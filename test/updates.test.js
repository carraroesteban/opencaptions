// "A new version is available" (src/updates.js): the version comparison, and the GitHub check with fetch faked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const { newer, checkNow, updateInfo, installUpdate, CURRENT, _reset } = await import('../src/updates.js');

test('newer compares versions as numbers, with or without the v', () => {
  assert.equal(newer('0.10.0', '0.9.3'), true);
  assert.equal(newer('v1.0.0', '0.99.99'), true);
  assert.equal(newer('0.6.2', '0.6.1'), true);
  assert.equal(newer('0.6.1', '0.6.1'), false);
  assert.equal(newer('v0.6.1', '0.6.1'), false);
  assert.equal(newer('0.6.0', '0.6.1'), false);
  assert.equal(newer('0.7.0-beta.1', '0.7.0'), false); // a pre-release is older than its release
  assert.equal(newer('0.7.0', '0.7.0-beta.1'), true);
  assert.equal(newer('0.7', '0.6.9'), true);
});

/** Fake GitHub: answers with this tag (or throws), and remembers what was asked. */
function fakeGithub(tag, { status = 200, fail = false } = {}) {
  const calls = [];
  globalThis.fetch = /** @type {any} */ (async (url, opts) => {
    calls.push({ url: String(url), headers: opts?.headers, method: opts?.method });
    if (fail) throw new TypeError('fetch failed');
    return new Response(JSON.stringify({ tag_name: tag, html_url: 'https://evil.example' }), { status });
  });
  return calls;
}
const realFetch = globalThis.fetch;
const [maj, min, pat] = CURRENT.split('-')[0].split('.').map(Number);

test('a newer release: a link to its notes and the right download for each install', async (t) => {
  t.after(() => { globalThis.fetch = realFetch; _reset(); });
  _reset();
  const calls = fakeGithub(`v${maj}.${min}.${pat + 1}`);
  assert.equal(await checkNow(), `${maj}.${min}.${pat + 1}`);
  const tag = `v${maj}.${min}.${pat + 1}`;
  // Nothing about this install goes to GitHub: plain GETs of the public release and of the native app it expects.
  assert.deepEqual(calls.map((c) => [c.url, c.method]), [['https://api.github.com/repos/carraroesteban/opencaptions/releases/latest', undefined], [`https://raw.githubusercontent.com/carraroesteban/opencaptions/${tag}/deploy/desktop/shell.json`, undefined]]);
  const base = 'https://github.com/carraroesteban/opencaptions/releases';
  // Started by the app (scripts/start.js): the button, nothing else.
  assert.deepEqual(updateInfo({ platform: 'darwin', docker: false, git: false, supervised: true }), { version: tag.slice(1), notes: `${base}/tag/${tag}`, whatsNew: '', canUpdate: true, command: '', download: '', app: '' });
  assert.equal(updateInfo({ platform: 'darwin', docker: false, git: true, supervised: true }).canUpdate, true); // npm run app: git pull
  // Started some other way: the download for this computer, or a command.
  assert.equal(updateInfo({ platform: 'darwin', docker: false, git: false, supervised: false }).download, `${base}/download/${tag}/OpenCaptions-mac.zip`);
  assert.equal(updateInfo({ platform: 'win32', docker: false, git: false, supervised: false }).download, `${base}/download/${tag}/OpenCaptions-windows.zip`);
  assert.equal(updateInfo({ platform: 'linux', docker: false, git: false, supervised: false }).download, `${base}/tag/${tag}`);
  // A Docker container can't replace itself, even when something restarts it.
  assert.deepEqual(updateInfo({ platform: 'linux', docker: true, git: false, supervised: true }), { version: tag.slice(1), notes: `${base}/tag/${tag}`, whatsNew: '', canUpdate: false, command: 'git pull && docker compose up -d --build', download: '', app: '' });
  assert.equal(updateInfo({ platform: 'darwin', docker: false, git: true, supervised: false }).command, 'git pull && npm ci --omit=dev');
});

