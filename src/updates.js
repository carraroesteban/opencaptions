// "A new version is available": at start and once a day the server asks GitHub which release is the latest. The
// request carries nothing about this install (no version, no ID, no event), and when GitHub can't be reached it stays
// quiet and tries again the next day. Off with UPDATE_CHECK=0 or in Settings.
//
// "Update now" (only when someone clicks it): the Mac and Windows apps, and `npm run app`, run the server under
// scripts/start.js. There the new release's files are put over this copy's (settings, passwords and transcripts live
// in the data folder and aren't touched; a copy of the code does `git pull` instead), and the server exits with
// RESTART so start.js starts the new version, installing new libraries first if there are any. A Docker container
// can't replace itself: it gets the command to run instead.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); // not from config.js: package-desktop.js imports this file
const REPO = 'carraroesteban/opencaptions';
export const CURRENT = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
/** The server's exit code that asks scripts/start.js to start it again. */
export const RESTART = 75;
// What the app needs at run time (the desktop downloads ship these, scripts/package-desktop.js): no tests, docs or website.
export const APP_FILES = ['package.json', 'package-lock.json', 'LICENSE', 'README.md', 'CHANGELOG.md', '.env.example',
  ...['start', 'setup', 'local', 'local-asr-server', 'check-gemini', 'check-local', 'feed', 'agent', 'subtitle'].map((s) => `scripts/${s}.js`)];
export const APP_DIRS = ['src/', 'public/', 'config/', 'samples/'];

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
let whatsNew = ''; // its release notes, as GitHub has them (plain text for the dashboard and the apps' dialogs)
let latestShell = 0; // its deploy/desktop/shell.json: the native app (window, launcher) the release expects

/** Ask GitHub once. Failures (offline, rate limit, a strange answer) keep what was known before. */
export async function checkNow({ timeoutMs = 5000 } = {}) {
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(timeoutMs) });
    const rel = /** @type {any} */ (r.ok ? await r.json() : {});
    const v = String(rel.tag_name || '').replace(/^v/i, '');
    if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(v)) return latest; // only a version goes into links, file names and downloads
    latest = v;
    whatsNew = String(rel.body || '').slice(0, 4000);
    // Only for a newer release: which native app it needs (absent before there was one: the first, 0).
    if (newer(v, CURRENT)) {
      const s = await fetch(`https://raw.githubusercontent.com/${REPO}/v${v}/deploy/desktop/shell.json`, { signal: AbortSignal.timeout(timeoutMs) });
      latestShell = s.ok ? Number((/** @type {any} */ (await s.json())).version) || 0 : 0;
    }
  } catch { /* offline: try again tomorrow */ }
  return latest;
}

/** Check now and then every day, while enabled() says so. */
export function startChecks(enabled) {
  const tick = () => { if (enabled()) checkNow(); };
  tick();
  setInterval(tick, 24 * 3600_000).unref();
}

const isGit = () => fs.existsSync(path.join(ROOT, '.git'));
const writable = (dir) => { try { fs.accessSync(dir, fs.constants.W_OK); return true; } catch { return false; } };

/**
 * What the dashboard shows, or null when this version is the latest (or GitHub hasn't answered). canUpdate: the
 * "Update now" button (started by scripts/start.js, which starts the new version). Otherwise a Docker container or a
 * copy of the code gets the command, anything else the download for this computer. app: the download, when the
 * release also changes the native app around the files (OC_SHELL, set by the Mac app and the Windows launcher), which
 * "Update now" can't replace.
 */
export function updateInfo({ platform = process.platform, docker = !!process.env.OC_DOCKER, git = isGit(), supervised = !!process.env.OC_SUPERVISED, shell = process.env.OC_SHELL } = {}) {
  if (!latest || !newer(latest, CURRENT)) return null;
  const tag = `v${latest}`;
  const file = platform === 'darwin' ? 'OpenCaptions-mac.zip' : platform === 'win32' ? 'OpenCaptions-windows.zip' : '';
  const canUpdate = supervised && !docker && writable(ROOT);
  const url = file ? `https://github.com/${REPO}/releases/download/${tag}/${file}` : `https://github.com/${REPO}/releases/tag/${tag}`;
  return {
    version: latest,
    notes: `https://github.com/${REPO}/releases/tag/${tag}`,
    whatsNew,
    canUpdate,
    command: canUpdate ? '' : docker ? 'docker compose up -d' : git ? 'git pull && npm ci --omit=dev' : '',
    download: canUpdate || docker || git ? '' : url,
    app: canUpdate && !git && latestShell > (Number(shell) || 0) ? url : '',
  };
}

const run = promisify(execFile);

/**
 * Put the latest release in this copy, ready for a restart: `git pull` in a copy of the code, otherwise the release's
 * app files from GitHub over these (config/ files that exist are the organizer's and stay). Throws with a message
 * the dashboard can show; until the files are copied, nothing here has changed.
 */
export async function installUpdate({ root = ROOT, version = latest, git = isGit() } = {}) {
  if (!version) throw new Error('no new version known yet');
  if (git) {
    await run('git', ['pull', '--ff-only'], { cwd: root, timeout: 120_000 });
    return;
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-update-'));
  try {
    // shortcut: trusts GitHub's tag over HTTPS (releases carry no signature to check); verify one if releases get signed.
    const r = await fetch(`https://codeload.github.com/${REPO}/tar.gz/refs/tags/v${version}`, { signal: AbortSignal.timeout(180_000) });
    if (!r.ok) throw new Error(`GitHub answered ${r.status}`);
    fs.writeFileSync(path.join(tmp, 'release.tar.gz'), Buffer.from(await r.arrayBuffer()));
    await run('tar', ['-xzf', 'release.tar.gz'], { cwd: tmp, timeout: 120_000 }); // macOS, Linux and Windows 10+ have tar
    const top = fs.readdirSync(tmp).find((d) => d !== 'release.tar.gz') || '';
    const src = path.join(tmp, top);
    let got = '';
    try { got = JSON.parse(fs.readFileSync(path.join(src, 'package.json'), 'utf8')).version; } catch { /* checked below */ }
    if (got !== version) throw new Error(`the download isn't OpenCaptions ${version}`);
    const files = [];
    const walk = (rel) => {
      for (const e of fs.readdirSync(path.join(src, rel), { withFileTypes: true })) {
        const f = path.posix.join(rel, e.name);
        if (e.isDirectory()) walk(f); else files.push(f);
      }
    };
    for (const d of APP_DIRS) if (fs.existsSync(path.join(src, d))) walk(d.slice(0, -1));
    // shortcut: a failure halfway (a full disk) leaves a mix of two versions, fixed by downloading the app again; stage and
    // swap whole folders if that ever happens in practice.
    for (const f of [...APP_FILES, ...files]) {
      const from = path.join(src, f), to = path.join(root, f);
      // Plain files only: a link in the download would copy whatever it points to on this computer into the app.
      if (!fs.existsSync(from) || !fs.lstatSync(from).isFile() || (f.startsWith('config/') && fs.existsSync(to))) continue;
      const data = fs.readFileSync(from);
      // Unchanged files keep their date: start.js reinstalls the libraries only when package-lock.json changed.
      if (fs.existsSync(to) && data.equals(fs.readFileSync(to))) continue;
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.writeFileSync(to, data);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** Test hooks: forget the last answer, or pretend GitHub gave one. */
export const _reset = (v = '') => { latest = v; whatsNew = ''; latestShell = 0; };
