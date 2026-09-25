#!/usr/bin/env node
// Subtitle a recorded video/audio file with OpenCaptions itself: plays the file into a temporary room in
// real time, then writes <file>.<lang>.srt (and .vtt) next to it — ready for YouTube → Subtitles → Upload.
//
//   npm run subtitle -- ~/Movies/demo.mov --langs en            # English subtitles
//   npm run subtitle -- talk.mp4 --source es --langs en,pt      # Spanish talk → EN + PT (+ original)
//
// Options: --langs <codes> (default en,es) · --source <code|auto> · --server http://localhost:8080
//          --admin-token X (or ADMIN_TOKEN; not needed on the server machine) · --out <dir>
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';
import { openAudio } from '../src/pull.js';

const argv = process.argv.slice(2);
const file = argv.find((a, i) => !a.startsWith('--') && !(argv[i - 1] || '').startsWith('--'));
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
if (!file || !fs.existsSync(file)) {
  console.error('usage: npm run subtitle -- <video-or-audio-file> [--langs en,es] [--source auto|es|en] [--out dir]');
  process.exit(1);
}
const http = String(opt('server', process.env.OC_SERVER || 'http://localhost:8080')).replace(/^ws/, 'http').replace(/\/$/, '');
const token = opt('admin-token', process.env.ADMIN_TOKEN || '');
const headers = { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) };
const langs = String(opt('langs', 'en,es')).split(',').map((s) => s.trim()).filter(Boolean);
const source = opt('source', 'auto');
const outDir = path.resolve(opt('out', path.dirname(file)));
const base = path.basename(file).replace(/\.[^.]+$/, '');
const room = `subs-${Date.now().toString(36)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, p, body) {
  const r = await fetch(`${http}${p}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${p}: ${r.status} ${t.slice(0, 200)}`);
  return p.includes('export.') && !p.includes('export.json') ? t : JSON.parse(t || '{}');
}

try { await api('GET', '/healthz'); } catch (e) { console.error(`✗ server not reachable at ${http} — run npm start first (${e.message})`); process.exit(1); }

await api('POST', '/api/stages', { id: room, name: `Subtitles · ${base}`.slice(0, 80), source, targets: langs, translation: 'text' });
let cleaned = false;
const cleanup = async () => { if (cleaned) return; cleaned = true; try { await api('DELETE', `/api/stages/${room}`); } catch { /* ignore */ } };
process.on('SIGINT', async () => { await cleanup(); process.exit(130); });

const ws = new WebSocket(`${http.replace(/^http/, 'ws')}/ws/ingest?stage=${room}&kind=cli&label=subtitle`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
// New talk right now = subtitle time 00:00 is the first byte of the file.
const talk = await api('POST', `/api/stages/${room}/talk`, { title: base });
const talkId = talk.talk.id;
console.log(`▶ ${path.basename(file)} → ${langs.join(', ')} (real time; Ctrl+C to abort)`);

let lastLine = '';
ws.on('message', (d) => {
  try {
    const m = JSON.parse(d.toString());
    if (m.type !== 'status') return;
    const line = Object.entries(m.preview || {}).map(([k, v]) => `[${k}] ${String(v).slice(-60)}`).join('  ');
    if (line && line !== lastLine) { lastLine = line; process.stdout.write(`\r\x1b[2K${line.slice(0, (process.stdout.columns || 120) - 1)}`); }
  } catch { /* ignore */ }
});

const t0 = Date.now();
await new Promise((resolve, reject) => {
  const src = openAudio(file, { realtime: true });
  src.on('data', (b) => ws.readyState === 1 && ws.send(b, { binary: true }));
  src.on('error', reject);
  src.on('end', resolve);
});
// Push a few seconds of silence so the model finishes the last sentence, then let translations land.
const silence = Buffer.alloc(3200);
for (let i = 0; i < 40; i++) { if (ws.readyState === 1) ws.send(silence, { binary: true }); await sleep(100); }
await sleep(6000);
ws.close();
console.log(`\n✓ played ${Math.round((Date.now() - t0) / 1000)} s of audio`);

fs.mkdirSync(outDir, { recursive: true });
for (const lang of ['orig', ...langs]) {
  for (const fmt of ['srt', 'vtt']) {
    const body = await api('GET', `/api/stages/${room}/export.${fmt}?talk=${encodeURIComponent(talkId)}&lang=${lang}`);
    if (!body.trim() || body.trim() === 'WEBVTT') continue;
    const out = path.join(outDir, `${base}.${lang === 'orig' ? 'original' : lang}.${fmt}`);
    fs.writeFileSync(out, body);
    if (fmt === 'srt') console.log(`  ${out}`);
  }
}
await cleanup();
console.log('Upload the .srt to YouTube Studio → Subtitles → Add language → Upload file (with timing).');
process.exit(0);
