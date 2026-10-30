// The public address learned from the dashboard: opened over HTTPS on a domain through the organizer's own tunnel or
// proxy (a Cloudflare Tunnel to the container), that's where phones reach the server, so nothing asks to turn one on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const PORT = 24000 + Math.floor(Math.random() * 2000);
const base = `http://127.0.0.1:${PORT}`;

/** GET with any Host and forwarded headers (fetch can't set Host). */
const get = (p, headers = {}) => new Promise((resolve, reject) => {
  http.get(base + p, { headers }, (res) => {
    let body = '';
    res.on('data', (d) => { body += d; });
    res.on('end', () => resolve(JSON.parse(body)));
  }).on('error', reject);
});
const admin = { authorization: 'Bearer adm' };
const viaTunnel = (host) => ({ host, 'x-forwarded-proto': 'https', 'x-forwarded-for': '203.0.113.7', 'cf-connecting-ip': '203.0.113.7' });

async function withServer(dataDir, env, fn) {
  const srv = spawn(process.execPath, ['src/server.js'], {
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', ENGINE: 'mock', DATA_DIR: dataDir, SCHEDULE: path.join(dataDir, 's.json'), GLOSSARY: path.join(dataDir, 'g.json'), ADMIN_TOKEN: 'adm', CREW_TOKEN: 'crew', INGEST_TOKEN: 'ing', PUBLIC_URL: '', GEMINI_API_KEY: '', TUNNEL: '', UPDATE_CHECK: '0', TRUST_PROXY: 'loopback', ...env },
    stdio: 'ignore',
  });
  try {
    for (let i = 0; ; i++) {
      try { if ((await fetch(`${base}/healthz`)).ok) break; } catch { /* starting */ }
      if (i > 100) throw new Error('server did not start');
      await new Promise((r) => setTimeout(r, 100));
    }
    await fn();
  } finally {
    await new Promise((r) => { srv.once('exit', r); srv.kill(); });
  }
}

test('an admin on HTTPS through a proxy, on a domain: that address is the public one, now and after a restart', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-address-'));
  await withServer(dir, {}, async () => {
    // Not from these: plain HTTP, an IP, a .local name, a crew member.
    for (const [headers, why] of [
      [{ ...admin, host: 'subs.example.org' }, 'plain http'],
      [{ ...admin, ...viaTunnel('203.0.113.9') }, 'an IP address'],
      [{ ...admin, ...viaTunnel('server.local') }, 'a .local name'],
      [{ authorization: 'Bearer crew', ...viaTunnel('subs.example.org') }, 'crew, not admin'],
    ]) {
      const s = await get('/api/setup', headers);
      assert.equal(s.publicUrlSource, 'auto', why);
    }
    assert.equal((await get('/api/status', admin)).publicUrl, '', 'nothing learned yet');
    const s = await get('/api/setup', { ...admin, ...viaTunnel('subs.example.org') });
    assert.equal(s.publicUrlSource, 'seen');
    assert.equal(s.publicUrl, 'https://subs.example.org');
    // QR codes and links use it, whatever address a page is opened at.
    assert.equal((await get('/api/event', { host: '127.0.0.1' })).publicUrl, 'https://subs.example.org');
    assert.equal((await get('/api/status', admin)).publicUrl, 'https://subs.example.org', 'the checklist\'s public address step is done');
  });
  await withServer(dir, {}, async () => {
    assert.equal((await get('/api/event', { host: '127.0.0.1' })).publicUrl, 'https://subs.example.org', 'kept across restarts');
  });
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a PUBLIC_URL set on the server is never replaced by the address a page was opened at', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-address-'));
  await withServer(dir, { PUBLIC_URL: 'https://captions.example.com' }, async () => {
    const s = await get('/api/setup', { ...admin, ...viaTunnel('other.example.org') });
    assert.equal(s.publicUrlSource, 'config');
    assert.equal(s.publicUrl, 'https://captions.example.com');
  });
  fs.rmSync(dir, { recursive: true, force: true });
});
