// Starting over and the event's languages: FRESH=1 runs on an empty temporary data folder that disappears when the
// server stops, pages learn when the data folder changed (so browsers forget what they remembered), and any
// language can be removed while no room uses it.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env = { ENGINE: 'mock', EVENT_CONFIG: 'test/fixtures/event.json', ADMIN_TOKEN: 't', INGEST_TOKEN: 't', PUBLIC_URL: '', GEMINI_API_KEY: '', TUNNEL: '', FALLBACK: '', FRESH: '' };

async function server(extra) {
  const port = 25000 + Math.floor(Math.random() * 2000);
  const p = spawn(process.execPath, ['src/server.js'], { env: { ...process.env, ...env, PORT: String(port), HOST: '127.0.0.1', ...extra }, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/healthz`)).ok) break; } catch { /* starting */ }
    await sleep(100);
  }
  const api = async (method, url, body) => {
    const r = await fetch(base + url, { method, headers: { authorization: 'Bearer t', 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  const stop = () => new Promise((r) => { p.once('exit', r); p.kill('SIGTERM'); });
  return { p, port, base, api, stop };
}

let dataDir, main;
before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-setup-'));
  main = await server({ DATA_DIR: dataDir });
});
after(async () => {
  await main?.stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('FRESH=1: an empty temporary data folder, deleted when the server stops; the real one is untouched', async () => {
  // Earlier runs left a set-up "Just for me" with a transcript behind.
  const old = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-old-'));
  fs.writeFileSync(path.join(old, 'setup.json'), JSON.stringify({ done: true, mode: 'personal', name: 'Old event' }));
  fs.mkdirSync(path.join(old, 'transcripts', 'me', 'x'), { recursive: true });
  const before = new Set(fs.readdirSync(os.tmpdir()).filter((d) => d.startsWith('opencaptions-fresh-')));
  const s = await server({ DATA_DIR: old, FRESH: '1' });
  try {
    const setup = (await s.api('GET', '/api/setup')).body;
    assert.equal(setup.done, false, 'the first-run wizard again');
    assert.equal(setup.mode, 'event');
    assert.notEqual(setup.name, 'Old event');
    const made = fs.readdirSync(os.tmpdir()).filter((d) => d.startsWith('opencaptions-fresh-') && !before.has(d));
    assert.equal(made.length, 1, 'one temporary folder');
    const dir = path.join(os.tmpdir(), made[0]);
    assert.ok(fs.existsSync(path.join(dir, 'instance.json')));
    await s.stop();
    assert.ok(!fs.existsSync(dir), 'gone when the server stops');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(old, 'setup.json'), 'utf8')).name, 'Old event', 'the real data folder is untouched');
    assert.ok(fs.existsSync(path.join(old, 'transcripts', 'me', 'x')));
  } finally {
    if (s.p.exitCode == null) await s.stop();
    fs.rmSync(old, { recursive: true, force: true });
  }
});

test('pages learn which data folder this is, so a browser forgets what it remembered for another one', async () => {
  const name = `oc_data_127_0_0_1_${main.port}`;
  const r = await fetch(`${main.base}/`);
  const cookie = r.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
  assert.ok(cookie, 'named after the host and port, so two servers on one computer stay apart');
  const id = cookie.split(';')[0].split('=')[1];
  assert.equal(id, JSON.parse(fs.readFileSync(path.join(dataDir, 'instance.json'), 'utf8')).id, 'kept with the data');
  const again = await fetch(`${main.base}/watch.html`, { headers: { cookie: `${name}=${id}` } });
  assert.ok(!again.headers.getSetCookie().some((c) => c.startsWith(name)), 'not sent again when the browser has it');
  const apiCall = await fetch(`${main.base}/api/event`);
  assert.ok(!apiCall.headers.getSetCookie().some((c) => c.startsWith(name)), 'pages only, not the API');
  assert.match(fs.readFileSync('public/common.js', 'utf8'), /oc_data_\$\{location\.host\.replace\(\/\\W\/g, '_'\)\}/, 'the page reads the same name');
});

test('any language can be removed while no room uses it, and added back', async () => {
  const { api } = main;
  let r = await api('PUT', '/api/setup', { removedLanguages: ['pt'] });
  assert.equal(r.status, 409, 'Room A translates into Portuguese');
  assert.equal(r.body.code, 'language-in-use');
  assert.deepEqual(r.body.rooms, ['Room A']);
  assert.deepEqual(r.body.languages, ['Português']);
  assert.equal((await api('PATCH', '/api/stages/room-a', { targets: ['es', 'en'] })).status, 200);
  r = await api('PUT', '/api/setup', { removedLanguages: ['pt'] });
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys((await api('GET', '/api/event')).body.languages), ['es', 'en']);
  const setup = (await api('GET', '/api/setup')).body;
  assert.deepEqual(setup.removedLanguages, ['pt']);
  assert.deepEqual(setup.builtInLanguages, ['es', 'en', 'pt']);
  assert.equal((await api('PUT', '/api/setup', { removedLanguages: ['xx'] })).status, 400, 'only event.json languages');
  // Added from the catalogue and removed again, as before.
  assert.equal((await api('PUT', '/api/setup', { languages: { fr: 'Français' } })).status, 200);
  assert.ok('fr' in (await api('GET', '/api/event')).body.languages);
  assert.equal((await api('PUT', '/api/setup', { languages: {} })).status, 200);
  // Back.
  assert.equal((await api('PUT', '/api/setup', { removedLanguages: [] })).status, 200);
  assert.deepEqual(Object.keys((await api('GET', '/api/event')).body.languages), ['es', 'en', 'pt']);
});

test('event mode blocks switching to Just for me, which would take the event offline', async () => {
  const { api } = main;
  await api('POST', '/api/lock', { locked: true });
  try {
    assert.equal((await api('PUT', '/api/setup', { mode: 'personal' })).status, 423);
  } finally {
    await api('POST', '/api/lock', { locked: false });
  }
  assert.equal((await api('PUT', '/api/setup', { mode: 'personal' })).status, 200);
  assert.equal((await api('GET', '/api/setup')).body.mode, 'personal');
  assert.equal((await api('PUT', '/api/setup', { mode: 'event' })).status, 200);
});
