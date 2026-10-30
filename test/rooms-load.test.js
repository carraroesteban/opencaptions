// Which rooms a restart brings back: the dashboard's (data/stages.json), unless the rooms written in event.json were
// edited since. A re-created, copied or otherwise edited event.json must never hide the rooms made in the dashboard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 22000 + Math.floor(Math.random() * 2000);
const base = `http://127.0.0.1:${PORT}`;
const SHIPPED = JSON.parse(fs.readFileSync('config/event.json', 'utf8'));
const auth = { authorization: 'Bearer t', 'content-type': 'application/json' };

/** Starts the server on this event file and data folder, returns the room ids, stops it. */
async function roomsAfterStart(eventFile, dataDir, during = async () => {}) {
  const srv = spawn(process.execPath, ['src/server.js'], {
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', ENGINE: 'mock', DATA_DIR: dataDir, EVENT_CONFIG: eventFile, SCHEDULE: path.join(dataDir, 's.json'), GLOSSARY: path.join(dataDir, 'g.json'), ADMIN_TOKEN: 't', INGEST_TOKEN: 't', PUBLIC_URL: '', GEMINI_API_KEY: '', STAGES: '', UPDATE_CHECK: '0' },
    stdio: 'ignore',
  });
  try {
    for (let i = 0; ; i++) {
      try { if ((await fetch(`${base}/healthz`)).ok) break; } catch { /* starting */ }
      if (i > 100) throw new Error('server did not start');
      await new Promise((r) => setTimeout(r, 100));
    }
    await during();
    return (await (await fetch(`${base}/api/event`)).json()).stages.map((s) => s.id);
  } finally {
    await new Promise((r) => { srv.once('exit', r); srv.kill(); });
  }
}
const writeEvent = (file, ev) => { fs.writeFileSync(file, JSON.stringify(ev, null, 2)); fs.utimesSync(file, new Date(), new Date(Date.now() + 5000)); }; // always newer

test('the rooms OpenCaptions starts with when event.json is missing are the shipped ones', async () => {
  const { SHIPPED_STAGES } = await import('../src/config.js');
  assert.deepEqual(SHIPPED_STAGES, SHIPPED.stages);
  assert.equal(JSON.stringify(SHIPPED_STAGES), JSON.stringify(SHIPPED.stages), 'same key order: the fingerprint compares the text');
});

test('rooms made in the dashboard come back after event.json is re-created (the shipped room never hides them)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-rooms-'));
  const ev = path.join(dir, 'event.json');
  // Saved by a version without fingerprints, then event.json written again (newer), as when a missing config folder is filled.
  fs.writeFileSync(path.join(dir, 'stages.json'), JSON.stringify([...SHIPPED.stages, { id: 'hall-a', name: 'Hall A' }, { id: 'hall-b', name: 'Hall B' }]));
  writeEvent(ev, SHIPPED);
  assert.deepEqual(await roomsAfterStart(ev, dir), ['main', 'hall-a', 'hall-b']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the dashboard\'s rooms win over event.json until the rooms written there change; then those, and the dashboard\'s are kept aside', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-rooms-'));
  const ev = path.join(dir, 'event.json');
  writeEvent(ev, { ...SHIPPED, stages: [{ id: 'keynote', name: 'Keynote' }] });
  // A room added in the dashboard: saved with the fingerprint of event.json's rooms.
  const added = await roomsAfterStart(ev, dir, async () => {
    const r = await fetch(`${base}/api/stages`, { method: 'POST', headers: auth, body: JSON.stringify({ id: 'side', name: 'Side room' }) });
    assert.equal(r.status, 200);
  });
  assert.deepEqual(added, ['keynote', 'side']);
  // Anything else in event.json edited (newer file): the dashboard's rooms stay.
  writeEvent(ev, { ...SHIPPED, eventName: 'Renamed', stages: [{ id: 'keynote', name: 'Keynote' }] });
  assert.deepEqual(await roomsAfterStart(ev, dir), ['keynote', 'side']);
  // Its rooms edited by hand: those are used, and the dashboard's list is kept in stages.json.bak.
  writeEvent(ev, { ...SHIPPED, stages: [{ id: 'keynote', name: 'Keynote' }, { id: 'workshop', name: 'Workshop' }] });
  assert.deepEqual(await roomsAfterStart(ev, dir), ['keynote', 'workshop']);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'stages.json.bak'), 'utf8')).map((s) => s.id), ['keynote', 'side']);
  fs.rmSync(dir, { recursive: true, force: true });
});
