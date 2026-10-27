// Apple's on-device speech (src/engines/apple.js): the Swift helper is faked here by a process whose stdout we write,
// so these run on any computer. The real helper (src/local/apple.swift) needs macOS 26: see docs/local.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

const { AppleEngine } = await import('../src/engines/apple.js');
const { LocalMode } = await import('../src/local/mode.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A stand-in for `opencaptions-apple listen`: say(obj) prints a JSON line, crash() exits. */
function fakeHelper() {
  const p = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), signals: [], audio: 0 });
  p.stdin.on('data', (b) => { p.audio += b.length; });
  p.kill = (sig = 'SIGTERM') => { p.signals.push(sig); return true; };
  p.say = (o) => p.stdout.write(`${JSON.stringify(o)}\n`);
  p.crash = () => p.emit('close', 1);
  return p;
}

function engine(o = {}) {
  const procs = [];
  const opened = [];
  const e = new AppleEngine({ label: 't', target: 'es', source: 'en', vocabulary: ['Horizon Summit'], ...o, listen: async (args) => { opened.push(args); const p = fakeHelper(); procs.push(p); return p; } });
  const got = { input: [], interim: [], errors: [], states: [] };
  e.on('input', (x) => got.input.push(x));
  e.on('interim', (x) => got.interim.push(x));
  e.on('error', (m) => got.errors.push(m));
  e.on('state', (s) => got.states.push(s));
  e.on('log', () => {});
  return { e, procs, opened, got };
}

test('streams audio in, provisional and settled sentences out', async () => {
  const { e, procs, opened, got } = engine();
  e.start();
  await sleep(5);
  assert.deepEqual(opened, [{ lang: 'en', vocabulary: ['Horizon Summit'] }]);
  e.sendAudio(Buffer.alloc(3200)); // not live yet: kept, and heard once it listens (the room's first words)
  procs[0].say({ ready: 'en-US', engine: 'SpeechAnalyzer' });
  await sleep(5);
  assert.equal(e.state, 'live');
  e.sendAudio(Buffer.alloc(3200));
  e.sendAudio(Buffer.alloc(3200));
  await sleep(5);
  assert.equal(procs[0].audio, 9600);
  procs[0].say({ partial: 'Welcome every' });
  procs[0].say({ partial: '' }); // nothing pending: no caption change
  procs[0].say({ final: 'Welcome everyone to Horizon Summit.', start: 0.3, end: 2.1 });
  await sleep(5);
  assert.deepEqual(got.interim, [{ text: 'Welcome every', lang: 'en' }]);
  assert.deepEqual(got.input, [{ text: ' Welcome everyone to Horizon Summit.', finished: true, lang: 'en' }]);
  e.endAudio(); // the room went quiet: settle what was heard
  assert.deepEqual(procs[0].signals, ['SIGUSR1']);
  assert.equal(e.status().finals, 1);
  e.stop();
  assert.equal(e.state, 'idle');
  assert.ok(procs[0].signals.includes('SIGTERM'));
});

test('a finished sentence is committed once two updates agree, before Apple settles it', async () => {
  const { e, procs, got } = engine();
  e.start();
  await sleep(5);
  procs[0].say({ ready: 'en-US', engine: 'SpeechAnalyzer' });
  procs[0].say({ partial: 'Hello everyone. Today we' });
  procs[0].say({ partial: 'Hello everyone. Today we talk' }); // agrees on "Hello everyone."
  procs[0].say({ partial: 'Hello, everyone. Today we talk about cities' }); // Apple revised a committed word
  // Apple's settled version spells a committed word differently: only the new words are added.
  procs[0].say({ final: 'Hello, everyone. Today we talk about cities.', start: 0, end: 4 });
  await sleep(5);
  assert.deepEqual(got.input.map((x) => [x.text, x.finished]), [[' Hello everyone.', false], [' Today we talk about cities.', true]]);
  assert.deepEqual(got.interim.map((x) => x.text), ['Hello everyone. Today we', 'Today we talk', 'Today we talk about cities']);
  e.stop();
});

test('a helper that stops is restarted, and says why', async () => {
  const { e, procs, got } = engine();
  e.start();
  await sleep(5);
  procs[0].say({ ready: 'en-US', engine: 'SpeechAnalyzer' });
  await sleep(5);
  procs[0].say({ error: 'speech model download failed' });
  await sleep(5);
  procs[0].crash();
  assert.equal(e.state, 'reconnecting');
  assert.deepEqual(got.errors, ['Apple speech: speech model download failed']);
  await sleep(1100); // first retry after 1 s
  assert.equal(procs.length, 2);
  procs[1].say({ ready: 'en-US', engine: 'SpeechAnalyzer' });
  await sleep(5);
  assert.equal(e.state, 'live');
  e.stop();
});

