#!/usr/bin/env node
// Feed any audio/video file, URL or YouTube link into a stage, in real time.
//   node scripts/feed.js --stage main --input samples/talk-en.mp3
//   node scripts/feed.js --stage sala-a --youtube https://www.youtube.com/watch?v=XXXX --start 120
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


function connect() {
  const url = `${server}/ws/ingest?stage=${encodeURIComponent(stage)}&kind=cli&label=${encodeURIComponent(args.label || String(args.youtube || input).slice(0, 60))}`;
  const ws = new WebSocket(url, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  let ff;
  ws.on('open', () => {
    console.log(`→ streaming to ${stage} @ ${server}`);
    ff = openAudio(input, { realtime: true, loop: !!args.loop, start: Number(args.start || 0) });
    ff.on('data', (b) => ws.readyState === 1 && ws.send(b, { binary: true }));
    ff.on('log', (m) => console.error('ffmpeg:', m));
    ff.on('error', (e) => { console.error('✗', e.message); process.exit(1); });
    ff.on('end', () => { console.log('input finished'); ws.close(); process.exit(0); });
  });
  let lastPrint = '';
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString());
    if (m.type === 'status' && !args.quiet) {
      const line = Object.entries(m.preview || {}).map(([k, v]) => `[${k}] ${v.slice(-70)}`).join('  ');
      if (line && line !== lastPrint) { console.log(line); lastPrint = line; }
    }
    if (m.type === 'status' && m.latency && Date.now() - (connect.lastLat || 0) > 5000) {
      connect.lastLat = Date.now();
      const tr = Object.entries(m.latency.tr || {}).map(([k, v]) => `${k} ${(v / 1000).toFixed(1)}s`).join(' · ');
      if (m.latency.asr != null) console.log(`\x1b[35m⏱  latency (speech → caption): orig ${(m.latency.asr / 1000).toFixed(1)}s${tr ? ' · ' + tr : ''}\x1b[0m`);
    }
    if (m.type === 'replaced') console.log('ingest replaced by another source:', m.why);
  });
  ws.on('close', (code, reason) => {
    ff?.stopAudio();
    console.log(`connection closed ${code} ${reason}`);
    if (code === 4001 || code === 4004 || code === 4000) process.exit(1);
    setTimeout(connect, 2000);
  });
  ws.on('error', (e) => console.error('ws error:', e.message));
}
connect();