test('the same or an older release: nothing to show', async (t) => {
  t.after(() => { globalThis.fetch = realFetch; _reset(); });
  for (const tag of [`v${CURRENT}`, `v${maj}.${min}.${Math.max(0, pat - 1)}`, 'v0.0.1']) {
    _reset();
    fakeGithub(tag);
    await checkNow();
    assert.equal(updateInfo(), null, tag);
  }
});

test('offline, an error or a strange answer: quiet, and what was known stays', async (t) => {
  t.after(() => { globalThis.fetch = realFetch; _reset(); });
  _reset();
  fakeGithub('', { fail: true });
  assert.equal(await checkNow(), '');
  assert.equal(updateInfo(), null);
  fakeGithub('v99.0.0');
  await checkNow();
  fakeGithub('', { fail: true });
  assert.equal(await checkNow(), '99.0.0'); // a failed check doesn't hide a release already found
  fakeGithub('v100.0.0', { status: 403 }); // rate limited
  assert.equal(await checkNow(), '99.0.0');
  _reset();
  fakeGithub('v1.0.0"><script>'); // only a version may reach the dashboard's links
  assert.equal(await checkNow(), '');
});

test('what\'s new, and "download the app once" only when the release needs a newer native app', async (t) => {
  t.after(() => { globalThis.fetch = realFetch; _reset(); });
  _reset();
  const tag = `v${maj}.${min}.${pat + 1}`;
  globalThis.fetch = /** @type {any} */ (async (url) => new Response(JSON.stringify(String(url).endsWith('shell.json') ? { version: 2 } : { tag_name: tag, body: '- Check for Updates in the app menu' })));
  await checkNow();
  const app = { platform: 'darwin', docker: false, git: false, supervised: true };
  const mac = `https://github.com/carraroesteban/opencaptions/releases/download/${tag}/OpenCaptions-mac.zip`;
  assert.equal(updateInfo({ ...app, shell: '2' }).whatsNew, '- Check for Updates in the app menu');
  assert.equal(updateInfo({ ...app, shell: '2' }).app, ''); // this app is the one the release expects
  assert.equal(updateInfo({ ...app, shell: '1' }).app, mac); // an older app: the files update, and the app is offered once
  assert.equal(updateInfo({ ...app, shell: undefined }).app, mac); // apps from before OC_SHELL
  assert.equal(updateInfo({ ...app, shell: '1' }).canUpdate, true);
  assert.equal(updateInfo({ ...app, git: true, shell: undefined }).app, ''); // npm run app from a clone has no native app
  // The release has no shell.json (GitHub answers 404): nothing to download.
  _reset();
  globalThis.fetch = /** @type {any} */ (async (url) => (String(url).endsWith('shell.json') ? new Response('404', { status: 404 }) : new Response(JSON.stringify({ tag_name: tag }))));
  await checkNow();
  assert.equal(updateInfo({ ...app, shell: undefined }).app, '');
});

test('the Mac app, the Windows launcher and shell.json say the same native app version', () => {
  const root = path.resolve(import.meta.dirname, '..');
  const want = String(JSON.parse(fs.readFileSync(path.join(root, 'deploy/desktop/shell.json'), 'utf8')).version);
  assert.equal(fs.readFileSync(path.join(root, 'deploy/desktop/macos/OpenCaptions.swift'), 'utf8').match(/let shellVersion = "(\d+)"/)?.[1], want);
  assert.equal(fs.readFileSync(path.join(root, 'deploy/desktop/windows/Launcher.cs'), 'utf8').match(/const string ShellVersion = "(\d+)"/)?.[1], want);
});

/** A release as GitHub serves it: opencaptions-<version>/… in a .tar.gz. */
function releaseTarball(version, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-release-'));
  const top = path.join(dir, `opencaptions-${version}`);
  for (const [f, text] of Object.entries({ 'package.json': JSON.stringify({ version }), ...files })) {
    fs.mkdirSync(path.dirname(path.join(top, f)), { recursive: true });
    fs.writeFileSync(path.join(top, f), text);
  }
  execFileSync('tar', ['-czf', 'r.tar.gz', `opencaptions-${version}`], { cwd: dir });
  const data = fs.readFileSync(path.join(dir, 'r.tar.gz'));
  fs.rmSync(dir, { recursive: true, force: true });
  return data;
}

