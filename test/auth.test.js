// Signing in to the dashboard (src/auth.js, src/oidc.js): sessions in an HttpOnly cookie, the crew role, signing
// devices out, changing passwords, two-factor codes and company sign-in against a stand-in OpenID provider.
// The server runs with AUTH=token, so even these requests from 127.0.0.1 must sign in.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PORT = 27000 + Math.floor(Math.random() * 2000);
const base = `http://127.0.0.1:${PORT}`;
const ADMIN = 'admin-password-for-tests', CREW = 'crew-password-for-tests';
let srv, idp, dataDir;

// ---------------------------------------------------------------- a stand-in OpenID provider
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
const codes = new Map(); // code → { nonce, email }
let nextEmail = 'ana@example.org', audience = 'oc-test';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function idToken(claims) {
  const head = b64({ alg: 'RS256', kid: 'k1', typ: 'JWT' }), body = b64(claims);
  return `${head}.${body}.${crypto.sign('sha256', Buffer.from(`${head}.${body}`), privateKey).toString('base64url')}`;
}
let issuer = '';

before(async () => {
  idp = http.createServer(async (req, res) => {
    const u = new URL(req.url, issuer);
    if (u.pathname === '/.well-known/openid-configuration') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks` }));
    }
    if (u.pathname === '/jwks') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ keys: [jwk] })); }
    if (u.pathname === '/authorize') {
      // The person "signs in" and consents: back to OpenCaptions with a code.
      const code = crypto.randomBytes(8).toString('hex');
      codes.set(code, { nonce: u.searchParams.get('nonce'), email: nextEmail, challenge: u.searchParams.get('code_challenge') });
      res.writeHead(302, { location: `${u.searchParams.get('redirect_uri')}?code=${code}&state=${u.searchParams.get('state')}` });
      return res.end();
    }
    if (u.pathname === '/token') {
      let body = '';
      for await (const c of req) body += c;
      const p = new URLSearchParams(body);
      const c = codes.get(p.get('code'));
      codes.delete(p.get('code'));
      const pkceOk = c && crypto.createHash('sha256').update(p.get('code_verifier') || '').digest('base64url') === c.challenge;
      if (!c || !pkceOk || p.get('client_secret') !== 'oc-secret') { res.writeHead(400, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: 'invalid_grant' })); }
      const now = Math.floor(Date.now() / 1000);
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ id_token: idToken({ iss: issuer, aud: audience, sub: c.email, email: c.email, email_verified: true, nonce: c.nonce, iat: now, exp: now + 300 }) }));
    }
    res.writeHead(404).end();
  });
  await new Promise((r) => idp.listen(0, '127.0.0.1', r));
  issuer = `http://127.0.0.1:${idp.address().port}`;

  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-auth-'));
  srv = spawn(process.execPath, ['src/server.js'], {
    env: {
      ...process.env, PORT: String(PORT), ENGINE: 'mock', DATA_DIR: dataDir, SCHEDULE: path.join(dataDir, 's.json'), AUTH: 'token',
      ADMIN_TOKEN: ADMIN, CREW_TOKEN: '', INGEST_TOKEN: 'ingest-password-for-tests', PUBLIC_URL: '', FALLBACK: '', TUNNEL: '',
      OIDC_ISSUER: issuer, OIDC_CLIENT_ID: 'oc-test', OIDC_CLIENT_SECRET: 'oc-secret', OIDC_ADMINS: 'ana@example.org', OIDC_CREW: '@crew.example.org', OIDC_LABEL: 'Test ID',
    },
    stdio: 'ignore',
  });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/healthz`)).ok) break; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  // The crew password is generated (CREW_TOKEN empty): read it where the server keeps it.
  crewPassword = JSON.parse(fs.readFileSync(path.join(dataDir, 'secrets.json'), 'utf8')).crewToken;
});
after(() => { srv?.kill(); idp?.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });
let crewPassword = CREW;

/** A browser: keeps its cookies between requests, like the dashboard does. */
function browser() {
  const jar = new Map();
  const call = async (method, url, body, headers = {}) => {
    const r = await fetch(base + url, {
      method, redirect: 'manual',
      headers: { 'content-type': 'application/json', cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    for (const c of r.headers.getSetCookie()) {
      const [kv] = c.split(';');
      const [k, v] = kv.split('=');
      if (/Max-Age=0/.test(c) || !v) jar.delete(k); else jar.set(k, v);
    }
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: r.status, body: json, headers: r.headers, cookies: r.headers.getSetCookie() };
  };
  return { call, jar };
}

test('without signing in, the dashboard API answers 401; a wrong password too', async () => {
  const b = browser();
  assert.equal((await b.call('GET', '/api/status')).status, 401);
  assert.equal((await b.call('POST', '/api/auth/login', { password: 'nope' })).status, 401);
  assert.deepEqual((await b.call('GET', '/api/auth/config')).body, { password: true, sso: 'Test ID' });
});

test('signing in gives an HttpOnly, SameSite=Strict cookie; the password is never needed again', async () => {
  const b = browser();
  const r = await b.call('POST', '/api/auth/login', { password: ADMIN, device: 'Ana’s laptop' });
  assert.equal(r.status, 200);
  assert.equal(r.body.role, 'admin');
  const c = r.cookies.find((x) => x.startsWith('oc_session='));
  assert.match(c, /HttpOnly/);
  assert.match(c, /SameSite=Strict/);
  assert.match(c, /Max-Age=86400/);
  assert.ok(!c.includes(ADMIN), 'the cookie is a random session id, not the password');
  assert.equal((await b.call('GET', '/api/status')).status, 200);
  const me = (await b.call('GET', '/api/auth/me')).body;
  assert.deepEqual([me.role, me.via, me.label], ['admin', 'session', 'Ana’s laptop']);
  // Stored on the server as a hash only.
  const saved = fs.readFileSync(path.join(dataDir, 'sessions.json'), 'utf8');
  assert.ok(!saved.includes(b.jar.get('oc_session')));
});

test('a signed-in browser refuses changes sent from another website', async () => {
  const b = browser();
  await b.call('POST', '/api/auth/login', { password: ADMIN, device: 'x' });
  assert.equal((await b.call('PUT', '/api/setup', { name: 'Hacked' }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await b.call('PUT', '/api/setup', { name: 'Real name' }, { origin: base })).status, 200);
  assert.equal((await b.call('POST', '/api/auth/login', { password: ADMIN }, { origin: 'https://evil.example' })).status, 403);
});

test('the crew runs the live controls, but can’t touch the setup', async () => {
  const b = browser();
  assert.equal((await b.call('POST', '/api/auth/login', { password: crewPassword, device: 'Stage left' })).body.role, 'crew');
  assert.equal((await b.call('GET', '/api/status')).status, 200);
  assert.equal((await b.call('POST', '/api/stages/main/talk', { title: 'Next talk' })).status, 200);
  assert.equal((await b.call('PATCH', '/api/stages/main', { title: 'Renamed talk' })).status, 200);
  assert.equal((await b.call('POST', '/api/stages/main/restart')).status, 200);
  for (const [m, u, body] of [['PATCH', '/api/stages/main', { name: 'New room name' }], ['DELETE', '/api/stages/main'], ['POST', '/api/stages', { id: 'x', name: 'X' }],
    ['PUT', '/api/glossary', { vocabulary: [], replacements: [] }], ['POST', '/api/lock', { locked: false }], ['PUT', '/api/ai/key', { key: 'AIza' }],
    ['POST', '/api/tunnel', { mode: 'quick' }], ['GET', '/api/auth/sessions'], ['POST', '/api/auth/passwords/admin']]) {
    assert.equal((await b.call(m, u, body)).status, 403, `${m} ${u}`);
  }
  // The History says who did it.
  const a = browser();
  await a.call('POST', '/api/auth/login', { password: ADMIN, device: 'Ana’s laptop' });
  await a.call('PUT', '/api/setup', { name: 'Summit with names' });
  const latest = (await a.call('GET', '/api/history')).body.changes[0];
  assert.equal(latest.by, 'Ana’s laptop');
});

test('signed-in devices: listed, signed out one by one or all at once', async () => {
  const admin = browser(), lost = browser();
  await admin.call('POST', '/api/auth/login', { password: ADMIN, device: 'Office PC' });
  await lost.call('POST', '/api/auth/login', { password: crewPassword, device: 'Lost tablet' });
  const list = (await admin.call('GET', '/api/auth/sessions')).body;
  const tablet = list.find((s) => s.device === 'Lost tablet');
  assert.ok(tablet && list.find((s) => s.current).device === 'Office PC');
  assert.ok(!JSON.stringify(list).includes(lost.jar.get('oc_session')), 'never the cookie');
  assert.equal((await admin.call('DELETE', `/api/auth/sessions/${tablet.id}`)).status, 200);
  assert.equal((await lost.call('GET', '/api/status')).status, 401, 'the lost tablet is out');
  const other = browser();
  await other.call('POST', '/api/auth/login', { password: ADMIN, device: 'Other' });
  assert.ok((await admin.call('POST', '/api/auth/sessions/sign-out-others')).body.signedOut >= 1);
  assert.equal((await other.call('GET', '/api/status')).status, 401);
  assert.equal((await admin.call('GET', '/api/status')).status, 200, 'but not this one');
  await admin.call('POST', '/api/auth/logout');
  assert.equal((await admin.call('GET', '/api/status')).status, 401);
});

test('changing a generated password signs out everyone who used it; one from .env can’t be changed here', async () => {
  const admin = browser(), crew = browser();
  await admin.call('POST', '/api/auth/login', { password: ADMIN, device: 'Office PC' });
  await crew.call('POST', '/api/auth/login', { password: crewPassword, device: 'Volunteer' });
  const r = await admin.call('POST', '/api/auth/passwords/crew');
  assert.equal(r.status, 200);
  assert.ok(r.body.password.length >= 20 && r.body.password !== crewPassword);
  assert.equal((await crew.call('GET', '/api/status')).status, 401, 'the old crew session is out');
  assert.equal((await browser().call('POST', '/api/auth/login', { password: crewPassword })).status, 401, 'the old password is dead');
  crewPassword = r.body.password;
  assert.equal((await browser().call('POST', '/api/auth/login', { password: crewPassword })).status, 200);
  assert.equal((await admin.call('POST', '/api/auth/passwords/admin')).status, 409, 'ADMIN_TOKEN is set in the environment');
  assert.ok(!JSON.stringify((await admin.call('GET', '/api/history')).body).includes(crewPassword), 'the History never shows a password');
});

test('company sign-in: an allowed account gets in, with its role; others are turned away', async () => {
  const signIn = async (email, { binding = true } = {}) => {
    nextEmail = email;
    const b = browser();
    const start = await b.call('GET', '/auth/oidc/start?device=Laptop');
    assert.equal(start.status, 302);
    const auth = new URL(start.headers.get('location'));
    assert.equal(auth.searchParams.get('code_challenge_method'), 'S256');
    const consent = await fetch(auth, { redirect: 'manual' });
    const cb = new URL(consent.headers.get('location'));
    if (!binding) b.jar.delete('oc_oidc');
    const back = await b.call('GET', cb.pathname + cb.search);
    return { b, back };
  };
  const ok = await signIn('ana@example.org');
  assert.equal(ok.back.status, 302);
  assert.equal(ok.back.headers.get('location'), '/admin.html');
  const me = (await ok.b.call('GET', '/api/auth/me')).body;
  assert.deepEqual([me.role, me.label], ['admin', 'ana@example.org · Laptop']);

  const crew = await signIn('sam@crew.example.org');
  assert.equal((await crew.b.call('GET', '/api/auth/me')).body.role, 'crew');

  const stranger = await signIn('eve@elsewhere.example');
  assert.match(decodeURIComponent(stranger.back.headers.get('location')), /isn't allowed/);
  assert.equal((await stranger.b.call('GET', '/api/auth/me')).body.role, null);

  const otherBrowser = await signIn('ana@example.org', { binding: false });
  assert.match(decodeURIComponent(otherBrowser.back.headers.get('location')), /another browser/);

  audience = 'someone-else';
  const wrongApp = await signIn('ana@example.org');
  assert.match(decodeURIComponent(wrongApp.back.headers.get('location')), /another app/);
  audience = 'oc-test';
});

test('room computers: a password in the socket URL is refused; a one-minute ticket works, once', async () => {
  const INGEST = 'ingest-password-for-tests';
  const ws = (q, headers = {}) => new Promise((resolve) => {
    const s = new WebSocket(`ws://127.0.0.1:${PORT}/ws/ingest?stage=main&kind=test${q}`, { headers });
    s.on('message', () => { resolve('open'); s.close(); });
    s.on('close', (code) => resolve(code));
    s.on('error', () => resolve('error'));
  });
  assert.equal(await ws(`&token=${INGEST}`), 4001, 'never in the URL');
  assert.equal(await ws('', { authorization: `Bearer ${INGEST}` }), 'open', 'the agent\'s header still works');
  const r = await fetch(`${base}/api/ingest/ticket`, { method: 'POST', headers: { authorization: `Bearer ${INGEST}` } });
  const { ticket, expiresIn } = await r.json();
  assert.equal(expiresIn, 60);
  assert.equal(await ws(`&ticket=${ticket}`), 'open');
  assert.equal(await ws(`&ticket=${ticket}`), 4001, 'single use');
  assert.equal((await fetch(`${base}/api/ingest/ticket`, { method: 'POST' })).status, 401);
});

