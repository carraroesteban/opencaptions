// The event's time zone (Settings → Event) and when the audience pages open and close.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fromWall } from '../src/agenda-import.js';

const PORT = 20000 + Math.floor(Math.random() * 2000);
const base = `http://127.0.0.1:${PORT}`;
let srv, dataDir;
const api = async (method, url, body) => {
  const r = await fetch(`${base}${url}`, { method, headers: { 'content-type': 'application/json', authorization: 'Bearer t' }, body: body && JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
};

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-tz-'));
  // TZ set like a container's: the dashboard's choice must still win.
  srv = spawn(process.execPath, ['src/server.js'], {
    env: { ...process.env, TZ: 'UTC', PORT: String(PORT), ENGINE: 'mock', DATA_DIR: dataDir, SCHEDULE: path.join(dataDir, 'schedule.json'), EVENT_CONFIG: 'test/fixtures/event.json', ADMIN_TOKEN: 't', INGEST_TOKEN: 't', PUBLIC_URL: '', GEMINI_API_KEY: '', UPDATE_CHECK: '0' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/healthz`)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start');
});
after(() => { srv?.kill(); fs.rmSync(dataDir, { recursive: true, force: true }); });

test('a wall-clock time in a zone, across a DST change', () => {
  assert.equal(fromWall(Date.UTC(2026, 10, 12, 10, 0), 'America/Mexico_City'), Date.UTC(2026, 10, 12, 16, 0));
  assert.equal(fromWall(Date.UTC(2026, 6, 1, 10, 0), 'Europe/Madrid'), Date.UTC(2026, 6, 1, 8, 0)); // summer: +2
  assert.equal(fromWall(Date.UTC(2026, 10, 1, 10, 0), 'Europe/Madrid'), Date.UTC(2026, 10, 1, 9, 0)); // winter: +1
});

test('the event’s time zone wins over TZ, takes the browser’s spelling, and keeps each talk at its clock time', async () => {
  assert.equal((await api('PUT', '/api/setup', { timezone: 'Mars/Olympus' })).status, 400);
  assert.equal((await api('PUT', '/api/setup', { timezone: 'Asia/Kolkata' })).status, 200, 'browsers say Kolkata, Node Calcutta');
  assert.match((await api('GET', '/api/event')).body.timezone, /Asia\/(Kolkata|Calcutta)/);

  assert.equal((await api('PUT', '/api/setup', { timezone: 'America/Mexico_City' })).status, 200);
  await api('PUT', '/api/schedule', { csv: 'main,2026-11-12 10:00,Opening keynote,Ana' });
  const start = async () => new Date((await api('GET', '/api/schedule')).body[0].start).getTime();
  assert.equal(await start(), Date.UTC(2026, 10, 12, 16, 0), '10:00 in Mexico City');
  assert.equal((await api('PUT', '/api/setup', { timezone: 'Europe/Madrid' })).status, 200);
  assert.equal(await start(), Date.UTC(2026, 10, 12, 9, 0), 'still 10:00, now in Madrid');
  assert.equal((await api('GET', '/api/event')).body.timezone, 'Europe/Madrid');
});

test('the audience pages open and close at the event’s time, with the organizers’ messages', async () => {
  assert.equal((await api('PUT', '/api/setup', { opensAt: '12/11/2026 09:00' })).status, 400);
  assert.equal((await api('PUT', '/api/setup', { opensAt: '2026-11-12T18:00', closesAt: '2026-11-12T09:00' })).status, 400, 'closes before it opens');
  assert.equal((await api('PUT', '/api/setup', { afterText: 'x'.repeat(501) })).status, 400);
  assert.equal((await api('PUT', '/api/setup', { opensAt: '2026-11-12T09:00', closesAt: '2026-11-13T19:00', beforeText: 'Captions will show here.', afterText: 'Thanks for coming!' })).status, 200);
  const ev = (await api('GET', '/api/event')).body;
  assert.equal(ev.opensAt, Date.UTC(2026, 10, 12, 8, 0), '09:00 in Madrid');
  assert.equal(ev.closesAt, Date.UTC(2026, 10, 13, 18, 0));
  assert.deepEqual([ev.beforeText, ev.afterText], ['Captions will show here.', 'Thanks for coming!']);
  assert.equal((await api('GET', '/api/setup')).body.opensAt, '2026-11-12T09:00', 'the form gets back what was typed');
  assert.equal((await api('PUT', '/api/setup', { opensAt: '', closesAt: '' })).status, 200);
  assert.equal((await api('GET', '/api/event')).body.opensAt, null, 'no dates: always open');
});

test('auto-update needs an imported agenda', async () => {
  assert.equal((await api('PUT', '/api/schedule/auto', { on: true })).status, 409);
});
