#!/usr/bin/env node
// The downloads for organizers, attached to every GitHub release (.github/workflows/release.yml):
//   dist/OpenCaptions-mac.zip      OpenCaptions/OpenCaptions.app (the app files inside) + Read me.txt
//   dist/OpenCaptions-windows.zip  OpenCaptions/Start OpenCaptions.exe + Read me.txt + app/
// Only what runs the event goes in: no tests, docs, website or developer tools. The libraries are installed on the
// first start (they include a platform-specific ffmpeg).
//
//   node scripts/package-desktop.js [--exe "path/to/Start OpenCaptions.exe"]   (Windows only with --exe)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DESK = path.join(ROOT, 'deploy', 'desktop');
const DIST = path.join(ROOT, 'dist');
const exeArg = process.argv.indexOf('--exe');
const exe = exeArg > 0 ? path.resolve(process.argv[exeArg + 1]) : '';
const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

// What the app needs at run time: files git would publish (nothing ignored: no .env, data/ or local/).
const RUNTIME_SCRIPTS = ['start', 'setup', 'local', 'local-asr-server', 'check-gemini', 'check-local', 'feed', 'agent', 'subtitle'].map((s) => `scripts/${s}.js`);
const FILES = ['package.json', 'package-lock.json', 'LICENSE', 'README.md', 'CHANGELOG.md', '.env.example', ...RUNTIME_SCRIPTS];
const DIRS = ['src/', 'public/', 'config/', 'samples/'];
const tracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
const appFiles = tracked.filter((f) => FILES.includes(f) || DIRS.some((d) => f.startsWith(d)));
for (const f of FILES) if (!appFiles.includes(f)) throw new Error(`missing from git: ${f}`);

const copyApp = (dest) => {
  for (const f of appFiles) {
    fs.mkdirSync(path.dirname(path.join(dest, f)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, f), path.join(dest, f));
  }
};
/** Zip a folder keeping Unix permissions (the app's launcher must stay executable). */
const zip = (cwd, name, out) => {
  fs.rmSync(out, { force: true });
  if (process.platform === 'win32') return execFileSync('tar', ['-a', '-c', '-f', out, name], { cwd }); // Windows 10+ tar writes ZIPs (no Unix permissions: the release is packaged on Linux)
  try { execFileSync('zip', ['-q', '-r', '-y', '-X', out, name], { cwd }); } catch (e) {
    if (process.platform !== 'darwin') throw e;
    execFileSync('ditto', ['-c', '-k', '--keepParent', path.join(cwd, name), out]);
  }
};

fs.rmSync(DIST, { recursive: true, force: true });

// macOS: one app, with the app files inside.
const mac = path.join(DIST, 'mac', 'OpenCaptions');
const contents = path.join(mac, 'OpenCaptions.app', 'Contents');
fs.mkdirSync(path.join(contents, 'MacOS'), { recursive: true });
fs.mkdirSync(path.join(contents, 'Resources'), { recursive: true });
fs.writeFileSync(path.join(contents, 'Info.plist'), fs.readFileSync(path.join(DESK, 'macos', 'Info.plist'), 'utf8').replaceAll('%VERSION%', version));
fs.copyFileSync(path.join(DESK, 'macos', 'OpenCaptions'), path.join(contents, 'MacOS', 'OpenCaptions'));
fs.chmodSync(path.join(contents, 'MacOS', 'OpenCaptions'), 0o755);
fs.copyFileSync(path.join(DESK, 'OpenCaptions.icns'), path.join(contents, 'Resources', 'OpenCaptions.icns'));
copyApp(path.join(contents, 'Resources', 'app'));
fs.copyFileSync(path.join(DESK, 'macos', 'Read me.txt'), path.join(mac, 'Read me.txt'));
zip(path.join(DIST, 'mac'), 'OpenCaptions', path.join(DIST, 'OpenCaptions-mac.zip'));
console.log(`✓ dist/OpenCaptions-mac.zip (${version}, ${appFiles.length} app files)`);

// Windows: the launcher next to an app folder.
if (exe) {
  const win = path.join(DIST, 'windows', 'OpenCaptions');
  copyApp(path.join(win, 'app'));
  fs.copyFileSync(path.join(DESK, 'windows', 'Start OpenCaptions.bat'), path.join(win, 'app', 'Start OpenCaptions.bat'));
  fs.copyFileSync(exe, path.join(win, 'Start OpenCaptions.exe'));
  fs.writeFileSync(path.join(win, 'Read me.txt'), fs.readFileSync(path.join(DESK, 'windows', 'Read me.txt'), 'utf8').replace(/\r?\n/g, '\r\n'));
  zip(path.join(DIST, 'windows'), 'OpenCaptions', path.join(DIST, 'OpenCaptions-windows.zip'));
  console.log('✓ dist/OpenCaptions-windows.zip');
} else {
  console.log('· Windows skipped: pass --exe with the compiled launcher (the release workflow builds it on Windows)');
}
