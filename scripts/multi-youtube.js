#!/usr/bin/env node
// Latency / scale test with real talks: N rooms, each fed server-side with a different YouTube video.
//
//   npm run multi                                  # 15 rooms, Nerdearla 2025 talks, 5 min, then stop
//   npm run multi -- --rooms 5 --minutes 3
//   npm run multi -- --playlist "https://www.youtube.com/playlist?list=..."
//   npm run multi -- --file urls.txt               # one YouTube URL per line
//   npm run multi -- --list                        # only show which videos would be used
//   npm run multi -- --cleanup                     # also delete the rooms at the end
//
// Needs yt-dlp (brew install yt-dlp) on the machine running the server. The server must be running (npm start).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const a = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, arr) => {
  if (v.startsWith('--')) acc.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));
const N = Number(a.rooms || 15);
const MINUTES = Number(a.minutes ?? 5); // 0 = until Ctrl+C
const START = Number(a.start ?? 180); // skip intros / sponsor slides
const PREFIX = String(a.prefix || 'ne25');
const QUERY = String(a.query || 'Nerdearla 2025');
const YEAR = String(a.year || '2025');
const MIN_DUR = Number(a['min-duration'] || 900); // talks, not shorts/clips
const http = String(a.server || process.env.OC_SERVER || 'http://localhost:8080').replace(/\/$/, '');
const headers = { 'content-type': 'application/json', 'x-admin-token': a['admin-token'] || process.env.ADMIN_TOKEN || '' };
const CONCURRENCY = Number(a.concurrency || 3);

const c = { dim: (s) => `\x1b[2m${s}\x1b[0m`, red: (s) => `\x1b[31m${s}\x1b[0m`, green: (s) => `\x1b[32m${s}\x1b[0m`, yellow: (s) => `\x1b[33m${s}\x1b[0m`, bold: (s) => `\x1b[1m${s}\x1b[0m` };

// ---------- discovery ----------
function ytdlp(args, timeoutMs = 90000) {
  return new Promise((resolve, reject) => {
    const p = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    const t = setTimeout(() => { p.kill('SIGKILL'); reject(new Error(`yt-dlp timeout: ${args.at(-1)}`)); }, timeoutMs);
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) => { clearTimeout(t); reject(e.code === 'ENOENT' ? new Error('yt-dlp not found — brew install yt-dlp') : e); });
    p.on('close', (code) => { clearTimeout(t); code === 0 || out ? resolve(out) : reject(new Error(err.trim().split('\n').pop() || `yt-dlp exit ${code}`)); });
  });
}
const FMT = '%(id)s\t%(title)s\t%(duration)s\t%(channel)s\t%(url)s';
const parse = (out) => out.split('\n').filter(Boolean).map((l) => {
  const [id, title, dur, channel, url] = l.split('\t');
  return { id, title, duration: Number(dur) || 0, channel: channel === 'NA' ? '' : channel, url: url && url !== 'NA' ? url : '' };
}).filter((v) => v.id && v.id !== 'NA');

async function listFlat(url, extra = []) {
  return parse(await ytdlp(['--flat-playlist', '--no-warnings', '-q', '--print', FMT, ...extra, url]));
}

