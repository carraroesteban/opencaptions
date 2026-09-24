#!/usr/bin/env node
// Simulate N simultaneous stages fed with the same audio (one ffmpeg, N ingest sockets).
//   node scripts/loadtest.js --stages 10 --input samples/talk-en.wav [--server http://localhost:8080] [--admin-token X]
import WebSocket from 'ws';
import { openAudio } from '../src/pull.js';

const a = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, arr) => {
  if (v.startsWith('--')) acc.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));
const n = Number(a.stages || 10);
const http = (a.server || 'http://localhost:8080').replace(/^ws/, 'http');
const wsBase = http.replace(/^http/, 'ws');
const headers = { 'content-type': 'application/json', 'x-admin-token': a['admin-token'] || process.env.ADMIN_TOKEN || '' };
const input = a.input || 'samples/talk-en.wav';

const ids = Array.from({ length: n }, (_, i) => `load-${i + 1}`);
for (const id of ids) {
  const r = await fetch(`${http}/api/stages`, { method: 'POST', headers, body: JSON.stringify({ id, name: `Load ${id}`, source: a.source || 'auto', targets: (a.targets || 'es,en').split(',') }) });
  if (!r.ok && r.status !== 400) console.error(id, r.status, await r.text());
}
const sockets = ids.map((id) => new WebSocket(`${wsBase}/ws/ingest?stage=${id}&kind=loadtest&token=${process.env.INGEST_TOKEN || ''}`));
await Promise.all(sockets.map((ws) => new Promise((res) => ws.on('open', res))));
console.log(`${n} ingest sockets open → streaming ${input}`);
const ff = openAudio(input, { realtime: true, loop: true });
ff.on('error', (e) => { console.error('✗', e.message); process.exit(1); });
ff.on('data', (b) => { for (const ws of sockets) if (ws.readyState === 1) ws.send(b, { binary: true }); });

setInterval(async () => {
  const s = await (await fetch(`${http}/api/status`, { headers })).json();
  const load = s.stages.filter((x) => ids.includes(x.id));
  const live = load.filter((x) => x.engines.every((e) => e.state === 'live')).length;
  const lat = load.map((x) => x.latency.asr).filter(Boolean);
  const avg = lat.length ? Math.round(lat.reduce((p, c) => p + c, 0) / lat.length) : '-';
  console.log(`live ${live}/${n} · sessions ${s.totals.sessions} · avg ASR latency ${avg} ms · est. cost $${s.totals.costUsd} · rss ${Math.round(process.memoryUsage().rss / 1e6)}MB (client)`);
}, 5000);

process.on('SIGINT', async () => {
  ff.stopAudio();
  if (a.cleanup) for (const id of ids) await fetch(`${http}/api/stages/${id}`, { method: 'DELETE', headers });
  process.exit(0);
});
