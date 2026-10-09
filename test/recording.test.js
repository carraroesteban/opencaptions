// Caption a recording (src/recording.js): a file uploaded in pieces becomes a normal transcript of a room, much
// faster than real time. With the simulated AI: the upload endpoint and its refusals, progress, the stored transcript
// (meta.json + captions.jsonl, like a live talk), its SRT export, cancelling, and npm run subtitle. Plus the pieces
// the engines share: where to cut the audio, caption lines, placing translations, Gemini's timestamps, estimates.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const { splitLine, cutPieces, buildCues, sentences, placeTranslation, parseTime, geminiSegments, estimate, speechThreshold, MAX_CHARS } = await import('../src/recording.js');
const { withAsrSlot } = await import('../src/local/asr.js');

const SAMPLE = 'samples/talk-en.wav'; // 58 s, 16 kHz mono
const PORT = 31000 + Math.floor(Math.random() * 2000);
const base = `http://127.0.0.1:${PORT}`;
const ADMIN = 'admin-password-for-recording-tests', CREW = 'crew-password-for-recording-tests';
let srv, dataDir, tmpDir;

// ---------------------------------------------------------------- pieces shared by the engines

test('recording: caption lines are at most two lines long and end where they read best', () => {
  const text = 'Hi everyone and welcome to Horizon Summit. My name is Hiroshi Tanaka and I work on telehealth for rural clinics. Today I want to talk about care at a distance and why the best technology is the one patients barely notice.';
  const lines = splitLine(text);
  assert.ok(lines.every((l) => l.length <= MAX_CHARS), lines.join(' | '));
  assert.equal(lines.join(' '), text, 'no word lost or added');
  assert.equal(lines[0], 'Hi everyone and welcome to Horizon Summit.', 'a line ends with its sentence');
  assert.ok(!lines.some((l) => /\s(and I|the|a)$/.test(l)), 'not on a short word that belongs with the next line');
  assert.deepEqual(splitLine('Short one.'), ['Short one.']);
  assert.deepEqual(splitLine('  '), []);
  assert.ok(splitLine('字'.repeat(200)).every((l) => l.length <= MAX_CHARS), 'no spaces (Chinese): hard cuts');
});

test('recording: the audio is cut at pauses, silence is skipped, and no piece is too long', () => {
  // 100 ms frames: 2 s silence, 12 s speech with a 0.6 s pause at 6 s, 5 s silence, 40 s of speech without a pause.
  const lv = [...Array(20).fill(0), ...Array(60).fill(0.05), ...Array(6).fill(0), ...Array(60).fill(0.05), ...Array(50).fill(0), ...Array(400).fill(0.05)];
  lv[146 + 50 + 250] = 0.02; // the quietest moment in the long stretch
  const pieces = cutPieces(lv, 0.03, { minMs: 4000, maxMs: 25000, pauseMs: 400, breakMs: 1500 });
  assert.equal(pieces[0].from, 18, 'starts 200 ms before the first word, not at the silence before it');
  assert.ok(pieces[0].to >= 80 && pieces[0].to <= 86, `the first piece ends in the pause (${pieces[0].to})`);
  for (const p of pieces) assert.ok((p.to - p.from) * 100 <= 25000, 'at most maxMs');
  for (let i = 1; i < pieces.length; i++) assert.ok(pieces[i].from >= pieces[i - 1].to, 'pieces don’t overlap');
  assert.ok(!pieces.some((p) => p.from >= 150 && p.to <= 195), 'the 5 s of silence isn’t a piece');
  const total = pieces.reduce((a, p) => a + p.voiced, 0);
  assert.equal(total, lv.filter((x) => x >= 0.03).length, 'every frame of speech is in a piece');
  assert.equal(cutPieces(Array(100).fill(0), 0.03, { minMs: 4000, maxMs: 25000, pauseMs: 400, breakMs: 1500 }).length, 0, 'silence only: nothing to send');
  assert.ok(speechThreshold(lv) >= 0.004);
});

