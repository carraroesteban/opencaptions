#!/usr/bin/env node
// What "Start OpenCaptions" (the double-click file for macOS and Windows) runs: installs what's missing the first
// time, starts the server and opens the dashboard in the browser. If OpenCaptions is already running, it only opens
// the dashboard. Uses Node's built-in modules only, because it runs before `npm install`.
//
//   node scripts/start.js            (also: npm run app)
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const say = (s = '') => console.log(s);
const win = process.platform === 'win32';

function openUrl(url) {
  const [cmd, args] = process.platform === 'darwin' ? ['open', [url]] : win ? ['cmd', ['/c', 'start', '""', url]] : ['xdg-open', [url]];
  try { spawn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true }).unref(); } catch { /* the address is printed anyway */ }
}

say('\n  OpenCaptions\n');

const major = Number(process.versions.node.split('.')[0]);
if (major < 20) {
  say(`  OpenCaptions needs Node.js 20 or later (this computer has ${process.versions.node}).`);
  say('  Opening the download page: install the LTS version, then start OpenCaptions again.\n');
  openUrl('https://nodejs.org/en/download');
  process.exit(1);
}

// First time (or after an update): install the libraries. node_modules/.package-lock.json is npm's own record.
const lock = path.join(ROOT, 'package-lock.json');
const installed = path.join(ROOT, 'node_modules', '.package-lock.json');
if (!fs.existsSync(installed) || (fs.existsSync(lock) && fs.statSync(lock).mtimeMs > fs.statSync(installed).mtimeMs)) {
  say('  Installing what OpenCaptions needs (the first time only, about a minute)…\n');
  const r = spawnSync(win ? 'npm.cmd' : 'npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], { cwd: ROOT, stdio: 'inherit', shell: win });
  if (r.status !== 0) {
    say('\n  The installation didn\'t finish. Check this computer\'s internet connection and start OpenCaptions again.');
    process.exit(1);
  }
  say('');
}

// The port: PORT in the environment or in .env, else 8080.
const envFile = path.join(ROOT, '.env');
const fromEnvFile = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8').match(/^PORT=(\d+)/m)?.[1] : '';
const port = Number(process.env.PORT || fromEnvFile || 8080);
const dashboard = `http://localhost:${port}/admin.html`;

// Started twice? Just show the dashboard of the one already running.
/** @type {any} */
const running = await fetch(`http://127.0.0.1:${port}/healthz`, { signal: AbortSignal.timeout(1500) }).then((r) => r.json()).catch(() => null);
if (running?.ok) {
  say(`  OpenCaptions is already running. Opening ${dashboard}\n`);
  openUrl(dashboard);
  process.exit(0);
}

say('  Keep this window open while you use OpenCaptions. To stop it, close the window (or press Ctrl+C).\n');
const server = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js'), '--open', ...process.argv.slice(2)], { cwd: ROOT, stdio: 'inherit' });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.kill(/** @type {NodeJS.Signals} */ (sig)));
server.on('exit', (code) => process.exit(code ?? 0));
