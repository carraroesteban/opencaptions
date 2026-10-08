#!/usr/bin/env node
// Simulate N simultaneous stages fed with the same audio (one ffmpeg, N ingest sockets).
//   node scripts/loadtest.js --stages 10 --input samples/talk-en.wav [--server http://localhost:8080] [--admin-token X]
// With --listeners L, each room also gets L phones playing the room's sound (assistive listening, audio=orig): the
// report adds what they receive (kbit/s each, Mbit/s in all), how long a frame takes from ingest to phone, and gaps.
//   node scripts/loadtest.js --stages 1 --listeners 200 --seconds 60
// --seconds N stops after N seconds and prints a summary (the server's CPU from /healthz, averaged after 10 s).
import crypto from 'node:crypto';
import WebSocket from 'ws';
import { openAudio } from '../src/pull.js';
import { muLaw } from '../src/audio.js';

const a = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, arr) => {
  if (v.startsWith('--')) acc.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));
const n = Number(a.stages || 10);
const listeners = Number(a.listeners || 0);
const seconds = Number(a.seconds || 0);
const http = (a.server || 'http://localhost:8080').replace(/^ws/, 'http');
const wsBase = http.replace(/^http/, 'ws');
const headers = { 'content-type': 'application/json', 'x-admin-token': a['admin-token'] || process.env.ADMIN_TOKEN || '' };
const input = a.input || 'samples/talk-en.wav';

const ids = Array.from({ length: n }, (_, i) => `load-${i + 1}`);
for (const id of ids) {
  const sound = listeners ? { roomSound: true, roomSoundMax: Math.max(listeners, 1) } : {};
  const r = await fetch(`${http}/api/stages`, { method: 'POST', headers, body: JSON.stringify({ id, name: `Load ${id}`, source: a.source || 'auto', targets: (a.targets || 'es,en').split(','), ...sound }) });
  // Already there (a previous run): make sure its room sound is set as asked.
  if (!r.ok && r.status === 400 && listeners) await fetch(`${http}/api/stages/${id}`, { method: 'PATCH', headers, body: JSON.stringify(sound) });
  else if (!r.ok && r.status !== 400) console.error(id, r.status, await r.text());
}
const sockets = ids.map((id) => new WebSocket(`${wsBase}/ws/ingest?stage=${id}&kind=loadtest`, { headers: { authorization: `Bearer ${process.env.INGEST_TOKEN || a['admin-token'] || process.env.ADMIN_TOKEN || ''}` } }));
await Promise.all(sockets.map((ws) => new Promise((res) => ws.on('open', res))));

// ---- phones playing the room's sound ----
// μ-law is one byte per sample, so a frame is found in what was sent by its bytes, wherever the server's 100 ms
// boundaries fall (a file that loops ends with a short chunk). Its time is when its last sample went to the server.
// Every phone gets the same frames: each is looked up once. Sound found twice (silence) isn't timed.
let sent = Buffer.alloc(0), sentBase = 0; // the last few seconds sent, as μ-law; sentBase: offset of sent[0]
const marks = []; // [end offset, when sent] per chunk
const timeOf = new Map(); // hash of a frame → when its last sample was sent (null: not timed)
const hash = (b) => crypto.createHash('md5').update(b).digest('base64');
function sentTime(frame) {
  const k = hash(frame);
  if (timeOf.has(k)) return timeOf.get(k);
  const probe = frame.subarray(0, 64), i = sent.indexOf(probe);
  const end = i >= 0 && i === sent.lastIndexOf(probe) ? sentBase + i + frame.length : -1;
  const t = end < 0 ? null : marks.find(([e]) => e >= end)?.[1] ?? null;
  timeOf.set(k, t);
  if (timeOf.size > 5000) timeOf.delete(timeOf.keys().next().value);
  return t;
}
const phones = [];
const stats = { bytes: 0, frames: 0, transit: [], gaps: 0, refused: 0 };
for (const id of ids) {
  for (let i = 0; i < listeners; i++) {
    const ws = new WebSocket(`${wsBase}/ws/view?stage=${id}&langs=orig&audio=orig`);
    let last = 0;
    ws.on('message', (d, binary) => {
      const now = performance.now();
      if (!binary) {
        const m = JSON.parse(d.toString());
        if ((m.type === 'hello' || m.type === 'listen') && (m.listen ?? m).ok === false) stats.refused++;
        return;
      }
      stats.bytes += d.length;
      stats.frames++;
      if (last && now - last > 250) stats.gaps++; // a frame more than 150 ms late
      last = now;
      const t = sentTime(d);
      if (t) stats.transit.push(now - t);
    });
    phones.push(new Promise((res) => ws.on('open', res)));
  }
}
await Promise.all(phones);
console.log(`${n} ingest sockets open${listeners ? `, ${listeners * n} phones listening` : ''} → streaming ${input}`);
const ff = openAudio(input, { realtime: true, loop: true });
ff.on('error', (e) => { console.error('✗', e.message); process.exit(1); });
ff.on('data', (b) => {
  if (listeners) {
    sent = Buffer.concat([sent, muLaw(b)]);
    if (sent.length > 160_000) { sentBase += sent.length - 80_000; sent = sent.subarray(sent.length - 80_000); }
    marks.push([sentBase + sent.length, performance.now()]);
    while (marks.length && marks[0][0] < sentBase) marks.shift();
  }
  for (const ws of sockets) if (ws.readyState === 1) ws.send(b, { binary: true });
});

