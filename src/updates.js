// "A new version is available": at start and once a day the server asks GitHub which release is the latest. The
// request carries nothing about this install (no version, no ID, no event), nothing is ever installed by itself, and
// when GitHub can't be reached it stays quiet and tries again the next day. Off with UPDATE_CHECK=0 or in Settings.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './config.js';

const REPO = 'carraroesteban/opencaptions';
export const CURRENT = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

/** Is version a newer than b? "v0.10.0" > "0.9.3"; "0.7.0-beta.1" is older than "0.7.0". */
export function newer(a, b) {
  const parse = (v) => {
    const [core, pre] = String(v).trim().replace(/^v/i, '').split('-');
    const n = core.split('.');
    return [0, 1, 2].map((i) => Number(n[i]) || 0).concat(pre ? 0 : 1);
  };
  const x = parse(a), y = parse(b);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

let latest = ''; // the latest release's version, '' until GitHub answers

/** Ask GitHub once. Failures (offline, rate limit, a strange answer) keep what was known before. */
export async function checkNow({ timeoutMs = 5000 } = {}) {
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(timeoutMs) });
    const v = r.ok ? String((/** @type {any} */ (await r.json())).tag_name || '').replace(/^v/i, '') : '';
    if (/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(v)) latest = v; // only a version goes into links on the dashboard
  } catch { /* offline: try again tomorrow */ }
  return latest;
}

/** Check now and then every day, while enabled() says so. */
export function startChecks(enabled) {
  const tick = () => { if (enabled()) checkNow(); };
  tick();
  setInterval(tick, 24 * 3600_000).unref();
}

/**
 * What the dashboard shows, or null when this version is the latest (or GitHub hasn't answered). How to update depends
 * on the install: a Docker container and a copy of the code get a command, the desktop apps their download.
 */
export function updateInfo({ platform = process.platform, docker = !!process.env.OC_DOCKER, git = fs.existsSync(path.join(ROOT, '.git')) } = {}) {
  if (!latest || !newer(latest, CURRENT)) return null;
  const tag = `v${latest}`;
  const file = platform === 'darwin' ? 'OpenCaptions-mac.zip' : platform === 'win32' ? 'OpenCaptions-windows.zip' : '';
  return {
    version: latest,
    notes: `https://github.com/${REPO}/releases/tag/${tag}`,
    command: docker ? 'git pull && docker compose up -d --build' : git ? 'git pull && npm ci --omit=dev' : '',
    download: docker || git ? '' : file ? `https://github.com/${REPO}/releases/download/${tag}/${file}` : `https://github.com/${REPO}/releases/tag/${tag}`,
  };
}

/** Test hook: forget the last answer. */
export const _reset = () => { latest = ''; };