test('recording: a long segment becomes lines placed on its speech, without overlaps', () => {
  const lv = [...Array(30).fill(0.05), ...Array(10).fill(0), ...Array(30).fill(0.05)]; // 3 s speech, 1 s pause, 3 s speech
  const text = 'The first months were hard, and some people did not trust the video calls at all. We listened and made every step shorter for everyone.';
  const cues = buildCues([{ start: 0, end: 7000, text }], lv, 0.03);
  assert.ok(cues.length >= 2);
  assert.equal(cues.map((c) => c.text).join(' '), text);
  for (const c of cues) assert.ok(c.text.length <= MAX_CHARS && c.end > c.start && c.start >= 0 && (c === cues[cues.length - 1] || c.end <= 7000), JSON.stringify(c));
  for (let i = 1; i < cues.length; i++) assert.ok(cues[i].start >= cues[i - 1].end, 'no overlap');
  assert.equal(cues[1].start, 4000, 'the second line starts when the speaker does again, after the pause');
  assert.ok(cues[0].end >= 3000 && cues[0].end <= 4000, 'the first one stays on screen through the pause, to be read');
  // A short line stays on screen long enough to read, when the next one leaves room.
  const short = buildCues([{ start: 0, end: 300, text: 'Yes.' }, { start: 5000, end: 6000, text: 'And then we started.' }], lv, 0.03);
  assert.ok(short[0].end - short[0].start >= 1000);
});

test('recording: a translated sentence is laid over the times of its original lines', () => {
  const cues = [{ start: 0, end: 2000, text: 'Hi everyone and welcome to Horizon Summit,' }, { start: 2000, end: 5000, text: 'my name is Hiroshi Tanaka.' }, { start: 6000, end: 8000, text: 'Next sentence.' }];
  const sents = sentences(cues);
  assert.equal(sents.length, 2, 'a sentence ends with its punctuation');
  assert.equal(sents[0].text, 'Hi everyone and welcome to Horizon Summit, my name is Hiroshi Tanaka.');
  const out = placeTranslation(sents[0], 'Hola a todos y bienvenidos a Horizon Summit, mi nombre es Hiroshi Tanaka.');
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((c) => [c.start, c.end]), [[0, 2000], [2000, 5000]], 'the original lines’ times');
  assert.equal(out.map((c) => c.text).join(' '), 'Hola a todos y bienvenidos a Horizon Summit, mi nombre es Hiroshi Tanaka.');
  assert.match(out[0].text, /Summit,$/, 'cut after the comma, where the original line ends');
  assert.deepEqual(placeTranslation(sents[1], 'Siguiente frase.'), [{ start: 6000, end: 8000, text: 'Siguiente frase.' }]);
  assert.deepEqual(placeTranslation(sents[1], '  '), []);
});

test('recording: Gemini’s timestamps are read in every shape, and broken ones are repaired', () => {
  assert.equal(parseTime('02:31.5'), 151.5);
  assert.equal(parseTime('1:02:31'), 3751);
  assert.equal(parseTime('7.25'), 7.25);
  assert.equal(parseTime(12), 12);
  assert.ok(Number.isNaN(parseTime('soon')));
  const segs = geminiSegments({ segments: [{ start: '00:00.0', end: '00:03.2', text: 'Hello there.' }, { start: '00:03.5', end: '00:02.0', text: 'Backwards end.' }, { start: '00:09.0', end: '00:10.0', text: '' }] }, 60000);
  assert.deepEqual(segs.map((s) => s.text), ['Hello there.', 'Backwards end.']);
  assert.deepEqual([segs[0].start, segs[0].end], [0, 3200]);
  assert.ok(segs[1].end > segs[1].start, 'an end before the start is replaced');
  // A model that counted past the end of the clip, consistently: scaled back into it.
  const scaled = geminiSegments({ segments: [{ start: '00:00', end: '01:00', text: 'a' }, { start: '01:00', end: '02:00', text: 'b' }] }, 60000);
  assert.ok(scaled.every((s) => s.end <= 60000) && scaled[1].start === 30000);
  // No usable times at all: spread by length over the clip.
  const spread = geminiSegments({ segments: [{ start: '?', end: '?', text: 'one two' }, { start: 'x', end: 'y', text: 'three four' }] }, 10000);
  assert.ok(spread[0].start === 0 && spread[1].end === 10000);
});

