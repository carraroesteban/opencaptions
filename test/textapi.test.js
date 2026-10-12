// Another AI service for translations, summaries and questions (src/textapi.js), with fetch faked: what is sent, the
// check before saving, the fields some services refuse, and that the key is stored but never shown back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-textapi-'));
const { config } = await import('../src/config.js');
const { textApiOn, textApiInfo, checkTextApi, saveTextApi, textChat } = await import('../src/textapi.js');
const { translateText } = await import('../src/translate.js');

const realFetch = globalThis.fetch;
const SERVICE = { url: 'https://api.example.com/v1', key: 'sk-test-1234', model: 'small-model' };

/** Fake service: answers each request with the next reply (a status and a body, or a thrown error). */
function fakeService(...replies) {
  const calls = [];
  globalThis.fetch = /** @type {any} */ (async (url, opts) => {
    calls.push({ url: String(url), headers: opts.headers, body: JSON.parse(opts.body) });
    const r = replies.shift() ?? replies.at(-1);
    if (r instanceof Error) throw r;
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  });
  return calls;
}
const answer = (content) => ({ body: { choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 3 } } });

test('cloud translations go to the service: its chat endpoint, the key, the model', async (t) => {
  t.after(() => { globalThis.fetch = realFetch; config.textApi = { url: '', key: '', model: '', source: '' }; config.engine = 'mock'; });
  config.engine = 'gemini';
  config.textApi = { ...SERVICE, source: 'env' };
  assert.equal(textApiOn(), true);
  const calls = fakeService(answer('"Hola a todos"'));
  assert.equal(await translateText({ text: 'Hello everyone', from: 'en', to: 'es' }), 'Hola a todos');
  assert.equal(calls[0].url, 'https://api.example.com/v1/chat/completions');
  assert.equal(calls[0].headers.authorization, 'Bearer sk-test-1234');
  assert.equal(calls[0].body.model, 'small-model');
  assert.match(calls[0].body.messages[1].content, /Hello everyone/);
  // Local mode keeps its own text model: the service is only for the cloud.
  config.engine = 'local';
  assert.equal(textApiOn(), false);
});

test('fields a service refuses are dropped or renamed once, then remembered', async (t) => {
  t.after(() => { globalThis.fetch = realFetch; config.textApi = { url: '', key: '', model: '', source: '' }; config.engine = 'mock'; });
  config.engine = 'gemini';
  config.textApi = { ...SERVICE, url: 'https://reasoning.example.com/v1', source: 'dashboard' };
  const calls = fakeService(
    { status: 400, body: { error: { message: "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead." } } },
    { status: 400, body: { error: { message: "Unsupported value: 'temperature' does not support 0.2 with this model." } } },
    answer('{"summary":"ok"}'),
  );
  assert.equal(await textChat({ system: 's', user: 'u', json: true, maxTokens: 50 }), '{"summary":"ok"}');
  assert.equal(calls.length, 3);
  assert.deepEqual(Object.keys(calls[2].body).sort(), ['max_completion_tokens', 'messages', 'model', 'response_format', 'stream']);
  assert.equal(calls[2].body.max_completion_tokens, 50);
  fakeService(answer('again'));
  await textChat({ system: 's', user: 'u' });
  const next = fakeService(answer('x'));
  await textChat({ system: 's', user: 'u' });
  assert.equal(next[0].body.max_tokens, undefined); // remembered: no second refusal
  assert.equal(next[0].body.temperature, undefined);
});

test('the check before saving: ok, quota, a wrong key, a wrong model, offline', async (t) => {
  t.after(() => { globalThis.fetch = realFetch; });
  fakeService(answer('OK'));
  assert.deepEqual(await checkTextApi(SERVICE), { ok: true, code: 'ok' });
  fakeService({ status: 429, body: { error: { message: 'You exceeded your current quota' } } });
  assert.deepEqual(await checkTextApi(SERVICE), { ok: true, code: 'quota', detail: 'You exceeded your current quota' });
  fakeService({ status: 401, body: { error: { message: 'Incorrect API key provided' } } });
  assert.equal((await checkTextApi(SERVICE)).code, 'invalid');
  fakeService({ status: 404, body: { error: { message: 'The model `nope` does not exist' } } });
  assert.equal((await checkTextApi(SERVICE)).code, 'model');
  fakeService(new TypeError('fetch failed'));
  assert.equal((await checkTextApi(SERVICE)).code, 'offline');
});

test('saved in data/secrets.json, never shown back; removing it goes back to Gemini', () => {
  saveTextApi(SERVICE);
  const saved = JSON.parse(fs.readFileSync(path.join(config.dataDir, 'secrets.json'), 'utf8'));
  assert.deepEqual(JSON.parse(saved.textApi), SERVICE);
  assert.deepEqual(textApiInfo(), { url: SERVICE.url, model: 'small-model', last4: '1234', source: 'dashboard' });
  assert.ok(!JSON.stringify(textApiInfo()).includes('sk-test'));
  saveTextApi(null);
  assert.equal(JSON.parse(fs.readFileSync(path.join(config.dataDir, 'secrets.json'), 'utf8')).textApi, undefined);
  assert.equal(config.textApi.url, process.env.TEXT_API_URL || '');
});
