// "Run it on this computer": the server prepares the local AI itself (src/local/mode.js, src/local/setup.js) and
// switches rooms to it. The speech server and Ollama are fakes here, so nothing is downloaded.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { LocalMode } from '../src/local/mode.js';

const quietUi = () => {};
const until = async (check, ms = 5000) => {
  for (const t0 = Date.now(); Date.now() - t0 < ms; await new Promise((r) => setTimeout(r, 50))) if (await check()) return;
  throw new Error('timed out');
};

test('captions first, translations once Ollama shows up', async (t) => {
  t.mock.method(console, 'log', quietUi);
  const applied = [];
  let ollama = false;
  const m = new LocalMode({
    retryMs: 20,
    apply: (part) => applied.push(Object.keys(part)[0]),
    prepareSpeech: async () => ({ url: 'http://127.0.0.1:1/inference', api: 'whispercpp', label: 'whisper small' }),
    prepareText: async () => {
      if (!ollama) throw Object.assign(new Error('no ollama'), { code: 'no-ollama' });
      return { url: 'http://127.0.0.1:2', model: 'gemma3:4b', mtModel: '' };
    },
  });
  await m.start();
  assert.equal(m.status().state, 'ready');
  assert.deepEqual(applied, ['speech']);
  await until(() => m.status().text === 'missing');
  ollama = true; // the person installs and opens Ollama
  await until(() => m.status().text === 'ready');
  assert.deepEqual(applied, ['speech', 'text']);
  await m.start(); // a second click changes nothing
  assert.deepEqual(applied, ['speech', 'text']);
  m.reset();
});

test('a failed speech setup can be tried again', async (t) => {
  t.mock.method(console, 'log', quietUi);
  let fail = true;
  const m = new LocalMode({
    apply: () => {},
    prepareSpeech: async () => { if (fail) throw new Error('download interrupted'); return { url: 'u', api: '', label: 'w' }; },
    prepareText: async () => ({ url: 'x', model: 'm', mtModel: '' }),
  });
  assert.equal((await m.start()).state, 'error');
  assert.match(m.status().error, /interrupted/);
  fail = false;
  assert.equal((await m.start()).state, 'ready');
});

test('the dashboard button switches a server without a key to this computer, with download progress', async (t) => {
  // A fake speech server and a fake Ollama whose "download" of the model reports progress.
  const pulls = [];
  const fake = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      if (req.url === '/api/tags') return res.end(JSON.stringify({ models: pulls.length ? [{ name: 'gemma3:4b' }] : [] }));
      if (req.url === '/api/pull') {
        pulls.push(JSON.parse(body).model);
        res.write(`${JSON.stringify({ status: 'pulling manifest' })}\n`);
        let n = 0;
        const step = () => {
          if (n > 4) { res.end(`${JSON.stringify({ status: 'success' })}\n`); return; }
          res.write(`${JSON.stringify({ status: 'pulling', total: 4e9, completed: n++ * 1e9 })}\n`);
          setTimeout(step, 150);
        };
        return step();
      }
      if (req.url === '/api/chat') return res.end(JSON.stringify({ message: { content: 'OK' } }));
      res.end('{}');
    });
  });
  await new Promise((r) => fake.listen(0, '127.0.0.1', r));
  const fakeUrl = `http://127.0.0.1:${/** @type {any} */ (fake.address()).port}`;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-localmode-'));
  fs.copyFileSync('test/fixtures/glossary.json', path.join(dataDir, 'glossary.json')); // tests never write to config/
  const PORT = 20000 + Math.floor(Math.random() * 2000);
  const base = `http://127.0.0.1:${PORT}`;
  const srv = spawn(process.execPath, ['src/server.js'], {
    env: {
      ...process.env, PORT: String(PORT), DATA_DIR: dataDir, LOCAL_DIR: path.join(dataDir, 'local'), SCHEDULE: path.join(dataDir, 'schedule.json'), GLOSSARY: path.join(dataDir, 'glossary.json'),
      ADMIN_TOKEN: 't', GEMINI_API_KEY: '', ENGINE: '', LOCAL_ASR_URL: `${fakeUrl}/inference`, LOCAL_LLM_URL: fakeUrl, LOCAL_LLM: '',
    },
    stdio: 'ignore',
  });
  t.after(() => { srv.kill(); fake.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });
  const api = async (method, url) => (await fetch(base + url, { method, headers: { authorization: 'Bearer t' } })).json();
  await until(async () => { try { return (await fetch(`${base}/healthz`)).ok; } catch { return false; } }, 10000);

  assert.equal((await api('GET', '/api/local')).engine, 'mock');
  await api('POST', '/api/local/start');
  const seen = [];
  await until(async () => { const s = await api('GET', '/api/local'); seen.push(s); return s.text === 'ready'; }, 10000);
  assert.ok(seen.some((s) => s.engine === 'local' && s.text === 'working' && s.total === 4e9 && s.done > 0), 'the model download shows its progress');
  assert.deepEqual(pulls, ['gemma3:4b']);
  const snap = await api('GET', '/api/setup');
  assert.equal(snap.engine, 'local');
  // Remembered: the next start uses this computer again.
  assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, 'setup.json'), 'utf8')).localMode, true);
});
