// Who is using the dashboard, and what they may do.
//
// Roles: admin → everything. crew → the live controls only (next talk, renaming the current talk, restarting a room,
// stopping a pull, the offline-backup switch) plus reading the status, transcripts and history; never the setup.
//
// Ways in:
//   • this computer (AUTH=auto, see isLocalRequest in security.js) → admin, no password;
//   • a session: signing in with a password (POST /api/auth/login) or with a company account (src/oidc.js) gives
//     the browser an HttpOnly, SameSite=Strict cookie. The password itself is never kept in the browser or put in
//     a link. Sessions expire (SESSION_HOURS, default 24), are listed in Settings → Access, and each one can be
//     signed out;
//   • a password in a header (Authorization: Bearer …) for scripts and room computers. The admin password is refused
//     this way while two-factor sign-in is on: a leaked password alone must not be enough.
//
// Two-factor: a 6-digit code from an authenticator app (TOTP, RFC 6238) on top of the admin password.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { config } from './config.js';
import { authMode, tokens, safeEqual, isLocalRequest, presentedToken, originAllowed } from './security.js';
import { readSecret, saveSecret } from './aikey.js';

const env = process.env;
export const SESSION_HOURS = Number(env.SESSION_HOURS || 24);
export const COOKIE = 'oc_session';
const RANK = { ingest: 0, crew: 1, admin: 2 };

/**
 * @typedef {{ role: 'admin' | 'crew' | 'ingest', via: 'off' | 'local' | 'session' | 'token', label: string, session?: Session }} Identity
 * @typedef {{ hash: string, pid: string, role: 'admin' | 'crew', device: string, via: string, createdAt: number, lastSeen: number, expiresAt: number, ip: string }} Session
 */

// ---------------------------------------------------------------- sessions
const file = () => path.join(config.dataDir, 'sessions.json');
/** @type {Map<string, Session>} by sha256(cookie value): the cookie itself is never stored */
const sessions = new Map();
try {
  for (const s of JSON.parse(fs.readFileSync(file(), 'utf8'))) if (s.expiresAt > Date.now()) sessions.set(s.hash, s);
} catch { /* none yet */ }
let saveTimer = null;
function save(now = false) {
  clearTimeout(saveTimer);
  const write = () => {
    fs.mkdirSync(config.dataDir, { recursive: true });
    fs.writeFileSync(file(), JSON.stringify([...sessions.values()], null, 1), { mode: 0o600 });
  };
  if (now) write(); else { saveTimer = setTimeout(write, 30_000); saveTimer.unref?.(); }
}
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

/** Device names are shown to other admins: keep them short and plain. */
export const cleanDevice = (s) => String(s || '').replace(/[\p{Cc}<>]/gu, '').trim().slice(0, 60) || 'A browser';

/**
 * Start a session and return the Set-Cookie value.
 * @param {{ role: 'admin' | 'crew', device: string, via: string }} who
 * @param {import('express').Request} req
 */
export function createSession(who, req) {
  const id = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  /** @type {Session} */
  const s = { hash: sha(id), pid: crypto.randomBytes(6).toString('hex'), role: who.role, device: cleanDevice(who.device), via: who.via, createdAt: now, lastSeen: now, expiresAt: now + SESSION_HOURS * 3600_000, ip: String(req.ip || '') };
  sessions.set(s.hash, s);
  save(true);
  return { session: s, cookie: cookieFor(id, req, SESSION_HOURS * 3600) };
}

