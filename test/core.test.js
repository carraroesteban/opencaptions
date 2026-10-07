import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CaptionTrack } from '../src/captions.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store, toSRT, toVTT, toTXT } from '../src/store.js';
import { ffmpegArgs } from '../src/pull.js';
import { rms, Chunker } from '../src/audio.js';

const fakeGlossary = {
  apply: (t) => t.replace(/tele health/gi, 'telehealth'),
};

test('caption track finalizes on sentence end and applies glossary', () => {
  let now = 0;
  const tr = new CaptionTrack({ channel: 'orig', glossary: fakeGlossary, clock: () => now, idleMs: 10_000 });
  const out = [];
  tr.on('caption', (s) => out.push(s));
  for (const w of ['Today', ' we', ' talk', ' about', ' tele', ' health', ' in', ' clinics.', ' Next']) { now += 300; tr.push(w); }
  const finals = out.filter((s) => s.final);
  assert.equal(finals.length, 1);
  assert.equal(finals[0].text, 'Today we talk about telehealth in clinics.');
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

test('txt export: a paragraph never ends mid-sentence, even when captions were cut at every pause', () => {
  // The local engine cuts captions at pauses, often mid-sentence: an 8 s pause there must not start a paragraph.
  const segs = [
    { start: 0, end: 1000, text: 'Many people here are good at trying to explain' },
    { start: 9000, end: 10000, text: 'Tor to their friends.' },
    { start: 15000, end: 16000, text: 'Next topic.' }, // a pause after a sentence: new paragraph
    { start: 16500, end: 17000, text: 'It goes on' },
    { start: 50000, end: 51000, text: 'after a long silence.' }, // quiet for a long while: new paragraph anyway
  ];
  assert.equal(toTXT(segs), 'Many people here are good at trying to explain Tor to their friends.\n\nNext topic. It goes on\n\nafter a long silence.\n');
  // A long run of speech is split at a sentence end once the paragraph is long.
  const long = Array.from({ length: 12 }, (_, i) => ({ start: i * 3000, end: i * 3000 + 2900, text: `Sentence number ${i} is here and it is about fifty characters.` }));
  const ps = toTXT(long).trim().split('\n\n');
  assert.ok(ps.length >= 2 && ps.every((p) => /\.$/.test(p) && p.length < 700), JSON.stringify(ps.map((p) => p.length)));
});

test('ffmpeg args: files are paced in real time, streams are not', () => {
  assert.ok(ffmpegArgs('samples/a.wav').includes('-re'));
  assert.ok(!ffmpegArgs('srt://0.0.0.0:9000?mode=listener').includes('-re'));
  assert.ok(ffmpegArgs('https://x/stream.m3u8').includes('-reconnect'));
  assert.ok(!ffmpegArgs('rtmp://x/live').includes('-reconnect'));
  assert.ok(ffmpegArgs('https://x/stream.m3u8').includes('-protocol_whitelist'));
  assert.ok(!ffmpegArgs('samples/a.wav').includes('-protocol_whitelist'));
  assert.ok(ffmpegArgs('rtmp://0.0.0.0:1935/live/test').includes('-listen'), 'RTMP listener for OBS/vMix');
  assert.ok(!ffmpegArgs('rtmp://example.com/live/test').includes('-listen'));
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

test('speaker labels: VTT voice tags on every cue, SRT and TXT name the speaker when it changes', () => {
  const segs = [
    { start: 0, end: 2000, text: 'Welcome, everyone.', spk: 'Host' },
    { start: 2500, end: 4000, text: 'Our first speaker is Ana.', spk: 'Host' },
    { start: 5000, end: 7000, text: 'Thank you!', spk: 'Ana Pérez' },
    { start: 7200, end: 9000, text: 'No label here.' },
  ];
  assert.match(toVTT(segs), /<v Host>Welcome, everyone\.\n[\s\S]*<v Host>Our first[\s\S]*<v Ana Pérez>Thank you!\n[\s\S]*\nNo label here\./);
  const srt = toSRT(segs);
  assert.match(srt, /\nHost: Welcome, everyone\.\n/);
  assert.match(srt, /\nOur first speaker is Ana\.\n/, 'same speaker: not repeated');
  assert.match(srt, /\nAna Pérez: Thank you!\n/);
  assert.equal(toTXT(segs), 'Host: Welcome, everyone. Our first speaker is Ana.\n\nAna Pérez: Thank you! No label here.\n');
});

test('WebVTT escapes & < > in captions and speaker names (the file stays valid)', () => {
  const vtt = toVTT([{ start: 0, end: 2000, text: 'Q&A starts <now>', spk: 'Audience (Q&A)' }]);
  assert.match(vtt, /<v Audience \(Q&amp;A\)>Q&amp;A starts &lt;now&gt;\n/);
});

test('saved talks: summaries and transcripts are cached, but never stale', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-store-'));
  try {
    const store = new Store(dir, { enabled: true });
    store.openTalk('main', { id: 't1', title: 'One', startedAt: 1 }, ['orig', 'es']);
    store.append('main', 't1', { channel: 'orig', text: 'Hello.', start: 0, end: 1000 });
    store.append('main', 't1', { channel: 'es', text: 'Hola.', start: 0, end: 1000 });
    assert.deepEqual(store.listTalks('main').map((t) => [t.segments, t.origSegments, t.durationMs]), [[2, 1, 1000]]);
    assert.equal(store.readTalk('main', 't1').length, 2);
    store.append('main', 't1', { channel: 'orig', text: 'Bye.', start: 1000, end: 2500 });
    assert.deepEqual(store.listTalks('main').map((t) => [t.segments, t.origSegments, t.durationMs]), [[3, 2, 2500]], 'a new line shows up');
    assert.equal(store.readTalk('main', 't1').length, 3);
    fs.writeFileSync(path.join(dir, 'transcripts', '.DS_Store'), ''); // Finder's file must not break listing or retention
    assert.equal(store.listTalks('main').length, 1);
    new Store(dir, { enabled: true, retentionDays: 30 });
    assert.ok(store.removeTalk('main', 't1'), 'a transcript can be deleted for good');
    assert.equal(store.listTalks('main').length, 0);
    assert.equal(store.readTalk('main', 't1').length, 0, 'nothing cached is left behind');
    assert.equal(store.removeTalk('main', 't1'), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('saved talks: a caption saved again with its id is a correction (newest text, first place)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-store-'));
  try {
    const store = new Store(dir, { enabled: true });
    store.openTalk('main', { id: 't1', title: 'One', startedAt: 1 }, ['orig']);
    store.append('main', 't1', { id: 'a', channel: 'orig', text: 'Helo.', start: 0, end: 1000 });
    store.append('main', 't1', { id: 'b', channel: 'orig', text: 'Bye.', start: 1000, end: 2000 });
    assert.deepEqual(store.correct('main', 't1', 'a', 'Hello.'), { id: 'a', channel: 'orig', text: 'Hello.', start: 0, end: 1000, edited: true });
    assert.deepEqual(store.readTalk('main', 't1').map((x) => x.text), ['Hello.', 'Bye.']);
    assert.equal(store.correct('main', 't1', 'zz', 'x'), null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