const t0 = Date.now();
const cpu = [];
let lastBytes = 0, lastAt = Date.now();
const pct = (arr, p) => { if (!arr.length) return null; const s = [...arr].sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))].toFixed(1); };
setInterval(async () => {
  const s = /** @type {any} */ (await (await fetch(`${http}/api/status`, { headers })).json());
  const h = /** @type {any} */ (await (await fetch(`${http}/healthz`)).json());
  if (Date.now() - t0 > 10_000) cpu.push(h);
  const load = s.stages.filter((x) => ids.includes(x.id));
  const live = load.filter((x) => x.engines.every((e) => e.state === 'live')).length;
  const lat = load.map((x) => x.latency.asr).filter(Boolean);
  const avg = lat.length ? Math.round(lat.reduce((p, c) => p + c, 0) / lat.length) : '-';
  const now = Date.now();
  const mbps = ((stats.bytes - lastBytes) * 8) / ((now - lastAt) / 1000) / 1e6;
  lastBytes = stats.bytes; lastAt = now;
  const sound = listeners ? ` · room sound ${mbps.toFixed(2)} Mbit/s to ${listeners * n} phones, transit p50 ${pct(stats.transit, 50)} ms p99 ${pct(stats.transit, 99)} ms` : '';
  console.log(`live ${live}/${n} · sessions ${s.totals.sessions} · avg ASR latency ${avg} ms · est. cost $${s.totals.costUsd} · server CPU ${h.cpuPct}% rss ${h.rssMB}MB${sound}`);
}, 5000);

async function finish() {
  ff.stopAudio();
  const avg = (k) => (cpu.length ? +(cpu.reduce((p, h) => p + h[k], 0) / cpu.length).toFixed(1) : null);
  const secs = (Date.now() - t0) / 1000;
  const summary = {
    stages: n, listeners: listeners * n, seconds: Math.round(secs),
    serverCpuPct: avg('cpuPct'), serverRssMB: avg('rssMB'), loopLagP99Ms: avg('loopLagP99Ms'),
    ...(listeners ? {
      kbpsPerPhone: +((stats.bytes * 8) / secs / 1000 / (listeners * n)).toFixed(1),
      mbpsTotal: +((stats.bytes * 8) / secs / 1e6).toFixed(2),
      framesPerPhonePerSec: +(stats.frames / secs / (listeners * n)).toFixed(2),
      transitMs: { p50: pct(stats.transit, 50), p95: pct(stats.transit, 95), p99: pct(stats.transit, 99), max: pct(stats.transit, 100), timed: stats.transit.length },
      lateFrames: stats.gaps, refused: stats.refused,
    } : {}),
  };
  console.log(JSON.stringify(summary));
  if (a.cleanup) for (const id of ids) await fetch(`${http}/api/stages/${id}`, { method: 'DELETE', headers });
  process.exit(0);
}
process.on('SIGINT', finish);
if (seconds) setTimeout(finish, seconds * 1000);
