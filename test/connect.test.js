// Setting up from the browser instead of the terminal: the Gemini API key (checked with a stand-in for Google,
// saved in data/secrets.json, never sent back) and the public address (src/tunnel.js, with a script standing in
// for cloudflared).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Tunnel } from '../src/tunnel.js';

const GOOD = 'AIzaGOODgoodGOODgoodGOODgoodGOODgood123';
const PORT = 25000 + Math.floor(Math.random() * 2000);
const base = `http://127.0.0.1:${PORT}`;
const h = { 'content-type': 'application/json', authorization: 'Bearer t' };
let srv, google, dataDir;
const api = async (method, url, body) => {
  const r = await fetch(base + url, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};
const status = async () => (await fetch(`${base}/api/status`, { headers: h })).json();

before(async () => {
  // Google's model endpoint, as far as checking a key goes.
  google = http.createServer((req, res) => {
    const ok = req.headers['x-goog-api-key'] === GOOD;
    res.writeHead(ok ? 200 : 400, { 'content-type': 'application/json' });
    res.end(JSON.stringify(ok ? { name: 'models/x' } : { error: { message: 'API key not valid. Please pass a valid API key.' } }));
  });
  await new Promise((r) => google.listen(0, '127.0.0.1', r));
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-connect-'));
  const glossary = path.join(dataDir, 'glossary.json');
  fs.copyFileSync('test/fixtures/glossary.json', glossary);
  srv = spawn(process.execPath, ['src/server.js'], {
    env: { ...process.env, PORT: String(PORT), ENGINE: '', GEMINI_API_KEY: '', GEMINI_API_BASE: `http://127.0.0.1:${google.address().port}`, DATA_DIR: dataDir, SCHEDULE: path.join(dataDir, 'schedule.json'), GLOSSARY: glossary, ADMIN_TOKEN: 't', INGEST_TOKEN: 't', PUBLIC_URL: '', FALLBACK: '', TUNNEL: '' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/healthz`)).ok) return; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 100));
  }
});
after(() => { srv?.kill(); google?.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

test('without a key, captions are simulated and the dashboard says so', async () => {
  const s = (await api('GET', '/api/setup')).body;
  assert.equal(s.engine, 'mock');
  assert.deepEqual([s.ai.set, s.ai.source], [false, '']);
});

test('a key Google rejects is not saved, and the reason is given', async () => {
  const bad = await api('PUT', '/api/ai/key', { key: 'AIzaBADbadBADbadBADbadBADbadBADbad123' });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.code, 'invalid');
  assert.equal((await api('PUT', '/api/ai/key', { key: 'sk-not-a-gemini-key' })).body.code, 'format');
  assert.equal((await status()).engine, 'mock');
  assert.ok(!fs.existsSync(path.join(dataDir, 'secrets.json')) || !fs.readFileSync(path.join(dataDir, 'secrets.json'), 'utf8').includes('AIza'));
});

test('a good key is saved privately, switches the rooms to Gemini, and is never sent back', async () => {
  const r = await api('PUT', '/api/ai/key', { key: GOOD });
  assert.equal(r.status, 200);
  assert.equal(r.body.engine, 'gemini');
  assert.deepEqual([r.body.key.set, r.body.key.last4, r.body.key.source], [true, 'd123', 'dashboard']);
  assert.equal((await status()).engine, 'gemini');
  const file = path.join(dataDir, 'secrets.json');
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).geminiApiKey, GOOD);
  if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600, 'only this user can read it');
  for (const url of ['/api/setup', '/api/status', '/api/history', '/api/event']) {
    assert.ok(!(await (await fetch(base + url, { headers: h })).text()).includes(GOOD), `${url} must not reveal the key`);
  }
});

test('Event mode: a key can still be replaced (it may run out mid-event), but not removed', async () => {
  await api('POST', '/api/lock', { locked: true });
  assert.equal((await api('DELETE', '/api/ai/key')).status, 423);
  assert.equal((await api('PUT', '/api/ai/key', { key: GOOD })).status, 200);
  assert.equal((await api('POST', '/api/tunnel', { mode: 'quick' })).status, 423, 'the public address is locked too');
  await api('POST', '/api/lock', { locked: false });
});

test('removing the saved key goes back to simulated captions', async () => {
  const r = await api('DELETE', '/api/ai/key');
  assert.equal(r.body.engine, 'mock');
  assert.equal(r.body.key.set, false);
});

test('QR codes never point at localhost: without a public address they use this computer\'s Wi-Fi address', async () => {
  const lan = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
  const ev = await (await fetch(`http://localhost:${PORT}/api/event`)).json();
  if (lan) assert.equal(ev.publicUrl, `http://${lan}:${PORT}`);
  else assert.equal(ev.publicUrl, `http://localhost:${PORT}`);
  const viaLan = await (await fetch(`${base}/api/event`)).json();
  assert.ok(lan ? viaLan.publicUrl.includes(lan) : true);
});

test('a public address needs a valid hostname and a token for your own domain', async () => {
  assert.equal((await api('POST', '/api/tunnel', { mode: 'token', host: 'captions.example.com' })).status, 400);
  assert.equal((await api('POST', '/api/tunnel', { mode: 'token', token: 'x', host: 'not a host' })).status, 400);
  assert.equal((await api('POST', '/api/tunnel', { mode: 'sideways' })).status, 400);
});

// ---------------------------------------------------------------- the tunnel itself, with a fake cloudflared
const fakeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-cf-'));
const fake = path.join(fakeDir, 'cloudflared.js');
fs.writeFileSync(fake, `
const fs = require('node:fs');
const counter = process.env.FAKE_COUNTER;
const n = counter ? (Number(fs.existsSync(counter) ? fs.readFileSync(counter, 'utf8') : 0) + 1) : 1;
if (counter) fs.writeFileSync(counter, String(n));
if (process.env.FAKE_ENV_OUT) fs.writeFileSync(process.env.FAKE_ENV_OUT, JSON.stringify({ args: process.argv.slice(2), token: process.env.TUNNEL_TOKEN || '' }));
if (process.argv.includes('run')) {
  if (process.env.TUNNEL_TOKEN === 'good') console.error('INF Registered tunnel connection connIndex=0');
  else { console.error('ERR Provided Tunnel token is not valid.'); process.exit(1); }
} else {
  console.error('INF |  Your quick Tunnel has been created! Visit it at:  |');
  console.error('INF |  https://fake-' + n + '.trycloudflare.com  |');
  if (process.env.FAKE_DIE_ONCE && n === 1) setTimeout(() => process.exit(1), 200);
}
setInterval(() => {}, 1000);
`);
after(() => fs.rmSync(fakeDir, { recursive: true, force: true }));
const makeTunnel = (env = {}) => new Tunnel({
  origin: 'http://127.0.0.1:1',
  find: () => 'cloudflared',
  check: async () => true,
  probeDelayMs: 10,
  exec: (_bin, args, opts) => spawn(process.execPath, [fake, ...args], { ...opts, env: { ...opts.env, ...env } }),
});
const until = async (t, pred, ms = 8000) => {
  for (let i = 0; i < ms / 50; i++) { if (pred(t.status())) return t.status(); await new Promise((r) => setTimeout(r, 50)); }
  throw new Error(`timed out: ${JSON.stringify(t.status())}`);
};

test('quick tunnel: reads the address, reports it reachable, and never passes a stray TUNNEL_TOKEN', async () => {
  const out = path.join(fakeDir, 'env.json');
  const prev = process.env.TUNNEL_TOKEN;
  process.env.TUNNEL_TOKEN = 'left-in-env';
  const t = makeTunnel({ FAKE_ENV_OUT: out });
  try {
    await t.start({ mode: 'quick' });
    const st = await until(t, (s) => s.reachable === true);
    assert.equal(st.url, 'https://fake-1.trycloudflare.com');
    const seen = JSON.parse(fs.readFileSync(out, 'utf8'));
    assert.equal(seen.token, '', 'a quick tunnel must not become the named one from .env');
    assert.ok(seen.args.includes('--url') && seen.args.includes('http://127.0.0.1:1'));
  } finally {
    t.stop();
    if (prev === undefined) delete process.env.TUNNEL_TOKEN; else process.env.TUNNEL_TOKEN = prev;
  }
  assert.equal(t.status().state, 'off');
});

test('quick tunnel: if cloudflared dies it comes back, with a new address', async () => {
  const t = makeTunnel({ FAKE_COUNTER: path.join(fakeDir, 'n'), FAKE_DIE_ONCE: '1' });
  try {
    await t.start({ mode: 'quick' });
    await until(t, (s) => s.url === 'https://fake-1.trycloudflare.com');
    const st = await until(t, (s) => s.url === 'https://fake-2.trycloudflare.com' && s.state === 'on');
    assert.equal(st.mode, 'quick');
  } finally { t.stop(); }
});

test('own domain: a good token connects on the given address, a bad one stops with the reason', async () => {
  const t = makeTunnel();
  try {
    await t.start({ mode: 'token', token: 'good', host: 'captions.example.com' });
    assert.equal((await until(t, (s) => s.state === 'on')).url, 'https://captions.example.com');
    await t.start({ mode: 'token', token: 'bad', host: 'captions.example.com' });
    const st = await until(t, (s) => s.state === 'error');
    assert.match(st.error, /token is not valid/);
  } finally { t.stop(); }
});
