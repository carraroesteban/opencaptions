// Regression tests for event-day failure modes (see CHANGELOG "Fixed").
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.ADMIN_TOKEN ||= 't';
process.env.INGEST_TOKEN ||= 't';
process.env.MT_PARTIAL_MS = '300';
const { GeminiEngine, _setClient } = await import('../src/engines/gemini.js');
const { PullSource } = await import('../src/pull.js');
const { Stage } = await import('../src/stage.js');
const { config } = await import('../src/config.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fakeLive(closeWith) {
  return { live: { connect: async ({ callbacks }) => { setTimeout(() => callbacks.onclose(closeWith), 5); return { close() {}, sendRealtimeInput() {} }; } } };
}

test('network drops before setup do not strip the session config', async () => {
  _setClient(fakeLive({ code: 1006, reason: '' }));
  const e = new GeminiEngine({ label: 't', target: 'es', vocabulary: ['Kubernetes'] });
  e.on('error', () => {});
  e.start();
  await sleep(1300);
  e.stop();
  assert.equal(e.status().level, 'full');
});

test('an explicit config rejection steps down to a smaller config', async () => {
  _setClient(fakeLive({ code: 1007, reason: 'Invalid argument: customVocabulary' }));
  const e = new GeminiEngine({ label: 't', target: 'es', vocabulary: ['Kubernetes'] });
  e.on('error', () => {});
  e.on('log', () => {});
  e.start();
  await sleep(100);
  e.stop();
  assert.notEqual(e.status().level, 'full');
});

test('a pull that fails before its first byte does not crash the process', async () => {
  let unhandled = null;
  const onUnhandled = (r) => { unhandled = r; };
  process.on('unhandledRejection', onUnhandled);
  const stage = { attachIngest() {}, detachIngest() {}, pushAudio() {}, log() {} };
  const p = new PullSource(stage, 'samples/does-not-exist.wav', {});
  await sleep(300);
  p.stop();
  process.off('unhandledRejection', onUnhandled);
  assert.equal(unhandled, null);
});

test('text mode: a new talk mid-sentence stores each translation once, in the right talk', async () => {
  config.engine = 'mock';
  const appended = [];
  const store = { openTalk() {}, append(stage, talk, seg) { appended.push({ talk, ch: seg.channel, text: seg.text }); } };
  const glossary = { apply: (t) => t, vocabulary: () => [] };
  const st = new Stage({ id: 't', name: 't', source: 'en', targets: ['es'], translation: 'text', vocabulary: [], title: '' }, { glossary, store });
  st.on('log', () => {});
  const chunk = Buffer.alloc(3200);
  for (let i = 0; i < 1600; i++) chunk.writeInt16LE(Math.round(8000 * Math.sin(i / 5)), i * 2);
  const talk1 = st.talk.id;
  for (let i = 0; i < 60; i++) { st.pushAudio(chunk); await sleep(20); }
  await sleep(1500);
  for (let i = 0; i < 20; i++) { st.pushAudio(chunk); await sleep(100); }
  st.engines.get('es')?.emit('turn');
  for (let i = 0; i < 20; i++) { st.pushAudio(chunk); await sleep(100); }
  st.newTalk('second');
  await sleep(300);
  st.destroy();
  const es = appended.filter((a) => a.ch === 'es' && a.talk === talk1).map((a) => a.text);
  assert.ok(es.length > 0, 'some translations stored');
  assert.equal(new Set(es).size, es.length, `duplicate finals: ${JSON.stringify(es)}`);
  // no half sentence immediately followed by its completed version
  for (let i = 1; i < es.length; i++) assert.ok(!es[i].startsWith(es[i - 1].replace(/[.?!…]$/, '')) || es[i] === es[i - 1], `provisional committed: ${es[i - 1]} / ${es[i]}`);
});

test('a destroyed room never opens new model sessions', async () => {
  config.engine = 'mock';
  const store = { openTalk() {}, append() {} };
  const glossary = { apply: (t) => t, vocabulary: () => [] };
  const st = new Stage({ id: 'd', name: 'd', source: 'en', targets: ['es'], vocabulary: [], title: '' }, { glossary, store });
  st.on('log', () => {});
  const chunk = Buffer.alloc(3200);
  for (let i = 0; i < 1600; i++) chunk.writeInt16LE(Math.round(8000 * Math.sin(i / 5)), i * 2);
  st.destroy();
  for (let i = 0; i < 5; i++) st.pushAudio(chunk);
  assert.equal(st.engines.size, 0);
});
