#!/usr/bin/env node
// Long-run check: a mock-engine server with rooms that hear speech the whole time (the bundled talks on a loop) and
// phones that come and go, measured every minute: heap, RSS and event-loop lag. Never calls the real AI.
//   npm run soak -- --minutes 60 [--rooms 2] [--viewers 20] [--out data/soak.json]   (default: data/soak-<time>.json)
// Per minute it prints the lowest heap seen (closest to what's left after garbage collection), the highest RSS and
// the worst loop lag; at the end, how fast each grew after the first 5 minutes (MB per hour), and a JSON report.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { openAudio } from '../src/pull.js';

const a = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, arr) => {
  if (v.startsWith('--')) acc.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));
const minutes = Number(a.minutes || 60);
const rooms = Number(a.rooms || 2);
const viewersPerRoom = Number(a.viewers || 20);
const port = Number(a.port || 18900 + Math.floor(Math.random() * 500));
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-soak-'));
const out = a.out || path.join('data', `soak-${new Date().toISOString().slice(0, 16).replace(/:/g, '')}.json`);

const srv = spawn(process.execPath, ['src/server.js', '--mock'], {
  env: { ...process.env, PORT: String(port), ENGINE: 'mock', DATA_DIR: dataDir, SCHEDULE: path.join(dataDir, 's.json'), AUTH: 'auto', ADMIN_TOKEN: '', PUBLIC_URL: '', TUNNEL: '', FALLBACK: '', UPDATE_CHECK: '0' },
  stdio: ['ignore', 'ignore', 'inherit'],
});
const stop = (code) => { srv.once('exit', () => { fs.rmSync(dataDir, { recursive: true, force: true }); process.exit(code); }); srv.kill(); };
process.on('SIGINT', () => stop(130));
for (let i = 0; ; i++) {
  try { if ((await fetch(`${base}/healthz`)).ok) break; } catch { /* starting */ }
  if (i > 100) { console.error('server did not start'); stop(1); }
  await new Promise((r) => setTimeout(r, 100));
}

const ids = Array.from({ length: rooms }, (_, i) => `soak-${i + 1}`);
for (const id of ids) {
  const r = await fetch(`${base}/api/stages`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, name: id, source: 'auto', targets: ['es', 'en'] }) });
  if (!r.ok) { console.error(`room ${id}: ${r.status} ${await r.text()}`); stop(1); }
}

// Audio in: each room hears a bundled talk on a loop, in real time, like a room computer.
ids.forEach((id, i) => {
  const ws = new WebSocket(`${base.replace('http', 'ws')}/ws/ingest?stage=${id}&kind=cli&label=soak`);
  ws.on('open', () => openAudio(`samples/talk-${i % 2 ? 'es' : 'en'}.wav`, { realtime: true, loop: true }).on('data', (b) => ws.readyState === 1 && ws.send(b, { binary: true })));
  ws.on('error', (e) => console.error(`ingest ${id}:`, e.message));
});

// Phones: they read captions, and every few seconds one of them "sleeps" (its socket dies without a goodbye) and
// another comes back, getting the history again, the way phones in a hall do.
let captions = 0, hellos = 0;
const phones = [];
const phone = (id) => {
  const ws = new WebSocket(`${base.replace('http', 'ws')}/ws/view?stage=${id}&langs=orig,es`);
  ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.type === 'caption') captions++; else if (m.type === 'hello') hellos++; });
  ws.on('error', () => {});
  return ws;
};
for (const id of ids) for (let v = 0; v < viewersPerRoom; v++) phones.push({ id, ws: phone(id) });
const churn = setInterval(() => {
  const p = phones[Math.floor(Math.random() * phones.length)];
  if (Math.random() < 0.5) p.ws.terminate(); else p.ws.close();
  p.ws = phone(p.id);
}, 5000);

// Measure: every 10 s, kept per minute as the lowest heap, the highest RSS and the worst loop lag.
const rows = [];
let cur = null;
const t0 = Date.now();
const sample = async () => {
  try {
    const s = /** @type {any} */ (await (await fetch(`${base}/api/status`)).json()).system;
    cur ??= { min: rows.length + 1, heapMB: Infinity, rssMB: 0, lagP99Ms: 0, lagMaxMs: 0 };
    cur.heapMB = Math.min(cur.heapMB, s.heapMB);
    cur.rssMB = Math.max(cur.rssMB, s.rssMB);
    cur.lagP99Ms = Math.max(cur.lagP99Ms, s.loopLagMs.p99);
    cur.lagMaxMs = Math.max(cur.lagMaxMs, s.loopLagMs.max);
  } catch (e) { console.error('sample failed:', e.message); }
};
const slope = (k, from) => { // least squares, MB per hour
  const pts = rows.filter((r) => r.min > from);
  if (pts.length < 3) return null;
  const n = pts.length, mx = pts.reduce((s, r) => s + r.min, 0) / n, my = pts.reduce((s, r) => s + r[k], 0) / n;
  const b = pts.reduce((s, r) => s + (r.min - mx) * (r[k] - my), 0) / pts.reduce((s, r) => s + (r.min - mx) ** 2, 0);
  return +(b * 60).toFixed(2);
};
console.log(`soak: ${rooms} rooms, ${phones.length} phones, ${minutes} min · minute heapMB rssMB lagP99 lagMax captions`);
const tick = setInterval(async () => {
  await sample();
  if (Date.now() - t0 < (rows.length + 1) * 60_000) return;
  rows.push({ ...cur, captions, hellos });
  console.log(`${String(cur.min).padStart(4)}  ${String(cur.heapMB).padStart(5)}  ${String(cur.rssMB).padStart(5)}  ${String(cur.lagP99Ms).padStart(6)}  ${String(cur.lagMaxMs).padStart(6)}  ${captions}`);
  cur = null;
  if (rows.length < minutes) return;
  clearInterval(tick); clearInterval(churn);
  const report = { rooms, phones: phones.length, minutes, heapMBPerHour: slope('heapMB', 5), rssMBPerHour: slope('rssMB', 5), first: rows[5] || rows[0], last: rows.at(-1), rows };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`after warm-up: heap ${report.heapMBPerHour} MB/h, RSS ${report.rssMBPerHour} MB/h · report: ${out}`);
  stop(0);
}, 10_000);
