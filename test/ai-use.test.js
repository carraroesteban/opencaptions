// Which AI makes the captions (src/server.js aiNow, POST /api/ai/use): one answer for every page, a switch that checks
// what it can do, and a start that doesn't keep a Gemini key unused because of an old "Run it on this computer".
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const servers = [];
after(() => { for (const s of servers) s.kill(); });

async function start(env, setup) {
  const port = 25000 + Math.floor(Math.random() * 2000);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-ai-'));
  if (setup) fs.writeFileSync(path.join(dir, 'setup.json'), JSON.stringify(setup));
  const srv = spawn(process.execPath, ['src/server.js'], { env: { ...process.env, PORT: String(port), ENGINE: 'mock', DATA_DIR: dir, ADMIN_TOKEN: 't', INGEST_TOKEN: 't', PUBLIC_URL: '', GEMINI_API_KEY: '', ...env }, stdio: 'ignore' });
  servers.push(srv);
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${base}/healthz`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 100)); }
  const api = async (method, url, body) => {
    const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', authorization: 'Bearer t' }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json() };
  };
  return { api, dir };
}

test('without a key: simulated, and Gemini can\'t be picked', async () => {
  const { api } = await start({});
  const { body } = await api('GET', '/api/setup');
  assert.equal(body.aiNow.now, 'simulated');
  assert.equal(body.aiNow.use, 'none');
  assert.equal(body.aiNow.hasKey, false);
  const r = await api('POST', '/api/ai/use', { use: 'cloud' });
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'no-key');
  assert.equal((await api('POST', '/api/ai/use', { use: 'somewhere' })).status, 400);
});

test('an old "Run it on this computer" doesn\'t keep a Gemini key unused', async () => {
  const { api, dir } = await start({ GEMINI_API_KEY: 'k'.repeat(39) }, { done: true, localMode: true });
  const { body } = await api('GET', '/api/status');
  assert.equal(body.aiNow.use, 'cloud', 'the key is used');
  assert.equal(body.aiNow.forced, true, 'started in test mode here (ENGINE=mock): the badge says so');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'setup.json'), 'utf8')).localMode, false);
});

test('in Docker (or on a cloud server) there is no offline backup to turn on', async () => {
  const { api } = await start({ ENGINE: '', GEMINI_API_KEY: 'k'.repeat(39), OC_DOCKER: '1', FALLBACK_PROBE_URL: 'http://127.0.0.1:9/' });
  assert.equal((await api('GET', '/api/setup')).body.aiNow.canBackup, false, 'pages hide the offer');
  const r = await api('POST', '/api/ai/use', { use: 'auto' });
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'no-backup-here');
});

test('in Docker there is no "This computer" either', async () => {
  const { api } = await start({ ENGINE: '', GEMINI_API_KEY: 'k'.repeat(39), OC_DOCKER: '1' });
  assert.equal((await api('GET', '/api/setup')).body.aiNow.canLocal, false, 'pages hide the choice');
  for (const r of [await api('POST', '/api/ai/use', { use: 'local' }), await api('POST', '/api/local/start')]) {
    assert.equal(r.status, 400);
    assert.equal(r.body.code, 'no-local-here');
  }
  assert.equal((await api('GET', '/api/setup')).body.aiNow.use, 'cloud', 'nothing changed');
});

test('"Gemini, with this computer as backup" gets this computer ready without leaving Gemini', async (t) => {
  const fake = http.createServer((req, res) => res.end(req.url === '/api/tags' ? JSON.stringify({ models: [{ name: 'gemma3:4b' }] }) : '{}'));
  await new Promise((r) => fake.listen(0, '127.0.0.1', r));
  t.after(() => fake.close());
  const url = `http://127.0.0.1:${/** @type {any} */ (fake.address()).port}`;
  const { api } = await start({ ENGINE: '', GEMINI_API_KEY: 'k'.repeat(39), FALLBACK_PROBE_URL: url, LOCAL_ASR_URL: `${url}/inference`, LOCAL_LLM_URL: url, LOCAL_LLM: '' });
  assert.equal((await api('GET', '/api/setup')).body.aiNow.canBackup, true);
  const r = await api('POST', '/api/ai/use', { use: 'auto' });
  assert.equal(r.status, 200);
  assert.equal(r.body.use, 'auto');
  let lm;
  for (let i = 0; i < 100 && (lm = (await api('GET', '/api/local')).body).state !== 'ready'; i++) await new Promise((res) => setTimeout(res, 100));
  assert.equal(lm.state, 'ready', 'the backup got ready');
  assert.equal(lm.standby, true);
  const { body } = await api('GET', '/api/setup');
  assert.equal(body.engine, 'gemini', 'captions stay on Gemini');
  assert.equal(body.aiNow.use, 'auto');
  assert.equal(body.aiNow.now, 'cloud');
});
