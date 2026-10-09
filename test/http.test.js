// HTTP layer smoke test: starts the real server (mock engine) and checks pages, app identity and headers.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

const PORT = 18000 + Math.floor(Math.random() * 2000);
const base = `http://127.0.0.1:${PORT}`;
// Tests never write to config/: the agenda and glossary live in the temp data dir.
const seedGlossary = (dir) => { const f = path.join(dir, 'glossary.json'); fs.copyFileSync('test/fixtures/glossary.json', f); return f; };
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
    env: { ...process.env, PORT: String(PORT), ENGINE: 'mock', DATA_DIR: dataDir, SCHEDULE: path.join(dataDir, 'schedule.json'), GLOSSARY: seedGlossary(dataDir), ADMIN_TOKEN: 't', INGEST_TOKEN: 't', PUBLIC_URL: '', GEMINI_API_KEY: '' },
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
  for (const page of ['/', '/watch.html', '/talk.html', '/talks.html', '/admin.html', '/kit.html', '/style.html', '/ingest.html', '/demo.html', '/screen.html', '/overlay.html', '/welcome.html', '/me.html']) {
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
    assert.match(body, new RegExp(`og:image" content="http://[\\d.]+:${PORT}/brand/og\\.png"`), page);
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

test('first-run setup: starts not done and saves the event name', async () => {
  const h = { 'content-type': 'application/json', 'x-admin-token': 't' };
  const s0 = await (await fetch(`${base}/api/setup`, { headers: h })).json();
  assert.equal(s0.done, false);
  assert.ok(s0.stages.length > 0);
  assert.equal(s0.failover, null); // mock engine: no offline backup
  assert.equal((await fetch(`${base}/api/setup`, { method: 'PUT', headers: h, body: JSON.stringify({ name: '  ' }) })).status, 400);
  const r = await (await fetch(`${base}/api/setup`, { method: 'PUT', headers: h, body: JSON.stringify({ name: 'Harbour Talks', done: true }) })).json();
  assert.deepEqual([r.name, r.done], ['Harbour Talks', true]);
  assert.equal((await (await fetch(`${base}/api/event`)).json()).name, 'Harbour Talks');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, 'setup.json'), 'utf8')).name, 'Harbour Talks');
  assert.equal((await fetch(`${base}/api/engine`, { method: 'POST', headers: h, body: JSON.stringify({ mode: 'local' }) })).status, 400);
});

