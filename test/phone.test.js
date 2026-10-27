// The phone page over a long session, in headless Chrome (the same Chrome `npm run a11y` uses; skipped where there's
// none): the page stays a bounded size however long the talk, and a phone coming back from the background or the
// back/forward cache reconnects at once, says so while it does, and shows live captions again with no line lost or
// doubled.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { openAudio } from '../src/pull.js';

const CHROME = [process.env.CHROME, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find((p) => p && fs.existsSync(p));
const skip = CHROME ? false : 'Chrome not found (set CHROME=/path/to/chrome)';
const PORT = 31000 + Math.floor(Math.random() * 2000), CDP = PORT + 2000;
const base = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let srv, chrome, ingest, audio, dataDir, profile, page;

const up = async (url, what) => {
  for (let i = 0; i < 150; i++) { try { if ((await fetch(url)).ok) return; } catch { /* starting */ } await sleep(100); }
  throw new Error(`${what} didn't start (${url})`);
};

/** One Chrome tab over the DevTools protocol: evaluate scripts, wait for conditions. */
async function tab() {
  const t = await (await fetch(`http://127.0.0.1:${CDP}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => ws.once('open', r));
  let id = 0;
  const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const send = (method, params = {}) => new Promise((r) => { pend.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'page error');
    return r.result?.result?.value;
  };
  const until = async (expression, ms = 8000) => {
    const end = Date.now() + ms;
    for (;;) { if (await evaluate(expression)) return Date.now(); if (Date.now() > end) throw new Error(`timed out waiting for: ${expression}`); await sleep(50); }
  };
  return { send, evaluate, until, close: () => ws.close() };
}

before(async () => {
  if (skip) return;
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-phone-'));
  srv = spawn(process.execPath, ['src/server.js'], {
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', ENGINE: 'mock', GEMINI_API_KEY: '', DATA_DIR: dataDir, SCHEDULE: path.join(dataDir, 's.json'), AUTH: 'auto', ADMIN_TOKEN: '', PUBLIC_URL: '', TUNNEL: '', FALLBACK: '', UPDATE_CHECK: '0' },
    stdio: 'ignore',
  });
  await up(`${base}/healthz`, 'the server');
  // The room hears a talk the whole time (mock engine): captions keep coming.
  ingest = new WebSocket(`ws://127.0.0.1:${PORT}/ws/ingest?stage=main&kind=cli&label=test`);
  await new Promise((r) => ingest.once('open', r));
  audio = openAudio('samples/talk-en.wav', { realtime: true, loop: true }).on('data', (b) => ingest.readyState === 1 && ingest.send(b, { binary: true }));
  profile = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-phone-chrome-'));
  chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, `--user-data-dir=${profile}`, '--no-first-run', ...(process.env.CI ? ['--no-sandbox'] : []), 'about:blank'], { stdio: 'ignore' });
  await up(`http://127.0.0.1:${CDP}/json/version`, 'Chrome');
  page = await tab();
  await page.send('Page.enable');
  await page.send('Page.navigate', { url: `${base}/watch.html?stage=main&lang=orig` });
  await page.until("document.querySelectorAll('#text span[data-id]').length > 2", 20000);
});
after(async () => {
  page?.close(); audio?.stopAudio(); ingest?.close();
  const gone = (p) => (p && p.exitCode === null ? new Promise((r) => { p.once('exit', r); p.kill(); }) : null);
  await Promise.all([gone(chrome), gone(srv)]); // nothing still writing in the folders
  for (const d of [dataDir, profile]) if (d) fs.rmSync(d, { recursive: true, force: true, maxRetries: 3 });
});

// What the reader has on screen: the captions' ids in order, and whether any is there twice.
const SHOWN = "(() => { const ids = [...document.querySelectorAll('#text span[data-id]')].map((s) => s.dataset.id); return { ids, dup: ids.length !== new Set(ids).size, status: document.querySelector('#status span:last-child').textContent, down: document.getElementById('text').classList.contains('down') }; })()";
// The page as the browser sees it after the phone was in the background: hidden, then visible again (and, for a
// back/forward cache restore, pageshow too). Returns what the reader sees in that same instant, before any answer.
const BACKGROUND = (ms, bfcache = false) => `(async () => {
  const set = (v) => { Object.defineProperty(document, 'visibilityState', { value: v, configurable: true }); Object.defineProperty(document, 'hidden', { value: v === 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); };
  set('hidden'); await new Promise((r) => setTimeout(r, ${ms})); set('visible');
  ${bfcache ? "dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));" : ''}
  return ${SHOWN};
})()`;

test('back from a few seconds in the background: Reconnecting at once, then live captions within 2 s, nothing lost or doubled', { skip }, async () => {
  const before = await page.evaluate(SHOWN);
  assert.equal(before.dup, false);
  const right = await page.evaluate(BACKGROUND(3000)); // shorter than the old 20 s threshold: a phone that went to the lock screen
  assert.equal(right.down, true, 'the old text is dimmed while it reconnects');
  assert.match(right.status, /reconnect/i, 'and the status says so');
  const t0 = Date.now();
  await page.until(`(${SHOWN}).down === false`, 2000);
  assert.ok(Date.now() - t0 <= 2000, 'live again within 2 s');
  await sleep(1500); // a few new words
  const after = await page.evaluate(SHOWN);
  assert.equal(after.dup, false, 'no caption twice');
  const kept = before.ids.filter((id) => after.ids.includes(id));
  assert.deepEqual(kept, before.ids.slice(-kept.length), 'what was on screen is still there, in order');
  assert.ok(kept.length >= Math.min(before.ids.length, 40), 'the scrollback is kept, not cut to the last few lines');
});

