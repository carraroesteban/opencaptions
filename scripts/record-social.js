#!/usr/bin/env node
// The real screens for the social-media video (scripts/compose-social.js puts them together): the server captions the
// 30-second sample talk with the recorded AI session (as in record-demo.js, so captions and translations are real),
// while headless Chrome films a phone reading in Spanish, one reading in English, and the dashboard, and photographs
// the printable QR kit. Writes dist/social/scenes/*.mp4 and *.png.
//
//   node scripts/record-social.js
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import * as tty from '../src/tty.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist', 'social', 'scenes');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CHROME = [process.env.CHROME, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => p && fs.existsSync(p));
if (!CHROME) { tty.fail('Chrome not found: set CHROME=/path/to/chrome'); process.exit(1); }

const TALK_SEC = 30, TAIL_SEC = 4, FPS = 30;
const TITLE = 'Telehealth for rural clinics';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-social-'));
const done = [];
const cleanup = () => { for (const f of done.reverse()) try { f(); } catch { /* best effort */ } };
process.on('exit', cleanup);

// 1. OpenCaptions with the fictional test event and the recorded AI in real time. No admin token: the dashboard is
// open to this computer, as on a fresh install.
const appPort = 24000 + Math.floor(Math.random() * 2000);
const base = `http://localhost:${appPort}`;
const glossary = path.join(tmp, 'glossary.json');
fs.copyFileSync(path.join(ROOT, 'test/fixtures/glossary.json'), glossary);
const app = spawn(process.execPath, [path.join(ROOT, 'src/server.js')], {
  cwd: ROOT, stdio: 'ignore',
  env: { ...process.env, PORT: String(appPort), HOST: '127.0.0.1', ENGINE: 'gemini', GEMINI_API_KEY: 'replay', OC_REPLAY: 'test/fixtures/talk-en.json', OC_REPLAY_SPEED: '1',
    DATA_DIR: tmp, SCHEDULE: path.join(tmp, 'schedule.json'), EVENT_CONFIG: 'test/fixtures/event.json', GLOSSARY: glossary, ADMIN_TOKEN: '', INGEST_TOKEN: 'social', PUBLIC_URL: 'https://live.example.org', TUNNEL: '', FALLBACK: '', FRESH: '' },
});
done.push(() => app.kill());
for (let i = 0; i < 100; i++) { try { if ((await fetch(`${base}/healthz`)).ok) break; } catch { await sleep(100); } }
const json = { 'content-type': 'application/json' };
for (const [method, url, body] of /** @type {[string, string, object][]} */ ([['PUT', '/api/setup', { done: true, name: 'Horizon Summit' }], ['POST', '/api/stages/main/talk', { title: TITLE }]])) {
  const r = await fetch(base + url, { method, headers: json, body: JSON.stringify(body) });
  if (!r.ok) tty.warn(`${method} ${url}: ${r.status} ${await r.text()}`);
}

// 2. Chrome over the DevTools protocol (as in record-demo.js).
const port = 9400 + Math.floor(Math.random() * 400);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-social-chrome-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
done.push(() => { chrome.kill(); setTimeout(() => fs.rmSync(profile, { recursive: true, force: true }), 300); });
let info;
for (let i = 0; i < 100 && !info; i++) { try { info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { await sleep(100); } }
const ws = new WebSocket(info.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
await new Promise((r) => ws.once('open', r));
done.push(() => ws.close());
let seq = 0;
const pending = new Map(), listeners = [];
ws.on('message', (d) => {
  const m = JSON.parse(d.toString());
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
  else if (m.method) for (const l of listeners) l(m);
});
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params, sessionId })); });