test('strict CSP: scripts only from files, no inline scripts or handlers anywhere', async () => {
  const csp = (await fetch(`${base}/`)).headers.get('content-security-policy');
  const scriptSrc = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src '));
  assert.doesNotMatch(scriptSrc, /unsafe-inline|unsafe-eval/);
  assert.match(csp, /script-src-attr 'none'/);
  const pub = path.join(process.cwd(), 'public');
  for (const f of fs.readdirSync(pub).filter((x) => x.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(pub, f), 'utf8');
    for (const [, attrs] of html.matchAll(/<script\b([^>]*)>/g)) assert.match(attrs, /\bsrc=/, `${f}: inline <script>`);
    assert.doesNotMatch(html, /\son[a-z]+=["']/, `${f}: inline event handler`);
  }
  // Page scripts build HTML from templates: no handlers there either.
  for (const f of fs.readdirSync(path.join(pub, 'pages'))) {
    assert.doesNotMatch(fs.readFileSync(path.join(pub, 'pages', f), 'utf8'), /\son[a-z]+=["'\\]/, `pages/${f}: inline event handler in a template`);
  }
});

test('strict CSP for styles: page <style> blocks by hash, no style="" attributes anywhere', async () => {
  const csp = (await fetch(`${base}/`)).headers.get('content-security-policy');
  const styleSrc = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('style-src '));
  assert.doesNotMatch(styleSrc, /unsafe-inline/);
  assert.match(csp, /style-src-attr 'none'/);
  const pub = path.join(process.cwd(), 'public');
  for (const f of fs.readdirSync(pub).filter((x) => x.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(pub, f), 'utf8');
    for (const [, css] of html.matchAll(/<style>([\s\S]*?)<\/style>/g)) {
      assert.ok(styleSrc.includes(`'sha256-${crypto.createHash('sha256').update(css).digest('base64')}'`), `${f}: its <style> block isn't allowed by the CSP`);
    }
    assert.doesNotMatch(html, /\sstyle=["']/, `${f}: style="" attribute (use a class)`);
  }
  // Templates in scripts too (pages, and the shared modules that build markup).
  const scripts = [...fs.readdirSync(path.join(pub, 'pages')).map((f) => path.join('pages', f)), ...fs.readdirSync(pub).filter((f) => f.endsWith('.js'))];
  for (const f of scripts) assert.doesNotMatch(fs.readFileSync(path.join(pub, f), 'utf8'), /\sstyle=["'\\]/, `${f}: style="" in a template (use a class)`);
});

test('the agenda\'s time zone can be set from the browser (the wizard), and must be a real one', async () => {
  const h = { 'content-type': 'application/json', authorization: 'Bearer t' };
  assert.equal((await fetch(`${base}/api/setup`, { method: 'PUT', headers: h, body: JSON.stringify({ timezone: 'Mars/Olympus' }) })).status, 400);
  const s = await (await fetch(`${base}/api/setup`, { headers: h })).json();
  assert.equal(typeof s.timezone, 'string');
  assert.equal(typeof s.timezoneFixed, 'boolean');
});

test('no password on this computer, but other websites can’t post to it (CSRF)', async () => {
  const post = (headers) => new Promise((resolve, reject) => {
    const req = http.request(`${base}/api/stages/main/restart`, { method: 'POST', headers: { 'content-type': 'text/plain', ...headers } }, (res) => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
    req.end('');
  });
  assert.equal(await post({ origin: 'https://evil.example' }), 403, 'a page on another site, in the organizer’s browser');
  assert.equal(await post({ origin: base }), 200, 'our own dashboard');
  assert.equal(await post({}), 200, 'a script (no Origin header)');
});

test('a rename with a bad time zone changes nothing (no half-applied setup)', async () => {
  const put = (body) => fetch(`${base}/api/setup`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const before = (await (await fetch(`${base}/api/event`)).json()).name;
  assert.equal((await put({ name: 'Half applied', timezone: 'Not/AZone' })).status, 400);
  assert.equal((await (await fetch(`${base}/api/event`)).json()).name, before);
});

test('a glossary correction with nothing to look for is refused (it would match everywhere)', async () => {
  const put = (replacements) => fetch(`${base}/api/glossary`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ vocabulary: [], replacements }) });
  assert.equal((await put([{ from: ' | ', to: 'X' }])).status, 400);
  assert.equal((await put([{ from: 'tele health | tele-health', to: 'telehealth' }])).status, 200);
});

test('languages can be added from the dashboard, and one a room uses can’t be removed', async () => {
  const put = async (body) => { const r = await fetch(`${base}/api/setup`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
  assert.equal((await put({ languages: { fr: 'Français' } })).status, 200);
  assert.equal((await (await fetch(`${base}/api/event`)).json()).languages.fr, 'Français');
  assert.equal((await fetch(`${base}/api/stages/main`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ targets: ['es', 'fr'] }) })).status, 200);
  assert.equal((await put({ languages: {} })).status, 409, 'main still shows French');
  assert.equal((await put({ languages: { 'not a code': 'x' } })).status, 400);
  await fetch(`${base}/api/stages/main`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ targets: ['es', 'en'] }) });
  assert.equal((await put({ languages: {} })).status, 200);
});

test('who can read transcripts is set from the dashboard', async () => {
  const put = (v) => fetch(`${base}/api/setup`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ publicTranscripts: v }) });
  assert.equal((await put('everyone')).status, 400);
  assert.equal((await put('none')).status, 200);
  assert.equal((await (await fetch(`${base}/api/event`)).json()).publicTranscripts, 'none');
  assert.equal((await put('current')).status, 200);
});

