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
  e.sendAudio(Buffer.alloc(3200)); // not live yet: dropped
  procs[0].say({ ready: 'en-US', engine: 'SpeechAnalyzer' });
  await sleep(5);
  assert.equal(e.state, 'live');
  e.sendAudio(Buffer.alloc(3200));
  e.sendAudio(Buffer.alloc(3200));
  await sleep(5);
  assert.equal(procs[0].audio, 6400);
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
