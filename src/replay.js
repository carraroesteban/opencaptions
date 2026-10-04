// Record and replay the AI, for end-to-end tests without an API key (see test/e2e.test.js).
//
//   OC_RECORD=test/fixtures/talk-en.json  wrap the real Gemini client and save what it answers: every Live
//                                         message (with its time) and every text-model response
//   OC_REPLAY=test/fixtures/talk-en.json  a fake client that plays those answers back. Everything else in
//                                         OpenCaptions (ingest, stage, captions, translation queue, storage,
//                                         summaries, WebSockets) runs for real.
//   OC_REPLAY_SPEED=3                     replay Live messages this many times faster than recorded
//
// Live messages are timed from the session's first audio chunk, so they line up with the audio a test sends.
// Translated speech isn't stored (it's large): its parts keep their size and replay as silence.
import fs from 'node:fs';
import path from 'node:path';

const now = () => Date.now();

/**
 * Key for a text-model request: what the model was asked, independent of timing.
 * @param {{ model: string, contents: any, config?: { systemInstruction?: any } }} req
 */
function requestKey({ model, contents, config = {} }) {
  const sys = typeof config.systemInstruction === 'string' ? config.systemInstruction : JSON.stringify(config.systemInstruction ?? '');
  return `${model}\n${sys}\n${typeof contents === 'string' ? contents : JSON.stringify(contents)}`;
}
/** Same model and instructions (a summary, a question…), whatever the transcript in the prompt. */
const requestKind = (req) => requestKey({ ...req, contents: '' });
/** The sentence being translated, for a looser match when the context around it differs between runs. */
const translateTarget = (contents) => (typeof contents === 'string' && contents.includes('Translate:\n') ? contents.split('Translate:\n').pop() : null);

function shrinkAudio(m) {
  if (m.sessionResumptionUpdate?.newHandle) m.sessionResumptionUpdate.newHandle = 'recorded-handle';
  for (const p of m.serverContent?.modelTurn?.parts || []) {
    if (p.inlineData?.data) p.inlineData = { mimeType: p.inlineData.mimeType, bytes: Buffer.byteLength(p.inlineData.data, 'base64') };
  }
  return m;
}

// ---------------------------------------------------------------- recording
export function recordingClient(real, file) {
  const out = { version: 1, recordedAt: new Date().toISOString(), sessions: [], generate: [] };
  const save = () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(out, null, 1));
  };
  process.on('exit', save);
  setInterval(save, 5000).unref();
  return {
    live: {
      async connect(params) {
        const rec = { model: params.model, connectedAt: now(), firstAudioAt: 0, messages: [] };
        out.sessions.push(rec);
        const cb = params.callbacks;
        const session = await real.live.connect({
          ...params,
          callbacks: {
            ...cb,
            onmessage: (m) => {
              const t = now();
              rec.messages.push({ t: t - rec.connectedAt, m: shrinkAudio(JSON.parse(JSON.stringify(m))) });
              cb.onmessage(m);
            },
          },
        });
        return {
          sendRealtimeInput(input) {
            if (input?.audio && !rec.firstAudioAt) rec.firstAudioAt = now() - rec.connectedAt;
            return session.sendRealtimeInput(input);
          },
          close: () => session.close(),
        };
      },
    },
    models: {
      async generateContent(req) {
        const res = await real.models.generateContent(req);
        out.generate.push({ key: requestKey(req), kind: requestKind(req), translate: translateTarget(req.contents), text: res.text ?? '', usageMetadata: res.usageMetadata ?? null });
        return res;
      },
      async generateContentStream(req) {
        const stream = await real.models.generateContentStream(req);
        const entry = { key: requestKey(req), kind: requestKind(req), translate: translateTarget(req.contents), text: '', usageMetadata: null, stream: true };
        out.generate.push(entry);
        return (async function* () {
          for await (const chunk of stream) {
            entry.text += chunk.text || '';
            if (chunk.usageMetadata) entry.usageMetadata = chunk.usageMetadata;
            yield chunk;
          }
        })();
      },
    },
  };
}

// ---------------------------------------------------------------- replay
export const replayStats = { sessions: 0, generate: 0, misses: [] };

export function replayClient(file, speed = Number(process.env.OC_REPLAY_SPEED || 1)) {
  const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
  let nextSession = 0;
  const used = new Set();
  return {
    live: {
      async connect(params) {
        const src = rec.sessions[nextSession++ % Math.max(1, rec.sessions.length)];
        replayStats.sessions++;
        const cb = params.callbacks;
        const timers = new Set();
        let closed = false;
        let audioAt = 0;
        const at = (ms, fn) => { const tm = setTimeout(() => { timers.delete(tm); if (!closed) fn(); }, Math.max(0, ms / speed)); timers.add(tm); };
        const emit = (m) => {
          const copy = JSON.parse(JSON.stringify(m));
          for (const p of copy.serverContent?.modelTurn?.parts || []) {
            if (p.inlineData?.bytes != null) p.inlineData = { mimeType: p.inlineData.mimeType, data: Buffer.alloc(p.inlineData.bytes).toString('base64') };
          }
          cb.onmessage(copy);
        };
        const lead = src?.firstAudioAt || 0;
        // Messages from before the first audio (setupComplete…) play on connect; the rest wait for audio.
        for (const { t, m } of src?.messages || []) if (t < lead) at(t, () => emit(m));
        const session = {
          sendRealtimeInput(input) {
            if (!input?.audio || audioAt) return;
            audioAt = now();
            for (const { t, m } of src?.messages || []) if (t >= lead) at(t - lead, () => emit(m));
          },
          close() {
            if (closed) return;
            closed = true;
            for (const tm of timers) clearTimeout(tm);
            setTimeout(() => cb.onclose?.({ code: 1000, reason: 'closed' }), 0);
          },
        };
        setTimeout(() => cb.onopen?.(), 0);
        return session;
      },
    },
    models: {
      // Streaming: the recorded answer, a few words at a time.
      async generateContentStream(req) {
        const res = await this.generateContent(req);
        const words = res.text.split(/(?<=\s)/);
        return (async function* () {
          for (let i = 0; i < words.length; i += 3) {
            await new Promise((r) => setTimeout(r, 30 / speed));
            yield { text: words.slice(i, i + 3).join(''), usageMetadata: i + 3 >= words.length ? res.usageMetadata : undefined };
          }
        })();
      },
      async generateContent(req) {
        replayStats.generate++;
        const key = requestKey(req);
        const tgt = translateTarget(req.contents);
        // Exact request first; then, for a translation, the same sentence with different context; for anything else
        // (summaries, questions: their prompt holds the transcript, which differs a little between runs), an answer
        // to the same kind of request.
        const pick = (pred) => {
          const i = rec.generate.findIndex((g, k) => !used.has(k) && pred(g));
          const j = i >= 0 ? i : rec.generate.findIndex(pred);
          if (j < 0) return null;
          used.add(j);
          return rec.generate[j];
        };
        const hit = pick((g) => g.key === key) || (tgt != null ? pick((g) => g.translate === tgt) : pick((g) => (g.kind ?? '') === requestKind(req)));
        if (!hit) {
          replayStats.misses.push(tgt ?? String(req.contents).slice(0, 80));
          throw Object.assign(new Error('replay: request was not recorded'), { status: 404 });
        }
        return { text: hit.text, usageMetadata: hit.usageMetadata || undefined };
      },
    },
  };
}
