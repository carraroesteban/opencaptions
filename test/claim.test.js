// First run on a server (src/auth.js claimState): the person who installed it chooses the admin password in the
// browser, once. AUTH=token, so these requests from 127.0.0.1 count as another computer.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 29000 + Math.floor(Math.random() * 2000);
const base = `http://127.0.0.1:${PORT}`;
const servers = [], dirs = [];
let out = '';

async function start(dataDir, port) {
  const srv = spawn(process.execPath, ['src/server.js'], {
    env: { ...process.env, PORT: String(port), ENGINE: 'mock', DATA_DIR: dataDir, SCHEDULE: path.join(dataDir, 's.json'), AUTH: 'token', ADMIN_TOKEN: '', CREW_TOKEN: '', INGEST_TOKEN: '', PUBLIC_URL: '', FALLBACK: '', TUNNEL: '' },
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  srv.stdout.on('data', (b) => { out += b; });
  servers.push(srv);
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) return; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 100));
  }
}
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-claim-')); dirs.push(d); return d; };
const post = (url, body, b = base) => fetch(b + url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const claimOf = async (b = base) => (await (await fetch(`${b}/api/auth/config`)).json()).claim;

before(() => start(tmp(), PORT));
after(() => { for (const s of servers) s.kill(); for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });

test('a new install asks for the admin password once: the first to choose it is in, and it then works to sign in', async () => {
  assert.equal(await claimOf(), 'open');
  assert.match(out, /choose the admin password/);
  assert.equal((await post('/api/auth/claim', { password: 'short' })).status, 400);
  // Two people at the same moment: only one gets it.
  const [a, b] = await Promise.all([post('/api/auth/claim', { password: 'first-person-password', device: 'Laptop' }), post('/api/auth/claim', { password: 'second-person-password' })]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  const winner = a.status === 200 ? 'first-person-password' : 'second-person-password';
  const body = await (a.status === 200 ? a : b).json();
  assert.equal(body.role, 'admin');
  assert.ok(body.crew, 'the crew password, to hand over');
  assert.equal(await claimOf(), 'no');
  assert.equal((await post('/api/auth/claim', { password: 'a-third-password' })).status, 409);
  assert.equal((await post('/api/auth/login', { password: winner })).status, 200);
});

test('an install that already has a password never asks, even after a restart', async () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'secrets.json'), JSON.stringify({ adminToken: 'an-old-generated-password', crewToken: 'c', ingestToken: 'i' }));
  const b = `http://127.0.0.1:${PORT + 1}`;
  await start(dir, PORT + 1);
  assert.equal(await claimOf(b), 'no');
  assert.equal((await post('/api/auth/claim', { password: 'stranger-password' }, b)).status, 409);
});

test('the window closes an hour after starting, and once the welcome wizard is done', async () => {
  const dir = tmp();
  process.env.DATA_DIR = dir;
  process.env.ADMIN_TOKEN = '';
  const { claimState, CLAIM_MS } = await import('../src/auth.js');
  assert.equal(claimState(false), 'open');
  assert.equal(claimState(false, Date.now() + CLAIM_MS + 1000), 'expired');
  assert.equal(claimState(true), 'no');
});
