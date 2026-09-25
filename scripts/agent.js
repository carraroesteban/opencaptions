#!/usr/bin/env node
// OpenCaptions stage agent — headless, no browser.
// Captures a sound-card input with ffmpeg and streams it to the server. Meant to run as a system
// service on each stage PC (systemd / launchd / Windows service), reconnecting on its own forever.
//
//   node scripts/agent.js --list-devices
//   node scripts/agent.js --stage sala-a --device 1 --server wss://subs.example.com --token XXXX
//   node scripts/agent.js --stage sala-a --device "USB Audio CODEC" --channel left
//
// Options: --stage, --server (ws[s]://host[:port], default ws://localhost:8080), --token (or INGEST_TOKEN),
//          --device (index or name; default = system default input), --channel mix|left|right, --gain <x>,
//          --label <text>, --quiet
import { spawn, spawnSync } from 'node:child_process';
import os from 'node:os';
import WebSocket from 'ws';
import { ffmpegBin } from '../src/pull.js';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : d; };
const platform = os.platform();
const ff = ffmpegBin();
if (!ff) { console.error('✗ ffmpeg not found (brew install ffmpeg / apt install ffmpeg / winget install ffmpeg)'); process.exit(1); }

// ---------- device listing ----------
if (arg('list-devices')) {
  if (platform === 'darwin') {
    const r = spawnSync(ff, ['-hide_banner', '-f', 'avfoundation', '-list_devices', 'true', '-i', ''], { encoding: 'utf8' });
    const lines = (r.stderr || '').split('\n');
    const i = lines.findIndex((l) => /audio devices/i.test(l));
    console.log('Audio inputs (use --device <index>):');
    for (const l of lines.slice(i + 1)) { const m = l.match(/\[(\d+)\] (.+)$/); if (m) console.log(`  ${m[1]}: ${m[2]}`); }
  } else if (platform === 'win32') {
    const r = spawnSync(ff, ['-hide_banner', '-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'], { encoding: 'utf8' });
    console.log('Audio inputs (use --device "<name>"):');
    for (const l of (r.stderr || '').split('\n')) { const m = l.match(/"(.+)" \(audio\)/); if (m) console.log(`  ${m[1]}`); }
  } else {
    const p = spawnSync('pactl', ['list', 'short', 'sources'], { encoding: 'utf8' });
    if (p.status === 0) { console.log('PulseAudio/PipeWire sources (use --device <name>):'); console.log(p.stdout.split('\n').filter(Boolean).map((l) => '  ' + l.split('\t')[1]).join('\n')); }
    const a = spawnSync('arecord', ['-l'], { encoding: 'utf8' });
    if (a.status === 0) { console.log('\nALSA cards (use --device hw:<card>,<device>):'); console.log(a.stdout); }
  }
  process.exit(0);
}

const stage = arg('stage');
if (!stage) { console.error('usage: node scripts/agent.js --stage <id> [--device <idx|name>] [--server ws://host:8080] [--token X] [--channel mix|left|right]\n       node scripts/agent.js --list-devices'); process.exit(1); }
const server = String(arg('server', process.env.OC_SERVER || 'ws://localhost:8080')).replace(/^http/, 'ws').replace(/\/$/, '');
const token = arg('token', process.env.INGEST_TOKEN || '');
const device = arg('device', null);
const channel = arg('channel', 'mix');
const gain = Number(arg('gain', 1));
const quiet = !!arg('quiet');
const label = arg('label', `agent@${os.hostname()}${device != null ? ` · ${device}` : ''}`);

const testFile = arg('file', null); // simulate a sound card with a file (testing / rehearsals)
if (platform === 'win32' && device == null && !testFile) { console.error('✗ on Windows pass --device "<name>" (see --list-devices)'); process.exit(1); }
function inputArgs() {
  if (testFile) return ['-re', '-stream_loop', '-1', '-i', testFile];
  if (platform === 'darwin') return ['-f', 'avfoundation', '-i', `:${device ?? 0}`];
  if (platform === 'win32') return ['-f', 'dshow', '-i', `audio=${device}`];
  if (device && String(device).startsWith('hw:')) return ['-f', 'alsa', '-i', device];
  return ['-f', 'pulse', '-i', device ?? 'default'];
}
function filterArgs() {
  const f = [];
  if (channel === 'left') f.push('pan=mono|c0=c0');
  else if (channel === 'right') f.push('pan=mono|c0=c1');
  if (gain !== 1) f.push(`volume=${gain}`);
  return f.length ? ['-af', f.join(',')] : [];
}

