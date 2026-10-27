// The public sandbox: every visitor gets a private, throwaway OpenCaptions with simulated captions (ENGINE=mock, no
// AI, no cost) and no sign-in, so they can open the admin page, change anything and try Just for me with their own
// microphone. Each copy is deleted after COPY_MINUTES; a cookie says which copy a browser is using. Copies run on an
// internal Docker network with no internet, so a visitor can't use one to reach anything else. See README.md.
//
// No dependencies: Node's http and net, and the Docker Engine API on its socket.
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const env = process.env;
const IMAGE = env.IMAGE || 'ghcr.io/carraroesteban/opencaptions:latest';
const PUBLIC_URL = env.PUBLIC_URL || '';
const HOST_DIR = env.HOST_DIR; // this folder on the server, for the copies' event.json
const MAX = Number(env.MAX_COPIES || 15);
const MINUTES = Number(env.COPY_MINUTES || 60);
const PER_IP_HOUR = Number(env.PER_IP_HOUR || 4);
const NET = 'oc-sandbox';
const PUBLIC = '/app/public'; // the image's own pages: the landing page uses its fonts, colours and logo
if (!HOST_DIR) throw new Error('set HOST_DIR (docker-compose.yml does)');

// ---------------------------------------------------------------- Docker
function docker(method, p, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ socketPath: '/var/run/docker.sock', method, path: p, headers: { 'content-type': 'application/json' } }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => {
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on('error', reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
}
const ok = (r, what) => { if (r.status >= 300) throw new Error(`${what}: ${r.status} ${r.text.slice(0, 200)}`); return r; };

/** @type {Map<string, number>} copy id → when it ends (ms) */
const live = new Map();

async function refresh() {
  const filters = encodeURIComponent(JSON.stringify({ label: ['oc.sandbox'] }));
  const r = ok(await docker('GET', `/containers/json?all=1&filters=${filters}`), 'list copies');
  const now = new Map();
  for (const c of r.json) {
    const ends = c.Created * 1000 + MINUTES * 60_000;
    if (ends < Date.now() || c.State === 'exited' || c.State === 'dead') await docker('DELETE', `/containers/${c.Id}?force=1`).catch(() => {});
    else now.set(c.Labels['oc.sandbox'], ends);
  }
  for (const id of live.keys()) if (!now.has(id)) live.delete(id);
  for (const [id, ends] of now) live.set(id, ends);
}

async function createCopy(id) {
  const name = `oc-sb-${id}`;
  ok(await docker('POST', `/containers/create?name=${name}`, {
    Image: IMAGE,
    Labels: { 'oc.sandbox': id },
    Env: [
      'ENGINE=mock', 'AUTH=off', 'UPDATE_CHECK=0', 'TRUST_PROXY=uniquelocal', 'EVENT_CONFIG=/sandbox/event.json',
      'GLOSSARY=/app/data/glossary.json', 'SCHEDULE=/app/data/schedule.json', 'RECORDING_MAX_MB=20',
      `PUBLIC_URL=${PUBLIC_URL}`, `TZ=${env.TZ || 'UTC'}`,
    ],
    HostConfig: {
      NetworkMode: NET,
      Binds: [`${HOST_DIR}/event.json:/sandbox/event.json:ro`],
      Memory: 300 * 2 ** 20, MemorySwap: 300 * 2 ** 20, NanoCpus: 0.5e9, PidsLimit: 128,
      ReadonlyRootfs: true, Tmpfs: { '/tmp': 'size=64m', '/app/data': 'size=64m,uid=1000,gid=1000' },
      CapDrop: ['ALL'], SecurityOpt: ['no-new-privileges'], Init: true,
      LogConfig: { Type: 'json-file', Config: { 'max-size': '1m', 'max-file': '1' } },
    },
  }), 'create copy');
  ok(await docker('POST', `/containers/${name}/start`), 'start copy');
  live.set(id, Date.now() + MINUTES * 60_000);
  // Ready when it answers its health check (a few seconds).
  for (let i = 0; i < 60; i++) {
    const up = await new Promise((res) => http.get({ host: name, port: 8080, path: '/healthz', timeout: 1000 }, (r) => { r.resume(); res(r.statusCode === 200); }).on('error', () => res(false)));
    if (up) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${name} didn't start`);
}

// ---------------------------------------------------------------- pages
const cookieId = (req) => /(?:^|;\s*)oc_sb=([a-f0-9]{16})\b/.exec(req.headers.cookie || '')?.[1] || null;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const isEs = (req) => /^es\b/i.test(req.headers['accept-language'] || '');

const T = {
  en: {
    title: 'Try OpenCaptions', lead: 'Your own private copy, for one hour. Open the admin page, change anything, start a room or try Just for me with your microphone.',
    note: 'Captions are simulated: sample sentences appear when there is sound, so no AI is used and nothing you say leaves this copy. It is deleted after an hour.',
    start: 'Start my copy', ended: 'Your copy ended after an hour. Start a new one any time.',
    full: 'Every copy is in use right now. Try again in a few minutes.', many: 'You started several copies in the last hour. Try again later.',
    failed: 'Your copy didn\'t start. Try again in a minute.', real: 'To caption a real event, download OpenCaptions:',
  },
  es: {
    title: 'Probá OpenCaptions', lead: 'Tu propia copia privada, por una hora. Abrí la página de administración, cambiá lo que quieras, poné en marcha una sala o probá Solo para mí con tu micrófono.',
    note: 'Los subtítulos son simulados: aparecen frases de ejemplo cuando hay sonido, así que no se usa IA y nada de lo que digas sale de esta copia. Se borra después de una hora.',
    start: 'Abrir mi copia', ended: 'Tu copia terminó después de una hora. Podés abrir otra cuando quieras.',
    full: 'Todas las copias están en uso. Probá de nuevo en unos minutos.', many: 'Abriste varias copias en la última hora. Probá más tarde.',
    failed: 'Tu copia no arrancó. Probá de nuevo en un minuto.', real: 'Para subtitular un evento real, descargá OpenCaptions:',
  },
};

function landing(req, res, status = 200, msgKey = null) {
  const lang = isEs(req) ? 'es' : 'en';
  const t = T[lang];
  const msg = msgKey ? `<p class="msg" role="status">${esc(t[msgKey])}</p>` : '';
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-frame-options': 'DENY', 'x-content-type-options': 'nosniff' });
  res.end(`<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t.title)}</title><link rel="icon" href="/brand/icon.svg"><link rel="stylesheet" href="/tokens.css">
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--bg); color: var(--fg); font: 17px/1.5 var(--font); }
  main { max-width: 34rem; padding: 2rem 1.5rem; }
  .logo { width: 4rem; height: 4rem; }
  h1 { font: 700 2.2rem/1.1 var(--font-display); margin: 1rem 0 .75rem; }
  p { margin: 0 0 1rem; } .note { color: var(--fg2); font-size: .95rem; }
  .msg { background: var(--bg2); border: 1px solid var(--line-strong); border-radius: var(--radius-sm); padding: .75rem 1rem; }
  button { font: 600 1.05rem var(--font); background: var(--primary-bg); color: var(--primary-fg); border: 0; border-radius: var(--radius); padding: .85rem 1.5rem; min-height: 48px; cursor: pointer; margin: .5rem 0 1.5rem; }
  button:focus-visible, a:focus-visible { outline: 3px solid var(--accent-fg); outline-offset: 3px; }
  button[disabled] { opacity: .6; cursor: progress; }
  a { color: var(--fg); }
</style></head>
<body><main>
  <img class="logo" src="/brand/icon.svg" alt="">
  <h1>${esc(t.title)}</h1>
  ${msg}
  <p>${esc(t.lead)}</p>
  <p class="note">${esc(t.note)}</p>
  <form method="post" action="/_sandbox/start" onsubmit="this.querySelector('button').disabled = true">
    <button type="submit">${esc(t.start)}</button>
  </form>
  <p class="note">${esc(t.real)} <a href="https://opencaptions.kvza.ar">opencaptions.kvza.ar</a></p>
</main></body></html>`);
}

// Only what the landing page needs from the image's public folder.
function asset(req, res) {
  const p = new URL(req.url, 'http://x').pathname;
  if (!/^\/(tokens\.css|brand\/[\w.-]+|fonts\/[\w./-]+)$/.test(p) || p.includes('..')) return false;
  const file = path.join(PUBLIC, p);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  const type = { '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }[path.extname(p)] || 'application/octet-stream';
  res.writeHead(200, { 'content-type': type, 'cache-control': 'public, max-age=3600' });
  fs.createReadStream(file).pipe(res);
  return true;
}

// ---------------------------------------------------------------- start a copy
const starts = new Map(); // ip → start times in the last hour
const clientIp = (req) => String(req.headers['cf-connecting-ip'] || req.socket.remoteAddress || '');

async function start(req, res) {
  req.resume();
  const ip = clientIp(req);
  const recent = (starts.get(ip) || []).filter((t) => t > Date.now() - 3600_000);
  if (recent.length >= PER_IP_HOUR) return landing(req, res, 429, 'many');
  await refresh();
  if (live.size >= MAX) return landing(req, res, 503, 'full');
  starts.set(ip, [...recent, Date.now()]);
  const id = crypto.randomBytes(8).toString('hex');
  try { await createCopy(id); } catch (e) {
    console.error(e.message);
    await docker('DELETE', `/containers/oc-sb-${id}?force=1`).catch(() => {});
    live.delete(id);
    return landing(req, res, 500, 'failed');
  }
  console.log(`copy ${id} started (${live.size}/${MAX})`);
  res.writeHead(303, { location: '/welcome.html', // every new copy starts at the first-run choice: an event or Just for me
    'set-cookie': `oc_sb=${id}; Path=/; Max-Age=${MINUTES * 60}; HttpOnly; Secure; SameSite=Lax`, 'cache-control': 'no-store' });
  res.end();
}

// ---------------------------------------------------------------- proxy to the visitor's copy
const server = http.createServer((req, res) => {
  if (req.url === '/_sandbox/start' && req.method === 'POST') return void start(req, res).catch((e) => { console.error(e); res.destroyed || landing(req, res, 500, 'failed'); });
  const id = cookieId(req);
  if (id && live.has(id)) {
    const up = http.request({ host: `oc-sb-${id}`, port: 8080, method: req.method, path: req.url, headers: { ...req.headers, 'x-forwarded-for': clientIp(req), 'x-forwarded-proto': 'https' } }, (r) => {
      res.writeHead(r.statusCode, r.headers);
      r.pipe(res);
    });
    up.on('error', () => { if (!res.headersSent) landing(req, res, 502, 'failed'); else res.destroy(); });
    return void req.pipe(up);
  }
  if (req.method === 'GET' && asset(req, res)) return;
  if (req.url.startsWith('/api/') || req.url === '/healthz') {
    res.writeHead(req.url === '/healthz' ? 200 : 410, { 'content-type': 'application/json' });
    return void res.end(req.url === '/healthz' ? '{"ok":true}' : '{"error":"this sandbox copy has ended: reload the page to start a new one"}');
  }
  landing(req, res, 200, id ? 'ended' : null);
});

// Live captions and the microphone go over WebSockets: pass the upgrade through untouched.
server.on('upgrade', (req, socket, head) => {
  const id = cookieId(req);
  if (!id || !live.has(id)) return socket.destroy();
  const up = net.connect(8080, `oc-sb-${id}`, () => {
    const headers = [];
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      if (!/^x-forwarded-(for|proto)$/i.test(req.rawHeaders[i])) headers.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
    }
    headers.push(`X-Forwarded-For: ${clientIp(req)}`, 'X-Forwarded-Proto: https');
    up.write(`${req.method} ${req.url} HTTP/1.1\r\n${headers.join('\r\n')}\r\n\r\n`);
    if (head?.length) up.write(head);
    up.pipe(socket).pipe(up);
  });
  up.on('error', () => socket.destroy());
  socket.on('error', () => up.destroy());
});

// ---------------------------------------------------------------- startup
// The copies' network has no way out to the internet; this container joins it to reach them.
const created = await docker('POST', '/networks/create', { Name: NET, Internal: true });
if (created.status !== 201 && created.status !== 409) ok(created, 'create network');
const joined = await docker('POST', `/networks/${NET}/connect`, { Container: os.hostname() });
if (joined.status >= 300 && !/already exists|already attached/i.test(joined.text)) ok(joined, 'join network');
await refresh();
setInterval(() => refresh().catch((e) => console.error(e.message)), 60_000);
server.listen(8080, () => console.log(`sandbox on :8080 · ${live.size} copies · up to ${MAX}, ${MINUTES} min each`));
