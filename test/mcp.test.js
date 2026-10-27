// AI assistants (MCP, POST /mcp): a stranger gets 401, the crew password lists the read-only tools, and a search finds
// a phrase in a saved transcript with its room, talk and time. AUTH=token, so even 127.0.0.1 needs a password.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 35000 + Math.floor(Math.random() * 2000);
const base = `http://127.0.0.1:${PORT}`;
const CREW = 'crew-password-for-mcp-tests';
let srv, dataDir;

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-mcp-'));
  const d = path.join(dataDir, 'transcripts', 'main', 'talk-keynote');
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'meta.json'), JSON.stringify({ id: 'talk-keynote', stage: 'main', title: 'Opening keynote', speaker: 'Ana Pérez', startedAt: Date.parse('2026-10-07T14:00:00Z'), languages: ['orig'] }));
  fs.writeFileSync(path.join(d, 'captions.jsonl'), [
    { id: 'orig-1', channel: 'orig', lang: 'orig', text: 'Welcome to the summit.', start: 0, end: 2500, final: true },
    { id: 'orig-2', channel: 'orig', lang: 'orig', text: 'Our new bike lanes open in March.', spk: 'Ana Pérez', start: 65000, end: 68000, final: true },
  ].map((x) => JSON.stringify(x)).join('\n') + '\n');
  srv = spawn(process.execPath, ['src/server.js'], {
    env: {
      ...process.env, PORT: String(PORT), ENGINE: 'mock', DATA_DIR: dataDir, SCHEDULE: path.join(dataDir, 's.json'), AUTH: 'token', TZ: 'UTC',
      EVENT_CONFIG: process.env.EVENT_CONFIG || 'test/fixtures/event.json', ADMIN_TOKEN: 'admin-password-for-mcp-tests', CREW_TOKEN: CREW,
      INGEST_TOKEN: 'ingest-password-for-mcp-tests', PUBLIC_URL: '', FALLBACK: '', TUNNEL: '', GEMINI_API_KEY: '',
    },
    stdio: 'ignore',
  });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/healthz`)).ok) break; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 100));
  }
});
after(() => { srv?.kill(); fs.rmSync(dataDir, { recursive: true, force: true }); });

let nextId = 1;
const rpc = (method, params, token = CREW) => fetch(`${base}/mcp`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
});

test('a stranger gets 401', async () => {
  assert.equal((await rpc('tools/list', {}, '')).status, 401);
  assert.equal((await rpc('tools/list', {}, 'a-wrong-password')).status, 401);
});

test('the crew password connects and lists the read-only tools', async () => {
  const init = await (await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } })).json();
  assert.equal(init.result.protocolVersion, '2025-06-18');
  assert.equal(init.result.serverInfo.name, 'opencaptions');
  const { result } = await (await rpc('tools/list', {})).json();
  assert.deepEqual(result.tools.map((t) => t.name), ['list_rooms', 'list_talks', 'get_transcript', 'search_transcripts', 'ask_event', 'event_report']);
});

test('a search finds the phrase in a saved transcript, with room, talk, time and quote', async () => {
  const { result } = await (await rpc('tools/call', { name: 'search_transcripts', arguments: { phrase: 'bike lanes' } })).json();
  const { hits } = JSON.parse(result.content[0].text);
  assert.equal(hits.length, 1);
  assert.deepEqual(
    { room: hits[0].room, talkId: hits[0].talkId, talk: hits[0].talk, at: hits[0].at, time: hits[0].time, quote: hits[0].quote },
    { room: 'Main Stage', talkId: 'talk-keynote', talk: 'Opening keynote', at: '00:01:05', time: '2026-10-07T14:01:05.000Z', quote: 'Our new bike lanes open in March.' },
  );
  const text = await (await rpc('tools/call', { name: 'get_transcript', arguments: { room: 'main', talk: 'talk-keynote' } })).json();
  assert.match(text.result.content[0].text, /bike lanes/);
  // A question to the whole event: the mock engine answers with the moments it found (no model).
  const asked = await (await rpc('tools/call', { name: 'ask_event', arguments: { question: 'When do the bike lanes open?' } })).json();
  const a = JSON.parse(asked.result.content[0].text);
  assert.equal(a.found, true);
  assert.deepEqual([a.sources[0].talkId, a.sources[0].text], ['talk-keynote', 'Our new bike lanes open in March.']);
  const bad = await (await rpc('tools/call', { name: 'get_transcript', arguments: { room: 'nowhere' } })).json();
  assert.equal(bad.result.isError, true);
});

test("a talk's page previews as that talk (this event's transcripts are public), and stays out of search engines", async () => {
  const page = await (await fetch(`${base}/talk.html?stage=main&talk=talk-keynote`)).text();
  assert.match(page, /<meta property="og:title" content="Opening keynote · Ana Pérez"/);
  assert.match(page, /<meta name="robots" content="noindex" \/>/);
  const unknown = await (await fetch(`${base}/talk.html?stage=main&talk=nope`)).text();
  assert.match(unknown, /<meta property="og:title" content="[^"]*Live captions"/, 'an unknown talk: the event\'s own preview');
});