async function discover() {
  if (a.file) {
    return fs.readFileSync(a.file, 'utf8').split('\n').map((s) => s.trim()).filter((s) => /^https?:\/\//.test(s))
      .map((u, i) => ({ id: (u.match(/[?&]v=([\w-]{11})|youtu\.be\/([\w-]{11})/) || [])[1] || `v${i}`, title: u, url: u, duration: 0 }));
  }
  if (a.playlist) return listFlat(a.playlist);

  const byYear = (v) => new RegExp(`\\b${YEAR}\\b`).test(v.title);
  const long = (v) => !v.duration || v.duration >= MIN_DUR;
  const seen = new Map();
  const add = (list) => { for (const v of list) if (!seen.has(v.id) && long(v)) seen.set(v.id, v); };

  // 1) Channel playlists whose title mentions the year (e.g. "Nerdearla 2025 · Charlas").
  try {
    const pls = (await listFlat('https://www.youtube.com/@nerdearla/playlists')).filter(byYear);
    for (const pl of pls.slice(0, 6)) {
      process.stdout.write(c.dim(`  playlist: ${pl.title}\n`));
      try { add(await listFlat(pl.url || `https://www.youtube.com/playlist?list=${pl.id}`)); } catch (e) { console.log(c.dim(`    ${e.message}`)); }
      if (seen.size >= N * 2) break;
    }
  } catch (e) { console.log(c.dim(`  playlists: ${e.message}`)); }

  // 2) Channel uploads with the year in the title.
  if (seen.size < N) {
    try { add((await listFlat('https://www.youtube.com/@nerdearla/videos', ['--playlist-end', '400'])).filter(byYear)); } catch (e) { console.log(c.dim(`  uploads: ${e.message}`)); }
  }
  // 3) Plain search as a last resort.
  if (seen.size < N) {
    try { add((await listFlat(`ytsearch60:${QUERY}`)).filter((v) => /nerdearla/i.test(v.title + v.channel))); } catch (e) { console.log(c.dim(`  search: ${e.message}`)); }
  }
  return [...seen.values()];
}

// ---------- server calls ----------
async function api(method, p, body) {
  const r = await fetch(`${http}${p}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const txt = await r.text();
  let j; try { j = JSON.parse(txt); } catch { j = { error: txt.slice(0, 120) }; }
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

async function pool(items, n, fn) {
  const q = [...items];
  await Promise.all(Array.from({ length: n }, async () => { while (q.length) await fn(q.shift()); }));
}

// ---------- stats ----------
const samples = new Map(); // id -> { asr: [], tr: [] }
const pct = (arr, p) => {
  if (!arr.length) return null;
  const s = [...arr].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const ms = (v) => (v == null ? c.dim('   -  ') : `${(v / 1000).toFixed(1).padStart(5)}s`);
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n));

function render(status, rooms, t0) {
  const byId = new Map(status.stages.map((s) => [s.id, s]));
  const lines = [];
  let live = 0;
  for (const r of rooms) {
    const s = byId.get(r.id);
    if (!s) { lines.push(`${r.id}  ${c.red('missing')}`); continue; }
    const engState = s.engines.map((e) => e.state).join(',') || 'idle';
    const ok = s.engines.length && s.engines.every((e) => e.state === 'live');
    if (ok) live++;
    const tr = Object.values(s.latency.tr || {}).filter(Boolean);
    const trMax = tr.length ? Math.max(...tr) : null;
    const smp = samples.get(r.id) || { asr: [], tr: [] };
    if (s.latency.asr) smp.asr.push(s.latency.asr);
    if (trMax) smp.tr.push(trMax);
    samples.set(r.id, smp);
    const lang = (s.detectedLang || s.source || '?').slice(0, 5).padEnd(5);
    const state = ok ? c.green(cut(engState, 9)) : r.error ? c.red(cut('error', 9)) : c.yellow(cut(engState, 9));
    const alerts = (s.alerts || []).map((x) => x.code || x).join(',');
    lines.push(`${cut(r.id, 7)} ${state} ${lang} ${ms(s.latency.asr)} ${ms(trMax)} ${`$${(s.costUsd || 0).toFixed(3)}`.padStart(7)}  ${cut(r.error ? c.red(r.error) : (s.preview?.orig || s.preview?.[Object.keys(s.preview || {})[0]] || '').replace(/\s+/g, ' '), 46)} ${alerts ? c.yellow(alerts) : ''}`);
  }
  const allAsr = [...samples.values()].flatMap((x) => x.asr);
  const allTr = [...samples.values()].flatMap((x) => x.tr);
  const sys = status.system || {};
  const elapsed = Math.round((Date.now() - t0) / 1000);
  console.clear();
  console.log(c.bold(`opencaptions · ${rooms.length} rooms · ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}${MINUTES ? ` / ${MINUTES}:00` : ''} · live ${live}/${rooms.length} · Live sessions ${status.totals?.sessions ?? '?'} · cost $${status.totals?.costUsd ?? '?'}`));
  console.log(c.dim(`server cpu ${sys.cpuPct ?? '?'}% · rss ${sys.rssMB ?? '?'}MB · event-loop p99 ${sys.loopLagMs?.p99 ?? '?'}ms · host mem ${sys.sysMemPct ?? '?'}%`));
  console.log(c.bold(`latency so far → original p50 ${ms(pct(allAsr, 50))} p90 ${ms(pct(allAsr, 90))}  ·  translation p50 ${ms(pct(allTr, 50))} p90 ${ms(pct(allTr, 90))}`));
  console.log(c.dim('room    engines   lang   orig  transl    cost  last caption'));
  console.log(lines.join('\n'));
  console.log(c.dim('\nCtrl+C to stop · dashboard: ' + http + '/admin.html'));
  return { live, allAsr, allTr };
}

// ---------- main ----------
try { await api('GET', '/healthz'); } catch (e) { console.error(c.red(`✗ server not reachable at ${http} (${e.message}) — run npm start first`)); process.exit(1); }

console.log(c.bold(`Looking for ${a.file || a.playlist || `"${QUERY}"`} videos…`));
let videos;
try { videos = await discover(); } catch (e) { console.error(c.red(`✗ ${e.message}`)); process.exit(1); }
if (!videos.length) { console.error(c.red('✗ no videos found. Try --playlist <url> or --file urls.txt')); process.exit(1); }
videos = videos.slice(0, N);
console.log(`Using ${videos.length} video(s):`);
videos.forEach((v, i) => console.log(`  ${String(i + 1).padStart(2)}. ${v.title}${v.duration ? c.dim(` (${Math.round(v.duration / 60)} min)`) : ''}  ${c.dim(v.id)}`));
if (a.list) process.exit(0);

const perMin = videos.length * 0.0368;
console.log(c.yellow(`\n≈ $${perMin.toFixed(2)}/min in Gemini Live + ~$0.01/min per room in text translation${MINUTES ? ` → ≈ $${(perMin * MINUTES * 1.25).toFixed(2)} for ${MINUTES} min` : ''}. Starting in 5 s (Ctrl+C to abort)…`));
await new Promise((r) => setTimeout(r, 5000));

const rooms = videos.map((v, i) => ({ id: `${PREFIX}-${String(i + 1).padStart(2, '0')}`, video: v, url: v.url && /watch|youtu\.be/.test(v.url) ? v.url : `https://www.youtube.com/watch?v=${v.id}` }));
let t0 = Date.now();
let stopping = false;

await pool(rooms, CONCURRENCY, async (r) => {
  if (stopping) return;
  const name = `Sala ${r.id.split('-').pop()}`;
  try {
    try { await api('POST', '/api/stages', { id: r.id, name, source: a.source || 'auto', targets: String(a.targets || 'es,en').split(',') }); }
    catch (e) { if (!/exist/i.test(e.message)) throw e; }
    await api('POST', `/api/stages/${r.id}/talk`, { title: r.video.title.slice(0, 120) });
    process.stdout.write(`▶ ${r.id} ${cut(r.video.title, 60)} … `);
    await api('POST', `/api/stages/${r.id}/youtube`, { url: r.url, start: START });
    console.log(c.green('audio flowing'));
  } catch (e) {
    r.error = e.message;
    console.log(c.red(`✗ ${e.message}`));
  }
});
t0 = Date.now();

async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  console.log('\nStopping pulls…');
  let last;
  try { last = await api('GET', '/api/status'); } catch {}
  await Promise.all(rooms.map(async (r) => {
    try { await api('DELETE', `/api/stages/${r.id}/pull`); } catch {}
    if (a.cleanup) { try { await api('DELETE', `/api/stages/${r.id}`); } catch {} }
  }));
  // Report
  const rows = rooms.map((r) => {
    const s = samples.get(r.id) || { asr: [], tr: [] };
    const st = last?.stages.find((x) => x.id === r.id);
    return { id: r.id, title: r.video.title, url: r.url, lang: st?.detectedLang || null, error: r.error || null,
      origP50: pct(s.asr, 50), origP90: pct(s.asr, 90), trP50: pct(s.tr, 50), trP90: pct(s.tr, 90), costUsd: st?.costUsd ?? null };
  });
  const allAsr = rooms.flatMap((r) => samples.get(r.id)?.asr || []);
  const allTr = rooms.flatMap((r) => samples.get(r.id)?.tr || []);
  const report = { at: new Date().toISOString(), server: http, rooms: rooms.length, seconds: Math.round((Date.now() - t0) / 1000),
    origP50: pct(allAsr, 50), origP90: pct(allAsr, 90), trP50: pct(allTr, 50), trP90: pct(allTr, 90),
    costUsd: last?.totals?.costUsd ?? null, system: last?.system ?? null, perRoom: rows };
  const dir = path.resolve('data');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `latency-${report.at.replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(c.bold(`\nResult (${rooms.length} rooms, ${Math.round(report.seconds / 60)} min)`));
  console.log(`original    p50 ${ms(report.origP50)}  p90 ${ms(report.origP90)}`);
  console.log(`translation p50 ${ms(report.trP50)}  p90 ${ms(report.trP90)}`);
  console.log(`cost        $${report.costUsd}`);
  console.log(c.dim(`report → ${file}${a.cleanup ? '' : ' · rooms kept (use --cleanup to delete them)'}`));
  process.exit(code);
}

const timer = setInterval(async () => {
  try {
    const status = await api('GET', '/api/status');
    render(status, rooms, t0);
    if (MINUTES && Date.now() - t0 > MINUTES * 60000) stop(0);
  } catch (e) { console.log(c.red(`status: ${e.message}`)); }
}, 5000);
process.on('SIGINT', () => stop(0));