test('no helper (no developer tools, older macOS): an error, then retries', async () => {
  let tries = 0;
  const e = new AppleEngine({ label: 't', target: 'es', listen: async () => { tries++; throw new Error('needs macOS 26 or later'); } });
  const errors = [];
  e.on('error', (m) => errors.push(m));
  e.start();
  await sleep(5);
  assert.equal(e.state, 'reconnecting');
  assert.deepEqual(errors, ['Apple speech: needs macOS 26 or later']);
  await sleep(1100);
  assert.equal(tries, 2);
  assert.equal(errors.length, 1); // the same problem isn't reported twice
  e.stop();
});

test('"auto" listens for the Mac\'s own language (Apple doesn\'t detect it)', async () => {
  const { e, opened } = engine({ source: 'auto' });
  e.start();
  await sleep(5);
  assert.match(opened[0].lang, /^[a-z]{2,3}$/);
  e.stop();
});

test('"Run it on this computer" with Apple speech: translations are ready without Ollama', async () => {
  let askedOllama = false;
  const m = new LocalMode({
    apply: () => {},
    prepareSpeech: async () => ({ url: 'apple:', api: 'apple', label: 'Apple speech (on this Mac)' }),
    prepareText: async () => { askedOllama = true; throw Object.assign(new Error('no ollama'), { code: 'no-ollama' }); },
  });
  await m.start();
  assert.equal(m.status().state, 'ready');
  assert.equal(m.status().text, 'ready');
  assert.equal(askedOllama, false);
  m.reset();
});

// ---------- translated voice (🎧) ----------
const { appleVoice } = await import('../src/local/apple.js');

/** A stand-in for appleSpeak: each sentence is `ms` of audio in 100 ms chunks, made at once like Apple does. */
function fakeSpeak(ms = 300) {
  const asked = [];
  const speak = async (text, lang, rate, onPcm) => {
    asked.push({ text, lang, rate });
    if (text === 'boom') throw new Error('this Mac has no voice for \'xx\'');
    for (let i = 0; i < ms / 100; i++) onPcm(Buffer.alloc(4800, asked.length)); // 100 ms of 24 kHz PCM16
    return 'Mónica';
  };
  return { speak, asked };
}

test('voice: each translated sentence is read aloud, sent at the pace it is heard', async () => {
  const { speak, asked } = fakeSpeak(1500);
  const got = [];
  const v = appleVoice('es', (pcm) => got.push({ at: Date.now(), n: pcm[0] }), () => {}, speak);
  const t0 = Date.now();
  v.say('Hola a todos.');
  v.say('Bienvenidos.');
  v.say('Gracias.');
  await sleep(20);
  assert.deepEqual(asked, [{ text: 'Hola a todos.', lang: 'es', rate: 1 }]);
  assert.equal(got.length, 11, 'about a second ahead goes out at once');
  await sleep(1700);
  assert.equal(asked.length, 2, 'the next sentence once this one is nearly heard');
  assert.equal(asked[1].rate, 1.15, 'another one waiting: a little faster');
  // Scheduled exactly 400 ms out (1.5 s of audio, 1 s ahead); timers can fire a millisecond early by Date.now().
  assert.ok(got.filter((g) => g.n === 1).at(-1).at - t0 >= 390, 'never more than a second ahead of the ear');
  assert.ok(got.findIndex((g) => g.n === 2) > got.findLastIndex((g) => g.n === 1), 'in order');
  v.stop();
  const before = got.length;
  await sleep(1600);
  assert.equal(got.length, before, 'stopped: nothing more');
});

test('voice: behind a fast speaker only the two newest sentences wait; a problem is reported once', async () => {
  const { speak, asked } = fakeSpeak(100);
  const errors = [];
  const v = appleVoice('es', () => {}, (m) => errors.push(m), speak);
  v.say('boom');
  for (const s of ['uno', 'dos', 'tres', 'cuatro']) v.say(s);
  v.say('  ');
  await sleep(50);
  assert.deepEqual(asked.map((a) => a.text), ['boom', 'tres', 'cuatro']);
  v.say('boom');
  await sleep(150);
  v.say('boom');
  await sleep(50);
  assert.deepEqual(errors, ['this Mac has no voice for \'xx\'', 'this Mac has no voice for \'xx\''], 'again after it worked in between');
  v.say('boom');
  await sleep(50);
  assert.equal(errors.length, 2, 'not twice in a row');
  v.stop();
});

test('voice: local mode on a Mac offers 🎧 in every translated language; Whisper offers none', async () => {
  const { config } = await import('../src/config.js');
  const { Stage } = await import('../src/stage.js');
  const prev = { engine: config.engine, localAsrApi: config.localAsrApi };
  const deps = { glossary: { apply: (t) => t, vocabulary: () => [] }, store: { openTalk() {}, append() {} } };
  try {
    const langs = (source, targets) => {
      const st = new Stage({ id: 'v', name: 'v', source, targets, vocabulary: [], title: '' }, deps);
      st.destroy();
      return st.audioLangs;
    };
    Object.assign(config, { engine: 'local', localAsrApi: 'apple' });
    assert.deepEqual(langs('en', ['es', 'fr', 'en']), ['es', 'fr'], 'not the language being spoken');
    assert.deepEqual(langs('auto', ['es', 'fr']), ['es', 'fr']);
    config.localAsrApi = 'whispercpp';
    assert.deepEqual(langs('en', ['es']), []);
  } finally {
    Object.assign(config, prev);
  }
});