// ---------- capture (restarted automatically) ----------
const pending = []; // PCM buffered while the server is unreachable (max ~15 s)
let ws = null, cap = null, level = 0, sentBytes = 0, lastStatus = null;
const t0 = Date.now();

function startCapture() {
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', ...inputArgs(), '-vn', ...filterArgs(), '-ac', '1', '-ar', '16000', '-f', 's16le', 'pipe:1'];
  cap = spawn(ff, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  cap.stdout.on('data', (b) => {
    let sum = 0;
    for (let i = 0; i + 1 < b.length; i += 2) { const v = b.readInt16LE(i) / 32768; sum += v * v; }
    level = Math.sqrt(sum / (b.length / 2 || 1));
    if (ws?.readyState === 1) { ws.send(b, { binary: true }); sentBytes += b.length; }
    else { pending.push(b); while (pending.length > 150) pending.shift(); }
  });
  cap.stderr.on('data', (b) => console.error('ffmpeg:', b.toString().trim()));
  cap.on('close', (code) => {
    console.error(`capture stopped (${code}); restarting in 2 s…${platform === 'darwin' ? ' (macOS: allow microphone access for your terminal in System Settings → Privacy)' : ''}`);
    setTimeout(startCapture, 2000);
  });
}

// ---------- server connection (reconnects forever) ----------
let backoff = 1000;
let lastMsgAt = 0;
// The server sends a status message every 500 ms: silence for 6 s means a half-dead connection (Wi-Fi roam,
// NAT timeout) that TCP would only notice after minutes. Drop it and reconnect.
setInterval(() => {
  if (ws?.readyState === 1 && Date.now() - lastMsgAt > 6000) { console.error('no reply from server for 6 s → reconnecting'); ws.terminate(); }
}, 2000);
function connect() {
  const url = `${server}/ws/ingest?stage=${encodeURIComponent(stage)}&kind=agent&label=${encodeURIComponent(label)}`;
  ws = new WebSocket(url, { headers: token ? { authorization: `Bearer ${token}` } : {} }); // token in a header, never in the URL
  ws.on('open', () => {
    backoff = 1000;
    lastMsgAt = Date.now();
    console.log(`✓ connected to ${server} as stage "${stage}"`);
    while (pending.length && ws.readyState === 1) ws.send(pending.shift(), { binary: true });
  });
  ws.on('message', (d) => { lastMsgAt = Date.now(); try { const m = JSON.parse(d.toString()); if (m.type === 'status') lastStatus = m; } catch { /* ignore */ } });
  ws.on('close', (code, reason) => {
    if (code === 4001) { console.error('✗ bad ingest token'); process.exit(1); }
    if (code === 4004) { console.error(`✗ unknown stage "${stage}"`); process.exit(1); }
    if (code === 4000) {
      // Another source (backup browser ingest, demo pull, second agent) took over this room on purpose.
      // Don't fight it every second; check back later.
      console.error('another audio source took over this room; retrying in 60 s');
      setTimeout(connect, 60000);
      return;
    }
    console.error(`connection closed (${code} ${reason || ''}); retrying in ${backoff / 1000}s`);
    setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, 15000);
  });
  ws.on('error', (e) => console.error('ws:', e.message));
}

startCapture();
connect();

if (!quiet) {
  setInterval(() => {
    const db = 20 * Math.log10(level || 1e-6);
    const bar = '█'.repeat(Math.max(0, Math.min(30, Math.round(((db + 60) / 60) * 30)))).padEnd(30, '·');
    const eng = lastStatus?.engines?.map((e) => `${e.target}:${e.state}`).join(' ') || '-';
    const lat = lastStatus?.latency?.asr != null ? ` · latency ${(lastStatus.latency.asr / 1000).toFixed(1)}s` : '';
    const al = lastStatus?.alerts?.length ? ` · ⚠ ${lastStatus.alerts.join(',')}` : '';
    console.log(`[${new Date().toLocaleTimeString()}] ${bar} ${db.toFixed(0).padStart(4)} dB · ${ws?.readyState === 1 ? 'online' : 'OFFLINE'} · ${eng}${lat}${al} · sent ${(sentBytes / 32000 / 60).toFixed(1)} min`);
  }, 5000);
}

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { try { cap?.kill('SIGKILL'); } catch { /* ignore */ } process.exit(0); });
