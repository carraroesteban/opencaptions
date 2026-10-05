#!/usr/bin/env node
// Accessibility check (npm run a11y): starts OpenCaptions with a fictional event and builds the website, opens every
// page of both (the website's from its sitemap) in headless Chrome, in light and dark and in Spanish and English, and runs axe-core against WCAG 2.2 AA (contrast, labels,
// names, landmarks, ARIA, keyboard focus…). Lists what it finds and exits with 1 if anything fails.
//
//   npm run a11y                 every page
//   npm run a11y -- admin        only pages whose address contains "admin"
//   npm run a11y -- site:        only the website
//
// Automated checks find roughly a third to a half of real problems; the rest needs people, ideally screen-reader
// and keyboard users. See docs/accessibility.md.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import * as tty from '../src/tty.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const only = process.argv[2] || '';
const AXE = fs.readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const CHROME = [process.env.CHROME, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find((p) => p && fs.existsSync(p));
if (!CHROME) { tty.fail('Chrome not found: set CHROME=/path/to/chrome'); process.exit(1); }

const PAGES = [
  '/', '/watch.html?stage=main', '/talk.html?stage=main', '/talks.html', '/screen.html?stage=main', '/overlay.html?stage=main&bg=ink',
  '/admin.html?dashboard', '/admin.html?dashboard#rooms', '/admin.html?dashboard#agenda', '/admin.html?dashboard#integrations', '/admin.html?dashboard#settings', '/welcome.html', '/welcome.html#rooms', '/me.html',
  '/ingest.html', '/demo.html', '/kit.html', '/style.html', '/report.html',
].filter((p) => p.includes(only));

// OpenCaptions itself, with the test event (four rooms) and nothing of yours.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-a11y-'));
const appPort = 21000 + Math.floor(Math.random() * 3000);
const app = spawn(process.execPath, [path.join(ROOT, 'src/server.js')], {
  cwd: ROOT, stdio: 'ignore',
  env: { ...process.env, PORT: String(appPort), HOST: '127.0.0.1', ENGINE: 'mock', GEMINI_API_KEY: '', DATA_DIR: tmp, SCHEDULE: path.join(tmp, 's.json'), EVENT_CONFIG: 'test/fixtures/event.json', GLOSSARY: 'test/fixtures/glossary.json', TUNNEL: '' },
});
const base = `http://localhost:${appPort}`;
for (let i = 0; i < 100; i++) { try { if ((await fetch(`${base}/healthz`)).ok) break; } catch { await sleep(100); } }

// The website (opencaptions.kvza.ar), built and served from _site, every page in its sitemap.
const { execFileSync } = await import('node:child_process');
execFileSync(process.execPath, [path.join(ROOT, 'scripts/site.js')], { cwd: ROOT, stdio: 'ignore' });
const { default: express } = await import('express');
const sitePort = appPort + 1;
const siteServer = express().use(express.static(path.join(ROOT, '_site'), { extensions: ['html'] })).listen(sitePort, '127.0.0.1');
const siteBase = `http://localhost:${sitePort}`;
const SITE = [...fs.readFileSync(path.join(ROOT, '_site/sitemap.xml'), 'utf8').matchAll(/<loc>https:\/\/[^/]+(\/[^<]*)<\/loc>/g)].map((m) => `site:${m[1]}`)
  .filter((p) => p.includes(only));

// Minimal DevTools-protocol driver (as in render-docs.js).
const port = 9800 + Math.floor(Math.random() * 400);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-a11y-chrome-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
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
await s('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
const evaluate = async (expression) => (await s('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;

console.log(`\n${tty.title('accessibility check')} ${tty.c.gray('· axe-core, WCAG 2.2 AA')}\n`);
const found = new Map(); // rule → { impact, help, url, where: Set }
for (const [theme, lang] of [['light', 'es'], ['dark', 'en']]) {
  await s('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
  for (const page of [...PAGES, ...SITE]) {
    const sp = tty.spinner(`${page} ${tty.c.gray(`${theme} · ${lang}`)}`);
    if (page.startsWith('site:')) {
      // The website picks its theme from the visitor's choice (light by default), and its language from the address.
      await s('Page.navigate', { url: siteBase + page.slice(5) });
      await sleep(1200);
      await evaluate(`document.documentElement.dataset.theme = '${theme}'; document.querySelectorAll('.reveal').forEach((e) => e.classList.add('in')); new Promise((r) => setTimeout(r, 400))`);
    } else {
      await s('Page.navigate', { url: `${base}${page}${page.includes('?') ? '&' : '?'}ui=${lang}` });
      await sleep(1800); // pages render after their data arrives
    }
    await evaluate(AXE);
    const res = await evaluate(`axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }, resultTypes: ['violations'] })
      .then((r) => r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, url: v.helpUrl, nodes: v.nodes.slice(0, 4).map((n) => n.target.join(' ') + (n.failureSummary ? ' — ' + n.failureSummary.split('\\n').slice(1, 2).join('').trim() : '')) })))`);
    for (const v of res) {
      const e = found.get(v.id) || { impact: v.impact, help: v.help, url: v.url, where: new Set() };
      for (const n of v.nodes) e.where.add(`${page} (${theme}): ${n}`);
      found.set(v.id, e);
    }
    if (res.length) sp.fail(`${page} ${tty.c.gray(`${theme} · ${lang}`)}: ${res.map((v) => v.id).join(', ')}`);
    else sp.succeed(`${page} ${tty.c.gray(`${theme} · ${lang}`)}`);
  }
}

ws.close();
chrome.kill();
siteServer.close();
app.kill();
fs.rmSync(tmp, { recursive: true, force: true });
setTimeout(() => fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }), 500);

if (!found.size) { console.log(`\n${tty.sym.ok} ${tty.c.bold('No problems found.')} ${tty.c.gray('Automated checks catch part of the issues: test with a screen reader and the keyboard too.')}\n`); process.exit(0); }
const order = { critical: 0, serious: 1, moderate: 2, minor: 3 };
console.log('');
for (const [id, e] of [...found].sort((a, b) => order[a[1].impact] - order[b[1].impact])) {
  console.log(`${tty.sym.fail} ${tty.c.bold(id)} ${tty.c.gray(`(${e.impact})`)} ${e.help}\n  ${tty.c.gray(e.url)}`);
  const max = process.env.A11Y_ALL ? Infinity : 8;
  for (const w of [...e.where].slice(0, max)) console.log(`    ${w}`);
  if (e.where.size > max) console.log(tty.c.gray(`    … and ${e.where.size - max} more (A11Y_ALL=1 lists them all)`));
}
console.log(`\n${found.size} kinds of problem.\n`);
process.exit(1);
