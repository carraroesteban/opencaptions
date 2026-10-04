// Secrets set from the dashboard instead of .env, kept in data/secrets.json (mode 0600, next to the generated
// tokens): the Gemini API key (checked with Google first) and the Cloudflare tunnel token. A saved key wins over
// GEMINI_API_KEY; removing it goes back to .env's key, or to simulated captions if there is none.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const file = () => path.join(config.dataDir, 'secrets.json');

function readSecrets() {
  try { return JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { return {}; }
}

/** @param {string} name */
export const readSecret = (name) => String(readSecrets()[name] || '');

/** Store (or, with an empty value, remove) one secret in data/secrets.json. */
export function saveSecret(name, value) {
  const s = readSecrets();
  if (value) s[name] = value; else delete s[name];
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(s, null, 2), { mode: 0o600 });
}

/** @param {string | null} key  null removes the saved key */
export const saveKey = (key) => saveSecret('geminiApiKey', key);

/** What the dashboard may know about the key: never the key itself. */
export function keyInfo() {
  return {
    set: !!config.geminiApiKey,
    last4: config.geminiApiKey ? config.geminiApiKey.slice(-4) : '',
    source: config.keySource,
    vertex: config.vertex,
    envKey: !!process.env.GEMINI_API_KEY,
  };
}

/** A Gemini Developer API key looks like AIza… (39 characters); anything else is surely a copy-paste slip. */
export const looksLikeKey = (k) => /^AIza[\w-]{30,}$/.test(k);

/**
 * Ask Google whether this key works, by reading the caption translation model's details (free, no tokens used).
 * @param {string} key
 * @returns {Promise<{ ok: boolean, code: 'ok' | 'invalid' | 'forbidden' | 'quota' | 'offline' | 'error', detail?: string }>}
 */
export async function checkKey(key, { timeoutMs = 8000 } = {}) {
  const base = (process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
  let r;
  try {
    r = await fetch(`${base}/v1beta/models/${encodeURIComponent(config.textModel)}`, { headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    return { ok: false, code: 'offline', detail: e.message };
  }
  // 404: the key works, this account just doesn't list that model by that name.
  if (r.ok || r.status === 404) return { ok: true, code: 'ok' };
  const body = await r.json().catch(() => ({}));
  const detail = String(body?.error?.message || r.statusText).slice(0, 300);
  if (r.status === 429) return { ok: true, code: 'quota', detail }; // a real key, out of free quota for now
  if (r.status === 400 || r.status === 401) return { ok: false, code: 'invalid', detail };
  if (r.status === 403) return { ok: false, code: 'forbidden', detail };
  return { ok: false, code: 'error', detail };
}
