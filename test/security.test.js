import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.ADMIN_TOKEN = 'admin-secret-token';
process.env.INGEST_TOKEN = 'ingest-secret-token';
process.env.AUTH = 'auto';
const sec = await import('../src/security.js');

const req = ({ addr = '127.0.0.1', host = 'localhost:8080', headers = {}, method = 'GET' } = {}) => ({
  method,
  socket: { remoteAddress: addr },
  headers: { host, ...headers },
});
const url = (q = '') => new URL(`http://x/api${q}`);

test('localhost is trusted only for direct loopback requests with a local Host header', () => {
  assert.equal(sec.isLocalRequest(req()), true);
  assert.equal(sec.isLocalRequest(req({ addr: '::1', host: '[::1]:8080' })), true);
  assert.equal(sec.isLocalRequest(req({ host: 'evil.example' })), false, 'DNS rebinding');
  assert.equal(sec.isLocalRequest(req({ headers: { 'x-forwarded-for': '1.2.3.4' } })), false, 'reverse proxy');
  assert.equal(sec.isLocalRequest(req({ headers: { 'cf-connecting-ip': '1.2.3.4' } })), false, 'tunnel');
  assert.equal(sec.isLocalRequest(req({ addr: '192.168.1.20', host: 'localhost' })), false, 'LAN');
});

test('passwords are read from headers, and from ?token= only where allowed', () => {
  const remote = { addr: '203.0.113.9', host: 'subs.example.com' };
  assert.equal(sec.presentedToken(req({ ...remote, headers: { authorization: 'Bearer abc' } }), url()), 'abc');
  assert.equal(sec.presentedToken(req({ ...remote, headers: { 'x-admin-token': 'abc' } }), url()), 'abc');
  assert.equal(sec.presentedToken(req(remote), url('?token=abc')), 'abc');
  assert.equal(sec.presentedToken(req(remote), url('?token=abc'), { allowQuery: false }), '');
  assert.equal(sec.presentedToken(req(remote), url()), '');
});

test('websocket origin must match the host for admin/ingest sockets', () => {
  assert.equal(sec.originAllowed(req({ host: 'subs.example.com' })), true, 'no Origin = non-browser client');
  assert.equal(sec.originAllowed(req({ host: 'subs.example.com', headers: { origin: 'https://subs.example.com' } })), true);
  assert.equal(sec.originAllowed(req({ host: 'subs.example.com', headers: { origin: 'https://evil.example' } })), false);
});

test('pull URLs: SSRF and local file protection', async () => {
  const ok = async (u, o) => assert.doesNotReject(sec.checkPullUrl(u, o), u);
  const bad = async (u, o) => assert.rejects(sec.checkPullUrl(u, o), undefined, u);
  await ok('samples/talk-en.wav');
  await ok('srt://0.0.0.0:9001?mode=listener');
  await ok('srt://192.168.1.50:9000');
  await ok('https://93.184.215.14/live.m3u8');
  await bad('/etc/passwd');
  await bad('samples/../../etc/passwd');
  await bad('file:///etc/passwd');
  await bad('http://169.254.169.254/computeMetadata/v1/');
  await bad('http://metadata.google.internal/');
  await bad('http://127.0.0.1:8080/');
  await bad('http://10.0.0.5/stream');
  await bad('http://[::1]/');
  await bad('gopher://example.com/');
  await bad('concat:/etc/passwd|x');
  await bad('samples/talk-en.wav', { httpOnly: true });
  // An admin's LAN AI server or alert service: private hosts yes, cloud metadata still no.
  await ok('http://192.168.1.20:1234/v1', { httpOnly: true, lan: true });
  await bad('http://169.254.169.254/latest/', { httpOnly: true, lan: true });
});

test('rate limiter blocks after the limit within a window', () => {
  const allow = sec.rateLimiter({ windowMs: 60_000, max: 3 });
  assert.deepEqual([1, 2, 3, 4].map(() => allow('a')), [true, true, true, false]);
  assert.equal(allow('b'), true);
});

test('safeEqual', () => {
  assert.equal(sec.safeEqual('abc', 'abc'), true);
  assert.equal(sec.safeEqual('abc', 'abd'), false);
  assert.equal(sec.safeEqual('abc', 'abcd'), false);
  assert.equal(sec.safeEqual('', ''), false);
});

test('the guess limit counts the real visitor: proxy headers count only from a trusted proxy', () => {
  const ip = (addr, headers) => sec.clientIp({ ...req({ addr, headers }), connection: { remoteAddress: addr } });
  assert.equal(ip('192.168.1.50', { 'x-forwarded-for': '6.6.6.6' }), '192.168.1.50', 'a phone on the venue Wi-Fi faking the header');
  assert.equal(ip('192.168.1.50', { 'cf-connecting-ip': '6.6.6.6' }), '192.168.1.50');
  assert.equal(ip('127.0.0.1', { 'x-forwarded-for': '203.0.113.9' }), '203.0.113.9', 'a proxy on this computer');
  assert.equal(ip('127.0.0.1', { 'cf-connecting-ip': '203.0.113.9' }), '203.0.113.9', 'the Cloudflare tunnel');
});

test('a damaged secrets.json stops with a clear message; a missing one is a first run', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const os = await import('node:os');
  const { readSecretsFile } = await import('../src/config.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-secrets-'));
  assert.deepEqual(readSecretsFile(dir), {});
  fs.writeFileSync(path.join(dir, 'secrets.json'), '{"adminToken": "abc", "gemin');
  assert.throws(() => readSecretsFile(dir), /secrets\.json is damaged/);
  fs.rmSync(dir, { recursive: true, force: true });
});
