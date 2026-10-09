// A file set as a room's audio (Settings → Pull de audio) plays once: at its end the room has no audio source, and
// nothing plays it again unless "Repeat in loop" is on. Playing it again would caption the same talk twice and keep a
// paid AI session open. Live streams (SRT/RTMP/HLS) are still reconnected whenever they end.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { PullSource, ffmpegBin } from '../src/pull.js';

const PORT = 37000 + Math.floor(Math.random() * 2000);
const base = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const h = { authorization: 'Bearer t', 'content-type': 'application/json' };
const api = async (method, url, body) => { const r = await fetch(base + url, { method, headers: h, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const room = async (id) => (await api('GET', '/api/status')).body.stages.find((s) => s.id === id);
const until = async (fn, ms = 8000) => { for (let t = 0; t < ms; t += 100) { const v = await fn(); if (v) return v; await sleep(100); } return null; };
let srv, dataDir, media;

/** A 16 kHz mono WAV of a tone (read natively, without ffmpeg). */
function wav(file, seconds) {
  const n = Math.round(seconds * 16000);
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(8000 * Math.sin(i / 5)), 44 + i * 2);
  fs.writeFileSync(file, b);
  return file;
}

/** A room as PullSource sees it: who attached, and what was logged. */
function fakeStage() {
  const s = { attached: 0, detached: 0, bytes: 0, logs: [] };
  return Object.assign(s, { attachIngest() { s.attached++; }, detachIngest() { s.detached++; }, pushAudio(b) { s.bytes += b.length; }, log(level, msg) { s.logs.push(`${level} ${msg}`); } });
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-pull-once-'));
  media = path.join(dataDir, 'media');
  fs.mkdirSync(media);
  wav(path.join(media, 'short.wav'), 1.5);
  fs.copyFileSync('test/fixtures/glossary.json', path.join(dataDir, 'glossary.json'));
  srv = spawn(process.execPath, ['src/server.js'], {
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', ENGINE: 'mock', DATA_DIR: dataDir, MEDIA_DIR: media, EVENT_CONFIG: 'test/fixtures/event.json', GLOSSARY: path.join(dataDir, 'glossary.json'), ADMIN_TOKEN: 't', INGEST_TOKEN: 't', PUBLIC_URL: '', GEMINI_API_KEY: '', TUNNEL: '', FALLBACK: '' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/healthz`)).ok) return; } catch { /* starting */ }
    await sleep(100);
  }
  throw new Error('server did not start');
});

after(() => {
  srv?.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('a file in the room settings plays once, then the room has no audio source', async () => {
  const file = path.join(media, 'short.wav');
  assert.equal((await api('PATCH', '/api/stages/room-b', { pull: file, loop: false })).status, 200);
  // Watch the room for a while after the 1.5 s file: each time the pull attaches, it has a new `since`.
  const starts = new Set();
  let ended = 0;
  for (let t = 0; t < 4500; t += 100) {
    const st = await room('room-b');
    if (st.ingest?.kind === 'pull') starts.add(st.ingest.since);
    else if (starts.size && !ended) ended = Date.now();
    await sleep(100);
  }
  assert.equal(starts.size, 1, 'the file played once, and was not started again a second after its end');
  assert.ok(ended, 'the file ended');
  const st = await room('room-b');
  assert.equal(st.ingest, null, 'no audio source after the file');
  assert.equal(st.pull, '', 'the finished file is off the room settings: a restart does not play it again');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, 'stages.json'), 'utf8')).find((d) => d.id === 'room-b').pull, '');
  // The log says it finished, and never that it retries.
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws/admin`, { headers: { authorization: 'Bearer t' } });
  const logs = await new Promise((r) => ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.type === 'logs') r(m.logs.filter((l) => l.stage === 'room-b').map((l) => l.msg)); }));
  ws.close();
  assert.ok(logs.some((m) => /^pull finished/.test(m)), logs.join('\n'));
  assert.ok(!logs.some((m) => /pull ended, retrying/.test(m)), logs.join('\n'));
});

test('with Repeat in loop, the file keeps playing', async () => {
  const file = path.join(media, 'short.wav');
  assert.equal((await api('PATCH', '/api/stages/room-c', { pull: file, loop: true })).status, 200);
  const first = await until(async () => (await room('room-c')).ingest?.kind === 'pull' && (await room('room-c')).ingest.since);
  assert.ok(first);
  await sleep(3500); // past two ends of the file
  const st = await room('room-c');
  assert.equal(st.ingest?.kind, 'pull');
  assert.equal(st.pull, file);
  assert.equal((await api('PATCH', '/api/stages/room-c', { pull: '' })).status, 200);
});

test('PullSource: a file without loop finishes once; onFinish is called', async () => {
  const stage = fakeStage();
  let finished = 0;
  const p = new PullSource(/** @type {any} */ (stage), wav(path.join(dataDir, 'half.wav'), 0.5), { onFinish: () => finished++ });
  await sleep(2500); // the file, then more than the 1 s a retry would wait
  p.stop();
  assert.equal(stage.attached, 1, stage.logs.join('\n'));
  assert.equal(finished, 1);
  assert.equal(stage.bytes, 16000, 'all of it, once');
  assert.ok(stage.logs.some((l) => /pull finished/.test(l)), stage.logs.join('\n'));
});

test('PullSource: a live stream that ends is reconnected; a media file over http(s) is not', { skip: !ffmpegBin() && 'ffmpeg is not installed' }, async () => {
  const body = fs.readFileSync(wav(path.join(dataDir, 'net.wav'), 0.3));
  const web = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'audio/wav', 'content-length': body.length }); res.end(body); });
  await new Promise((r) => web.listen(0, '127.0.0.1', r));
  const at = `http://127.0.0.1:${/** @type {any} */ (web.address()).port}`;
  try {
    const live = fakeStage();
    const a = new PullSource(/** @type {any} */ (live), `${at}/live`); // no media extension: a stream (Icecast, HLS…)
    const file = fakeStage();
    const b = new PullSource(/** @type {any} */ (file), `${at}/talk.wav`);
    await sleep(3000);
    a.stop();
    b.stop();
    assert.ok(live.attached >= 2, `the stream was reconnected: ${live.logs.join('\n')}`);
    assert.equal(file.attached, 1, file.logs.join('\n'));
    assert.ok(file.logs.some((l) => /pull finished/.test(l)), file.logs.join('\n'));
  } finally {
    web.close();
  }
});
