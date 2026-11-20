// The agenda's next talk when speakers hand over with no silence (Nerdearla 2026: the room never went quiet for
// 30 s, so it stayed on the first talk all afternoon). The room must switch at a short pause, or at the deadline.
// The real server with the simulated AI; audio goes in through the ingest WebSocket like on event day.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PORT = 25000 + Math.floor(Math.random() * 2000);
const base = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const h = { authorization: 'Bearer t', 'content-type': 'application/json' };
const api = async (method, url, body) => { const r = await fetch(base + url, { method, headers: h, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const until = async (fn, ms = 8000) => { for (let t = 0; t < ms; t += 200) { const v = await fn(); if (v) return v; await sleep(200); } return null; };
// The room's talk in progress ({ id, title }) and how many captions it has.
const talkOf = async (id) => {
  const st = (await api('GET', '/api/status')).body.stages.find((s) => s.id === id);
  const caps = (await api('GET', `/api/stages/${id}/captions`)).body;
  return st && { talk: st.talk, captions: caps.captions || [] };
};
const talk = fs.readFileSync('samples/talk-en.wav').subarray(44);
let srv, dataDir, startB;

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-agenda-'));
  startB = Date.now() + 6000;
  fs.writeFileSync(path.join(dataDir, 'schedule.json'), JSON.stringify([
    { stage: 'main', start: new Date(Date.now() - 20 * 60_000).toISOString(), title: 'First talk', speaker: 'Ana' },
    { stage: 'main', start: new Date(startB).toISOString(), title: 'Second talk', speaker: 'Bo' },
  ]));
  fs.copyFileSync('test/fixtures/glossary.json', path.join(dataDir, 'glossary.json'));
  srv = spawn(process.execPath, ['src/server.js'], {
    env: {
      ...process.env, PORT: String(PORT), HOST: '127.0.0.1', ENGINE: 'mock', DATA_DIR: dataDir, SCHEDULE: path.join(dataDir, 'schedule.json'),
      EVENT_CONFIG: 'test/fixtures/event.json', GLOSSARY: path.join(dataDir, 'glossary.json'), ADMIN_TOKEN: 't', INGEST_TOKEN: 't',
      PUBLIC_URL: '', GEMINI_API_KEY: '', TUNNEL: '', FALLBACK: '',
      AGENDA_PAUSE_SEC: '60', // no pause is ever long enough: only the deadline can switch the room
      AGENDA_FORCE_MIN: '0.1', // 6 s after the second talk's start
    },
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

test('back-to-back talks with no silence: the room moves on at the deadline', async () => {
  const ing = new WebSocket(`ws://127.0.0.1:${PORT}/ws/ingest?stage=main&kind=cli&label=test`, { headers: { authorization: 'Bearer t' } });
  await new Promise((r) => ing.once('open', r));
  let o = 0;
  const feed = setInterval(() => { // the room never goes quiet: real time, the talk in a loop
    const at = o % (talk.length - 3200);
    if (ing.readyState === 1) ing.send(talk.subarray(at, at + 3200));
    o += 3200;
  }, 100);
  try {
    const first = await until(async () => { const c = await talkOf('main'); return c?.talk?.title === 'First talk' && c.captions?.length ? c : null; }, 15000);
    assert.ok(first, 'the first talk is named from the agenda and gets captions');
    const second = await until(async () => { const c = await talkOf('main'); return c?.talk?.title === 'Second talk' ? c : null; }, 50000);
    assert.ok(second, 'the room switched to the second talk without any silence');
    assert.ok(Date.now() - startB >= 6000, 'not before the deadline (pauses were too short to count)');
    assert.notEqual(second.talk.id, first.talk.id, 'a new talk, not a rename: the first talk keeps its own transcript');
  } finally {
    clearInterval(feed);
    ing.close();
  }
});

test('Settings → Event: the deadline is fixed by AGENDA_FORCE_MIN here', async () => {
  const s = (await api('GET', '/api/setup')).body;
  assert.equal(s.agendaForceMin, 0.1);
  assert.equal(s.agendaForceFixed, true);
  assert.equal((await api('PUT', '/api/setup', { agendaForceMin: 10 })).status, 409);
  assert.equal((await api('PUT', '/api/setup', { agendaForceMin: -1 })).status, 400);
});