function cookieFor(value, req, maxAge) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${req.secure ? '; Secure' : ''}`;
}
export const clearCookie = (req) => cookieFor('', req, 0);

/** @param {import('node:http').IncomingMessage} req */
export function cookieValue(req, name = COOKIE) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return '';
}

/** @returns {Session | null} */
function sessionOf(req) {
  const v = cookieValue(req);
  if (!v) return null;
  const s = sessions.get(sha(v));
  if (!s) return null;
  if (s.expiresAt <= Date.now()) { sessions.delete(s.hash); save(); return null; }
  if (Date.now() - s.lastSeen > 60_000) { s.lastSeen = Date.now(); save(); }
  return s;
}

/** Signed-in devices, newest activity first (never the cookie or its hash). */
export function listSessions(current) {
  return [...sessions.values()].filter((s) => s.expiresAt > Date.now()).sort((a, b) => b.lastSeen - a.lastSeen)
    .map((s) => ({ id: s.pid, role: s.role, device: s.device, via: s.via, createdAt: s.createdAt, lastSeen: s.lastSeen, expiresAt: s.expiresAt, current: s === current }));
}
/** @param {(s: Session) => boolean} which @returns {number} how many were signed out */
export function endSessions(which) {
  let n = 0;
  for (const s of [...sessions.values()]) if (which(s)) { sessions.delete(s.hash); n++; }
  if (n) save(true);
  return n;
}

// ---------------------------------------------------------------- who is this?
/**
 * @param {import('node:http').IncomingMessage & { method?: string }} req
 * @param {URL} [url]
 * @returns {Identity | null}
 */
export function identify(req, url) {
  if (authMode === 'off') return { role: 'admin', via: 'off', label: 'no sign-in (AUTH=off)' };
  if (isLocalRequest(req)) return { role: 'admin', via: 'local', label: 'this computer' };
  const s = sessionOf(req);
  if (s) return { role: s.role, via: 'session', label: s.device, session: s };
  const t = presentedToken(req, url, { allowQuery: req.method === 'GET' || !req.method });
  if (!t) return null;
  if (safeEqual(t, tokens.admin)) return twoFactorOn() ? null : { role: 'admin', via: 'token', label: 'admin password (script)' };
  if (safeEqual(t, tokens.crew)) return { role: 'crew', via: 'token', label: 'crew password (script)' };
  if (safeEqual(t, tokens.ingest)) return { role: 'ingest', via: 'token', label: 'room computer' };
  return null;
}

/** @param {Identity | null} who @param {'admin' | 'crew' | 'ingest'} need */
export const allows = (who, need) => !!who && RANK[who.role] >= RANK[need];

/**
 * A browser that signed in with a cookie only sends requests from our own pages: refuse changes coming from
 * another site (SameSite=Strict already stops most; this covers old browsers and same-site subdomains).
 */
export const sameOrigin = (req, who) => who?.via !== 'session' || ['GET', 'HEAD', 'OPTIONS'].includes(req.method) || originAllowed(req);

/** The person behind the current request, for the History (set by the server's auth middleware). */
export const actor = new AsyncLocalStorage();

// ---------------------------------------------------------------- passwords
/** Which role a password gives, or null. The ingest password never opens the dashboard. */
export function roleFor(password) {
  if (password && safeEqual(password, tokens.admin)) return 'admin';
  if (password && safeEqual(password, tokens.crew)) return 'crew';
  return null;
}

const ENV_NAME = { admin: 'ADMIN_TOKEN', crew: 'CREW_TOKEN', ingest: 'INGEST_TOKEN' };
/** A password set in .env can only be changed there. */
export const passwordFromEnv = (which) => !!env[ENV_NAME[which]];

/**
 * Replace a generated password with a new random one. Everyone signed in with the old one (that role's sessions,
 * except `keep`) is signed out.
 * @param {'admin' | 'crew' | 'ingest'} which
 */
export function changePassword(which, keep = null) {
  if (passwordFromEnv(which)) throw Object.assign(new Error(`this password is set in .env (${ENV_NAME[which]}): change it there and restart`), { status: 409 });
  const value = crypto.randomBytes(18).toString('base64url');
  saveSecret(`${which}Token`, value);
  tokens[which] = value;
  const signedOut = which === 'ingest' ? 0 : endSessions((s) => s.role === which && s !== keep && s.via === 'password');
  return { value, signedOut };
}

// ---------------------------------------------------------------- two-factor (TOTP)
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(buf) {
  let bits = 0, value = 0, out = '';
  for (const b of buf) { value = (value << 8) | b; bits += 8; while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function unbase32(s) {
  let bits = 0, value = 0;
  const out = [];
  for (const ch of String(s).toUpperCase().replace(/[^A-Z2-7]/g, '')) { value = (value << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
/** The 6-digit code for a 30-second step. */
export function totpCode(secret, step = Math.floor(Date.now() / 30_000)) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac('sha1', unbase32(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, '0');
}
let lastStep = 0; // a code works once: replaying an observed one fails
/** Accepts the current code and the ones just before and after (clocks drift). */
export function checkCode(secret, code) {
  const c = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(c) || !secret) return false;
  const now = Math.floor(Date.now() / 30_000);
  for (const step of [now, now - 1, now + 1]) {
    if (step > lastStep && safeEqual(totpCode(secret, step), c)) { lastStep = step; return true; }
  }
  return false;
}
export const twoFactorOn = () => !!readSecret('totpSecret');
export const twoFactorSecret = () => readSecret('totpSecret');
let pending = { secret: '', until: 0 };
/** Step 1 of turning it on: a new secret, kept for 10 minutes until a code from the app confirms it. */
export function startTwoFactor() {
  pending = { secret: base32(crypto.randomBytes(20)), until: Date.now() + 10 * 60_000 };
  const label = encodeURIComponent(`OpenCaptions:${config.event.named ? config.event.name : 'admin'}`);
  return { secret: pending.secret, uri: `otpauth://totp/${label}?secret=${pending.secret}&issuer=OpenCaptions&digits=6&period=30` };
}
/** Step 2: the app's code proves it was set up; from now on the admin password needs a code. */
export function confirmTwoFactor(code) {
  if (!pending.secret || Date.now() > pending.until) throw new Error('start again: the setup expired');
  if (!checkCode(pending.secret, code)) throw new Error('that code isn\'t right: check the app shows OpenCaptions, and try the next code');
  saveSecret('totpSecret', pending.secret);
  pending = { secret: '', until: 0 };
}
/** Turn it off with a current code; `force` skips it (the server computer itself: the way back after losing the phone). */
export function disableTwoFactor(code, { force = false } = {}) {
  if (!force && !checkCode(twoFactorSecret(), code)) throw new Error('that code isn\'t right');
  saveSecret('totpSecret', '');
}
