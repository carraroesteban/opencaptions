#!/usr/bin/env node
// Feed any audio/video file, URL or YouTube link into a stage, in real time.
//   node scripts/feed.js --stage main --input samples/talk-en.mp3
//   node scripts/feed.js --stage room-a --youtube https://www.youtube.com/watch?v=XXXX --start 120
//   node scripts/feed.js --stage main --input srt://0.0.0.0:9000?mode=listener
import { execFileSync } from 'node:child_process';
import WebSocket from 'ws';
import { openAudio } from '../src/pull.js';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
    return acc;
  }, []),
);

const server = (args.server || process.env.OC_SERVER || 'ws://localhost:8080').replace(/^http/, 'ws');
const stage = args.stage || 'main';
const token = args.token || process.env.INGEST_TOKEN || '';
let input = args.input;

if (args.youtube) {
  try {
    input = execFileSync('yt-dlp', ['-f', 'bestaudio', '-g', args.youtube], { encoding: 'utf8' }).trim().split('\n')[0];
  } catch {
    console.error('yt-dlp is required for --youtube (brew install yt-dlp / pip install yt-dlp)');
    process.exit(1);
  }
}
if (!input) {
  console.error('usage: node scripts/feed.js --stage <id> (--input <file|url> | --youtube <url>) [--start sec] [--loop] [--server ws://host:8080] [--token X]');
  process.exit(1);
}


let lastLat = 0; // when latency was last printed
// The input opens on the first connection and keeps playing while the server is away (a restart, a network drop):
// what it plays meanwhile is buffered (up to 15 s) and sent on reconnecting, as the audio page does. Opening it again
// on every reconnect would start a file over from the top.
const MAX_PENDING = 32000 * 15; // bytes of 16 kHz PCM16
const pending = [];
let pendingBytes = 0, ws = null, ff = null, ended = false, backoff = 1000;
function startInput() {
  ff = openAudio(input, { realtime: true, loop: !!args.loop, start: Number(args.start || 0) });
  ff.on('data', (b) => {
    if (ws?.readyState === 1) return ws.send(b, { binary: true });
    pending.push(b);
    pendingBytes += b.length;
    while (pendingBytes > MAX_PENDING) pendingBytes -= pending.shift().length;
  });
  ff.on('log', (m) => console.error('ffmpeg:', m));
  ff.on('error', (e) => { console.error('✗', e.message); process.exit(1); });
  ff.on('end', () => { ended = true; console.log('input finished'); if (ws?.readyState === 1) ws.close(1000, 'input finished'); });
}

function connect() {
  const url = `${server}/ws/ingest?stage=${encodeURIComponent(stage)}&kind=cli&label=${encodeURIComponent(args.label || String(args.youtube || input).slice(0, 60))}`;
  ws = new WebSocket(url, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  ws.on('open', () => {
    backoff = 1000;
    console.log(`→ streaming to ${stage} @ ${server}`);
    if (!ff) startInput();
    for (const b of pending.splice(0)) ws.send(b, { binary: true });
    pendingBytes = 0;
    if (ended) ws.close(1000, 'input finished');
  });
  let lastPrint = '';
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString());
    if (m.type === 'status' && !args.quiet) {
      const line = Object.entries(m.preview || {}).map(([k, v]) => `[${k}] ${v.slice(-70)}`).join('  ');
      if (line && line !== lastPrint) { console.log(line); lastPrint = line; }
    }
    if (m.type === 'status' && m.latency && Date.now() - (lastLat) > 5000) {
      lastLat = Date.now();
      const tr = Object.entries(m.latency.tr || {}).map(([k, v]) => `${k} ${(v / 1000).toFixed(1)}s`).join(' · ');
      if (m.latency.asr != null) console.log(`\x1b[35m⏱  latency (speech → caption): orig ${(m.latency.asr / 1000).toFixed(1)}s${tr ? ' · ' + tr : ''}\x1b[0m`);
    }
    if (m.type === 'replaced') console.log('ingest replaced by another source:', m.why);
  });
  ws.on('close', (code, reason) => {
    if (ended && !pending.length) process.exit(0); // the input finished and all of it was sent
    console.log(`connection closed ${code} ${reason}`);
    // 4000: another source took the room on purpose, 4001: bad token, 4004: no such room. Anything else, a server
    // restart (1012) included, reconnects.
    if (code === 4001 || code === 4004 || code === 4000) { ff?.stopAudio(); process.exit(1); }
    console.log(`reconnecting in ${backoff / 1000}s`);
    setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, 10000);
  });
  ws.on('error', (e) => console.error('ws error:', e.message));
}
connect();
