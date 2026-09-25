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

test('admin and ingest tokens', () => {
  const remote = { addr: '203.0.113.9', host: 'subs.example.com' };
  assert.equal(sec.canAdmin(req(remote), url()), false);
  assert.equal(sec.canAdmin(req({ ...remote, headers: { authorization: 'Bearer admin-secret-token' } }), url()), true);
  assert.equal(sec.canAdmin(req({ ...remote, headers: { 'x-admin-token': 'admin-secret-token' } }), url()), true);
  assert.equal(sec.canAdmin(req(remote), url('?token=admin-secret-token')), true, 'query token on GET');
  assert.equal(sec.canAdmin(req({ ...remote, method: 'POST' }), url('?token=admin-secret-token')), false, 'no query token on POST');
  assert.equal(sec.canAdmin(req({ ...remote, headers: { authorization: 'Bearer ingest-secret-token' } }), url()), false);
  assert.equal(sec.canIngest(req({ ...remote, headers: { authorization: 'Bearer ingest-secret-token' } }), url()), true);
  assert.equal(sec.canIngest(req({ ...remote, headers: { authorization: 'Bearer admin-secret-token' } }), url()), true);
  assert.equal(sec.canIngest(req(remote), url('?token=wrong')), false);
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
