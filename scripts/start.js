#!/usr/bin/env node
// What the desktop downloads (the Mac app, "Start OpenCaptions.exe" on Windows) and `npm run app` run: installs what's
// missing the first time, starts the server and opens the dashboard in the browser. If OpenCaptions is already running,
// it only opens the dashboard. Uses Node's built-in modules only (and src/tty.js, which has no dependencies): it runs
// before `npm install`.
//
//   node scripts/start.js            (also: npm run app)
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as tty from '../src/tty.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const win = process.platform === 'win32';

function openUrl(url) {
  const [cmd, args] = process.platform === 'darwin' ? ['open', [url]] : win ? ['cmd', ['/c', 'start', '""', url]] : ['xdg-open', [url]];
  try { spawn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true }).unref(); } catch { /* the address is printed anyway */ }
}

if (process.stdout.isTTY) process.stdout.write('\x1b]0;OpenCaptions\x07'); // the window's title
console.log(`\n${tty.title()}\n`);

const major = Number(process.versions.node.split('.')[0]);
if (major < 20) {
  tty.fail(`OpenCaptions needs Node.js 20 or later (this computer has ${process.versions.node}).`);
  console.log('  Opening the download page: install the LTS version, then start OpenCaptions again.\n');
  openUrl('https://nodejs.org/en/download');
  process.exit(1);
}

// First time (or after an update): install the libraries. node_modules/.package-lock.json is npm's own record.
const lock = path.join(ROOT, 'package-lock.json');
const installed = path.join(ROOT, 'node_modules', '.package-lock.json');
if (!fs.existsSync(installed) || (fs.existsSync(lock) && fs.statSync(lock).mtimeMs > fs.statSync(installed).mtimeMs)) {
  const sp = tty.spinner('Installing what OpenCaptions needs (the first time only, about a minute)');
  const r = await new Promise((resolve) => {
    const p = spawn(win ? 'npm.cmd' : 'npm', ['install', '--omit=dev', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: ROOT, shell: win, windowsHide: true });
    let log = '';
    p.stdout.on('data', (d) => { log += d; });
    p.stderr.on('data', (d) => { log += d; });
    p.on('error', (e) => resolve({ code: 1, log: e.message }));
    p.on('close', (code) => resolve({ code, log }));
  });
  if (r.code !== 0) {
    sp.fail('The installation didn\'t finish. Check this computer\'s internet connection and start OpenCaptions again.');
    console.log(tty.c.gray(r.log.trim().split('\n').slice(-15).map((l) => `  ${l}`).join('\n')));
    process.exit(1);
  }
  sp.succeed('Installed what OpenCaptions needs');
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
  tty.ok(`OpenCaptions is already running. Opening ${tty.c.bold(dashboard)}\n`);
  openUrl(dashboard);
  process.exit(0);
}

tty.info(`Keep this window open while you use OpenCaptions. To stop it, close the window ${tty.c.gray('(or press Ctrl+C)')}.`);
const server = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js'), '--open', ...process.argv.slice(2)], { cwd: ROOT, stdio: 'inherit' });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.kill(/** @type {NodeJS.Signals} */ (sig)));
server.on('exit', (code) => process.exit(code ?? 0));
