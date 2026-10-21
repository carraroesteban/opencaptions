// Which AI makes the captions (src/server.js aiNow, POST /api/ai/use): one answer for every page, a switch that checks
// what it can do, and a start that doesn't keep a Gemini key unused because of an old "Run it on this computer".
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
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