test('recording: estimates grow with length and languages; only Gemini costs money', () => {
  const g1 = estimate({ durationMs: 3600_000, languages: 1, engine: 'gemini' });
  const g3 = estimate({ durationMs: 3600_000, languages: 3, engine: 'gemini' });
  assert.ok(g1.usd > 0 && g3.usd > g1.usd && g3.seconds > g1.seconds);
  assert.ok(g1.seconds < 600, `an hour with Gemini: minutes, not an hour (${g1.seconds} s)`);
  assert.ok(g1.usd < 1, `an hour costs cents (${g1.usd})`);
  assert.equal(estimate({ durationMs: 60_000, languages: 2, engine: 'local' }).usd, null);
  assert.ok(estimate({ durationMs: 60_000, languages: 2, engine: 'mock' }).seconds <= 2);
});

test('recording: local speech server queue — a live room’s pass goes before a recording’s next piece', async () => {
  const order = [];
  let release;
  const first = withAsrSlot(() => new Promise((r) => { release = r; order.push('live 1'); }));
  const bg = withAsrSlot(async () => { order.push('recording'); }, { background: true });
  const live = withAsrSlot(async () => { order.push('live 2'); });
  await new Promise((r) => setTimeout(r, 10));
  release();
  await Promise.all([first, bg, live]);
  assert.deepEqual(order, ['live 1', 'live 2', 'recording']);
});

