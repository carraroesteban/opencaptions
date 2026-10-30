// Captions off (the dashboard's AI switch): no AI session in any room while the room's computer keeps sending sound,
// also after a restart, until they're turned back on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PORT = 26000 + Math.floor(Math.random() * 2000);
const base = `http://127.0.0.1:${PORT}`;
const auth = { authorization: 'Bearer adm', 'content-type': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const talk = fs.readFileSync('samples/talk-en.wav').subarray(44);

async function withServer(dataDir, fn) {
  const srv = spawn(process.execPath, ['src/server.js'], {
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', ENGINE: 'mock', DATA_DIR: dataDir, SCHEDULE: path.join(dataDir, 's.json'), GLOSSARY: path.join(dataDir, 'g.json'), ADMIN_TOKEN: 'adm', INGEST_TOKEN: 'ing', PUBLIC_URL: '', GEMINI_API_KEY: '', TUNNEL: '', UPDATE_CHECK: '0', STAGES: 'main:Main' },
    stdio: 'ignore',
  });
  // The room's computer, sending the talk in real time the whole time.
  let ingest, timer;
  try {
    for (let i = 0; ; i++) {
      try { if ((await fetch(`${base}/healthz`)).ok) break; } catch { /* starting */ }
      if (i > 100) throw new Error('server did not start');
      await sleep(100);
    }
    ingest = new WebSocket(`ws://127.0.0.1:${PORT}/ws/ingest?stage=main&kind=cli&label=test`, { headers: { authorization: 'Bearer ing' } });
    await new Promise((r) => ingest.once('open', r));
    let o = 0;
    timer = setInterval(() => { ingest.send(talk.subarray(o, o + 3200)); o = (o + 3200) % (talk.length - 3200); }, 100);
    await fn();
  } finally {
    clearInterval(timer);
    ingest?.close();
    await new Promise((r) => { srv.once('exit', r); srv.kill(); });
  }
}
const status = async () => (await fetch(`${base}/api/status`, { headers: auth })).json();
const sessions = async () => (await status()).stages[0].engines.length;
const use = async (u) => (await fetch(`${base}/api/ai/use`, { method: 'POST', headers: auth, body: JSON.stringify({ use: u }) })).json();
async function until(fn, what, ms = 8000) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(200)) if (await fn()) return;
  assert.fail(`timed out waiting for ${what}`);
}

test('captions off: the rooms close their AI sessions and open none while sound keeps coming, after a restart too; back on, they start again', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-off-'));
  await withServer(dir, async () => {
    await until(async () => (await sessions()) > 0, 'the room\'s AI sessions');
    const off = await use('off');
    assert.equal(off.use, 'off');
    assert.equal(off.now, 'off');
    await until(async () => (await sessions()) === 0, 'the sessions to close');
    await sleep(3000); // the talk goes on: still none
    assert.equal(await sessions(), 0);
    assert.equal((await status()).aiNow.now, 'off');
  });
  await withServer(dir, async () => {
    await sleep(3000);
    assert.equal(await sessions(), 0, 'still off after a restart');
    const on = await use('on');
    assert.notEqual(on.now, 'off');
    await until(async () => (await sessions()) > 0, 'the sessions to start again');
  });
  fs.rmSync(dir, { recursive: true, force: true });
});
