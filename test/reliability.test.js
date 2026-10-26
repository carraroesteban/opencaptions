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
  const e = new GeminiEngine({ label: 't', target: 'es', vocabulary: ['Horizon Summit'] });
  e.on('error', () => {});
  e.start();
  await sleep(1300);
  e.stop();
  assert.equal(e.status().level, 'full');
});

test('an explicit config rejection steps down to a smaller config', async () => {
  _setClient(fakeLive({ code: 1007, reason: 'Invalid argument: customVocabulary' }));
  const e = new GeminiEngine({ label: 't', target: 'es', vocabulary: ['Horizon Summit'] });
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
  await say(['Usamos', 'mucho'], 'es', false); await say(['feedback'], 'en', false); await say(['en', 'todos', 'los', 'talleres.'], 'es');
  await say('Now I will switch to English for the live demo part.'.split(' '), 'en');
  await say('Y ahora volvemos al español para las preguntas.'.split(' '), 'es');
  await sleep(300);
  st.destroy();
  const es = finals.es.join(' | ');
  const en = finals.en.join(' | ');
  assert.match(es, /^Hola a todos, bienvenidos a la charla de hoy\./, es);
  assert.match(es, /Usamos mucho feedback en todos los talleres/, `short English word kept in the Spanish passthrough: ${es}`);
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

test('a speech model that names no language (Transcribe Live): the spoken language is passed through, not translated into itself', async () => {
  config.engine = 'mock';
  const store = { openTalk() {}, append() {} };
  const glossary = { apply: (t) => t, vocabulary: () => [] };
  const st = new Stage({ id: 'nolang', name: 'nolang', source: 'auto', targets: ['es', 'en'], translation: 'text', vocabulary: [], title: '' }, { glossary, store });
  st.on('log', () => {});
  const finals = { orig: [], es: [], en: [] }, partials = { orig: [], es: [], en: [] };
  st.on('caption', (s) => (s.final ? finals : partials)[s.channel].push(s.text));
  const chunk = Buffer.alloc(3200);
  for (let i = 0; i < 1600; i++) chunk.writeInt16LE(Math.round(8000 * Math.sin(i / 5)), i * 2);
  st.pushAudio(chunk);
  await sleep(50);
  const eng = st.engines.get('es');
  const useInterim = config.useInterim;
  config.useInterim = true;
  // Transcribe Live sends provisional words as they're spoken, then whole sentences, and never a language code.
  for (const text of ['Hi everyone and welcome', 'Hi everyone and welcome to the summit']) { eng.emit('interim', { text }); await sleep(20); }
  eng.emit('input', { text: 'Hi everyone and welcome to the summit, this is the part about our users.', finished: true });
  await sleep(80);
  for (const text of ['Today we', 'Today we will talk about']) { eng.emit('interim', { text }); await sleep(20); }
  eng.emit('input', { text: ' Today we will talk about the users and their phones.', finished: true });
  await sleep(80);
  eng.emit('input', { text: ' Y ahora volvemos al español para las preguntas de todos ustedes.', finished: true });
  await sleep(400);
  st.destroy();
  config.useInterim = useInterim;
  assert.ok(partials.orig.includes('Today we will talk about'), `provisional words on the original: ${partials.orig.join(' | ')}`);
  assert.ok(partials.en.includes('Today we will talk about'), `and as soon on the speaker's own language: ${partials.en.join(' | ')}`);
  assert.ok(partials.en.includes('Hi everyone and welcome to the summit'), `even a talk's first words, before any sentence: ${partials.en.join(' | ')}`);
  assert.ok(!partials.es.some((p) => /^(Today|Hi)/.test(p)), `never untranslated English on Spanish: ${partials.es.join(' | ')}`);
  const en = finals.en.join(' | '), es = finals.es.join(' | ');
  assert.ok(finals.en.includes('Hi everyone and welcome to the summit, this is the part about our users.'), `English shown as spoken: ${en}`);
  assert.ok(finals.es.includes('Y ahora volvemos al español para las preguntas de todos ustedes.'), `Spanish shown as spoken: ${es}`);
  assert.match(es, /\(es\) Hi everyone/, `English translated into Spanish: ${es}`);
  assert.match(en, /\(en\) Y ahora volvemos/, `Spanish translated into English: ${en}`);
  assert.equal(st.status().detectedLang, 'es', 'the dashboard shows the language being spoken');
});

test('"auto" between English and Spanish: Gemini is told both, and a sentence read as another language stays in the current one', async () => {
  let sent = null;
  _setClient({ live: { connect: async ({ config: c }) => { sent = c; return { close() {}, sendRealtimeInput() {} }; } } });
  config.engine = 'gemini';
  const store = { openTalk() {}, append() {} };
  const glossary = { apply: (t) => t, vocabulary: () => [] };
  const st = new Stage({ id: 'enes', name: 'enes', source: 'auto', spoken: ['en', 'es'], targets: ['es', 'en'], translation: 'text', vocabulary: [], title: '' }, { glossary, store });
  st.on('log', () => {});
  const chunk = Buffer.alloc(3200);
  for (let i = 0; i < 1600; i++) chunk.writeInt16LE(Math.round(8000 * Math.sin(i / 5)), i * 2);
  st.pushAudio(chunk);
  await sleep(50);
  config.engine = 'mock'; // translations: no network
  const eng = st.engines.get('es');
  eng.emit('input', { text: 'Hola a todos y bienvenidos a la cumbre de este año.', finished: true, lang: 'es' });
  eng.emit('input', { text: ' Obrigado a todos por estarem aqui hoje com a gente.', finished: true, lang: 'pt' });
  await sleep(50);
  st.destroy();
  assert.deepEqual(sent?.inputAudioTranscription.languageCodes, ['en', 'es']);
  assert.equal(st.status().detectedLang, 'es');
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

test('changing a room’s languages mid-talk keeps what was said, and a new language starts with it translated', async () => {
  config.engine = 'mock';
  const store = { openTalk() {}, append() {} };
  const glossary = { apply: (t) => t, vocabulary: () => [] };
  const st = new Stage({ id: 'lc', name: 'lc', source: 'en', targets: ['es'], translation: 'text', vocabulary: [], title: '' }, { glossary, store });
  st.on('log', () => {});
  const chunk = Buffer.alloc(3200);
  for (let i = 0; i < 1600; i++) chunk.writeInt16LE(Math.round(8000 * Math.sin(i / 5)), i * 2);
  st.pushAudio(chunk); // opens the (mock) session
  await sleep(50);
  const eng = st.engines.get('es');
  for (const w of 'Good morning everyone, and welcome to the talk.'.split(' ')) { eng.emit('input', { text: ` ${w}`, lang: 'en' }); await sleep(5); }
  eng.emit('input', { text: '', finished: true, lang: 'en' });
  await sleep(100);
  assert.equal(st.history('orig').length, 1);
  const fr = [];
  st.on('caption', (s) => { if (s.final && s.channel === 'fr') fr.push(s.text); });
  st.reconfigure({ ...st.def, targets: ['fr'] }); // the language picked in Just for me, or added by the organizer
  await sleep(100);
  st.destroy();
  assert.equal(st.history('orig').length, 1, 'what was said is still there for screens and phones that (re)connect');
  assert.deepEqual(fr, ['(fr) Good morning everyone, and welcome to the talk.'], 'the new language starts with the last sentences, translated');
  assert.equal(st.history('fr').length, 1);
});

test('a room’s cost never goes down at a new talk or a reconfigure', async () => {
  const st = new Stage({ id: 'cost', name: 'cost', source: 'en', targets: ['es'], vocabulary: [], title: '' }, { glossary: { apply: (t) => t, vocabulary: () => [] }, store: { openTalk() {}, append() {} } });
  st.on('log', () => {});
  const fake = () => ({ stats: { usd: 0.5 }, flush() {}, pending: () => false, degraded: () => false });
  st.costUsd = 1;
  st.mtQ = { es: fake() };
  assert.equal(st.totalCost(), 1.5);
  st.newTalk('next');
  assert.ok(st.totalCost() >= 1.5);
  st.mtQ = { es: fake() };
  st.reconfigure(st.def);
  assert.ok(st.totalCost() >= 2);
  assert.equal(st.status().costUsd, +st.totalCost().toFixed(3));
  st.destroy();
});
