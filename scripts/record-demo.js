#!/usr/bin/env node
// The product demo video for the website and README: the real server captions a 30-second sample talk while headless
// Chrome films the stage screen and a phone, and ffmpeg puts both side by side on the website's dark band, silent and
// ready to loop like a GIF. No API key: the AI is the recorded
// session the end-to-end test uses (test/fixtures/talk-en.json, see src/replay.js), played back in real time, so the
// captions, translations and timing are the real ones.
//
//   npm run demo:record                  # → site/media/demo.mp4 and demo-poster.jpg
//   CHROME=/path/to/chrome npm run demo:record
//
// Needs Chrome and ffmpeg. Run it again whenever the screens change.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import * as tty from '../src/tty.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'site', 'media');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CHROME = [process.env.CHROME, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => p && fs.existsSync(p));
if (!CHROME) { tty.fail('Chrome not found: set CHROME=/path/to/chrome'); process.exit(1); }
try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); } catch { tty.fail('ffmpeg not found (macOS: brew install ffmpeg)'); process.exit(1); }

const TALK_SEC = 30;   // what the fixture was recorded with
const TAIL_SEC = 4;    // let the last translation land
const FPS = 30;
const BG = '#111014'; // the band it sits on (--ink), so the devices float on the page
// The composition: 1920×1080, the stage screen on the left and a phone on the right.
const W = 1920, H = 1080;
const SCREEN = { x: 112, y: 208, w: 1200, h: 675 };            // 16:9
const PHONE = { x: 1424, y: 100, w: 384, h: 832, bezel: 14 };   // screen area; the bezel goes around it

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-demo-'));
const done = [];
const cleanup = () => { for (const f of done.reverse()) try { f(); } catch { /* best effort */ } };
process.on('exit', cleanup);

// 1. OpenCaptions with the fictional test event, and the recorded AI in real time.
const appPort = 24000 + Math.floor(Math.random() * 2000);
const base = `http://localhost:${appPort}`;
const glossary = path.join(tmp, 'glossary.json');
fs.copyFileSync(path.join(ROOT, 'test/fixtures/glossary.json'), glossary);
const app = spawn(process.execPath, [path.join(ROOT, 'src/server.js')], {
  cwd: ROOT, stdio: 'ignore',
  env: { ...process.env, PORT: String(appPort), HOST: '127.0.0.1', ENGINE: 'gemini', GEMINI_API_KEY: 'replay', OC_REPLAY: 'test/fixtures/talk-en.json', OC_REPLAY_SPEED: '1',
    DATA_DIR: tmp, SCHEDULE: path.join(tmp, 'schedule.json'), EVENT_CONFIG: 'test/fixtures/event.json', GLOSSARY: glossary, ADMIN_TOKEN: 'demo', INGEST_TOKEN: 'demo', PUBLIC_URL: 'https://live.example.org', TUNNEL: '', FALLBACK: '' },
});
done.push(() => app.kill());
for (let i = 0; i < 100; i++) { try { if ((await fetch(`${base}/healthz`)).ok) break; } catch { await sleep(100); } }

// 2. Chrome, driven over the DevTools protocol (as in a11y.js).
const port = 9400 + Math.floor(Math.random() * 400);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-demo-chrome-'));
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

