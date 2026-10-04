#!/usr/bin/env node
// Record a fixture for the end-to-end test (test/e2e.test.js): runs the real server against Gemini, streams a
// sample talk into room `main` in real time, asks for a summary and a question, and saves every AI response.
// Needs GEMINI_API_KEY in .env. Costs a couple of cents.
//
//   node scripts/record-e2e.js                                   # samples/talk-en.wav → test/fixtures/talk-en.json
//   node scripts/record-e2e.js --input samples/talk-es.wav --out test/fixtures/talk-es.json --seconds 30
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import dotenv from 'dotenv';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env'), quiet: true });
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const input = opt('input', 'samples/talk-en.wav');
const out = path.resolve(ROOT, opt('out', `test/fixtures/${path.basename(input, path.extname(input))}.json`));
const seconds = Number(opt('seconds', 30));
if (!process.env.GEMINI_API_KEY && !/^(1|true)$/i.test(process.env.GOOGLE_GENAI_USE_VERTEXAI || '')) {
  console.error('✗ GEMINI_API_KEY is not set (.env)');
  process.exit(1);
}

const PORT = 19000 + Math.floor(Math.random() * 900);
const base = `http://127.0.0.1:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-record-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = spawn(process.execPath, ['src/server.js'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), ENGINE: 'gemini', OC_RECORD: out, DATA_DIR: dataDir, PUBLIC_URL: '', AUTH: 'auto' },
  stdio: ['ignore', 'ignore', 'inherit'],
});
const stop = async () => { srv.kill('SIGTERM'); await new Promise((r) => srv.once('exit', r)); fs.rmSync(dataDir, { recursive: true, force: true }); };
process.on('SIGINT', () => stop().then(() => process.exit(1)));

for (let i = 0; ; i++) {
  try { if ((await fetch(`${base}/healthz`)).ok) break; } catch { /* starting */ }
  if (i > 100) { console.error('✗ server did not start'); await stop(); process.exit(1); }
  await sleep(100);
}

// Print what the audience sees while recording.
const view = new WebSocket(`ws://127.0.0.1:${PORT}/ws/view?stage=main&langs=orig,es,en`);
view.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.type === 'caption' && m.final) console.log(`[${m.channel}] ${m.text}`); });

// Stream the sample in real time (100 ms chunks of 16 kHz mono PCM).
const pcm = fs.readFileSync(path.resolve(ROOT, input)).subarray(44, 44 + seconds * 32000);
const ingest = new WebSocket(`ws://127.0.0.1:${PORT}/ws/ingest?stage=main&kind=cli&label=record`);
await new Promise((r, j) => { ingest.once('open', r); ingest.once('error', j); });
console.log(`recording ${seconds} s of ${input} → ${path.relative(ROOT, out)}`);
for (let o = 0; o < pcm.length; o += 3200) {
  ingest.send(pcm.subarray(o, o + 3200));
  await sleep(100);
}
ingest.close();
await sleep(8000); // trailing captions and translations

const talks = /** @type {any} */ (await (await fetch(`${base}/api/stages/main/talks`)).json());
const summary = /** @type {any} */ (await (await fetch(`${base}/api/stages/main/summary?lang=es&scope=full&talk=${talks[0]?.id || ''}`)).json());
console.log('summary:', summary.headline, summary.ai ? '(AI)' : '(extractive)');
const ask = /** @type {any} */ (await (await fetch(`${base}/api/stages/main/ask`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lang: 'en', question: 'What did each clinic get?' }) })).json());
console.log('ask:', ask.answer);
view.close();
await sleep(5500); // the recorder saves every 5 s and on exit
await stop();
const rec = JSON.parse(fs.readFileSync(out, 'utf8'));
console.log(`✓ ${rec.sessions.length} Live session(s), ${rec.sessions.reduce((a, s) => a + s.messages.length, 0)} messages, ${rec.generate.length} text-model responses`);