/** A tab of the given size in its own window, dark theme, filmed with Page.startScreencast. */
async function camera(name, url, { width, height, scale = 2, mobile = false, theme = 'dark' }) {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', newWindow: true });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p) => send(m, p, sessionId);
  await s('Page.enable');
  await s('Emulation.setFocusEmulationEnabled', { enabled: true });
  await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile });
  await s('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
  await s('Page.navigate', { url });
  const dir = path.join(tmp, name);
  fs.mkdirSync(dir);
  const frames = [];
  let recording = false;
  listeners.push((m) => {
    if (m.sessionId !== sessionId || m.method !== 'Page.screencastFrame') return;
    s('Page.screencastFrameAck', { sessionId: m.params.sessionId }).catch(() => {});
    if (!recording) return;
    const file = path.join(dir, `${String(frames.length).padStart(5, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(m.params.data, 'base64'));
    frames.push({ file, t: m.params.metadata.timestamp });
  });
  return {
    name, s, frames,
    run: (expression) => s('Runtime.evaluate', { expression, awaitPromise: true }),
    still: async (file) => fs.writeFileSync(file, Buffer.from((await s('Page.captureScreenshot', { format: 'png' })).data, 'base64')),
    start: async () => { recording = true; await s('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: width * scale, maxHeight: height * scale, everyNthFrame: 1 }); },
    stop: async () => { recording = false; await s('Page.stopScreencast'); },
  };
}

fs.mkdirSync(OUT, { recursive: true });
const sp = tty.spinner('Opening the pages');
// A still: the printable QR kit.
const kit = await camera('kit', `${base}/kit.html`, { width: 540, height: 960, theme: 'light' });
// Films: two phones in the audience (Spanish and English) and the dashboard.
const phoneEs = await camera('phone-es', `${base}/watch.html?stage=main&lang=es&ui=es`, { width: 390, height: 844, mobile: true });
const phoneEn = await camera('phone-en', `${base}/watch.html?stage=main&lang=en&ui=en`, { width: 390, height: 844, mobile: true });
const dash = await camera('dashboard', `${base}/admin.html?dashboard#live`, { width: 900, height: 1500, scale: 1.2 });
await sleep(6500);
await kit.still(path.join(OUT, 'kit.png'));
// The dashboard without the "Getting started" checklist, so the room cards show.
await dash.run(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Hide')?.click()`);
await sleep(500);
await dash.still(path.join(OUT, 'dashboard-start.png'));
if (process.env.PROBE) process.exit(0);
sp.succeed('Pages ready');

// 3. The talk into the main room in real time, while the phones and the dashboard are filmed.
const cams = [phoneEs, phoneEn, dash];
const t0 = Date.now() / 1000;
for (const c of cams) await c.start();
const rec = tty.spinner(`Recording ${TALK_SEC + TAIL_SEC} s`);
const ingest = new WebSocket(`ws://127.0.0.1:${appPort}/ws/ingest?stage=main&kind=cli&label=social`, { headers: { authorization: 'Bearer social' } });
await new Promise((r) => ingest.once('open', r));
const pcm = fs.readFileSync(path.join(ROOT, 'samples/talk-en.wav')).subarray(44, 44 + TALK_SEC * 32000);
const startAt = Date.now();
const audioAt = startAt / 1000 - t0;
for (let o = 0, n = 0; o < pcm.length; o += 3200, n++) {
  ingest.send(pcm.subarray(o, o + 3200));
  const wait = startAt + (n + 1) * 100 - Date.now();
  if (wait > 0) await sleep(wait);
}
await sleep(TAIL_SEC * 1000);
await dash.still(path.join(OUT, 'dashboard-end.png'));
for (const c of cams) await c.stop();
ingest.close();
rec.succeed(`Recorded ${cams.map((c) => `${c.name} ${c.frames.length}`).join(', ')} frames`);

// 4. Constant frame rate (each screencast frame lasts until the next), starting where the speaker starts.
const end = Date.now() / 1000;
for (const c of cams) {
  if (!c.frames.length) throw new Error(`no frames from ${c.name}`);
  const lines = [];
  c.frames.forEach((f, i) => lines.push(`file '${f.file}'`, `duration ${Math.max(0.001, (c.frames[i + 1]?.t ?? end) - (i ? f.t : t0)).toFixed(4)}`));
  lines.push(`file '${c.frames.at(-1).file}'`);
  const list = path.join(tmp, `${c.name}.txt`);
  fs.writeFileSync(list, lines.join('\n'));
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list,
    '-vf', `fps=${FPS},trim=start=${audioAt.toFixed(3)},setpts=PTS-STARTPTS,format=yuv420p`, '-t', String(TALK_SEC + TAIL_SEC),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', path.join(OUT, `${c.name}.mp4`)]);
}
console.log(`\n${tty.sym.ok} ${path.relative(ROOT, OUT)}: ${fs.readdirSync(OUT).join(', ')}\n`);
cleanup();
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(0);
