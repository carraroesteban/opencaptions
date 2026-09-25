// Security baseline: who may administer / send audio, HTTP hardening headers, rate limits, WebSocket
// origin checks and SSRF protection for server-side audio pulls. See docs/security-guide.md for the threat model.
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { config, ROOT } from './config.js';

const env = process.env;

// ---------------------------------------------------------------- tokens
// AUTH=auto (default): requests from this same machine (loopback, not via a proxy) are trusted; anything
//   else needs a token. If ADMIN_TOKEN / INGEST_TOKEN are not set, random ones are generated once and kept in
//   data/secrets.json, so a server exposed on a network is never left open by accident.
// AUTH=token: a token is required even from localhost.
// AUTH=off: no authentication at all (lab use only — the server prints a warning).
export const authMode = (env.AUTH || 'auto').toLowerCase();

function loadSecrets() {
  const file = path.join(config.dataDir, 'secrets.json');
  let s = {};
  try { s = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* first run */ }
  let dirty = false;
  for (const k of ['adminToken', 'ingestToken']) {
    if (!s[k]) { s[k] = crypto.randomBytes(18).toString('base64url'); dirty = true; }
  }
  if (dirty) {
    fs.mkdirSync(config.dataDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(s, null, 2), { mode: 0o600 });
  }
  return s;
}

const generated = authMode === 'off' || (config.adminToken && config.ingestToken) ? {} : loadSecrets();
export const tokens = {
  admin: authMode === 'off' ? '' : config.adminToken || generated.adminToken,
  ingest: authMode === 'off' ? '' : config.ingestToken || generated.ingestToken,
  adminGenerated: !config.adminToken && authMode !== 'off',
  ingestGenerated: !config.ingestToken && authMode !== 'off',
};

export function safeEqual(a, b) {
  if (!a || !b) return false;
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
/**
 * True only for a request made on this machine directly to the server: loopback socket, a localhost Host
 * header (blocks DNS rebinding) and no proxy headers (a tunnel/reverse proxy on the same box is NOT local).
 */
export function isLocalRequest(req) {
  if (authMode !== 'auto') return false;
  const addr = req.socket?.remoteAddress || '';
  if (!(addr === '::1' || addr.startsWith('127.') || addr === '::ffff:127.0.0.1')) return false;
  const h = req.headers || {};
  if (h['x-forwarded-for'] || h['x-real-ip'] || h['cf-connecting-ip'] || h['forwarded'] || h['true-client-ip']) return false;
  const host = String(h.host || '').replace(/:\d+$/, '').toLowerCase();
  return LOCAL_HOSTNAMES.has(host);
}

/** Token presented by a client: header (preferred) or ?token= (browsers can't set WebSocket headers). */
export function presentedToken(req, url, { allowQuery = true } = {}) {
  const h = req.headers || {};
  const bearer = String(h.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1];
  return bearer || h['x-admin-token'] || h['x-ingest-token'] || (allowQuery ? url?.searchParams?.get('token') : '') || '';
}

export function canAdmin(req, url) {
  if (authMode === 'off' || isLocalRequest(req)) return true;
  return safeEqual(presentedToken(req, url, { allowQuery: req.method === 'GET' || !req.method }), tokens.admin);
}

export function canIngest(req, url) {
  if (authMode === 'off' || isLocalRequest(req)) return true;
  const t = presentedToken(req, url);
  return safeEqual(t, tokens.ingest) || safeEqual(t, tokens.admin);
}

// ---------------------------------------------------------------- rate limits
/** Fixed-window counter per key. Returns a function (key) → true if allowed. */
export function rateLimiter({ windowMs, max }) {
  const hits = new Map();
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (now - v.t > windowMs) hits.delete(k); }, windowMs).unref();
  return (key) => {
    const now = Date.now();
    let e = hits.get(key);
    if (!e || now - e.t > windowMs) { e = { t: now, n: 0 }; hits.set(key, e); }
    e.n++;
    return e.n <= max;
  };
}

/**
 * Client address for rate limiting. Proxy headers are only believed when the connection comes from a
 * loopback/private address (a tunnel or reverse proxy in front of us), never from the open internet.
 */
export function clientIp(req) {
  const addr = req.socket?.remoteAddress || '?';
  const h = req.headers || {};
  const fromProxy = /^(::1|127\.|::ffff:127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::ffff:(10|192\.168|172)\.)/.test(addr);
  if (fromProxy) {
    const fwd = h['cf-connecting-ip'] || String(h['x-forwarded-for'] || '').split(',')[0].trim() || h['x-real-ip'];
    if (fwd) return String(fwd);
  }
  return addr;
}
// Venue Wi-Fi puts hundreds of phones behind ONE public IP, so public viewer traffic is not limited per IP;
// only state-changing API calls, failed logins and WebSocket connection floods are.
const apiLimit = rateLimiter({ windowMs: 60_000, max: Number(env.RATE_LIMIT_API ?? 300) });
const authFailLimit = rateLimiter({ windowMs: 10 * 60_000, max: Number(env.RATE_LIMIT_AUTH_FAIL ?? 20) });
const wsLimit = rateLimiter({ windowMs: 60_000, max: Number(env.RATE_LIMIT_WS ?? 3000) });