test('back from the back/forward cache: reconnects the same way, once (it fires visibilitychange and pageshow)', { skip }, async () => {
  await sleep(1100); // not straight after the previous return
  await page.evaluate(`(() => { window.__opened = 0; const W = window.WebSocket; window.WebSocket = class extends W { constructor(...a) { super(...a); window.__opened++; } }; return true; })()`);
  assert.equal((await page.evaluate(BACKGROUND(1500, true))).down, true);
  await page.until(`(${SHOWN}).down === false`, 2000);
  await sleep(1500);
  assert.equal(await page.evaluate('window.__opened'), 1, 'one new connection, not two');
  assert.equal((await page.evaluate(SHOWN)).dup, false);
});

test('a reader scrolled up to re-read keeps their place when the phone comes back', { skip }, async () => {
  await page.until("document.getElementById('scroll').scrollHeight > document.getElementById('scroll').clientHeight + 200", 30000);
  const at = await page.evaluate("(() => { const s = document.getElementById('scroll'); s.scrollTop = 40; s.dispatchEvent(new Event('scroll')); return s.scrollTop; })()");
  await sleep(1100);
  await page.evaluate(BACKGROUND(1500));
  await page.until(`(${SHOWN}).down === false`, 2000);
  const r = await page.evaluate("({ top: document.getElementById('scroll').scrollTop, tolive: !document.getElementById('tolive').classList.contains('hidden') })");
  assert.equal(r.top, at, 'still where they were reading');
  assert.equal(r.tolive, true, 'with the button back to live');
});

test('a long talk keeps the page bounded: at most 120 paragraphs, even when the speech never ends a sentence', { skip }, async () => {
  const r = await page.evaluate(`import('/common.js').then(({ CaptionFlow, CaptionState }) => {
    const box = document.createElement('div');
    const flow = new CaptionFlow(box);
    const st = new CaptionState();
    for (let i = 0; i < 4000; i++) { const seg = { id: 'x' + i, text: 'words without any full stop at all ' + i, final: true }; flow.update(seg); st.apply(seg); }
    const ps = [...box.children];
    return { paragraphs: ps.length, longest: Math.max(...ps.map((p) => p.textContent.length)), spans: box.querySelectorAll('span').length, kept: st.finals.length };
  })`);
  assert.ok(r.paragraphs <= 120, `${r.paragraphs} paragraphs`);
  assert.ok(r.longest <= 160 * 4 + 60, `longest paragraph ${r.longest} characters`);
  assert.ok(r.spans < 4000, 'old captions leave the page');
  assert.equal(r.kept, 200, 'the history in memory is capped too');
});

test('history after a reconnect: kept when it overlaps, replaced when the phone was away longer than it reaches', { skip }, async () => {
  const r = await page.evaluate(`import('/common.js').then(({ CaptionState }) => {
    const seg = (i) => ({ id: 's' + i, text: 'line ' + i, final: true });
    const range = (a, b) => Array.from({ length: b - a }, (_, i) => seg(a + i));
    const ids = (s) => s.finals.map((f) => f.id).join(',');
    const a = new CaptionState(); a.load(range(0, 100)); a.load(range(80, 120), null, true);
    const b = new CaptionState(); b.load(range(0, 100)); b.load(range(150, 190), null, true);
    const c = new CaptionState(); c.load(range(0, 100)); c.load(range(80, 120)); // another talk, or a first connect
    return { merged: a.finals.length, first: a.finals[0].id, last: a.finals.at(-1).id, dup: new Set(a.finals.map((f) => f.id)).size !== a.finals.length, gap: ids(b), other: c.finals.length };
  })`);
  assert.deepEqual([r.merged, r.first, r.last, r.dup], [120, 's0', 's119', false]);
  assert.equal(r.gap, Array.from({ length: 40 }, (_, i) => 's' + (150 + i)).join(','), 'no overlap: no lines joined across a gap');
  assert.equal(r.other, 40);
});

test('a failed request says why: the server message, or a plain one for a proxy error page (never a bare "Error")', { skip }, async () => {
  const r = await page.evaluate(`import('/common.js').then(({ failText }) => [
    failText({ status: 400, statusText: 'Bad Request' }, { error: 'pick a room' }),
    failText({ status: 502, statusText: '' }, {}),
    failText({ status: 503, statusText: 'Service Unavailable' }, {}),
    failText({ status: 404, statusText: 'Not Found' }, {}),
  ])`);
  assert.equal(r[0], 'pick a room');
  assert.match(r[1], /OpenCaptions/);
  assert.equal(r[2], r[1], 'a 5xx without a message never shows the proxy status text');
  assert.equal(r[3], 'Not Found');
});
