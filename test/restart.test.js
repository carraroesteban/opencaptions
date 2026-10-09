// A server restart (Ctrl+C, an update) must not stop the rooms' audio for good. The room computers hear 1012 "server
// restarting", never 4000 "another source took your room" (which makes them give up), and come back by themselves.
// The real server with the simulated AI; the room computers are `npm run feed`, the agent and a bare socket.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { ffmpegBin } from '../src/pull.js';

const PORT = 35000 + Math.floor(Math.random() * 2000);
const base = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const h = { authorization: 'Bearer t', 'content-type': 'application/json' };
const room = async (id) => (await (await fetch(`${base}/api/status`, { headers: h })).json()).stages.find((s) => s.id === id);
const until = async (fn, ms = 8000) => { for (let t = 0; t < ms; t += 100) { const v = await fn().catch(() => null); if (v) return v; await sleep(100); } return null; };
let srv, dataDir;
const kids = [];

async function startServer() {
  srv = spawn(process.execPath, ['src/server.js'], {
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', ENGINE: 'mock', DATA_DIR: dataDir, EVENT_CONFIG: 'test/fixtures/event.json', GLOSSARY: path.join(dataDir, 'glossary.json'), ADMIN_TOKEN: 't', INGEST_TOKEN: 't', PUBLIC_URL: '', GEMINI_API_KEY: '', TUNNEL: '', FALLBACK: '' },
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  if (!(await until(async () => (await fetch(`${base}/healthz`)).ok, 10000))) throw new Error('server did not start');
}
const running = () => srv.exitCode === null && srv.signalCode === null;
/** Ctrl+C, and wait until the process is gone. On Windows a signal to a child ends it at once (no handler runs), so the
 * test asks over IPC, which runs the same shutdown; elsewhere it's the real SIGINT. */
const stopServer = () => new Promise((r) => {
  if (!running()) return r();
  srv.once('exit', r);
  if (process.platform === 'win32') srv.send('shutdown'); else srv.kill('SIGINT');
});

/** A bare ingest socket: what it was told, and how it was closed. */
async function ingest(stage) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws/ingest?stage=${stage}&kind=test&label=bare`, { headers: { authorization: 'Bearer t' } });
  const got = { types: new Set(), closed: new Promise((r) => ws.once('close', (code, reason) => r({ code, reason: reason.toString() }))) };
  ws.on('message', (d) => got.types.add(JSON.parse(d.toString()).type));
  await new Promise((r, j) => { ws.once('open', r); ws.once('error', j); });
  ws.on('error', () => {});
  return { ws, got };
}

/** One of the repo's own room-computer clients, kept running in the background. */
function client(script, args) {
  const p = spawn(process.execPath, [script, '--server', `ws://127.0.0.1:${PORT}`, '--token', 't', '--quiet', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  p.out = '';
  p.stdout.on('data', (b) => (p.out += b));
  p.stderr.on('data', (b) => (p.out += b));
  kids.push(p);
  return p;
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-restart-'));
  fs.copyFileSync('test/fixtures/glossary.json', path.join(dataDir, 'glossary.json'));
  await startServer();
});

after(async () => {
  for (const p of kids) p.kill();
  await stopServer();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('a server restart: the room computers are told so (1012) and reconnect by themselves', async () => {
  const bare = await ingest('main');
  const feed = client('scripts/feed.js', ['--stage', 'room-b', '--input', 'samples/talk-en.wav']);
  const agent = ffmpegBin() ? client('scripts/agent.js', ['--stage', 'room-c', '--file', 'samples/talk-en.wav']) : null;
  assert.ok(await until(async () => (await room('room-b')).ingest?.kind === 'cli'), `feed connected: ${feed.out}`);
  if (agent) assert.ok(await until(async () => (await room('room-c')).ingest?.kind === 'agent'), `agent connected: ${agent.out}`);

  await stopServer();
  const { code, reason } = await bare.got.closed;
  assert.equal(code, 1012, `close code ${code} ${reason}: 4000 would tell the room computer that another source took its room`);
  assert.equal(reason, 'server restarting');
  assert.ok(!bare.got.types.has('replaced'), 'no "replaced" message on a restart');
  await sleep(300);
  assert.equal(feed.exitCode, null, `npm run feed keeps running while the server is away: ${feed.out}`);

  const down = Date.now();
  await startServer();
  const b = await until(async () => { const s = await room('room-b'); return s.ingest?.kind === 'cli' && s; }, 15000);
  assert.ok(b, `npm run feed reconnected by itself: ${feed.out}`);
  assert.ok(b.ingest.since > down);
  if (agent) {
    // Not the 60 s it waits after a takeover: its usual backoff (1, 2, 4 s).
    assert.ok(await until(async () => (await room('room-c')).ingest?.kind === 'agent', 15000), `the agent reconnected by itself: ${agent.out}`);
  }
  // Audio flows again (the file keeps playing where it was: the feed doesn't open it again).
  assert.ok(await until(async () => (await room('room-b')).level > 0, 5000), 'audio arrives after the restart');
  assert.equal(feed.exitCode, null);
  assert.equal((feed.out.match(/→ streaming to/g) || []).length, 2, feed.out);
});

test('another source taking the room is still 4000, with a "replaced" message', async () => {
  if (!running()) await startServer(); // the restart test failed halfway
  const first = await ingest('room-a');
  const second = await ingest('room-a');
  const { code } = await first.got.closed;
  assert.equal(code, 4000);
  assert.ok(first.got.types.has('replaced'));
  second.ws.close();
});

test('a room deleted under a room computer: 1012 "room removed", then 4004 on reconnecting', async () => {
  if (!running()) await startServer();
  const bare = await ingest('room-a');
  const r = await fetch(`${base}/api/stages/room-a`, { method: 'DELETE', headers: h });
  assert.equal(r.status, 200);
  const { code, reason } = await bare.got.closed;
  assert.equal(code, 1012);
  assert.equal(reason, 'room removed');
  const again = new WebSocket(`ws://127.0.0.1:${PORT}/ws/ingest?stage=room-a&kind=test`, { headers: { authorization: 'Bearer t' } });
  again.on('error', () => {});
  assert.equal(await new Promise((res) => again.once('close', res)), 4004);
});