// Last: turning two-factor on changes how the admin password works for the rest of this server's life.
function totp(secret, step) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0;
  const key = [];
  for (const ch of secret) { value = (value << 5) | A.indexOf(ch); bits += 5; if (bits >= 8) { key.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac('sha1', Buffer.from(key)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}
test('two-factor: the admin password then also needs a code from the app, and alone opens nothing', async () => {
  const admin = browser();
  await admin.call('POST', '/api/auth/login', { password: ADMIN, device: 'Office PC' });
  const start = (await admin.call('POST', '/api/auth/2fa/start')).body;
  assert.match(start.uri, /^otpauth:\/\/totp\//);
  assert.match(start.qr, /<svg/);
  const step = Math.floor(Date.now() / 30_000);
  assert.equal((await admin.call('POST', '/api/auth/2fa/confirm', { code: '000000' })).status, 400);
  assert.equal((await admin.call('POST', '/api/auth/2fa/confirm', { code: totp(start.secret, step) })).status, 200);

  const fresh = browser();
  assert.deepEqual((await fresh.call('POST', '/api/auth/login', { password: ADMIN })).body, { need: 'code' });
  assert.equal((await fresh.call('POST', '/api/auth/login', { password: ADMIN, code: '123456' })).status, 401);
  const used = await fresh.call('POST', '/api/auth/login', { password: ADMIN, code: totp(start.secret, step) });
  assert.equal(used.status, 401, 'a code works only once');
  const r = await fresh.call('POST', '/api/auth/login', { password: ADMIN, code: totp(start.secret, step + 1), device: 'New laptop' });
  assert.equal(r.status, 200);
  assert.equal((await fresh.call('GET', '/api/auth/me')).body.twoFactor, true);
  // A leaked admin password in a script header no longer works; the crew password still does.
  assert.equal((await fetch(`${base}/api/status`, { headers: { authorization: `Bearer ${ADMIN}` } })).status, 401);
  assert.equal((await fetch(`${base}/api/status`, { headers: { authorization: `Bearer ${crewPassword}` } })).status, 200);
});
