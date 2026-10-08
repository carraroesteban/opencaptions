// The room's sound on phones (assistive listening): a per-room setting, off by default. The real server with the
// simulated AI; audio goes in through the ingest WebSocket and phones listen with /ws/view?audio=orig.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { muLaw, muLawDecode } from '../src/audio.js';

const PORT = 25000 + Math.floor(Math.random() * 2000);
const base = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const h = { authorization: 'Bearer t', 'content-type': 'application/json' };
const api = async (method, url, body) => { const r = await fetch(base + url, { method, headers: h, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const room = async (id) => (await api('GET', '/api/status')).body.stages.find((s) => s.id === id);
const until = async (fn, ms = 8000) => { for (let t = 0; t < ms; t += 50) { const v = await fn(); if (v) return v; await sleep(50); } return null; };
const talk = fs.readFileSync('samples/talk-en.wav').subarray(44);
let srv, dataDir;

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-sound-'));
  srv = spawn(process.execPath, ['src/server.js'], {
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', ENGINE: 'mock', DATA_DIR: dataDir, EVENT_CONFIG: 'test/fixtures/event.json', GLOSSARY: 'test/fixtures/glossary.json', ADMIN_TOKEN: 't', INGEST_TOKEN: 't', PUBLIC_URL: '', GEMINI_API_KEY: '', TUNNEL: '', FALLBACK: '', FRESH: '' },
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

/** A phone on a room: its hellos, `listen` answers and the binary frames it gets. */
async function phone(stage, audio = 'orig', headers = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws/view?stage=${stage}&langs=orig&audio=${audio}`, { headers });
  const got = { hellos: [], listen: [], frames: [] };
  ws.on('message', (d, binary) => {
    if (binary) return got.frames.push(Buffer.from(d));
    const m = JSON.parse(d.toString());
    if (m.type === 'hello') got.hellos.push(m);
    else if (m.type === 'listen') got.listen.push(m);
  });
  await new Promise((r) => ws.once('open', r));
  await until(() => got.hellos.length);
  return { ws, got, hello: () => got.hellos.at(-1) };
}

async function ingest(stage) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws/ingest?stage=${stage}&kind=cli&label=test`, { headers: { authorization: 'Bearer t' } });
  await new Promise((r) => ws.once('open', r));
  return ws;
}
/** Sends `sec` seconds of the talk from `from` seconds in, 100 ms at a time; returns what was sent. */
async function send(ing, sec, from = 0) {
  const pcm = talk.subarray(from * 32000, (from + sec) * 32000);
  for (let o = 0; o < pcm.length; o += 3200) { ing.send(pcm.subarray(o, o + 3200)); await sleep(3); }
  return pcm;
}

test('off by default: Listen on Original is refused and no sound is sent', async () => {
  const st = await room('main');
  assert.equal(st.roomSound, false);
  const p = await phone('main');
  assert.equal(p.hello().stage.roomSound, false, 'phones don’t offer Listen on Original');
  assert.deepEqual(p.hello().listen, { channel: 'orig', ok: false, why: 'off' });
  const ing = await ingest('main');
  await send(ing, 2);
  await sleep(300);
  assert.equal(p.got.frames.length, 0);
  ing.close(); p.ws.close();
});

test('turned on: listeners get the room’s audio as it comes in, byte for byte (μ-law)', async () => {
  const before = await phone('room-a');
  assert.equal((await api('PATCH', '/api/stages/room-a', { roomSound: true })).status, 200);
  // Phones already on the page learn it at once (a fresh hello), so Listen shows up on Original.
  assert.ok(await until(() => before.hello().stage.roomSound === true));
  const p = await phone('room-a');
  assert.deepEqual(p.hello().listen, { channel: 'orig', ok: true, format: 'mulaw', rate: 16000 });
  const reader = await phone('room-a', '0'); // reading captions, not listening
  const ing = await ingest('room-a');
  const pcm = await send(ing, 3, 5);
  assert.ok(await until(() => p.got.frames.length >= 30), `${p.got.frames.length} frames`);
  assert.ok(p.got.frames.every((f) => f.length === 1600), '100 ms each: 1600 bytes');
  assert.deepEqual(Buffer.concat(p.got.frames), muLaw(pcm), 'the frames are the room’s audio');
  // ...and close to it once decoded (μ-law keeps speech at ~37 dB SNR).
  const dec = muLawDecode(Buffer.concat(p.got.frames));
  let sig = 0, err = 0;
  for (let i = 0; i < dec.length; i++) { const s = pcm.readInt16LE(i * 2); sig += s * s; err += (s - dec[i]) ** 2; }
  assert.ok(10 * Math.log10(sig / err) > 30, 'decodes to the same sound');
  assert.equal(reader.got.frames.length, 0, 'a phone that didn’t ask for sound gets none');
  assert.equal(before.got.frames.length, 0, 'nor one that asked for none');
  assert.equal((await room('room-a')).roomSoundListeners, 1);
  ing.close(); p.ws.close(); reader.ws.close(); before.ws.close();
});

test('it keeps going during a break and while music plays (it’s the room’s sound, not the captions)', async () => {
  await api('PATCH', '/api/stages/room-b', { roomSound: true });
  await api('POST', '/api/stages/room-b/break', { on: true });
  const p = await phone('room-b');
  const ing = await ingest('room-b');
  const pcm = await send(ing, 2);
  assert.ok(await until(() => p.got.frames.length >= 20), 'sound during the break');
  assert.deepEqual(Buffer.concat(p.got.frames), muLaw(pcm));
  assert.equal((await room('room-b')).gated, true, 'while the AI gets nothing');
  await api('POST', '/api/stages/room-b/break', { on: false });
  // Music (synthetic chords, faster than real time: the detector counts audio, not the clock).
  const music = Buffer.alloc(16 * 32000);
  for (let i = 0; i < music.length / 2; i++) {
    const t = i / 16000, f0 = [261.6, 220, 174.6, 196][Math.floor(t * 2) % 4];
    let v = 0;
    for (const f of [f0, f0 * 1.26, f0 * 1.5]) for (let k = 1; k <= 4; k++) v += Math.sin(2 * Math.PI * f * k * t) / (k * k * 3);
    music.writeInt16LE(Math.round(v * 0.25 * 16000), i * 2);
  }
  const m0 = p.got.frames.length;
  for (let o = 0; o < music.length; o += 3200) { ing.send(music.subarray(o, o + 3200)); await sleep(2); }
  assert.ok(await until(async () => (await room('room-b')).music), 'music detected: captions paused');
  assert.ok(await until(() => p.got.frames.length >= m0 + 160));
  assert.deepEqual(Buffer.concat(p.got.frames.slice(m0)), muLaw(music), 'the music plays on the phone');
  for (let o = 0; o < 32000; o += 3200) { ing.send(music.subarray(o, o + 3200)); await sleep(3); }
  assert.ok(await until(() => p.got.frames.length >= m0 + 170), 'and keeps playing once captions paused for it');
  ing.close(); p.ws.close();
});

test('turning it off stops every listener at once', async () => {
  await api('PATCH', '/api/stages/room-c', { roomSound: true });
  const p = await phone('room-c');
  const ing = await ingest('room-c');
  await send(ing, 1);
  assert.ok(await until(() => p.got.frames.length >= 10));
  assert.equal((await api('PATCH', '/api/stages/room-c', { roomSound: false })).status, 200);
  assert.ok(await until(() => p.hello().listen?.why === 'off'), 'the phone is told');
  assert.equal(p.hello().stage.roomSound, false);
  const n = p.got.frames.length;
  await send(ing, 1, 2);
  await sleep(300);
  assert.equal(p.got.frames.length, n, 'nothing after it was turned off');
  assert.equal((await room('room-c')).roomSoundListeners, 0);
  ing.close(); p.ws.close();
});

test('a cap per room: the phone over it is told the room’s sound is full', async () => {
  assert.equal((await api('PATCH', '/api/stages/room-c', { roomSound: true, roomSoundMax: 2 })).status, 200);
  assert.equal((await api('PATCH', '/api/stages/room-c', { roomSoundMax: 0 })).status, 400);
  const a = await phone('room-c'), b = await phone('room-c'), c = await phone('room-c');
  assert.equal(a.hello().listen.ok, true);
  assert.equal(b.hello().listen.ok, true);
  assert.deepEqual(c.hello().listen, { channel: 'orig', ok: false, why: 'full' });
  const st = await room('room-c');
  assert.equal(st.roomSoundListeners, 2);
  assert.equal(st.roomSoundMax, 2);
  const ing = await ingest('room-c');
  await send(ing, 1);
  assert.ok(await until(() => b.got.frames.length >= 10));
  assert.equal(c.got.frames.length, 0, 'the phone over the cap gets nothing');
  a.ws.close();
  assert.ok(await until(async () => (await room('room-c')).roomSoundListeners === 1));
  const d = await phone('room-c');
  assert.equal(d.hello().listen.ok, true, 'a place freed up');
  ing.close(); b.ws.close(); c.ws.close(); d.ws.close();
  await api('PATCH', '/api/stages/room-c', { roomSound: false });
});

test('never in Just for me: listeners stop when it’s switched on, and nothing is sent', async () => {
  await api('PATCH', '/api/stages/main', { roomSound: true });
  const p = await phone('main');
  assert.equal(p.hello().listen.ok, true);
  const ing = await ingest('main');
  assert.equal((await api('PUT', '/api/setup', { mode: 'personal' })).status, 200);
  try {
    assert.ok(await until(() => p.hello().listen?.why === 'off'), 'the phone is told');
    const n = p.got.frames.length;
    await send(ing, 1);
    await sleep(300);
    assert.equal(p.got.frames.length, n, 'nothing in personal mode');
    // Signed in (personal mode's pages need it), still nothing: not the event's rooms, not the personal room.
    const q = await phone('main', 'orig', { authorization: 'Bearer t' });
    assert.equal(q.hello().stage.roomSound, false);
    assert.equal(q.hello().listen.why, 'off');
    assert.equal((await api('POST', '/api/stages', { id: 'me', name: 'Me', targets: ['es'], roomSound: true })).status, 200);
    const me = await phone('me', 'orig', { authorization: 'Bearer t' });
    assert.equal(me.hello().listen.why, 'off');
    const ingMe = await ingest('me');
    await send(ingMe, 1);
    await sleep(300);
    assert.equal(q.got.frames.length + me.got.frames.length, 0);
    q.ws.close(); me.ws.close(); ingMe.close();
  } finally {
    assert.equal((await api('PUT', '/api/setup', { mode: 'event' })).status, 200);
  }
  // Back to the event: the event's room plays again, the personal room never does.
  const r = await phone('main');
  assert.equal(r.hello().listen.ok, true);
  const me = await phone('me', 'orig', { authorization: 'Bearer t' });
  assert.equal(me.hello().listen.why, 'off', 'the personal room is someone’s own calls, in any mode');
  ing.close(); p.ws.close(); r.ws.close(); me.ws.close();
  await api('DELETE', '/api/stages/me');
});