test('recording: the Gemini path end to end, with a stand-in for Gemini', async () => {
  const { Recordings, _setClient } = await import('../src/recording.js');
  const { config } = await import('../src/config.js');
  const { Store } = await import('../src/store.js');
  const { Readable } = await import('node:stream');
  const { promptLanguage } = await import('../src/languages.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-rec-gemini-'));
  const requests = [];
  _setClient({
    models: {
      async generateContent(req) {
        requests.push(req);
        const usageMetadata = { promptTokenCount: 2000, candidatesTokenCount: 300, promptTokensDetails: [{ modality: 'AUDIO', tokenCount: 1860 }] };
        if (Array.isArray(req.contents)) { // a piece of audio: subtitle lines with timestamps
          return { usageMetadata, text: JSON.stringify({ language: 'en', segments: [
            { start: '00:00.5', end: '00:04.0', text: 'Hi everyone, and welcome to Horizon Summit.' },
            { start: '00:04.2', end: '00:09.0', text: 'My name is Hiroshi Tanaka, and I work on telehealth for rural clinics.' },
            { start: '00:52.0', end: '00:57.5', text: 'Thank you very much.' },
          ] }) };
        }
        const to = / to (.+?), as a professional subtitler/.exec(req.config.systemInstruction)[1];
        const texts = JSON.parse(String(req.contents).slice(String(req.contents).indexOf('[')));
        return { usageMetadata, text: JSON.stringify(texts.map((t) => `[${to}] ${t}`)) };
      },
    },
  });
  const engine = config.engine;
  config.engine = 'gemini';
  try {
    const recs = new Recordings({ store: new Store(dir), glossary: { vocabulary: (x) => x, apply: (t) => t }, room: (id) => (id === 'main' ? { targets: ['es'] } : null), log: () => {} });
    const wav = fs.readFileSync(SAMPLE);
    const c = recs.create({ name: 'talk-en.wav', size: wav.length });
    const body = Object.assign(Readable.from([wav]), { complete: true });
    const ready = await recs.append(c.id, 0, body);
    assert.equal(ready.state, 'ready');
    assert.ok(ready.estimate.usd > 0, 'Gemini: an estimate in US$');
    recs.start(c.id, { room: 'main', source: 'auto', targets: ['es', 'en'], title: 'Gemini' });
    let j;
    for (let i = 0; i < 200 && !['done', 'failed'].includes((j = recs.get(c.id)).state); i++) await new Promise((r) => setTimeout(r, 25));
    assert.equal(j.state, 'done', j.error);
    const audio = requests.find((r) => Array.isArray(r.contents));
    const part = audio.contents[0].parts[0].inlineData;
    assert.ok(['audio/ogg', 'audio/wav'].includes(part.mimeType));
    assert.ok(Buffer.from(part.data, 'base64').length < wav.length, 'compressed (Opus) when ffmpeg is there, inline (no Files API) for a small piece');
    assert.equal(audio.model, config.recordingModel);
    assert.equal(audio.config.responseMimeType, 'application/json');
    assert.match(audio.contents[0].parts[1].text, /lasts 00:5[78]/, 'Gemini is told how long the clip is');
    assert.equal(requests.filter((r) => !Array.isArray(r.contents)).length, 1, 'one translation request for a few sentences (English needs none: it’s spoken)');
    const segs = recs.export(c.id, 'orig', 'json');
    const orig = segs.filter((x) => x.channel === 'orig');
    assert.deepEqual(orig.map((x) => x.text), ['Hi everyone, and welcome to Horizon Summit.', 'My name is Hiroshi Tanaka, and I work on telehealth for rural clinics.', 'Thank you very much.']);
    assert.ok(orig[0].start >= 300 && orig[0].start <= 700 && orig[2].start >= 51_500, 'Gemini’s times, in ms');
    const es = segs.filter((x) => x.channel === 'es');
    assert.equal(es.map((x) => x.text).join(' '), orig.map((x) => `[${promptLanguage('es')}] ${x.text}`).join(' '), 'every sentence translated, in order');
    assert.ok(es.every((x) => x.text.length <= MAX_CHARS + 16), 'a translation too long for one line is split');
    assert.deepEqual(segs.filter((x) => x.channel === 'en').map((x) => x.text), orig.map((x) => x.text));
    assert.ok(j.costUsd > 0, 'what it really cost, from the usage Gemini reports');
    assert.ok(fs.existsSync(path.join(dir, 'transcripts', 'main', j.talk.id, 'captions.jsonl')));
  } finally {
    config.engine = engine;
    _setClient(null);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- the server

const as = (token) => (token ? { authorization: `Bearer ${token}` } : {});
const json = (method, url, body, token = ADMIN) => fetch(base + url, { method, headers: { 'content-type': 'application/json', ...as(token) }, body: body ? JSON.stringify(body) : undefined });
const put = (id, offset, bytes, token = ADMIN) => fetch(`${base}/api/recordings/${id}/data?offset=${offset}`, { method: 'PUT', headers: { 'content-type': 'application/octet-stream', ...as(token) }, body: bytes });
const leftovers = () => fs.readdirSync(tmpDir).filter((d) => d.startsWith('opencaptions-rec-'));

/** Upload a file in pieces of `piece` bytes (the server's own size by default); returns the last answer. */
async function upload(buf, name = 'talk-en.wav', piece = 0) {
  const r = await json('POST', '/api/recordings', { name, size: buf.length });
  assert.equal(r.status, 200, await r.clone().text());
  let j = await r.json();
  const step = piece || j.chunkBytes;
  for (let at = 0; j.state === 'uploading'; at = j.size) {
    const res = await put(j.id, at, buf.subarray(at, at + step));
    j = { ...j, ...(await res.json()) };
    assert.equal(res.status, 200, JSON.stringify(j));
  }
  return j;
}

async function finish(id) {
  const seen = [];
  for (let i = 0; i < 300; i++) {
    const j = await (await json('GET', `/api/recordings/${id}`)).json();
    seen.push(j);
    if (!['queued', 'running'].includes(j.state)) return { job: j, seen };
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('the recording never finished');
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-rec-data-'));
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-rec-tmp-')); // the server's temporary folder: uploads go here
  srv = spawn(process.execPath, ['src/server.js'], {
    env: {
      ...process.env, PORT: String(PORT), ENGINE: 'mock', DATA_DIR: dataDir, SCHEDULE: path.join(dataDir, 's.json'), AUTH: 'token', TZ: 'UTC',
      EVENT_CONFIG: process.env.EVENT_CONFIG || 'test/fixtures/event.json', ADMIN_TOKEN: ADMIN, CREW_TOKEN: CREW, INGEST_TOKEN: 'ingest-password-for-recording-tests',
      PUBLIC_URL: '', FALLBACK: '', TUNNEL: '', GEMINI_API_KEY: '', RECORDING_MAX_MB: '8', TMPDIR: tmpDir, TMP: tmpDir, TEMP: tmpDir,
    },
    stdio: 'ignore',
  });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/healthz`)).ok) break; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 100));
  }
});
after(() => { srv?.kill(); fs.rmSync(dataDir, { recursive: true, force: true }); fs.rmSync(tmpDir, { recursive: true, force: true }); });

test('recording API: admin only', async () => {
  assert.equal((await json('POST', '/api/recordings', { name: 'a.wav', size: 10 }, '')).status, 401);
  assert.equal((await json('POST', '/api/recordings', { name: 'a.wav', size: 10 }, CREW)).status, 403, 'not the crew password');
  assert.equal((await json('GET', '/api/recordings', null, CREW)).status, 403);
  assert.equal((await put('anything', 0, Buffer.alloc(10), '')).status, 401);
});

test('recording API: upload in pieces, checked with an estimate; refusals say why', async () => {
  const wav = fs.readFileSync(SAMPLE);
  const j = await upload(wav, 'talk-en.wav', 500_000); // four pieces
  assert.equal(j.state, 'ready');
  assert.equal(j.name, 'talk-en.wav');
  assert.ok(Math.abs(j.durationMs - 58_050) < 100, `length ${j.durationMs}`);
  assert.equal(j.engine, 'mock');
  assert.ok(j.estimate.seconds >= 1 && j.estimate.usd === null);
  assert.equal(leftovers().length, 1, 'the file waits in one temporary folder');
  assert.equal((await json('DELETE', `/api/recordings/${j.id}`)).status, 200);
  assert.equal(leftovers().length, 0, 'thrown away: its folder is deleted');
  assert.equal((await json('GET', `/api/recordings/${j.id}`)).status, 404);

  // Too big for RECORDING_MAX_MB (8 MB here).
  const big = await json('POST', '/api/recordings', { name: 'huge.mov', size: 9 * 1024 * 1024 });
  assert.equal(big.status, 413);
  assert.equal((await big.json()).code, 'too-big');
  // A piece at the wrong place: the server says where to carry on.
  const c = await (await json('POST', '/api/recordings', { name: 'x.wav', size: wav.length })).json();
  const wrong = await put(c.id, 1000, wav.subarray(1000, 2000));
  assert.equal(wrong.status, 409);
  assert.deepEqual(await wrong.json(), { error: 'expected the piece at byte 0', code: 'offset', size: 0 });
  // More bytes than announced.
  const over = await put(c.id, 0, Buffer.concat([wav, Buffer.alloc(10)]));
  assert.equal(over.status, 413);
  await json('DELETE', `/api/recordings/${c.id}`);
  // Not audio or video: refused by ffmpeg's look at it (or, without ffmpeg, because only WAV can be read).
  const text = Buffer.from('These are meeting notes, not a recording.\n'.repeat(50));
  const t = await (await json('POST', '/api/recordings', { name: 'notes.mp3', size: text.length })).json();
  const bad = await put(t.id, 0, text);
  assert.ok([415, 503].includes(bad.status), String(bad.status));
  assert.ok(['not-media', 'no-ffmpeg'].includes((await bad.json()).code));
  assert.equal((await json('GET', `/api/recordings/${t.id}`)).status, 404, 'a refused file is forgotten');
  assert.equal(leftovers().length, 0, 'and deleted');
});

let done; // the finished job of the next test, for the ones after it
test('recording: progress while it runs, done in a few seconds, then the temporary file is gone', async () => {
  const j = await upload(fs.readFileSync(SAMPLE));
  const t0 = Date.now();
  const s = await json('POST', `/api/recordings/${j.id}/start`, { room: 'room-a', source: 'en', targets: ['es', 'en', 'pt'], title: 'Telehealth at a distance' });
  assert.equal(s.status, 200);
  const started = await s.json();
  assert.ok(['queued', 'running'].includes(started.state));
  const { job, seen } = await finish(j.id);
  const ms = Date.now() - t0;
  assert.equal(job.state, 'done', job.error);
  assert.ok(ms < 5000, `58 s of audio with the simulated AI in ${ms} ms`);
  const progress = seen.map((x) => x.progress);
  assert.ok(progress.every((p, i) => i === 0 || p >= progress[i - 1]), `progress never goes back: ${progress.join(' ')}`);
  assert.equal(job.progress, 1);
  assert.ok(seen.every((x) => ['queued', 'decode', 'transcribe', 'translate', 'save', 'done'].includes(x.phase)), seen.map((x) => x.phase).join(' '));
  assert.equal(job.lang, 'en');
  assert.ok(job.captions > 5);
  assert.deepEqual(Object.keys(job.talk), ['stage', 'id']);
  assert.equal(job.talk.stage, 'room-a');
  assert.equal(leftovers().length, 0, 'the uploaded file is deleted');
  assert.equal((await json('POST', `/api/recordings/${j.id}/start`, { room: 'room-a' })).status, 409, 'a job starts once');
  done = job;
});

test('recording: the transcript is stored like a live talk’s and listed with the room’s talks', async () => {
  const dir = path.join(dataDir, 'transcripts', 'room-a', done.talk.id);
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
  assert.equal(meta.stage, 'room-a');
  assert.equal(meta.title, 'Telehealth at a distance');
  assert.equal(meta.source, 'recording');
  assert.equal(meta.file, 'talk-en.wav');
  assert.deepEqual(meta.languages, ['orig', 'es', 'en', 'pt']);
  const segs = fs.readFileSync(path.join(dir, 'captions.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual([...new Set(segs.map((x) => x.channel))].sort(), ['en', 'es', 'orig', 'pt']);
  for (const x of segs) {
    assert.ok(x.id && x.final === true && x.text && x.end > x.start, JSON.stringify(x));
    assert.ok(x.text.length <= MAX_CHARS + 16, x.text);
  }
  const orig = segs.filter((x) => x.channel === 'orig');
  assert.ok(orig.every((x, i) => i === 0 || x.start >= orig[i - 1].end), 'original lines in order, without overlaps');
  assert.ok(orig[orig.length - 1].end <= 58_100 + 3000, 'within the recording');
  assert.deepEqual(segs.filter((x) => x.channel === 'en').map((x) => x.text), orig.map((x) => x.text), 'spoken in English: its English captions are the original');
  const talks = await (await json('GET', '/api/stages/room-a/talks')).json();
  const listed = talks.find((x) => x.id === done.talk.id);
  assert.ok(listed && listed.origSegments === orig.length && listed.source === 'recording');
  const info = await (await json('GET', `/api/stages/room-a/talks/${done.talk.id}`)).json();
  assert.equal(info.title, 'Telehealth at a distance');
  const report = await (await json('GET', '/api/report')).json();
  assert.ok(report.rooms.find((r) => r.id === 'room-a').talks.some((x) => x.id === done.talk.id), 'in the event report too');
});

test('recording: SRT export of each language, the room’s or not', async () => {
  const srt = async (lang) => (await fetch(`${base}/api/stages/room-a/export.srt?talk=${done.talk.id}&lang=${lang}`, { headers: as(ADMIN) })).text();
  const orig = await srt('orig');
  const blocks = orig.trim().split(/\n\n/);
  assert.equal(blocks.length, done.captions);
  let prev = -1;
  blocks.forEach((b, i) => {
    const [n, times, ...text] = b.split('\n');
    assert.equal(n, String(i + 1));
    const m = /^(\d\d):(\d\d):(\d\d),(\d{3}) --> (\d\d):(\d\d):(\d\d),(\d{3})$/.exec(times);
    assert.ok(m, times);
    const start = ((+m[1] * 60 + +m[2]) * 60 + +m[3]) * 1000 + +m[4];
    assert.ok(start >= prev, 'cues in order');
    prev = start;
    assert.ok(text.join(' ').length > 0);
  });
  assert.match(orig, /Good morning everyone, and thank you for joining us today\./);
  assert.match(await srt('es'), /Buenos días a todos, y gracias por acompañarnos hoy\./);
  // Room A captions in es, en and pt; Main Stage only in es and en: a recording's own languages export anywhere.
  assert.match(await srt('pt'), /Bom dia a todos/);
  const zip = await fetch(`${base}/api/transcripts.zip?room=room-a`, { headers: as(ADMIN) });
  assert.equal(zip.status, 200, 'in the room’s .zip too');
});

test('recording: cancelling a job, waiting or running, stops it and deletes its file', async () => {
  // A longer recording (the talk four times over), so the first job is still busy when the second one is started.
  const wav = fs.readFileSync(SAMPLE);
  const body = wav.subarray(44);
  const long = Buffer.concat([wav.subarray(0, 44), body, body, body, body]);
  long.writeUInt32LE(long.length - 8, 4);
  long.writeUInt32LE(long.length - 44, 40);
  const a = await upload(long, 'long.wav');
  assert.ok(Math.abs(a.durationMs - 4 * 58_050) < 400);
  const b = await upload(wav, 'second.wav');
  await json('POST', `/api/recordings/${a.id}/start`, { room: 'room-b', targets: ['es'] });
  const waiting = await (await json('POST', `/api/recordings/${b.id}/start`, { room: 'room-b', targets: ['es'] })).json();
  assert.equal(waiting.state, 'queued', 'one job at a time: the second waits its turn');
  assert.equal((await json('DELETE', `/api/recordings/${b.id}`)).status, 200);
  assert.equal((await json('DELETE', `/api/recordings/${a.id}`)).status, 200);
  const { job: jb } = await finish(b.id);
  assert.equal(jb.state, 'canceled');
  assert.equal(jb.talk, null, 'nothing saved');
  const { job: ja } = await finish(a.id);
  assert.ok(['canceled', 'done'].includes(ja.state), ja.state); // the simulated AI may have finished already
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(leftovers().length, 0, 'no file left behind');
  const talks = await (await json('GET', '/api/stages/room-b/talks')).json();
  assert.ok(!talks.some((x) => x.file === 'second.wav'), 'the cancelled one isn’t a transcript');
  if (ja.state === 'canceled') assert.ok(!talks.some((x) => x.file === 'long.wav'));
});

test('npm run subtitle: same CLI, through the new path, without a room', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-rec-out-'));
  try {
    const t0 = Date.now();
    const { stdout } = await promisify(execFile)(process.execPath, ['scripts/subtitle.js', SAMPLE, '--langs', 'es,pt', '--server', base, '--admin-token', ADMIN, '--out', out]);
    assert.ok(Date.now() - t0 < 15000, 'much faster than the 58 s it lasts');
    assert.deepEqual(fs.readdirSync(out).sort(), ['talk-en.es.srt', 'talk-en.es.vtt', 'talk-en.original.srt', 'talk-en.original.vtt', 'talk-en.pt.srt', 'talk-en.pt.vtt']);
    assert.match(fs.readFileSync(path.join(out, 'talk-en.pt.srt'), 'utf8'), /^1\n00:00:0\d,\d{3} --> /);
    assert.match(fs.readFileSync(path.join(out, 'talk-en.es.vtt'), 'utf8'), /^WEBVTT/);
    assert.match(stdout, /YouTube Studio/);
    const list = await (await json('GET', '/api/recordings')).json();
    assert.ok(!list.jobs.some((x) => x.name === 'talk-en.wav' && !x.room && x.state === 'done'), 'the server forgets it afterwards');
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});
