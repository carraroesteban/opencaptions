// Safety net for the event manager's work: every setup change is recorded and can be undone, deleted rooms
// go to a trash, and Event mode locks the setup on the server (live operations keep working).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 23000 + Math.floor(Math.random() * 2000);
const base = `http://127.0.0.1:${PORT}`;
const h = { 'content-type': 'application/json', authorization: 'Bearer t' };
// Tests never write to config/: the agenda and glossary live in the temp data dir.
const seedGlossary = (dir) => { const f = path.join(dir, 'glossary.json'); fs.copyFileSync('test/fixtures/glossary.json', f); return f; };
let srv, dataDir;
const api = async (method, url, body) => {
  const r = await fetch(base + url, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};
const history = async () => (await api('GET', '/api/history')).body;
const latest = async (kind) => (await history()).changes.find((c) => c.kind === kind);

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-history-'));
  srv = spawn(process.execPath, ['src/server.js'], { env: { ...process.env, PORT: String(PORT), ENGINE: 'mock', DATA_DIR: dataDir, SCHEDULE: path.join(dataDir, 'schedule.json'), GLOSSARY: seedGlossary(dataDir), ADMIN_TOKEN: 't', INGEST_TOKEN: 't', PUBLIC_URL: '' }, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/healthz`)).ok) return; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 100));
  }
});
after(() => { srv?.kill(); fs.rmSync(dataDir, { recursive: true, force: true }); });

test('a deleted room goes to the trash and comes back exactly as it was', async () => {
  await api('PATCH', '/api/stages/room-a', { name: 'Hall A', targets: ['es', 'en', 'pt'] });
  assert.equal((await api('DELETE', '/api/stages/room-a')).status, 200);
  let hst = await history();
  assert.equal(hst.trash[0].room.id, 'room-a');
  assert.equal(hst.trash[0].room.name, 'Hall A');
  assert.equal((await api('POST', `/api/history/${hst.trash[0].id}/undo`)).status, 200);
  const ev = await (await fetch(`${base}/api/event`)).json();
  const room = ev.stages.find((s) => s.id === 'room-a');
  assert.equal(room.name, 'Hall A');
  assert.deepEqual(room.languages, ['orig', 'es', 'en', 'pt']);
  hst = await history();
  assert.equal(hst.trash.length, 0);
  assert.equal(hst.changes.find((c) => c.kind === 'room.delete').undone, true);
});

test('undo puts back a room setting, the agenda, the glossary and the event name', async () => {
  await api('PATCH', '/api/stages/main', { targets: ['es'] });
  await api('POST', `/api/history/${(await latest('room.update')).id}/undo`);
  assert.deepEqual((await (await fetch(`${base}/api/event`)).json()).stages.find((s) => s.id === 'main').languages, ['orig', 'es', 'en']);

  await api('PUT', '/api/schedule', { csv: 'main,10:00,First talk,Ana\nmain,11:00,Second talk,Luis' });
  await api('PUT', '/api/schedule', { csv: 'main,12:00,Only this one,Eva' });
  assert.equal((await (await fetch(`${base}/api/schedule`)).json()).length, 1);
  await api('POST', `/api/history/${(await latest('agenda.set')).id}/undo`);
  assert.deepEqual((await (await fetch(`${base}/api/schedule`)).json()).map((e) => e.title), ['First talk', 'Second talk']);

  const g = (await api('GET', '/api/glossary')).body;
  await api('PUT', '/api/glossary', { vocabulary: ['Only'], replacements: [] });
  await api('POST', `/api/history/${(await latest('glossary.set')).id}/undo`);
  assert.deepEqual((await api('GET', '/api/glossary')).body.vocabulary, g.vocabulary);

  const name = (await (await fetch(`${base}/api/event`)).json()).name;
  await api('PUT', '/api/setup', { name: 'Typo Festivall' });
  await api('POST', `/api/history/${(await latest('event.rename')).id}/undo`);
  assert.equal((await (await fetch(`${base}/api/event`)).json()).name, name);
});

test('the agenda can be previewed without replacing it', async () => {
  const r = await api('PUT', '/api/schedule?dryRun=1', { csv: 'main,15:00,Preview talk,Ana' });
  assert.equal(r.body.count, 1);
  assert.equal(r.body.entries[0].title, 'Preview talk');
  assert.ok(!(await (await fetch(`${base}/api/schedule`)).json()).some((e) => e.title === 'Preview talk'));
});

test('Event mode locks the setup on the server, but live operations keep working', async () => {
  assert.equal((await api('POST', '/api/lock', { locked: true })).body.locked, true);
  for (const [m, u, b] of [['DELETE', '/api/stages/room-b'], ['POST', '/api/stages', { id: 'x', name: 'X' }], ['PATCH', '/api/stages/main', { targets: ['es'] }],
    ['PUT', '/api/schedule', { csv: '' }], ['PUT', '/api/glossary', { vocabulary: [], replacements: [] }], ['PUT', '/api/setup', { name: 'New name' }]]) {
    const r = await api(m, u, b);
    assert.equal(r.status, 423, `${m} ${u} should be locked`);
    assert.equal(r.body.locked, true);
  }
  assert.equal((await api('POST', `/api/history/${(await latest('glossary.set')).id}/undo`)).status, 423, 'undo is locked too');
  assert.equal((await api('PATCH', '/api/stages/main', { title: 'Keynote' })).status, 200, 'renaming the current talk is allowed');
  assert.equal((await api('POST', '/api/stages/main/talk', { title: 'Next one' })).status, 200, 'starting the next talk is allowed');
  assert.equal((await api('POST', '/api/stages/main/restart')).status, 200, 'restarting a room is allowed');
  assert.equal((await (await fetch(`${base}/api/status`, { headers: h })).json()).locked, true, 'the dashboard sees the lock');
  assert.equal((await api('POST', '/api/lock', { locked: false })).body.locked, false);
  assert.equal((await latest('event.lock')).after, false);
});

test('the history survives a restart', async () => {
  const lines = fs.readFileSync(path.join(dataDir, 'history.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.ok(lines.length >= 10);
  assert.ok(lines.some((c) => c.kind === 'room.delete' && c.before?.name === 'Hall A'));
});
