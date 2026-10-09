#!/usr/bin/env node
// Subtitle a recorded video/audio file with OpenCaptions itself, much faster than real time: the file is uploaded to
// the server's "Caption a recording" (src/recording.js, the same as Transcripts → Caption a recording), and
// <file>.<lang>.srt (and .vtt) are written next to it — ready for YouTube → Subtitles → Upload.
//
//   npm run subtitle -- ~/Movies/demo.mov --langs en            # English subtitles
//   npm run subtitle -- talk.mp4 --source es --langs en,pt      # Spanish talk → EN + PT (+ original)
//   npm run subtitle -- talk.mp4 --room main                    # also keep it as a transcript of the room "main"
//
// Options: --langs <codes> (default en,es) · --source <code|auto> · --server http://localhost:8080
//          --admin-token X (or ADMIN_TOKEN; not needed on the server machine) · --out <dir> · --room <id> · --title <text>
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const file = argv.find((a, i) => !a.startsWith('--') && !(argv[i - 1] || '').startsWith('--'));
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
if (!file || !fs.existsSync(file)) {
  console.error('usage: npm run subtitle -- <video-or-audio-file> [--langs en,es] [--source auto|es|en] [--out dir] [--room id]');
  process.exit(1);
}
const http = String(opt('server', process.env.OC_SERVER || 'http://localhost:8080')).replace(/^ws/, 'http').replace(/\/$/, '');
const token = opt('admin-token', process.env.ADMIN_TOKEN || '');
const auth = token ? { authorization: `Bearer ${token}` } : {};
const langs = String(opt('langs', 'en,es')).split(',').map((s) => s.trim()).filter(Boolean);
const source = opt('source', 'auto');
const room = opt('room', '');
const outDir = path.resolve(opt('out', path.dirname(file)));
const base = path.basename(file).replace(/\.[^.]+$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const secs = (ms) => `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} s`;
const line = (s) => process.stdout.write(`\r\x1b[2K${s.slice(0, (process.stdout.columns || 120) - 1)}`);

async function api(method, p, body, headers = { 'content-type': 'application/json' }) {
  const r = await fetch(`${http}${p}`, { method, headers: { ...headers, ...auth }, body: body && !Buffer.isBuffer(body) ? JSON.stringify(body) : body });
  const t = await r.text();
  let j = null;
  try { j = JSON.parse(t); } catch { /* text export */ }
  if (!r.ok) throw Object.assign(new Error(j?.error || `${method} ${p}: ${r.status} ${t.slice(0, 200)}`), { status: r.status, body: j });
  return j ?? t;
}

try { await api('GET', '/healthz'); } catch (e) { console.error(`✗ server not reachable at ${http} — run npm start first (${e.message})`); process.exit(1); }

let id = null;
process.on('SIGINT', async () => { if (id) await api('DELETE', `/api/recordings/${id}`).catch(() => {}); process.exit(130); });
try {
  // 1. upload, in pieces (the server says how big)
  const size = fs.statSync(file).size;
  let job = await api('POST', '/api/recordings', { name: path.basename(file), size });
  id = job.id;
  const fd = fs.openSync(file, 'r');
  const t0 = Date.now();
  while (job.state === 'uploading') {
    const piece = Buffer.alloc(Math.min(job.chunkBytes, size - job.size));
    fs.readSync(fd, piece, 0, piece.length, job.size);
    const r = await api('PUT', `/api/recordings/${id}/data?offset=${job.size}`, piece, { 'content-type': 'application/octet-stream' });
    job = { ...job, ...r };
    line(`↑ ${path.basename(file)} ${Math.floor((job.size / size) * 100)}%`);
  }
  fs.closeSync(fd);
  const est = job.estimate;
  line(`✓ uploaded ${(size / 1e6).toFixed(1)} MB in ${secs(Date.now() - t0)} · ${job.durationMs ? secs(job.durationMs) : '?'} of audio · about ${est.seconds} s${est.usd != null ? `, ~US$ ${est.usd.toFixed(2)}` : ''} with ${job.engine}\n`);

  // 2. caption it on the server
  const t1 = Date.now();
  job = await api('POST', `/api/recordings/${id}/start`, { room, source, targets: langs, title: opt('title', base) });
  while (['queued', 'running'].includes(job.state)) {
    await sleep(500);
    job = await api('GET', `/api/recordings/${id}`);
    line(`▶ ${job.phase} ${Math.round(job.progress * 100)}%${job.etaMs ? ` · ~${secs(job.etaMs)} left` : ''}`);
  }
  if (job.state !== 'done') throw new Error(job.error || job.state);
  line(`✓ ${job.captions} lines in ${secs(Date.now() - t1)}${job.lang ? ` (spoken: ${job.lang})` : ''}${job.costUsd ? ` · US$ ${job.costUsd.toFixed(4)}` : ''}\n`);

  // 3. the subtitle files, next to the recording
  fs.mkdirSync(outDir, { recursive: true });
  for (const lang of ['orig', ...langs]) {
    for (const fmt of ['srt', 'vtt']) {
      const body = String(await api('GET', `/api/recordings/${id}/export.${fmt}?lang=${lang}`));
      if (!body.trim() || body.trim() === 'WEBVTT') continue;
      const out = path.join(outDir, `${base}.${lang === 'orig' ? 'original' : lang}.${fmt}`);
      fs.writeFileSync(out, body);
      if (fmt === 'srt') console.log(`  ${out}`);
    }
  }
  if (job.talk) console.log(`  also in the dashboard: Transcripts → ${job.talk.stage}`);
  await api('DELETE', `/api/recordings/${id}`).catch(() => {}); // the server forgets it (a room's transcript stays)
  console.log('Upload the .srt to YouTube Studio → Subtitles → Add language → Upload file (with timing).');
  process.exit(0);
} catch (e) {
  console.error(`\n✗ ${e.message}`);
  if (id) await api('DELETE', `/api/recordings/${id}`).catch(() => {});
  process.exit(1);
}