/** A settled sentence as the helper writes it: every word with its time, spread evenly over [start, end]. */
const settled = (text, start, end) => {
  const ws = text.split(' ');
  const d = (end - start) / ws.length;
  return { final: text, start, end, w: ws.map((w, i) => [w, start + i * d, start + (i + 1) * d]) };
};
/** Words in progress: one stretch of time, as the helper writes them. */
const progress = (text, start, end) => ({ partial: text, w: [[text, start, end]] });

test('on "auto" two helpers listen; a sentence in the other language hands over to the other one, nothing garbled shown', async () => {
  const { e, procs, opened, got } = engine({ source: 'auto', heard: 'en', languages: ['es', 'en'] });
  const heard = [];
  e.on('heard', (l) => heard.push(l));
  e.start();
  await sleep(5);
  assert.deepEqual(opened.map((x) => x.lang), ['en', 'es'], 'the language believed spoken, and the room\'s other one');
  procs[0].say({ ready: 'en-US', engine: 'SpeechAnalyzer' });
  procs[1].say({ ready: 'es-ES', engine: 'SpeechAnalyzer' });
  await sleep(5);
  e.sendAudio(Buffer.alloc(3200));
  await sleep(5);
  assert.ok(procs[0].audio && procs[0].audio === procs[1].audio, 'both hear the same sound');
  // English: the English helper captions as usual (and early, before Apple settles it).
  procs[0].say(progress('Good morning everyone and welcome to the summit. Today', 0, 3.3));
  procs[0].say(progress('Good morning everyone and welcome to the summit. Today we', 0, 3.5));
  procs[1].say(settled('Gud mornin evrivan an guelcom tu de samit.', 0, 3));
  await sleep(5);
  assert.deepEqual(got.input.map((x) => x.text), [' Good morning everyone and welcome to the summit.']);
  // The speaker switches to Spanish. The Spanish helper settles it; the English one writes Spanish-looking words.
  procs[1].say(settled('Hoy seguimos en español con las preguntas de la gente.', 3.1, 7));
  procs[1].say(progress('Y esta es la', 7, 8));
  procs[0].say(settled('Good morning everyone and welcome to the summit. La hora sigo en espanol para las preguntas de la gente.', 0, 7.1));
  await sleep(5);
  assert.deepEqual(heard, ['es']);
  assert.deepEqual(got.input.map((x) => x.text).slice(1), [' Hoy seguimos en español con las preguntas de la gente.'], 'the Spanish helper\'s sentence, not the garbled one');
  assert.equal(got.interim.at(-1).text, 'Y esta es la', 'and its words in progress');
  // Spanish leads now, captioning early as usual.
  procs[1].say(progress('Y esta es la segunda pregunta que tenemos hoy. Muy', 7, 10));
  procs[1].say(progress('Y esta es la segunda pregunta que tenemos hoy. Muy bien', 7, 10.4));
  procs[0].say(settled('e esta es la segunda pregunta que tenemos', 7, 10));
  await sleep(5);
  assert.equal(got.input.at(-1).text, ' Y esta es la segunda pregunta que tenemos hoy.');
  assert.equal(got.input.length, 3);
  assert.ok(got.input.every((x) => x.lang === undefined), 'on "auto" the room tells each sentence\'s language from its words');
  e.stop();
});

test('on "auto" a sentence in the lead\'s own language is never handed over', async () => {
  const { e, procs, got } = engine({ source: 'auto', heard: 'es', languages: ['en'] });
  e.start();
  await sleep(5);
  procs[0].say({ ready: 'es-ES', engine: 'SpeechAnalyzer' });
  procs[1].say({ ready: 'en-US', engine: 'SpeechAnalyzer' });
  await sleep(5);
  procs[1].say(settled('la cultura de la gente is for every one hoo comes', 0, 3));
  procs[0].say(settled('La cultura de la gente es para todos los que vienen.', 0, 3));
  procs[0].say(settled('Gracias.', 3.2, 3.6)); // too short to tell: stays with the lead
  await sleep(5);
  assert.deepEqual(got.input.map((x) => x.text), [' La cultura de la gente es para todos los que vienen.', ' Gracias.']);
  e.stop();
});

test('runs of lone punctuation (music, noise) never reach the captions', async () => {
  const { e, procs, got } = engine();
  e.start();
  await sleep(5);
  procs[0].say({ ready: 'en-US', engine: 'SpeechAnalyzer' });
  procs[0].say({ partial: ', , ,, , ,, ,' });
  procs[0].say({ final: 'That is all. , , ,, ,' });
  await sleep(5);
  assert.deepEqual(got.interim, []);
  assert.deepEqual(got.input, [{ text: ' That is all.', finished: true, lang: 'en' }]);
  e.stop();
});
