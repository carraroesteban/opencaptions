// Event branding: the organizer's logo, tab icon and home page picture replace OpenCaptions' own. Only real PNG/JPEG/WebP
// files (judged by their bytes: an SVG from our origin could run script), up to 2 MB, admins only, and Event mode locks it.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 23000 + Math.floor(Math.random() * 2000);
const base = `http://127.0.0.1:${PORT}`;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60)]);
let srv, dataDir;
const upload = (body, type = 'image/png', token = 'a') => fetch(`${base}/api/event/logo`, { method: 'POST', headers: { 'content-type': type, authorization: `Bearer ${token}` }, body });
const event = async () => (await fetch(`${base}/api/event`)).json();

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-branding-'));
  const glossary = path.join(dataDir, 'glossary.json');
  fs.copyFileSync('test/fixtures/glossary.json', glossary);
  srv = spawn(process.execPath, ['src/server.js'], { env: { ...process.env, PORT: String(PORT), ENGINE: 'mock', DATA_DIR: dataDir, SCHEDULE: path.join(dataDir, 'schedule.json'), GLOSSARY: glossary, AUTH: 'token', ADMIN_TOKEN: 'a', CREW_TOKEN: 'c', INGEST_TOKEN: 'i', PUBLIC_URL: '', TUNNEL: '' }, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/healthz`)).ok) return; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 100));
  }
});
after(() => { srv?.kill(); fs.rmSync(dataDir, { recursive: true, force: true }); });

test('no logo: the event info says so and nothing is served', async () => {
  assert.equal((await event()).logo, null);
  assert.equal((await fetch(`${base}/branding/logo`)).status, 404);
});

test('a PNG upload shows in the event info and is served as a PNG', async () => {
  const r = await upload(PNG);
  assert.equal(r.status, 200);
  const { logo } = await event();
  assert.match(logo, /^\/branding\/logo\?v=\d+$/);
  const img = await fetch(base + logo);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/png');
  assert.equal(img.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Buffer.from(await img.arrayBuffer()), PNG);
  assert.ok(fs.existsSync(path.join(dataDir, 'branding', 'logo.png')));
  const hist = await (await fetch(`${base}/api/history`, { headers: { authorization: 'Bearer a' } })).json();
  assert.equal(hist.changes[0].kind, 'event.logo');
});

test('the bytes decide the type: a JPEG replaces the PNG, whatever the header said', async () => {
  const was = (await event()).logo;
  await new Promise((r) => setTimeout(r, 20)); // a new mtime, so a new URL
  assert.equal((await upload(JPEG, 'image/png')).status, 200);
  const { logo } = await event();
  assert.notEqual(logo, was);
  assert.equal((await fetch(base + logo)).headers.get('content-type'), 'image/jpeg');
  assert.deepEqual(fs.readdirSync(path.join(dataDir, 'branding')), ['logo.jpg']);
});

test('fake PNGs, SVGs and oversized files are refused', async () => {
  assert.equal((await upload(Buffer.from('<html><script>alert(1)</script></html>'))).status, 415);
  assert.equal((await upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'image/svg+xml')).status, 415);
  assert.equal((await upload(Buffer.concat([PNG, Buffer.alloc(2.1 * 1024 * 1024)]))).status, 413);
  assert.equal((await fetch(base + (await event()).logo)).headers.get('content-type'), 'image/jpeg', 'the logo is still the last good one');
});

test('only admins change it, and Event mode locks it', async () => {
  assert.equal((await upload(PNG, 'image/png', 'c')).status, 403);
  assert.equal((await fetch(`${base}/api/event/logo`, { method: 'DELETE' })).status, 401);
  const lock = (locked) => fetch(`${base}/api/lock`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer a' }, body: JSON.stringify({ locked }) });
  await lock(true);
  assert.equal((await upload(PNG)).status, 423);
  await lock(false);
});

test('DELETE removes it', async () => {
  assert.equal((await fetch(`${base}/api/event/logo`, { method: 'DELETE', headers: { authorization: 'Bearer a' } })).status, 200);
  assert.equal((await event()).logo, null);
  assert.equal((await fetch(`${base}/branding/logo`)).status, 404);
  assert.deepEqual(fs.readdirSync(path.join(dataDir, 'branding')), []);
});

test('the tab icon goes on every page and at /favicon.ico; the home picture on the audience home page; both go back when removed', async () => {
  const put = (kind, body) => fetch(`${base}/api/event/${kind}`, { method: 'POST', headers: { 'content-type': 'image/png', authorization: 'Bearer a' }, body });
  const del = (kind) => fetch(`${base}/api/event/${kind}`, { method: 'DELETE', headers: { authorization: 'Bearer a' } });
  const page = async (p) => (await fetch(base + p)).text();
  assert.equal((await put('icon', PNG)).status, 200);
  assert.equal((await put('cover', JPEG)).status, 200);
  const { icon, cover, logo } = await event();
  assert.match(icon, /^\/branding\/icon\?v=\d+$/);
  assert.match(cover, /^\/branding\/cover\?v=\d+$/);
  assert.equal(logo, null, 'each picture is its own');
  for (const p of ['/', '/watch.html', '/talks.html', '/admin.html', '/admin', '/screen.html', '/kit.html', '/welcome.html', '/me.html']) {
    const html = await page(p);
    assert.ok(html.includes(`<link rel="icon" href="${icon}" />`), p);
    assert.ok(html.includes(`<link rel="apple-touch-icon" href="${icon}" />`), p);
    assert.ok(!html.includes('/brand/icon.svg" type="image/svg+xml"'), `${p}: not OpenCaptions' icon too`);
  }
  assert.ok((await page('/')).includes(`src="${cover}"`), 'the home page shows the event\'s picture');
  const fav = await fetch(`${base}/favicon.ico`);
  assert.equal(fav.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await fav.arrayBuffer()), PNG);
  assert.equal((await fetch(base + cover)).headers.get('content-type'), 'image/jpeg');
  assert.equal((await put('icon', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).status, 415);
  // Removed: OpenCaptions' own again.
  await del('icon');
  await del('cover');
  assert.ok((await page('/admin.html')).includes('<link rel="icon" href="/brand/icon.svg" type="image/svg+xml" />'));
  assert.ok((await page('/')).includes('src="/art/audience.webp"'));
  assert.match((await fetch(`${base}/favicon.ico`)).headers.get('content-type'), /icon/);
  assert.deepEqual(fs.readdirSync(path.join(dataDir, 'branding')), []);
});
