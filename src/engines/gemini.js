// One Gemini Live Translate session = one (stage, target language) pair.
// Handles: setup-config fallback, session resumption across the ~10 min connection
// lifetime (GoAway), reconnect with backoff, and audio buffering while reconnecting
// so no speech is lost.
import { EventEmitter } from 'node:events';
import { Modality } from '@google/genai';
import { createClient } from '../genai.js';
import { config } from '../config.js';

let ai = null;
const client = () => (ai ??= createClient());
/** Test hook: inject a fake client. */
export const _setClient = (c) => { ai = c; };

const LEVELS = ['full', 'minimal', 'bare'];
const MAX_BUFFER_CHUNKS = 120; // 12 s of 100 ms chunks
const CONNECT_TIMEOUT_MS = 12000; // a connect that never completes setup is retried
const DRAIN_MS = 4000; // after a reconnect, keep accepting the old session's trailing transcriptions
// Only these close reasons mean "the model rejected our config" (→ retry with fewer optional fields).
// Network drops (1006), overload (1011/1013) or quota errors must NOT strip the glossary/language config.
const CONFIG_REJECTED = /invalid|unknown (name|field)|argument|unsupported|not supported|1007|1008/i;

export class GeminiEngine extends EventEmitter {
  constructor({ label, target, echo = false, vocabulary = [], languageHints = [], mode = '' }) {
    super();
    this.label = label;
    this.target = target;
    this.echo = echo;
    this.vocabulary = vocabulary;
    this.languageHints = languageHints;
    this.mode = mode;
    this.setupFails = 0;
    this.level = 0; // index in LEVELS; lowered automatically if the model rejects optional fields
    this.state = 'idle';
    this.session = null;
    this.gen = 0;
    this.handle = null;
    this.buffer = [];
    this.backoff = 1000;
    this.stopped = true;
    this.drainGen = -1;
    this.resumeFails = 0;
    this.stateSince = Date.now();
    this.stats = { reconnects: 0, resumes: 0, errors: 0, lastError: '', connectedAt: 0, audioMs: 0, lastInputAt: 0, lastOutputAt: 0, tokens: 0 };
  }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.#connect();
  }

  stop() {
    this.stopped = true;
    this.gen++;
    this.drainGen = -1;
    clearTimeout(this.retryTimer);
    clearTimeout(this.connectTimer);
    try { this.session?.close(); } catch { /* ignore */ }
    this.session = null;
    this.buffer = [];
    this.handle = null;
    this.#setState('idle');
  }

  /** Force a fresh connection (used by the stall watchdog). */
  restart(reason = 'restart') {
    if (this.stopped) return;
    this.#log(`restarting (${reason})`);
    this.#reconnect(reason, 0);
  }

  sendAudio(chunk) {
    if (this.stopped) return;
    if (this.state !== 'live' || !this.session) {
      this.buffer.push(chunk);
      if (this.buffer.length > MAX_BUFFER_CHUNKS) this.buffer.shift();
      return;
    }
    this.#send(chunk);
  }

  endAudio() {
    if (this.state === 'live' && this.session) {
      try { this.session.sendRealtimeInput({ audioStreamEnd: true }); } catch { /* ignore */ }
    }
  }

  status() {
    return { target: this.target, echo: this.echo, state: this.state, stateSince: this.stateSince, level: LEVELS[this.level], ...this.stats };
  }

  #send(chunk) {
    if (!this.session) { this.buffer.push(chunk); return; }
    try {
      this.session.sendRealtimeInput({ audio: { data: chunk.toString('base64'), mimeType: 'audio/pcm;rate=16000' } });
      this.stats.audioMs += (chunk.length / 32000) * 1000;
    } catch (e) {
      this.buffer.push(chunk);
      this.#fail(e);
    }
  }

  #buildConfig() {
    const level = LEVELS[this.level];
    const inputTx = {};
    if (level === 'full') {
      if (this.vocabulary.length) inputTx.customVocabulary = this.vocabulary;
      if (this.languageHints.length) inputTx.languageCodes = this.languageHints;
      if (this.mode) inputTx.mode = this.mode;
    }
    const cfg = {
      responseModalities: [Modality.AUDIO],
      inputAudioTranscription: inputTx,
      outputAudioTranscription: {},
      translationConfig: { targetLanguageCode: this.target, echoTargetLanguage: this.echo },
    };
    if (level !== 'bare') cfg.sessionResumption = this.handle ? { handle: this.handle } : {};
    if (level === 'full') cfg.contextWindowCompression = { slidingWindow: {} };
    if (level === 'full' && config.vadSilenceMs > 0) {
      cfg.realtimeInputConfig = { automaticActivityDetection: { silenceDurationMs: config.vadSilenceMs, endOfSpeechSensitivity: 'END_SENSITIVITY_HIGH' } };
    }
    return cfg;
  }

  async #connect() {
    const gen = ++this.gen;
    const resuming = !!this.handle;
    this.#setState(resuming ? 'resuming' : 'connecting');
    this.setupOk = false;
    // A handshake that hangs (blocked network, server never sends setupComplete) must not stall the room.
    clearTimeout(this.connectTimer);
    this.connectTimer = setTimeout(() => {
      if (gen === this.gen && !this.setupOk && !this.stopped) {
        this.stats.lastError = `connect timeout (${CONNECT_TIMEOUT_MS / 1000}s)`;
        this.#log(`no setup after ${CONNECT_TIMEOUT_MS / 1000}s → retrying`);
        this.#reconnect('connect timeout');
      }
    }, CONNECT_TIMEOUT_MS);
    try {
      const session = await client().live.connect({
        model: config.model,
        config: this.#buildConfig(),
        callbacks: {
          onopen: () => {},
          onmessage: (m) => (gen === this.gen ? this.#onMessage(m) : gen === this.drainGen && this.#onDrain(m)),
          onerror: (e) => gen === this.gen && this.#fail(e?.error || e),
          onclose: (e) => gen === this.gen && this.#onClose(e, resuming),
        },
      });
      if (gen !== this.gen) { try { session.close(); } catch { /* ignore */ } return; }
      this.session = session;
      if (this.setupOk) this.#flush(); // setupComplete may arrive before connect() resolves
      // Some server versions don't send setupComplete promptly: treat as live after a grace period.
      setTimeout(() => { if (gen === this.gen && !this.setupOk && this.session) this.#onSetup(); }, 2500);
    } catch (e) {
      if (gen !== this.gen) return;
      clearTimeout(this.connectTimer);
      this.#fail(e);
      this.#scheduleRetry();
    }
  }

  #onSetup() {
    clearTimeout(this.connectTimer);
    this.setupOk = true;
    this.setupFails = 0;
    this.resumeFails = 0;
    this.backoff = 1000;
    this.stats.connectedAt = Date.now();
    this.#setState('live');
    this.#flush();
  }

  #flush() {
    if (!this.session) return;
    const pending = this.buffer.splice(0);
    for (const c of pending) this.#send(c);
  }

  #onMessage(m) {
    if (process.env.OC_DEBUG_RAW) console.log('[raw]', JSON.stringify(m, (k, v) => (k === 'data' ? `<${v.length}b>` : v)).slice(0, 500));
    if (m.setupComplete) return this.#onSetup();
    if (m.sessionResumptionUpdate?.resumable && m.sessionResumptionUpdate.newHandle) {
      this.handle = m.sessionResumptionUpdate.newHandle;
    }
    if (m.goAway) {
      this.#log(`goAway (timeLeft ${m.goAway.timeLeft}) → resuming`);
      this.#reconnect('goaway', 0);
      return;
    }
    if (m.usageMetadata?.totalTokenCount) this.stats.tokens = Math.max(this.stats.tokens, m.usageMetadata.totalTokenCount);
    const sc = m.serverContent;
    if (!sc) return;
    if (!this.setupOk) this.#onSetup();
    if (sc.interimInputTranscription?.text) {
      const t = sc.interimInputTranscription;
      this.stats.interim = (this.stats.interim || 0) + 1;
      this.emit('interim', { text: t.text, lang: normLang(t.languageCode) });
    }
    if (sc.inputTranscription) {
      this.stats.lastInputAt = Date.now();
      const t = sc.inputTranscription;
      this.emit('input', { text: t.text || '', finished: !!t.finished, lang: normLang(t.languageCode) });
    }
    if (sc.outputTranscription) {
      this.stats.lastOutputAt = Date.now();
      const t = sc.outputTranscription;
      this.emit('output', { text: t.text || '', finished: !!t.finished, lang: this.target });
    }
    const parts = sc.modelTurn?.parts;
    if (parts) {
      for (const p of parts) {
        if (p.inlineData?.data && (p.inlineData.mimeType || '').startsWith('audio')) {
          this.emit('audio', Buffer.from(p.inlineData.data, 'base64'));
        }
      }
    }
    if (sc.turnComplete) this.emit('turn');
  }

  /** Trailing messages of the previous connection (goAway / restart): keep the words, ignore control. */
  #onDrain(m) {
    const sc = m.serverContent;
    if (!sc) return;
    if (sc.inputTranscription) this.emit('input', { text: sc.inputTranscription.text || '', finished: !!sc.inputTranscription.finished, lang: normLang(sc.inputTranscription.languageCode) });
    if (sc.outputTranscription) this.emit('output', { text: sc.outputTranscription.text || '', finished: !!sc.outputTranscription.finished, lang: this.target });
    for (const p of sc.modelTurn?.parts || []) {
      if (p.inlineData?.data && (p.inlineData.mimeType || '').startsWith('audio')) this.emit('audio', Buffer.from(p.inlineData.data, 'base64'));
    }
  }

  #onClose(e, wasResuming) {
    this.session = null;
    if (this.stopped) return;
    clearTimeout(this.connectTimer);
    const code = Number(e?.code) || 0;
    const reason = `${e?.code ?? ''} ${e?.reason ?? ''}`.trim();
    const transient = code === 1006 || code === 1001 || code === 1011 || code === 1013 || /429|quota|RESOURCE_EXHAUSTED|unavailable|overloaded|deadline/i.test(reason);
    if (!this.setupOk) {
      if (wasResuming) {
        // A network blip while resuming shouldn't cost us the session context: retry the handle once more.
        if (!transient || ++this.resumeFails >= 2) {
          this.#log(`resume rejected (${reason}); starting fresh session`);
          this.handle = null;
          this.resumeFails = 0;
        }
      } else if (!transient && this.level < LEVELS.length - 1 && (CONFIG_REJECTED.test(reason) || (reason && ++this.setupFails >= 3))) {
        this.level++;
        this.setupFails = 0;
        this.#log(`setup rejected (${reason}); retrying with '${LEVELS[this.level]}' config`);
        return this.#connect();
      }
    }
    this.stats.lastError = reason || 'connection closed';
    this.#reconnect(`closed ${reason}`);
  }

  #reconnect(reason, delay) {
    const oldGen = this.gen++;
    const old = this.session;
    this.session = null;
    clearTimeout(this.connectTimer);
    // The model runs a few seconds behind the audio: keep accepting the old socket's trailing
    // transcriptions (see #onDrain) for a moment before closing it, so no words are lost.
    if (old) {
      this.drainGen = oldGen;
      setTimeout(() => {
        if (this.drainGen === oldGen) this.drainGen = -1;
        try { old.close(); } catch { /* ignore */ }
      }, DRAIN_MS);
    }
    this.stats.reconnects++;
    if (this.handle) this.stats.resumes++;
    this.#setState('reconnecting');
    this.#scheduleRetry(delay);
  }

  #scheduleRetry(delay = this.backoff) {
    clearTimeout(this.retryTimer);
    if (this.stopped) return;
    this.retryTimer = setTimeout(() => this.#connect(), delay);
    this.backoff = Math.min(this.backoff * 2, 15000);
  }

  #fail(e) {
    const msg = e?.message || String(e);
    this.stats.errors++;
    this.stats.lastError = msg;
    this.emit('error', msg);
  }

  #setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.stateSince = Date.now();
    this.emit('state', s);
  }

  #log(msg) {
    // Printed by the Stage (or check script) via the 'log' event, to avoid duplicate console lines.
    this.emit('log', msg);
  }
}

function normLang(code) {
  if (!code) return null;
  return String(code).toLowerCase().split(/[-_]/)[0];
}