test('Update now: the new app files go over this copy, and the organizer\'s config and data stay', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-app-'));
  t.after(() => { globalThis.fetch = realFetch; fs.rmSync(root, { recursive: true, force: true }); });
  const put = (f, text) => { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), text); };
  put('package.json', JSON.stringify({ version: '0.6.1' }));
  put('package-lock.json', 'same lock');
  put('src/server.js', 'old server');
  put('config/event.json', '{"eventName":"Mine"}');
  put('data/secrets.json', '{"adminToken":"x"}');
  put('.env', 'GEMINI_API_KEY=k');
  const old = new Date(Date.now() - 3600_000);
  fs.utimesSync(path.join(root, 'package-lock.json'), old, old);
  const tarball = releaseTarball('9.9.9', {
    'package-lock.json': 'same lock', 'src/server.js': 'new server', 'src/new.js': 'a new file', 'public/x.html': 'page',
    'scripts/start.js': 'starter', 'scripts/loadtest.js': 'a dev tool', 'docs/a.md': 'docs', 'test/a.test.js': 'test',
    'config/event.json': '{}', 'config/brand-new.json': '{"new":true}', '.env': 'GEMINI_API_KEY=theirs', 'data/secrets.json': '{}',
  });
  const asked = [];
  globalThis.fetch = /** @type {any} */ (async (url) => { asked.push(String(url)); return new Response(tarball); });
  await installUpdate({ root, version: '9.9.9', git: false });
  assert.deepEqual(asked, ['https://codeload.github.com/carraroesteban/opencaptions/tar.gz/refs/tags/v9.9.9']);
  const read = (f) => (fs.existsSync(path.join(root, f)) ? fs.readFileSync(path.join(root, f), 'utf8') : null);
  assert.equal(JSON.parse(read('package.json')).version, '9.9.9');
  assert.equal(read('src/server.js'), 'new server');
  assert.equal(read('src/new.js'), 'a new file');
  assert.equal(read('public/x.html'), 'page');
  assert.equal(read('scripts/start.js'), 'starter');
  assert.equal(read('scripts/loadtest.js'), null); // only what the desktop app ships
  assert.equal(read('docs/a.md'), null);
  assert.equal(read('test/a.test.js'), null);
  assert.equal(read('config/event.json'), '{"eventName":"Mine"}'); // the organizer's
  assert.equal(read('config/brand-new.json'), '{"new":true}');
  assert.equal(read('.env'), 'GEMINI_API_KEY=k');
  assert.equal(read('data/secrets.json'), '{"adminToken":"x"}');
  // An unchanged lock file keeps its date, so start.js doesn't reinstall the libraries for nothing.
  assert.ok(fs.statSync(path.join(root, 'package-lock.json')).mtimeMs < Date.now() - 3000_000);
});

test('Update now: a download that is not the expected version, or GitHub failing, changes nothing', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-app-'));
  t.after(() => { globalThis.fetch = realFetch; fs.rmSync(root, { recursive: true, force: true }); });
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src/server.js'), 'old server');
  const wrong = releaseTarball('9.9.8', { 'src/server.js': 'other server' });
  globalThis.fetch = /** @type {any} */ (async () => new Response(wrong));
  await assert.rejects(installUpdate({ root, version: '9.9.9', git: false }), /isn't OpenCaptions 9.9.9/);
  globalThis.fetch = /** @type {any} */ (async () => new Response('Not Found', { status: 404 }));
  await assert.rejects(installUpdate({ root, version: '9.9.9', git: false }), /GitHub answered 404/);
  globalThis.fetch = /** @type {any} */ (async () => { throw new TypeError('fetch failed'); });
  await assert.rejects(installUpdate({ root, version: '9.9.9', git: false }), /fetch failed/);
  assert.equal(fs.readFileSync(path.join(root, 'src/server.js'), 'utf8'), 'old server');
});