/** Record a failed authentication; returns false once the client is over the limit (→ 429). */
export const noteAuthFailure = (req) => authFailLimit(clientIp(req));
export const wsAllowed = (req) => wsLimit(clientIp(req));

// ---------------------------------------------------------------- express middleware
const FRAME_ANCESTORS = env.FRAME_ANCESTORS || "'self'";
const CSP = [
  "default-src 'self'",
  // Pages are small static files with inline module scripts; no user content is ever rendered as HTML.
  "script-src 'self' 'unsafe-inline' https://www.youtube.com https://s.ytimg.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: https://i.ytimg.com",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "connect-src 'self' ws: wss:",
  "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com",
  `frame-ancestors ${FRAME_ANCESTORS}`,
  "base-uri 'none'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

export function securityHeaders(req, res, next) {
  res.set({
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'microphone=(self), camera=(), geolocation=(), payment=(), usb=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
  });
  if (FRAME_ANCESTORS === "'self'") res.set('X-Frame-Options', 'SAMEORIGIN');
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=31536000');
  next();
}

export function apiRateLimit(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || isLocalRequest(req) || apiLimit(clientIp(req))) return next();
  res.set('Retry-After', '60').status(429).json({ error: 'too many requests' });
}

// ---------------------------------------------------------------- websocket origin
const ALLOWED_ORIGINS = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
/**
 * Browsers always send Origin on WebSocket upgrades; a page on another site must not be able to drive the
 * admin or ingest sockets with a victim's stored token. Non-browser clients (the agent, scripts) send none.
 */
export function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    const o = new URL(origin);
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
    if (o.host === host) return true;
    if (config.publicUrl && o.origin === new URL(config.publicUrl).origin) return true;
  } catch { /* malformed */ }
  return false;
}

// ---------------------------------------------------------------- SSRF protection for pulls
const STREAM_SCHEMES = new Set(['srt:', 'rtmp:', 'rtmps:', 'rtsp:', 'rtsps:', 'udp:', 'rtp:']);
const HTTP_SCHEMES = new Set(['http:', 'https:']);
const ALLOW_PRIVATE = /^(1|true|yes)$/i.test(env.PULL_ALLOW_PRIVATE || '');
const MEDIA_DIRS = [path.join(ROOT, 'samples'), ...(env.MEDIA_DIR ? env.MEDIA_DIR.split(path.delimiter) : [])].map((d) => path.resolve(d));

function ipKind(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 169 && b === 254) return 'metadata'; // link-local incl. cloud metadata 169.254.169.254
    if (a === 127 || a === 0) return 'loopback';
    if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return 'private';
    return 'public';
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return ipKind(v.slice(7));
  if (v === '::1' || v === '::') return 'loopback';
  if (v.startsWith('fe80') || v.startsWith('fd00:ec2')) return 'metadata';
  if (v.startsWith('fc') || v.startsWith('fd')) return 'private';
  return 'public';
}

/**
 * Validate an audio source an admin asked the server to pull. Throws with a readable message if refused.
 *  • local files: only inside samples/ or MEDIA_DIR
 *  • srt/rtmp/rtsp/udp: allowed (typical venue LAN sources), except cloud metadata / link-local addresses
 *  • http(s): public hosts only, unless PULL_ALLOW_PRIVATE=1
 */
export async function checkPullUrl(input, { httpOnly = false } = {}) {
  const s = String(input || '').trim();
  if (!s) throw new Error('empty source');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s) || s.startsWith('file://')) {
    if (httpOnly) throw new Error('an http(s) URL is required');
    const p = path.resolve(ROOT, s.replace(/^file:\/\//, ''));
    if (!MEDIA_DIRS.some((d) => p === d || p.startsWith(d + path.sep))) throw new Error(`local files must be inside samples/ or MEDIA_DIR (got ${s})`);
    return;
  }
  let u;
  try { u = new URL(s); } catch { throw new Error('invalid URL'); }
  const isHttp = HTTP_SCHEMES.has(u.protocol);
  if (!isHttp && (httpOnly || !STREAM_SCHEMES.has(u.protocol))) throw new Error(`scheme ${u.protocol} not allowed`);
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!host || host === '0.0.0.0' || host === '::') {
    if (isHttp) throw new Error('invalid host');
    return; // SRT listener mode (srt://0.0.0.0:9001?mode=listener)
  }
  if (/^metadata(\.google\.internal)?$/i.test(host)) throw new Error('metadata endpoints are not allowed');
  let addrs;
  try { addrs = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((r) => r.address); }
  catch { throw new Error(`cannot resolve ${host}`); }
  for (const ip of addrs) {
    const kind = ipKind(ip);
    if (kind === 'metadata') throw new Error('link-local / metadata addresses are not allowed');
    if (isHttp && kind !== 'public' && !ALLOW_PRIVATE) throw new Error(`${host} is a private/loopback address (set PULL_ALLOW_PRIVATE=1 to allow LAN HTTP sources)`);
  }
}

export const _test = { ipKind };
