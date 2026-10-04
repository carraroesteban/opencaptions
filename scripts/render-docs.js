#!/usr/bin/env node
// Render the documentation diagrams (docs/diagrams/*.html) to PNG, in light and dark, with headless Chrome:
//   npm run docs:images                 → docs/images/diagrams/<name>-light.png and <name>-dark.png
//   npm run docs:images -- latency      only the diagrams whose name contains "latency"
// Needs Google Chrome or Chromium (set CHROME=/path/to/chrome if it isn't found) and internet for the fonts.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'docs', 'diagrams');
const OUT = path.join(ROOT, 'docs', 'images', 'diagrams');
const only = process.argv[2] || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CHROME = [process.env.CHROME, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find((p) => p && fs.existsSync(p));
if (!CHROME) { console.error('✗ Chrome not found: set CHROME=/path/to/chrome'); process.exit(1); }

// Serve the repository so diagrams can load /public/tokens.css, the brand marks and the fonts.
const server = express().use(express.static(ROOT)).listen(0);
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;

// Minimal DevTools-protocol driver.
const port = 9400 + Math.floor(Math.random() * 400);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-docs-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars', '--force-color-profile=srgb', 'about:blank'], { stdio: 'ignore' });
let info;
for (let i = 0; i < 100 && !info; i++) { try { info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { await sleep(100); } }
const ws = new WebSocket(info.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
await new Promise((r) => ws.once('open', r));
let seq = 0;
const pending = new Map();
ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } });
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params, sessionId })); });

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const s = (m, p) => send(m, p, sessionId);
await s('Page.enable');
await s('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1200, deviceScaleFactor: 2, mobile: false });
await s('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
const evaluate = async (expression) => (await s('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;

fs.mkdirSync(OUT, { recursive: true });
const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.html') && f.includes(only));
for (const f of files) {
  const name = f.replace(/\.html$/, '');
  for (const theme of ['light', 'dark']) {
    await s('Page.navigate', { url: `${base}/docs/diagrams/${f}?theme=${theme}` });
    for (let i = 0; i < 100 && !(await evaluate('window.__done === true')); i++) await sleep(100);
    await sleep(150);
    const r = await evaluate("(() => { const b = document.querySelector('.d').getBoundingClientRect(); return { x: b.x, y: b.y, width: Math.ceil(b.width), height: Math.ceil(b.height) }; })()");
    const { data } = await s('Page.captureScreenshot', { format: 'png', clip: { ...r, scale: 1 }, captureBeyondViewport: true });
    fs.writeFileSync(path.join(OUT, `${name}-${theme}.png`), Buffer.from(data, 'base64'));
  }
  console.log(`✓ ${name}`);
}
ws.close();
chrome.kill();
await new Promise((r) => chrome.once('exit', r));
server.close();
fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
