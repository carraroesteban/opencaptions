#!/usr/bin/env node
// Screenshots of the real app for the README and the website: npm run screenshots [-- transcript]
// Runs OpenCaptions with the fictional test event and the recorded AI (like demo:record), plays the sample talk into
// the main room, then photographs each page in headless Chrome at 2× (sharp on high-density screens), inside the
// dark window frame the website uses. Writes docs/images/<name>.png and site/media/screens/<name>.webp.
// Needs Chrome and cwebp (macOS: brew install webp).
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import * as tty from '../src/tty.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CHROME = [process.env.CHROME, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => p && fs.existsSync(p));
if (!CHROME) { tty.fail('Chrome not found: set CHROME=/path/to/chrome'); process.exit(1); }
try { execFileSync('cwebp', ['-version'], { stdio: 'ignore' }); } catch { tty.fail('cwebp not found (macOS: brew install webp)'); process.exit(1); }

const TITLE = 'Telehealth for rural clinics'; // what the recorded talk (test/fixtures/talk-en.json) is about
/** Each shot: the page, its size in CSS pixels (photographed at 2×), and what to do before the picture. */
const SHOTS = {
  transcript: { url: '/talk.html?stage=main&lang=es', width: 1080, height: 675, theme: 'light',
    prep: `document.getElementById('q').value = 'clínicas'; document.getElementById('q').dispatchEvent(new Event('input'));` },
};
const wanted = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const shots = Object.entries(SHOTS).filter(([n]) => !wanted.length || wanted.includes(n));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-shots-'));
const done = [];
process.on('exit', () => { for (const f of done.reverse()) try { f(); } catch { /* best effort */ } });

// 1. OpenCaptions with the fictional test event and the recorded AI, in real time.
const appPort = 24000 + Math.floor(Math.random() * 2000);
const base = `http://localhost:${appPort}`;
const glossary = path.join(tmp, 'glossary.json');
fs.copyFileSync(path.join(ROOT, 'test/fixtures/glossary.json'), glossary);
const app = spawn(process.execPath, [path.join(ROOT, 'src/server.js')], {
  cwd: ROOT, stdio: 'ignore',
  env: { ...process.env, PORT: String(appPort), HOST: '127.0.0.1', ENGINE: 'gemini', GEMINI_API_KEY: 'replay', OC_REPLAY: 'test/fixtures/talk-en.json', OC_REPLAY_SPEED: '1',
    DATA_DIR: tmp, SCHEDULE: path.join(tmp, 'schedule.json'), EVENT_CONFIG: 'test/fixtures/event.json', GLOSSARY: glossary, ADMIN_TOKEN: 'shots', INGEST_TOKEN: 'shots', PUBLIC_URL: 'https://live.example.org', TUNNEL: '', FALLBACK: '' },
});
done.push(() => app.kill());
for (let i = 0; i < 100; i++) { try { if ((await fetch(`${base}/healthz`)).ok) break; } catch { await sleep(100); } }
const auth = { 'content-type': 'application/json', authorization: 'Bearer shots' };
await fetch(`${base}/api/setup`, { method: 'PUT', headers: auth, body: JSON.stringify({ done: true }) });
await fetch(`${base}/api/stages/main/talk`, { method: 'POST', headers: auth, body: JSON.stringify({ title: TITLE }) });

// 2. The sample talk into the main room, as a room computer would send it.
tty.info('playing the sample talk (30 s)…');
const ingest = new WebSocket(`ws://127.0.0.1:${appPort}/ws/ingest?stage=main&kind=cli&label=screenshots`, { headers: { authorization: 'Bearer shots' } });
await new Promise((r) => ingest.once('open', r));
const pcm = fs.readFileSync(path.join(ROOT, 'samples/talk-en.wav')).subarray(44, 44 + 30 * 32000);
for (let o = 0; o < pcm.length; o += 3200) { ingest.send(pcm.subarray(o, o + 3200)); await sleep(100); }
await sleep(5000); // the last translations
ingest.close();

// 3. Chrome over the DevTools protocol (as in a11y.js).
const port = 9400 + Math.floor(Math.random() * 400);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-shots-chrome-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
done.push(() => { chrome.kill(); setTimeout(() => fs.rmSync(profile, { recursive: true, force: true }), 300); });
let info;
for (let i = 0; i < 100 && !info; i++) { try { info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { await sleep(100); } }
const ws = new WebSocket(info.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
await new Promise((r) => ws.once('open', r));
done.push(() => ws.close());
let seq = 0;
const pending = new Map();
ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } });
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params, sessionId })); });

// The website's window frame: the page with rounded top corners on the ink background, cut at the bottom.
// Drawing it needs a <style> the page's Content-Security-Policy would refuse, so CSP is bypassed for the photo only.
const FRAME = `html { background: #111014 !important; padding: 40px 44px 0 !important; }
  body { border-radius: 22px 22px 0 0; overflow: hidden; min-height: calc(100vh - 40px); box-shadow: 0 0 0 1px rgba(255,255,255,.08); }
  #follow, #tolive { display: none !important; } /* "Follow live" floats over the text */`;

for (const [name, s] of shots) {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', newWindow: true });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const c = (m, p) => send(m, p, sessionId);
  await c('Page.enable');
  await c('Page.setBypassCSP', { enabled: true });
  await c('Emulation.setDeviceMetricsOverride', { width: s.width, height: s.height, deviceScaleFactor: 2, mobile: false });
  await c('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: s.theme }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
  await c('Page.navigate', { url: base + s.url });
  await sleep(3500);
  await c('Runtime.evaluate', { expression: `${s.prep}; const st = document.createElement('style'); st.textContent = ${JSON.stringify(FRAME)}; document.head.append(st);` });
  await sleep(1200);
  await c('Runtime.evaluate', { expression: 'window.scrollTo(0, 0)' }); // a search scrolls to its first match
  await sleep(300);
  const { data } = await c('Page.captureScreenshot', { format: 'png' });
  const png = path.join(ROOT, 'docs/images', `${name}.png`);
  fs.writeFileSync(png, Buffer.from(data, 'base64'));
  execFileSync('cwebp', ['-quiet', '-q', '82', png, '-o', path.join(ROOT, 'site/media/screens', `${name}.webp`)]);
  await send('Target.closeTarget', { targetId });
  tty.ok(`${name}: docs/images/${name}.png, site/media/screens/${name}.webp (${s.width * 2}×${s.height * 2})`);
}
process.exit(0);
