import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CaptionTrack } from '../src/captions.js';
import { toSRT, toVTT, toTXT } from '../src/store.js';
import { ffmpegArgs } from '../src/pull.js';
import { rms, Chunker } from '../src/audio.js';

const fakeGlossary = {
  apply: (t) => t.replace(/cubernetes/gi, 'Kubernetes'),
};

test('caption track finalizes on sentence end and applies glossary', () => {
  let now = 0;
  const tr = new CaptionTrack({ channel: 'orig', glossary: fakeGlossary, clock: () => now, idleMs: 10_000 });
  const out = [];
  tr.on('caption', (s) => out.push(s));
  for (const w of ['Today', ' we', ' talk', ' about', ' cubernetes', ' in', ' production.', ' Next']) { now += 300; tr.push(w); }
  const finals = out.filter((s) => s.final);
  assert.equal(finals.length, 1);
  assert.equal(finals[0].text, 'Today we talk about Kubernetes in production.');
  assert.equal(tr.cur.raw, 'Next');
  tr.flush();
});

test('caption track splits very long unpunctuated speech', () => {
  const tr = new CaptionTrack({ channel: 'es', glossary: null, clock: () => 0, maxChars: 60, idleMs: 10_000 });
  const finals = [];
  tr.on('caption', (s) => s.final && finals.push(s.text));
  for (let i = 0; i < 40; i++) tr.push(` palabra${i}`);
  assert.ok(finals.length >= 4);
  assert.ok(finals.every((t) => t.length <= 60));
  tr.flush();
});

test('caption track accepts cumulative fragments', () => {
  const tr = new CaptionTrack({ channel: 'en', glossary: null, clock: () => 0, idleMs: 10_000 });
  let last;
  tr.on('caption', (s) => (last = s));
  tr.push('Hello');
  tr.push('Hello world');
  assert.equal(last.text, 'Hello world');
  tr.flush();
});

test('exports produce valid SRT/VTT/TXT', () => {
  const segs = [
    { text: 'Hola a todos.', start: 0, end: 1500 },
    { text: 'Bienvenidos.', start: 1400, end: 2600 },
    { text: 'Otra idea.', start: 9000, end: 10000 },
  ];
  const srt = toSRT(segs);
  assert.match(srt, /^1\n00:00:00,000 --> 00:00:01,399\nHola a todos\.\n/);
  assert.match(toVTT(segs), /^WEBVTT\n\n00:00:00\.000 --> /);
  assert.equal(toTXT(segs), 'Hola a todos. Bienvenidos.\n\nOtra idea.\n');
});

test('ffmpeg args: files are paced in real time, streams are not', () => {
  assert.ok(ffmpegArgs('samples/a.wav').includes('-re'));
  assert.ok(!ffmpegArgs('srt://0.0.0.0:9000?mode=listener').includes('-re'));
  assert.ok(ffmpegArgs('https://x/stream.m3u8').includes('-reconnect'));
  assert.ok(!ffmpegArgs('rtmp://x/live').includes('-reconnect'));
});

test('audio helpers', () => {
  const b = Buffer.alloc(3200 * 2 + 100);
  const chunks = [];
  const c = new Chunker((x) => chunks.push(x.length));
  c.push(b);
  assert.deepEqual(chunks, [3200, 3200]);
  const loud = Buffer.alloc(3200);
  for (let i = 0; i < 1600; i++) loud.writeInt16LE(i % 2 ? 16384 : -16384, i * 2);
  assert.ok(Math.abs(rms(loud) - 0.5) < 0.01);
});

test('native WAV reader streams 16 kHz samples without ffmpeg', async () => {
  const { openAudio } = await import('../src/pull.js');
  const src = openAudio('samples/talk-en.wav', { realtime: false });
  let bytes = 0;
  await new Promise((res, rej) => { src.on('data', (b) => (bytes += b.length)); src.on('end', res); src.on('error', rej); });
  assert.ok(bytes > 16000 * 2 * 30, `got ${bytes} bytes`);
});