/** A tab of the given size, filmed with Page.startScreencast into dir/<n>.jpg + timings. */
async function camera(name, url, { width, height, scale = 1, mobile = false }) {
  // Its own window, behaving as if focused: Chrome stops painting tabs that are in the background.
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', newWindow: true });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p) => send(m, p, sessionId);
  await s('Page.enable');
  await s('Emulation.setFocusEmulationEnabled', { enabled: true });
  await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile });
  await s('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
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
    s, frames,
    start: async () => { recording = true; await s('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: width * scale, maxHeight: height * scale, everyNthFrame: 1 }); },
    stop: async () => { recording = false; await s('Page.stopScreencast'); },
  };
}

const sp = tty.spinner('Opening the stage screen and a phone');
// The stage screen: Spanish translation big, the English original under it (how a bilingual event runs it).
const screen = await camera('screen', `${base}/screen.html?stage=main&langs=es,orig&clock=0&ui=es`, { width: 1280, height: 720 });
// A phone in the audience, reading in Spanish.
const phone = await camera('phone', `${base}/watch.html?stage=main&lang=es&ui=es`, { width: PHONE.w, height: PHONE.h, scale: 2, mobile: true });
await sleep(6500); // pages load, and the stage screen's "F for full screen" hint fades out
sp.succeed('Stage screen and phone ready');

// 3. The talk: the sample audio into the main room, in real time, like a room computer would send it.
const t0 = Date.now() / 1000;
await screen.start(); await phone.start();
const rec = tty.spinner(`Recording ${TALK_SEC + TAIL_SEC} s of live captions`);
const ingest = new WebSocket(`ws://127.0.0.1:${appPort}/ws/ingest?stage=main&kind=cli&label=demo`, { headers: { authorization: 'Bearer demo' } });
await new Promise((r) => ingest.once('open', r));
const pcm = fs.readFileSync(path.join(ROOT, 'samples/talk-en.wav')).subarray(44, 44 + TALK_SEC * 32000);
const startAt = Date.now();
const audioAt = startAt / 1000 - t0; // where the talk starts in the recording
for (let o = 0, n = 0; o < pcm.length; o += 3200, n++) {
  ingest.send(pcm.subarray(o, o + 3200));
  const wait = startAt + (n + 1) * 100 - Date.now(); // 100 ms of audio every 100 ms, without drift
  if (wait > 0) await sleep(wait);
}
await sleep(TAIL_SEC * 1000);
await screen.stop(); await phone.stop();
ingest.close();
rec.succeed(`Recorded ${screen.frames.length} + ${phone.frames.length} frames`);

// 4. Constant frame rate from the screencast's change-driven frames (each frame lasts until the next one).
const end = Date.now() / 1000;
function track(cam, name) {
  const list = cam.frames.length ? cam.frames : [];
  if (!list.length) throw new Error(`no frames from the ${name}`);
  const lines = [];
  // Hold the first frame from the start of the recording.
  for (let i = 0; i < list.length; i++) {
    const from = i ? list[i].t : t0, to = list[i + 1]?.t ?? end;
    lines.push(`file '${list[i].file}'`, `duration ${Math.max(0.001, to - from).toFixed(4)}`);
  }
  lines.push(`file '${list.at(-1).file}'`);
  const f = path.join(tmp, `${name}.txt`);
  fs.writeFileSync(f, lines.join('\n'));
  return f;
}
const screenList = track(screen, 'screen'), phoneList = track(phone, 'phone');

// The frame around the two screens: rendered by Chrome as a transparent PNG with two windows cut out.
const frameHtml = `<!doctype html><html><head><style>
  html, body { margin: 0; background: transparent; }
  .page { position: relative; width: ${W}px; height: ${H}px; }
  svg { position: absolute; inset: 0; }
</style></head><body><div class="page">
  <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs><mask id="m"><rect width="${W}" height="${H}" fill="#fff"/>
      <rect x="${SCREEN.x}" y="${SCREEN.y}" width="${SCREEN.w}" height="${SCREEN.h}" rx="18" fill="#000"/>
      <rect x="${PHONE.x}" y="${PHONE.y}" width="${PHONE.w}" height="${PHONE.h}" rx="40" fill="#000"/></mask>
      <filter id="sh" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#1A1820" flood-opacity=".16"/></filter></defs>
    <rect width="${W}" height="${H}" fill="${BG}" mask="url(#m)"/>
    <!-- a monitor and a phone in graphite, so the ink-black stage screen stands out from the ink page -->
    <rect x="${SCREEN.x - 12}" y="${SCREEN.y - 12}" width="${SCREEN.w + 24}" height="${SCREEN.h + 24}" rx="28" fill="#26252C" stroke="#3A3940" stroke-width="2" mask="url(#m)"/>
    <rect x="${PHONE.x - PHONE.bezel}" y="${PHONE.y - PHONE.bezel}" width="${PHONE.w + 2 * PHONE.bezel}" height="${PHONE.h + 2 * PHONE.bezel}" rx="${40 + PHONE.bezel}" fill="#26252C" stroke="#3A3940" stroke-width="2" mask="url(#m)"/>
  </svg>
</div></body></html>`;
const { targetId: ft } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId: fs_ } = await send('Target.attachToTarget', { targetId: ft, flatten: true });
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false }, fs_);
await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } }, fs_);
const frameFile = path.join(tmp, 'frame.html');
fs.writeFileSync(frameFile, frameHtml);
await send('Page.enable', {}, fs_);
await send('Page.navigate', { url: `file://${frameFile}` }, fs_);
await sleep(600);
const framePng = path.join(tmp, 'frame.png');
fs.writeFileSync(framePng, Buffer.from((await send('Page.captureScreenshot', { format: 'png' }, fs_)).data, 'base64'));

// 5. Compose and encode: the screens under the frame, on paper.
const comp = tty.spinner('Composing and encoding');
fs.mkdirSync(OUT, { recursive: true });
const mp4 = path.join(OUT, 'demo.mp4'), poster = path.join(OUT, 'demo-poster.jpg');
const filter = [
  `color=c=${BG}:s=${W}x${H}:r=${FPS}[bg]`,
  `[0:v]fps=${FPS},scale=${SCREEN.w}:${SCREEN.h}:flags=lanczos,setsar=1[sc]`,
  `[1:v]fps=${FPS},scale=${PHONE.w}:${PHONE.h}:flags=lanczos,setsar=1[ph]`,
  `[bg][sc]overlay=${SCREEN.x}:${SCREEN.y}:shortest=1[a]`,
  `[a][ph]overlay=${PHONE.x}:${PHONE.y}:shortest=1[b]`,
  // Start where the speaker starts. Silent: on the website it plays like a GIF.
  `[b][2:v]overlay=0:0,trim=start=${audioAt.toFixed(3)},setpts=PTS-STARTPTS,format=yuv420p[out]`,
].join(';');
const inputs = ['-f', 'concat', '-safe', '0', '-i', screenList, '-f', 'concat', '-safe', '0', '-i', phoneList, '-loop', '1', '-i', framePng];
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...inputs, '-filter_complex', filter, '-map', '[out]', '-an', '-t', String(TALK_SEC + TAIL_SEC),
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '22', '-movflags', '+faststart', mp4]);
// Poster: a moment with captions on both screens.
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', '12', '-i', mp4, '-frames:v', '1', '-q:v', '3', poster]);
comp.succeed('Composed');

const kb = (f) => `${Math.round(fs.statSync(f).size / 1024)} KB`;
console.log(`\n${tty.sym.ok} ${path.relative(ROOT, mp4)} ${tty.c.gray(kb(mp4))}\n${tty.sym.ok} ${path.relative(ROOT, poster)} ${tty.c.gray(kb(poster))}\n`);
cleanup();
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(0);
