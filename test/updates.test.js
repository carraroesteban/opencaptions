// "A new version is available" (src/updates.js): the version comparison, and the GitHub check with fetch faked.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { newer, checkNow, updateInfo, CURRENT, _reset } = await import('../src/updates.js');

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
  // Nothing about this install goes to GitHub: a plain GET of the public endpoint.
  assert.deepEqual(calls, [{ url: 'https://api.github.com/repos/carraroesteban/opencaptions/releases/latest', headers: { accept: 'application/vnd.github+json' }, method: undefined }]);
  const tag = `v${maj}.${min}.${pat + 1}`;
  const base = 'https://github.com/carraroesteban/opencaptions/releases';
  const mac = updateInfo({ platform: 'darwin', docker: false, git: false });
  assert.deepEqual(mac, { version: tag.slice(1), notes: `${base}/tag/${tag}`, command: '', download: `${base}/download/${tag}/OpenCaptions-mac.zip` });
  assert.equal(updateInfo({ platform: 'win32', docker: false, git: false }).download, `${base}/download/${tag}/OpenCaptions-windows.zip`);
  assert.equal(updateInfo({ platform: 'linux', docker: false, git: false }).download, `${base}/tag/${tag}`);
  assert.deepEqual(updateInfo({ platform: 'linux', docker: true, git: false }), { version: tag.slice(1), notes: `${base}/tag/${tag}`, command: 'git pull && docker compose up -d --build', download: '' });
  assert.equal(updateInfo({ platform: 'darwin', docker: false, git: true }).command, 'git pull && npm ci --omit=dev');
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
