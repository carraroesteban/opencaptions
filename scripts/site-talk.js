#!/usr/bin/env node
// The website's live demo: what phones received while OpenCaptions captioned the sample talk, with the talk's audio.
//   node scripts/site-talk.js     → site/media/talk.json + site/media/talk.m4a  (needs ffmpeg)
// Runs the real server on the recorded AI answers of the whole talk (deploy/hosted/demo/talk-en.json, recorded from
// Gemini; no key, no cost), lets it caption samples/talk-en.wav in real time as the demo room does, and writes down
// every caption message a phone gets in the original and each language, with when it arrived. The website plays them
// back against the audio, so what visitors see is what the app actually produced.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'site', 'media');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-site-talk-'));
const port = 25000 + Math.floor(Math.random() * 2000);
const event = path.join(tmp, 'event.json');
fs.writeFileSync(event, JSON.stringify({
  eventName: 'OpenCaptions demo', publicTranscripts: 'all', timezone: 'UTC', languages: { es: 'Español', en: 'English' }, defaultTargets: ['es', 'en'],
  stages: [{ id: 'main', name: 'Main Stage', source: 'auto', targets: ['es', 'en'], title: 'Telehealth for rural clinics' }],
}));
// The event's glossary, as an organizer would keep one: the recording spells one Spanish word wrong.
const glossary = path.join(tmp, 'glossary.json');
fs.writeFileSync(glossary, JSON.stringify({ vocabulary: ['Horizon Summit', 'telehealth'], replacements: [{ from: 'Comenzemos', to: 'Comencemos', lang: 'es' }] }));
const app = spawn(process.execPath, [path.join(ROOT, 'src/server.js')], {
  cwd: ROOT, stdio: 'ignore',
  env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', ENGINE: 'gemini', GEMINI_API_KEY: 'replay', OC_REPLAY: 'deploy/hosted/demo/talk-en.json', OC_REPLAY_SPEED: '1',
    DATA_DIR: tmp, SCHEDULE: path.join(tmp, 'schedule.json'), EVENT_CONFIG: event, GLOSSARY: glossary, ADMIN_TOKEN: 't', INGEST_TOKEN: 't', TUNNEL: '', FALLBACK: '', UPDATE_CHECK: '0' },
});
process.on('exit', () => { app.kill(); fs.rmSync(tmp, { recursive: true, force: true }); });
for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) break; } catch { await sleep(100); } }

// A phone reading all three channels.
const view = new WebSocket(`ws://127.0.0.1:${port}/ws/view?stage=main&langs=orig,en,es`);
const caps = [];
let t0 = 0;
view.on('message', (d) => {
  const m = JSON.parse(d.toString());
  if (m.type === 'caption' && t0) caps.push([Date.now() - t0, m.channel, m.id, m.text, m.final ? 1 : 0, m.lang || '']);
});
await new Promise((r) => view.once('open', r));

// The talk, as the room's computer sends it: 100 ms of 16 kHz mono PCM at a time, in real time, then 6 s of silence.
const ingest = new WebSocket(`ws://127.0.0.1:${port}/ws/ingest?stage=main&kind=cli&label=site-talk`, { headers: { authorization: 'Bearer t' } });
await new Promise((r) => ingest.once('open', r));
const pcm = fs.readFileSync(path.join(ROOT, 'samples/talk-en.wav')).subarray(44);
const silence = Buffer.alloc(6 * 32000);
t0 = Date.now();
const all = Buffer.concat([pcm, silence]);
for (let o = 0; o + 3200 <= all.length; o += 3200) {
  ingest.send(all.subarray(o, o + 3200));
  await sleep(Math.max(0, t0 + (o / 3200 + 1) * 100 - Date.now()));
}
await sleep(2000);
ingest.close(); view.close();

// The recording starts over when the audio does (the demo room loops): keep the talk once, up to its last thank-you.
const end = pcm.length / 32 + 3000;
const cut = caps.findIndex((c) => c[0] > end);
if (cut >= 0) caps.length = cut;
const finals = (ch) => caps.filter((c) => c[1] === ch && c[4]).length;
if (finals('orig') < 5 || finals('es') < 5) { console.error(`too few captions (orig ${finals('orig')}, es ${finals('es')}): not written`); process.exit(1); }
fs.writeFileSync(path.join(OUT, 'talk.json'), JSON.stringify({
  note: 'What phones received while OpenCaptions captioned samples/talk-en.wav (Gemini, recorded; an event glossary fixes one misspelled Spanish word): [ms from the start of the audio, channel, segment id, text, final, language]. Made by scripts/site-talk.js.',
  title: 'Telehealth for rural clinics', speaker: 'Hiroshi Tanaka', duration: Math.round(pcm.length / 32), caps,
}));
// The audio for visitors: AAC at 48 kb/s mono, ~350 KB.
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', path.join(ROOT, 'samples/talk-en.wav'), '-ac', '1', '-c:a', 'aac', '-b:a', '48k', '-movflags', '+faststart', path.join(OUT, 'talk.m4a')]);
console.log(`site/media/talk.json: ${caps.length} messages (finals: orig ${finals('orig')}, en ${finals('en')}, es ${finals('es')}); site/media/talk.m4a`);
process.exit(0);