test('the speech model is chosen from the dashboard, saved, and can be undone', async (t) => {
  const put = (v) => fetch(`${base}/api/setup`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ speechModel: v }) });
  const setup = async () => (await fetch(`${base}/api/setup`)).json();
  if ((await setup()).speechModelFixed) return t.skip('TRANSCRIBE_MODEL is set in .env');
  assert.equal((await setup()).speechModel, 'transcribe', 'Transcribe Live by default');
  assert.equal((await put('cheap')).status, 400);
  const r = await (await put('translate')).json();
  assert.equal((await setup()).speechModel, 'translate');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, 'setup.json'), 'utf8')).transcribeModel, '');
  assert.ok(r.change, 'recorded in the change log');
  assert.equal((await fetch(`${base}/api/history/${r.change}/undo`, { method: 'POST' })).status, 200);
  assert.equal((await setup()).speechModel, 'transcribe');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, 'setup.json'), 'utf8')).transcribeModel, 'gemini-3.5-transcribe-live');
});

test('“ask the talk” is limited per browser, not per venue IP', async () => {
  const ask = (client) => fetch(`${base}/api/stages/main/ask`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: 'what was said?', lang: 'en', client }) });
  for (let i = 0; i < 6; i++) await ask('phone-one-1234');
  assert.equal((await ask('phone-one-1234')).status, 429, 'the 7th question in a minute from one phone');
  assert.notEqual((await ask('phone-two-5678')).status, 429, 'another phone behind the same IP still can');
});

test('“just for me” mode: captions and transcripts only on this computer (or signed in)', async () => {
  const setMode = (mode) => fetch(`${base}/api/setup`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode }) });
  const fromWifi = { host: `phone.example:${PORT}` }; // not "localhost": another device on the network
  assert.equal((await setMode('personal')).status, 200);
  try {
    assert.equal((await (await fetch(`${base}/api/setup`)).json()).mode, 'personal');
    assert.equal((await get(`${base}/api/talks`, fromWifi)).status, 401);
    assert.equal((await get(`${base}/api/stages/main/export.txt`, fromWifi)).status, 401);
    assert.equal((await get(`${base}/api/talks`)).status, 200, 'this computer still reads them');
    // Only the personal room: the event's rooms (and their transcripts) don't show up in "just for me".
    assert.deepEqual((await (await fetch(`${base}/api/event`)).json()).stages.map((x) => x.id).filter((id) => id !== 'me'), []);
    assert.ok((await (await fetch(`${base}/api/talks`)).json()).talks.every((x) => x.stage === 'me'));
    // No event in "just for me": its pages lead to the personal page, and no event name shows.
    for (const page of ['/', '/watch.html?stage=main', '/screen.html?stage=main', '/overlay.html', '/kit.html']) {
      const r = await fetch(`${base}${page}`, { redirect: 'manual' });
      assert.equal(r.status, 302, page);
      assert.equal(r.headers.get('location'), '/me.html', page);
    }
    assert.equal((await fetch(`${base}/talks.html`, { redirect: 'manual' })).status, 200, 'transcripts stay');
    assert.equal((await (await fetch(`${base}/api/event`)).json()).name, 'OpenCaptions');
    assert.ok(Array.isArray((await (await fetch(`${base}/api/me/calls`)).json()).apps));
    const { default: WebSocket } = await import('ws');
    const view = (headers) => new Promise((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws/view?stage=main`, { headers });
      ws.on('open', () => { ws.close(); resolve('open'); });
      ws.on('unexpected-response', (req, res) => resolve(res.statusCode));
      ws.on('error', () => resolve('error'));
    });
    assert.equal(await view(fromWifi), 401);
    assert.equal(await view({}), 'open');
  } finally {
    await setMode('event');
  }
  assert.equal((await get(`${base}/api/stages/main/export.txt`, fromWifi)).status, 200, 'event mode: the talk in progress is public again');
  // Back in event mode, the personal room stays private and out of the event's lists.
  await fetch(`${base}/api/stages`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'me', name: 'Just for me', targets: ['en'] }) });
  assert.ok(!(await (await fetch(`${base}/api/event`)).json()).stages.some((x) => x.id === 'me'));
  assert.equal((await get(`${base}/api/stages/me/export.txt`, fromWifi)).status, 401);
  await fetch(`${base}/api/stages/me`, { method: 'DELETE' });
});

test('deleting a transcript that doesn’t exist says so', async () => {
  assert.equal((await fetch(`${base}/api/stages/main/talks/not-a-talk`, { method: 'DELETE' })).status, 404);
});
