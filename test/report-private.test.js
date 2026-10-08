// The event report (GET /api/report and /api/report.csv, which the crew reads) and the dashboard's log keep to the
// rooms the rest of the app shows: in event mode never the personal room (Just for me: someone's own calls), and in
// Just for me never the event's rooms. The server runs with AUTH=token, so even these requests from 127.0.0.1 need a
// password.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PORT = 33000 + Math.floor(Math.random() * 2000);
const base = `http://127.0.0.1:${PORT}`;
const ADMIN = 'admin-password-for-report-tests', CREW = 'crew-password-for-report-tests';
let srv, dataDir;

const at = (iso) => Date.parse(iso);
const TALKS = [
  { stage: 'main', id: 'talk-keynote', title: 'Opening keynote', startedAt: at('2026-10-07T14:00:00Z'), languages: ['orig', 'en'],
    segs: [{ channel: 'orig', text: 'Welcome to the summit.', spk: 'Ana Pérez' }, { channel: 'orig', text: 'Let’s begin.', spk: 'Ana Pérez' }] },
  { stage: 'me', id: 'talk-call', title: 'Call with the bank', startedAt: at('2026-10-09T11:00:00Z'), languages: ['orig', 'en'],
    segs: [{ channel: 'orig', text: 'Your loan was approved.', spk: 'Dr. Ruiz' }] },
];

/** Saved talks on disk, as the store writes them (meta.json and captions.jsonl, one folder per talk). */
function seed(talk) {
  const d = path.join(dataDir, 'transcripts', talk.stage, talk.id);
  fs.mkdirSync(d, { recursive: true });
  const { segs, ...meta } = talk;
  fs.writeFileSync(path.join(d, 'meta.json'), JSON.stringify({ speaker: '', ...meta }));
  fs.writeFileSync(path.join(d, 'captions.jsonl'), segs.map((s, i) => JSON.stringify({ id: `${s.channel}-${i + 1}`, lang: s.channel, ...s, start: i * 3000, end: i * 3000 + 2500, final: true })).join('\n') + '\n');
}

const as = (token) => (token ? { authorization: `Bearer ${token}` } : {});
const call = (method, url, body, token = ADMIN) => fetch(base + url, { method, headers: { 'content-type': 'application/json', ...as(token) }, body: body ? JSON.stringify(body) : undefined });
const report = async () => (await call('GET', '/api/report', null, CREW)).json();
const csv = async () => (await call('GET', '/api/report.csv', null, CREW)).text();

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-report-'));
  for (const talk of TALKS) seed(talk);
  srv = spawn(process.execPath, ['src/server.js'], {
    env: {
      ...process.env, PORT: String(PORT), ENGINE: 'mock', DATA_DIR: dataDir, SCHEDULE: path.join(dataDir, 's.json'), AUTH: 'token', TZ: 'UTC',
      EVENT_CONFIG: process.env.EVENT_CONFIG || 'test/fixtures/event.json', ADMIN_TOKEN: ADMIN, CREW_TOKEN: CREW, INGEST_TOKEN: 'ingest-password-for-report-tests',
      PUBLIC_URL: '', FALLBACK: '', TUNNEL: '', GEMINI_API_KEY: '',
    },
    stdio: 'ignore',
  });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/healthz`)).ok) break; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  // The personal room exists in event mode too (its captions are private there): created as Just for me does.
  assert.equal((await call('POST', '/api/stages', { id: 'me', name: 'Just for me', targets: ['en'] })).status, 200);
});
after(() => { srv?.kill(); fs.rmSync(dataDir, { recursive: true, force: true }); });

test('report in event mode: the event’s rooms, never the personal room’s calls', async () => {
  const r = await report();
  assert.ok(!r.rooms.some((x) => x.id === 'me'), 'no personal room');
  assert.deepEqual(r.rooms.find((x) => x.id === 'main').talks.map((t) => t.title), ['Opening keynote']);
  assert.equal(r.totals.talks, 1);
  assert.deepEqual(r.days, ['2026-10-07'], 'not even the day of the call');
  assert.doesNotMatch(JSON.stringify(r), /Call with the bank|Dr\. Ruiz/);
  const text = await csv();
  assert.match(text, /\r\nMain Stage,Opening keynote,Ana Pérez,2026-10-07,/);
  assert.doesNotMatch(text, /Just for me|Call with the bank|Dr\. Ruiz/);
});

test('dashboard log in event mode: nothing from the personal room, earlier or live', async () => {
  assert.equal((await call('POST', '/api/stages/me/talk', { title: 'Earlier private call' })).status, 200);
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws/admin`, { headers: { ...as(CREW), origin: base } });
  const seen = [];
  const done = new Promise((resolve) => ws.on('message', (data) => {
    const m = JSON.parse(String(data));
    if (m.type === 'logs' || m.type === 'log') seen.push(m);
    if (m.type === 'log' && m.msg.includes('Panel')) resolve(undefined);
  }));
  try {
    await new Promise((resolve) => ws.once('message', resolve)); // connected: the earlier log arrives first
    assert.equal((await call('POST', '/api/stages/me/talk', { title: 'Later private call' })).status, 200);
    assert.equal((await call('POST', '/api/stages/main/talk', { title: 'Panel' })).status, 200);
    await done;
  } finally { ws.close(); }
  assert.ok(seen.some((m) => m.type === 'logs'), 'got the earlier log');
  const logs = seen.flatMap((m) => (m.type === 'logs' ? m.logs : [m]));
  assert.ok(logs.length && logs.every((l) => l.stage !== 'me'), 'no personal room entries');
  assert.doesNotMatch(JSON.stringify(seen), /private call/);
});

test('report in Just for me: only the personal room, none of the event’s rooms', async () => {
  const setMode = (mode) => call('PUT', '/api/setup', { mode });
  assert.equal((await setMode('personal')).status, 200);
  try {
    const r = await report();
    assert.deepEqual(r.rooms.map((x) => x.id), ['me']);
    assert.deepEqual(r.rooms[0].talks.map((t) => t.title), ['Call with the bank']);
    assert.deepEqual(r.days, ['2026-10-09']);
    assert.doesNotMatch(JSON.stringify(r), /Opening keynote|Ana Pérez/);
    const text = await csv();
    assert.match(text, /\r\nJust for me,Call with the bank,Dr\. Ruiz,2026-10-09,/);
    assert.doesNotMatch(text, /Main Stage|Opening keynote|Ana Pérez/);
  } finally {
    assert.equal((await setMode('event')).status, 200);
  }
});
