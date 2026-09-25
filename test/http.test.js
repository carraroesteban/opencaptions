// HTTP layer smoke test: starts the real server (mock engine) and checks pages, app identity and headers.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

const PORT = 18000 + Math.floor(Math.random() * 2000);
const base = `http://127.0.0.1:${PORT}`;
let srv;
let dataDir;

// fetch() can't send a custom Host header, so use http.get for that case.
const get = (url, headers = {}) => new Promise((resolve, reject) => {
  http.get(url, { headers }, (res) => {
    let body = '';
    res.setEncoding('utf8');
    res.on('data', (d) => { body += d; });
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
  }).on('error', reject);
});

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-http-'));
  srv = spawn(process.execPath, ['src/server.js'], {
    env: { ...process.env, PORT: String(PORT), ENGINE: 'mock', DATA_DIR: dataDir, ADMIN_TOKEN: 't', INGEST_TOKEN: 't', PUBLIC_URL: '', GEMINI_API_KEY: '' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/healthz`)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start');
});

after(() => {
  srv?.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('every page has an icon, and the icons are served', async () => {
  for (const page of ['/', '/watch.html', '/talk.html', '/talks.html', '/admin.html', '/kit.html', '/style.html', '/ingest.html', '/demo.html', '/screen.html', '/overlay.html']) {
    const { status, body } = await get(base + page);
    assert.equal(status, 200, page);
    assert.match(body, /rel="icon" href="\/brand\/icon\.svg"/, page);
  }
  for (const [file, type] of [['/favicon.ico', /icon/], ['/brand/icon.svg', /svg/], ['/apple-touch-icon.png', /png/], ['/brand/og.png', /png/]]) {
    const r = await fetch(base + file);
    assert.equal(r.status, 200, file);
    assert.match(r.headers.get('content-type'), type, file);
  }
});

test('manifest is named after the event', async () => {
  const r = await fetch(`${base}/manifest.webmanifest`);
  assert.match(r.headers.get('content-type'), /application\/manifest\+json/);
  const m = await r.json();
  assert.ok(m.name.length > 0);
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
});

test('audience pages get absolute preview URLs and the event name', async () => {
  for (const page of ['/', '/watch', '/watch.html', '/talks.html']) {
    const { body } = await get(base + page);
    assert.match(body, new RegExp(`og:image" content="http://127\\.0\\.0\\.1:${PORT}/brand/og\\.png"`), page);
    assert.doesNotMatch(body, /%EVENT%/, page);
  }
});

test('a hostile Host header is never written into pages', async () => {
  const { status, body } = await get(`${base}/watch.html`, { Host: 'evil.example"><script>alert(1)</script>' });
  assert.ok(status === 200 || status === 400, `status ${status}`);
  assert.doesNotMatch(body, /<script>alert\(1\)<\/script>/);
});

test('security headers are present', async () => {
  const r = await fetch(`${base}/`);
  assert.match(r.headers.get('content-security-policy') || '', /default-src 'self'/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
});
