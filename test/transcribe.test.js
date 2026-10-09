// TRANSCRIBE_MODEL: text-mode rooms transcribe with Transcribe Live instead of Live Translate (cheaper, no 🎧 voice).
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.ADMIN_TOKEN ||= 't';
process.env.INGEST_TOKEN ||= 't';
const { GeminiEngine, _setClient } = await import('../src/engines/gemini.js');
const translate = await import('../src/translate.js');
const { Stage } = await import('../src/stage.js');
const { config } = await import('../src/config.js');
const { billedTokens, pct } = await import('../scripts/compare-transcribe.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A fake Live API: records each connect, says setupComplete, and answers audio with a transcript. */
function fakeLive(connects, sent = []) {
  return {
    live: {
      connect: async ({ model, config: cfg, callbacks }) => {
        connects.push({ model, cfg });
        setTimeout(() => callbacks.onmessage({ setupComplete: {} }), 5);
        let said = false;
        return {
          close() {},
          sendRealtimeInput(x) {
            sent.push(x);
            if (said) return;
            said = true;
            setTimeout(() => {
              callbacks.onmessage({ serverContent: { interimInputTranscription: { text: 'Hello every', languageCode: 'en-US' } } });
              callbacks.onmessage({ serverContent: { inputTranscription: { text: 'Hello everyone.', finished: true, languageCode: 'en-US' } }, usageMetadata: { promptTokenCount: 25, responseTokenCount: 4, totalTokenCount: 29 } });
            }, 5);
          },
        };
      },
    },
  };
}

const speech = Buffer.alloc(3200);
for (let i = 0; i < 1600; i++) speech.writeInt16LE(Math.round(8000 * Math.sin(i / 5)), i * 2);

test('a transcribe-only session asks for text from the transcribe model, with the glossary', async () => {
  const connects = [];
  _setClient(fakeLive(connects));
  config.transcribeModel = 'gemini-3.5-transcribe-live';
  const e = new GeminiEngine({ label: 't', target: 'es', vocabulary: ['Horizon Summit'], languageHints: ['en'], transcribeOnly: true });
  const got = { input: [], interim: [], usage: [] };
  for (const k of Object.keys(got)) e.on(k, (x) => got[k].push(x));
  e.on('error', () => {});
  e.start();
  await sleep(30);
  e.sendAudio(speech);
  await sleep(40);
  e.stop();
  const { model, cfg } = connects[0];
  assert.equal(model, 'gemini-3.5-transcribe-live');
  assert.deepEqual(cfg.responseModalities, ['TEXT']);
  assert.deepEqual(cfg.inputAudioTranscription, { customVocabulary: ['Horizon Summit'], languageCodes: ['en'] });
  for (const k of ['translationConfig', 'outputAudioTranscription', 'sessionResumption', 'contextWindowCompression']) assert.equal(cfg[k], undefined, k);
  assert.deepEqual(got.input, [{ text: ' Hello everyone.', finished: true, lang: 'en' }], 'a space before each finished sentence');
  assert.deepEqual(got.interim, [{ text: 'Hello every', lang: 'en' }]);
  assert.equal(got.usage[0].promptTokenCount, 25);
});

test('Transcribe Live is told the speaker stopped at each short pause (hybrid VAD)', async () => {
  const sent = [];
  _setClient(fakeLive([], sent));
  config.transcribeModel = 'gemini-3.5-transcribe-live';
  const e = new GeminiEngine({ label: 't', target: 'es', transcribeOnly: true });
  e.on('error', () => {});
  e.start();
  await sleep(30);
  const quiet = Buffer.alloc(3200);
  for (const c of [speech, quiet, quiet, quiet, quiet, quiet, speech, speech, quiet, quiet, quiet]) e.sendAudio(c);
  e.stop();
  assert.equal(sent.filter((x) => x.audioStreamEnd).length, 2, 'once per 300 ms pause after speech');
  const live = new GeminiEngine({ label: 't', target: 'es' }); // Live Translate keeps its own turn detection
  live.on('error', () => {});
  sent.length = 0;
  live.start();
  await sleep(30);
  for (const c of [speech, quiet, quiet, quiet, quiet]) live.sendAudio(c);
  live.stop();
  assert.equal(sent.filter((x) => x.audioStreamEnd).length, 0);
});

test('a text-mode room uses Transcribe Live: captions, no 🎧 voice, its own price', async () => {
  const connects = [];
  _setClient(fakeLive(connects));
  translate._setClient({ models: { generateContent: async () => ({ text: 'Hola a todos.' }), generateContentStream: async () => (async function* () { yield { text: 'Hola a todos.' }; })() } });
  config.engine = 'gemini';
  config.transcribeModel = 'gemini-3.5-transcribe-live';
  const store = { openTalk() {}, append() {} };
  const glossary = { apply: (t) => t, vocabulary: () => [] };
  const st = new Stage({ id: 'tx', name: 'tx', source: 'en', targets: ['es'], translation: 'text', vocabulary: [], title: '' }, { glossary, store });
  st.on('log', () => {});
  assert.equal(st.transcribeOnly, true);
  assert.deepEqual(st.audioLangs, []);
  for (let i = 0; i < 25; i++) { st.pushAudio(speech); await sleep(100); }
  const live = st.costUsd;
  st.destroy();
  assert.equal(connects[0].model, 'gemini-3.5-transcribe-live');
  assert.match(st.history('orig').map((s) => s.text).join(' '), /Hello everyone/);
  // ~2 s of streaming at $0.009/min, never Live Translate's $0.0368/min
  assert.ok(live > 0 && live <= (3 * 0.009) / 60, `live cost ${live}`);

  const hybrid = new Stage({ id: 'hy', name: 'hy', source: 'en', targets: ['es'], translation: 'hybrid', vocabulary: [], title: '' }, { glossary, store });
  assert.equal(hybrid.transcribeOnly, false, 'live/hybrid keep Live Translate for the translated voice');
  assert.deepEqual(hybrid.audioLangs, ['es']);
  hybrid.destroy();
  config.transcribeModel = '';
  config.engine = 'mock';
});

test('a running text room switches speech model when reconfigured (the dashboard setting)', async () => {
  const connects = [];
  _setClient(fakeLive(connects));
  const was = config.transcribeModel;
  config.engine = 'gemini';
  config.transcribeModel = '';
  const st = new Stage({ id: 'sw', name: 'sw', source: 'en', targets: ['es'], translation: 'text', vocabulary: [], title: '' }, { glossary: { apply: (t) => t, vocabulary: () => [] }, store: { openTalk() {}, append() {} } });
  st.on('log', () => {});
  st.pushAudio(speech);
  await sleep(30);
  assert.equal(connects.at(-1).model, config.model);
  config.transcribeModel = 'gemini-3.5-transcribe-live';
  st.reconfigure(st.def);
  await sleep(30);
  assert.equal(connects.at(-1).model, 'gemini-3.5-transcribe-live', 'reconnected with Transcribe Live');
  assert.deepEqual(st.audioLangs, [], 'no 🎧 voice any more');
  st.destroy();
  config.transcribeModel = was;
  config.engine = 'mock';
});

test('compare-transcribe: billed tokens across a reconnect, and percentiles', () => {
  const u = (p, r) => ({ promptTokenCount: p, responseTokenCount: r });
  assert.deepEqual(billedTokens([u(25, 2), u(50, 5), u(10, 1), u(30, 3)]), { in: 80, out: 8 });
  assert.deepEqual(billedTokens([]), { in: 0, out: 0 });
  assert.deepEqual(pct([3, 1, 2, 10]), { p50: 2, p90: 10 });
  assert.equal(pct([]), null);
});
