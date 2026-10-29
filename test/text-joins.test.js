// Words as the AI sends them → captions with one space between words and capitals only where they belong.
// The fragments are real (gemini-3.5-transcribe-live and -live-translate-preview on samples/tor-talk.wav, 2026-10-25,
// and the glued text of 2026-10-09 runs): a regression here is glued or mis-capitalized captions at an event.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.ADMIN_TOKEN ||= 't';
process.env.INGEST_TOKEN ||= 't';
const { continueText, namesIn, lowerWords, CaptionTrack } = await import('../src/captions.js');
const { Stage } = await import('../src/stage.js');
const { _setClient } = await import('../src/engines/gemini.js');
const { config } = await import('../src/config.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Fragments one after another, as #onInput joins them. */
function said(frags, o = {}) {
  let out = '';
  const names = new Set(o.names || []), common = new Set();
  for (const f of frags) {
    out += continueText(out, f, { ...o, names, common });
    for (const n of namesIn(out)) names.add(n);
    for (const w of lowerWords(out)) common.add(w);
  }
  return out.trim();
}

test('fragments without a space between them get one (both Gemini models, the Mac and local engines)', () => {
  assert.equal(said(['Hi everyone and welcome to OpenCaptions Live.', 'My name is Hiroshi Tanaka']), 'Hi everyone and welcome to OpenCaptions Live. My name is Hiroshi Tanaka');
  assert.equal(said(['conspiring with the NSA or', 'intelligence agencies']), 'conspiring with the NSA or intelligence agencies');
  assert.equal(said(['make a list of', 'all the people']), 'make a list of all the people');
  assert.equal(said(['Maybe this is AT&T', 'or Deutsche Telekom']), 'Maybe this is AT&T or Deutsche Telekom');
  // Already spaced, or punctuation that belongs to the word before: untouched.
  assert.equal(said(['So I hear, maybe that\'s', ' the Monopoly', ' telephone company in']), 'So I hear, maybe that\'s the Monopoly telephone company in');
  assert.equal(said(['the FBI watching WikiLeaks', '. org']), 'the FBI watching WikiLeaks. org');
  assert.equal(said(['Hola', ', ¿cómo están?']), 'Hola, ¿cómo están?');
  // Languages written without spaces stay that way.
  assert.equal(said(['皆さん、こんにちは。', '今日は']), '皆さん、こんにちは。今日は');
  assert.equal(said(['สวัสดี', 'ครับ']), 'สวัสดีครับ');
});

test('a capital the AI put after a pause in the middle of a sentence goes; names, "I" and acronyms keep theirs', () => {
  // Transcribe Live, real fragments: each pause starts a "sentence".
  assert.equal(said([' we think about it. So that\'s something that we also', ' Think a lot about']),
    'we think about it. So that\'s something that we also think a lot about');
  assert.equal(said([' if somebody does that. Even when you\'re using encryption like HTTPS to a website,', ' Somebody watching your traffic']),
    'if somebody does that. Even when you\'re using encryption like HTTPS to a website, somebody watching your traffic');
  // Apple's engine, from a saved transcript (2026-10-21).
  assert.equal(said(['Vi a unas chicas. Amigo,', ' Unas personas al lado mío']), 'Vi a unas chicas. Amigo, unas personas al lado mío');
  // A word never heard in lowercase may be a name: it keeps its capital.
  assert.equal(said([' they want to know more about all of their users so they can advertise to', ' Facebook']), 'they want to know more about all of their users so they can advertise to Facebook');
  assert.equal(said([' If you\'re talking to', ' Government groups']), 'If you\'re talking to Government groups');
  // After a full stop it's a new sentence: the capital stays.
  assert.equal(said(['the network.', ' Maybe this is']), 'the network. Maybe this is');
  assert.equal(said(['¿Me escuchan?', ' Bien']), '¿Me escuchan? Bien');
  // Not "Word" (one letter, all capitals, inner capitals): left alone.
  assert.equal(said(['and then', ' I think so']), 'and then I think so');
  assert.equal(said(['a talk from', ' NASA engineers']), 'a talk from NASA engineers');
  assert.equal(said(['the FBI watching', ' WikiLeaks.']), 'the FBI watching WikiLeaks.');
  assert.equal(said(['this is', ' AT&T']), 'this is AT&T');
  // A name heard mid-sentence before, or in the glossary / agenda: keeps its capital.
  assert.equal(said(['every citizen in Syria and syria', ' what they do. They live in', ' Syria']), 'every citizen in Syria and syria what they do. They live in Syria');
  assert.equal(said(['a hiroshi, please welcome', ' Hiroshi Tanaka'], { names: ['hiroshi', 'tanaka'] }), 'a hiroshi, please welcome Hiroshi Tanaka');
  // German writes every noun with a capital.
  assert.equal(said(['die kinder. wir haben', ' Kinder'], { lang: 'de' }), 'die kinder. wir haben Kinder');
});

test('a room joins the fragments the same way, on the original and on the speaker\'s own language', async () => {
  config.engine = 'mock';
  const glossary = { apply: (t) => t, vocabulary: (v) => v };
  const st = new Stage({ id: 'tj', name: 'tj', source: 'auto', targets: ['en', 'es'], translation: 'text', vocabulary: ['Hiroshi Tanaka'], title: '' }, { glossary, store: { append() {}, openTalk() {} } });
  st.on('log', () => {});
  const finals = { orig: [], en: [] };
  st.on('caption', (s) => s.final && finals[s.channel]?.push(s.text));
  const chunk = Buffer.alloc(3200);
  for (let i = 0; i < 1600; i++) chunk.writeInt16LE(Math.round(8000 * Math.sin(i / 5)), i * 2);
  st.pushAudio(chunk);
  await sleep(50);
  const eng = st.engines.get('en') || [...st.engines.values()][0];
  // Transcribe Live, as it really sends them: no leading space, a capital after every pause.
  for (const [text, finished] of [['We think so.', true], ['So that\'s something that we also', false], ['Think a lot about it today.', true], ['Please welcome', false], ['Hiroshi Tanaka to the stage.', true]]) {
    eng.emit('input', { text, finished, lang: 'en' });
    await sleep(20);
  }
  await sleep(50);
  st.destroy();
  const want = 'We think so. So that\'s something that we also think a lot about it today. Please welcome Hiroshi Tanaka to the stage.';
  assert.ok(finals.orig.join(' ').endsWith(want), finals.orig.join(' | '));
  assert.ok(finals.en.join(' ').endsWith(want), finals.en.join(' | '));
});

for (const [name, transcribeModel, lowered] of [['Live Translate\'s capitals are names: kept (its words come mid-sentence)', '', false], ['Transcribe Live\'s pause capitals: lowered', 'gemini-3.5-transcribe-live', true]]) {
  test(name, async () => {
    const was = { engine: config.engine, transcribeModel: config.transcribeModel };
    Object.assign(config, { engine: 'gemini', transcribeModel });
    _setClient({ live: { connect: async () => ({ close() {}, sendRealtimeInput() {} }) } }); // a session that never answers
    const glossary = { apply: (t) => t, vocabulary: (v) => v };
    const st = new Stage({ id: 'g', name: 'g', source: 'en', targets: ['es'], translation: 'text', vocabulary: [], title: '' }, { glossary, store: { append() {}, openTalk() {} } });
    st.on('log', () => {});
    const finals = [];
    st.on('caption', (s) => s.final && s.channel === 'orig' && finals.push(s.text));
    const chunk = Buffer.alloc(3200);
    for (let i = 0; i < 1600; i++) chunk.writeInt16LE(Math.round(8000 * Math.sin(i / 5)), i * 2);
    st.pushAudio(chunk);
    await sleep(30);
    const eng = [...st.engines.values()][0];
    for (const [text, finished] of [[' the agency watching every citizen in', false], [' Agency of the city.', true]]) eng.emit('input', { text, finished, lang: 'en' });
    st.destroy();
    Object.assign(config, was);
    assert.equal(finals.join(' '), `the agency watching every citizen in ${lowered ? 'agency' : 'Agency'} of the city.`);
  });
}

test('CaptionTrack keeps the spaces it is given (no word glued at a caption boundary)', () => {
  const tr = new CaptionTrack({ channel: 'orig', clock: () => 0 });
  const got = [];
  tr.on('caption', (s) => s.final && got.push(s.text));
  for (const f of [' I hear', ' Maybe that\'s the monopoly telephone company in Syria who\'s watching every citizen in Syria and what they do on the internet.', ' Or maybe somebody']) tr.push(f);
  tr.flush();
  assert.equal(got.join(' '), 'I hear Maybe that\'s the monopoly telephone company in Syria who\'s watching every citizen in Syria and what they do on the internet. Or maybe somebody');
});

test('Transcribe Live in Japanese: the fragments join with no space, through the real engine', async () => {
  const was = { engine: config.engine, transcribeModel: config.transcribeModel };
  Object.assign(config, { engine: 'gemini', transcribeModel: 'gemini-3.5-transcribe-live' });
  let cb;
  _setClient({ live: { connect: async (o) => { cb = o.callbacks; return { close() {}, sendRealtimeInput() {} }; } } });
  const st = new Stage({ id: 'ja', name: 'ja', source: 'ja', targets: ['en'], translation: 'text', vocabulary: [], title: '' }, { glossary: { apply: (t) => t, vocabulary: (v) => v }, store: { append() {}, openTalk() {} } });
  st.on('log', () => {});
  const finals = [];
  st.on('caption', (s) => s.final && s.channel === 'orig' && finals.push(s.text));
  const chunk = Buffer.alloc(3200);
  for (let i = 0; i < 1600; i++) chunk.writeInt16LE(Math.round(8000 * Math.sin(i / 5)), i * 2);
  st.pushAudio(chunk);
  await sleep(50);
  cb.onmessage({ setupComplete: {} });
  for (const text of ['皆さん、こんにちは。', '今日はオープンキャプションについて', 'お話しします。']) cb.onmessage({ serverContent: { inputTranscription: { text, finished: false } } });
  cb.onmessage({ serverContent: { inputTranscription: { text: '', finished: true } } });
  await sleep(20);
  st.destroy();
  Object.assign(config, was);
  assert.equal(finals.join(''), '皆さん、こんにちは。今日はオープンキャプションについてお話しします。');
});

test('provisional words confirmed after a pause stay one caption (no duplicate on phones)', async () => {
  const tr = new CaptionTrack({ channel: 'orig', clock: () => 0, idleMs: 30 });
  const seen = [];
  tr.on('caption', (s) => seen.push(s));
  tr.interim('hello every');
  tr.interim('hello everyone and welcome');
  await sleep(60); // longer than idleMs: the idle flush runs before the confirmed text
  tr.push('Hello everyone and welcome.', { finished: true });
  assert.equal(new Set(seen.map((s) => s.id)).size, 1, JSON.stringify(seen));
  assert.equal(seen.at(-1).text, 'Hello everyone and welcome.');
  assert.ok(seen.at(-1).final);
});

test('a Japanese sentence is translated when it ends (。), not after a pause or 220 characters', async () => {
  const was = config.engine;
  config.engine = 'mock';
  const { SentenceTranslator } = await import('../src/translate.js');
  const cut = [];
  const q = new SentenceTranslator({ from: 'ja', to: 'en', onPartial() {}, onFinal() {} });
  q.feed('今日は皆さんにオープンキャプションについてお話しします。まず最初に');
  cut.push(q.buf);
  q.flush();
  config.engine = was;
  assert.equal(cut[0], 'まず最初に');
});
