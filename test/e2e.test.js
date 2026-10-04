// End-to-end: the real server with Gemini replaced by a recording (test/fixtures/talk-en.json, made with
// scripts/record-e2e.js). Audio goes in through the ingest WebSocket like on event day; the test then checks what
// the audience receives, what's stored, the exports, the summary and the question. No API key, no network.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const SPEED = 3; // replay the recorded session 3× faster than real time
const PORT = 21000 + Math.floor(Math.random() * 2000);
const base = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let srv, dataDir;
const finals = { orig: [], es: [], en: [] };
const partials = { orig: 0, es: 0, en: 0 };

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-e2e-'));
  srv = spawn(process.execPath, ['src/server.js'], {
    env: { ...process.env, PORT: String(PORT), ENGINE: 'gemini', GEMINI_API_KEY: 'replay', OC_REPLAY: 'test/fixtures/talk-en.json', OC_REPLAY_SPEED: String(SPEED), DATA_DIR: dataDir, ADMIN_TOKEN: 't', INGEST_TOKEN: 't', PUBLIC_URL: '', FALLBACK: '' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/healthz`)).ok) break; } catch { /* starting */ }
    await sleep(100);
  }

  const view = new WebSocket(`ws://127.0.0.1:${PORT}/ws/view?stage=main&langs=orig,es,en`);
  view.on('message', (d) => {
    const m = JSON.parse(d.toString());
    if (m.type !== 'caption' || !(m.channel in finals)) return;
    if (m.final) finals[m.channel].push(m.text); else partials[m.channel]++;
  });
  await new Promise((r) => view.once('open', r));

  // The same 30 s of audio the fixture was recorded with, sent SPEED× faster.
  const pcm = fs.readFileSync('samples/talk-en.wav').subarray(44, 44 + 30 * 32000);
  const ingest = new WebSocket(`ws://127.0.0.1:${PORT}/ws/ingest?stage=main&kind=cli&label=e2e`, { headers: { authorization: 'Bearer t' } });
  await new Promise((r) => ingest.once('open', r));
  for (let o = 0; o < pcm.length; o += 3200) { ingest.send(pcm.subarray(o, o + 3200)); await sleep(100 / SPEED); }
  // Wait for the last recorded sentence to reach both caption languages.
  for (let i = 0; i < 200 && !(finals.orig.join(' ').includes('training') && finals.es.join(' ').match(/capacitaci/)); i++) await sleep(100);
  ingest.close();
  view.close();
});

after(() => {
  srv?.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const h = { authorization: 'Bearer t', 'content-type': 'application/json' };

test('e2e: the audience gets live captions in the original and in translation', () => {
  const orig = finals.orig.join(' ');
  const es = finals.es.join(' ');
  assert.match(orig, /welcome to Horizon Summit/i);
  assert.match(orig, /Hiroshi Tanaka/);
  assert.match(orig, /tablet, a good microphone/);
  assert.match(es, /Hola a todos/);
  assert.match(es, /telesalud|telemedicina/);
  assert.match(es, /tableta|tablet/);
  assert.match(finals.en.join(' '), /welcome to Horizon Summit/i, 'English is the spoken language: a passthrough of the transcript');
  assert.ok(partials.orig > 0, 'provisional words arrive before each sentence is final');
  assert.ok(finals.orig.length >= 4 && finals.es.length >= 4, `sentences: ${finals.orig.length} / ${finals.es.length}`);
});

test('e2e: the dashboard shows the room live, with latency', async () => {
  const s = await (await fetch(`${base}/api/status`, { headers: h })).json();
  const main = s.stages.find((x) => x.id === 'main');
  assert.equal(s.engine, 'gemini');
  assert.ok(main.latency?.asr > 0, 'transcription latency was measured');
  assert.ok(main.engines.length >= 1);
});

test('e2e: the transcript is stored and exports as SRT and VTT', async () => {
  const talks = await (await fetch(`${base}/api/stages/main/talks`, { headers: h })).json();
  assert.ok(talks.length >= 1);
  const t = await (await fetch(`${base}/api/stages/main/talks/${talks[0].id}`, { headers: h })).json();
  assert.ok(t.segments >= 4, `stored segments: ${t.segments}`);
  const srt = await (await fetch(`${base}/api/stages/main/export.srt?lang=es&talk=${talks[0].id}`, { headers: h })).text();
  assert.match(srt, /^1\r?\n\d\d:\d\d:\d\d,\d{3} --> \d\d:\d\d:\d\d,\d{3}/);
  assert.match(srt, /Hola a todos/);
  const vtt = await (await fetch(`${base}/api/stages/main/export.vtt?lang=orig&talk=${talks[0].id}`, { headers: h })).text();
  assert.match(vtt, /^WEBVTT/);
});

test('e2e: "What did I miss?" and questions use the AI', async () => {
  const sum = await (await fetch(`${base}/api/stages/main/summary?lang=es&scope=full`, { headers: h })).json();
  assert.equal(sum.ai, true, 'answered by the (recorded) model, not the extractive fallback');
  assert.ok(sum.headline.length > 5 && sum.bullets.length > 0);
  const ask = await (await fetch(`${base}/api/stages/main/ask`, { method: 'POST', headers: h, body: JSON.stringify({ lang: 'en', question: 'What did each clinic get?' }) })).json();
  assert.equal(ask.ai, true);
  assert.match(ask.answer, /tablet/i);
});
