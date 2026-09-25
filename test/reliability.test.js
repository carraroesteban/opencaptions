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

test('bilingual speaker: captions switch cleanly between passthrough and translation', async () => {
  config.engine = 'mock';
  const store = { openTalk() {}, append() {} };
  const glossary = { apply: (t) => t, vocabulary: () => [] };
  const st = new Stage({ id: 'bi', name: 'bi', source: 'auto', targets: ['es', 'en'], translation: 'text', vocabulary: [], title: '' }, { glossary, store });
  st.on('log', () => {});
  const finals = { orig: [], es: [], en: [] };
  st.on('caption', (s) => { if (s.final) finals[s.channel].push(s.text); });
  const chunk = Buffer.alloc(3200);
  for (let i = 0; i < 1600; i++) chunk.writeInt16LE(Math.round(8000 * Math.sin(i / 5)), i * 2);
  st.pushAudio(chunk); // opens the (mock) session
  await sleep(50);
  const eng = st.engines.get('es');
  let first = true;
  const say = async (words, lang, end = true) => {
    for (let i = 0; i < words.length; i++) { eng.emit('input', { text: (first ? '' : ' ') + words[i], finished: end && i === words.length - 1, lang }); first = false; await sleep(5); }
    if (end) first = true;
    await sleep(60);
  };
  await say('Hola a todos, bienvenidos a la charla de hoy.'.split(' '), 'es');
  // One English word inside Spanish speech must not flip the tracks.
  await say(['Usamos', 'mucho'], 'es', false); await say(['Kubernetes'], 'en', false); await say(['en', 'producción', 'todos', 'los', 'días.'], 'es');
  await say('Now I will switch to English for the live demo part.'.split(' '), 'en');
  await say('Y ahora volvemos al español para las preguntas.'.split(' '), 'es');
  await sleep(300);
  st.destroy();
  const es = finals.es.join(' | ');
  const en = finals.en.join(' | ');
  assert.match(es, /^Hola a todos, bienvenidos a la charla de hoy\./, es);
  assert.match(es, /Usamos mucho Kubernetes en producción/, `short English word kept in the Spanish passthrough: ${es}`);
  assert.match(es, /\(es\) Now I will switch to English/, `English speech translated into the Spanish track: ${es}`);
  assert.match(es, /Y ahora volvemos al español/, es);
  assert.match(en, /\(en\) Hola a todos/, en);
  assert.match(en, /Now I will switch to English for the live demo part\./, en);
  assert.match(en, /\(en\) Y ahora volvemos/, en);
  for (const f of [...finals.es, ...finals.en]) {
    assert.ok(!(/^\((es|en)\)/.test(f) && /(Now I will|Hola a todos|Y ahora)/.test(f.replace(/^\((es|en)\) /, '')) && f.includes(') ') && f.split('(').length > 2), `mixed caption: ${f}`);
  }
  assert.ok(!finals.en.some((f) => f.startsWith('(en)') && f.includes('Now I will')), `passthrough English not re-translated: ${en}`);
  assert.ok(!finals.es.some((f) => !f.startsWith('(es)') && f.includes('Now I will')), `English not shown untranslated in the Spanish track: ${es}`);
});

test('a pinned-language room still translates when the speaker switches language', async () => {
  config.engine = 'mock';
  const store = { openTalk() {}, append() {} };
  const glossary = { apply: (t) => t, vocabulary: () => [] };
  const st = new Stage({ id: 'pin', name: 'pin', source: 'es', targets: ['en'], translation: 'text', vocabulary: [], title: '' }, { glossary, store });
  st.on('log', () => {});
  assert.deepEqual(st.languages, ['orig', 'es', 'en']);
  assert.equal(st.channelFor('es'), 'es', 'Spanish viewers get their own track, not the raw original');
  const finals = [];
  st.on('caption', (s) => { if (s.final && s.channel === 'es') finals.push(s.text); });
  const chunk = Buffer.alloc(3200);
  for (let i = 0; i < 1600; i++) chunk.writeInt16LE(Math.round(8000 * Math.sin(i / 5)), i * 2);
  st.pushAudio(chunk);
  await sleep(50);
  const eng = st.engines.get('en');
  const words = 'And now a question from the audience in English please.'.split(' ');
  for (let i = 0; i < words.length; i++) { eng.emit('input', { text: (i ? ' ' : '') + words[i], finished: i === words.length - 1, lang: 'en' }); await sleep(5); }
  await sleep(200);
  st.destroy();
  assert.ok(finals.some((f) => f.startsWith('(es) And now a question')), `translated into Spanish: ${finals.join(' | ')}`);
});
