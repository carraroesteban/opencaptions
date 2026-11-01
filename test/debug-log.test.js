// LOG_LEVEL=debug (src/stage.js, src/engines/gemini.js): what a room hears and sends and what the AI answers, in the
// server's log; nothing of it without the setting.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.ADMIN_TOKEN ||= 't';
process.env.INGEST_TOKEN ||= 't';
const { GeminiEngine, _setClient } = await import('../src/engines/gemini.js');
const { Stage } = await import('../src/stage.js');
const { config } = await import('../src/config.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Speech-loud audio into a simulated room for a while; returns the debug lines it logged and printed. */
async function room(debug) {
  config.engine = 'mock';
  config.logDebug = debug;
  const st = new Stage({ id: 'dbg', name: 'dbg', source: 'en', targets: ['es'], vocabulary: [], title: '' }, { glossary: { apply: (t) => t, vocabulary: () => [] }, store: { openTalk() {}, append() {} } });
  const logged = [], printed = [];
  st.on('log', (e) => e.level === 'debug' && logged.push(e.msg));
  const log = console.log;
  console.log = (s) => printed.push(String(s));
  try {
    const chunk = Buffer.alloc(3200);
    for (let i = 0; i < 1600; i++) chunk.writeInt16LE(Math.round(8000 * Math.sin(i / 5)), i * 2);
    for (let i = 0; i < 40; i++) { st.pushAudio(chunk); await sleep(50); }
    await sleep(1500);
  } finally { console.log = log; st.destroy(); }
  return { logged, printed: printed.filter((s) => s.includes('debug:')) };
}

test('debug on: the room says when audio goes to the AI and what came back, in the log and the dashboard', async () => {
  const { logged, printed } = await room(true);
  assert.ok(logged.some((m) => /^speech at -\d+ dBFS \(threshold -\d+ dBFS\) → audio to the AI again/.test(m)), JSON.stringify(logged));
  assert.ok(logged.some((m) => /^(heard|→ es)/.test(m)), `a finished caption: ${JSON.stringify(logged)}`);
  assert.ok(printed.some((s) => s.startsWith('[dbg] debug: speech at')), JSON.stringify(printed));
});

test('debug off: none of it', async () => {
  const { logged, printed } = await room(false);
  assert.ok(!logged.some((m) => /^(speech at|heard|→ )/.test(m)), JSON.stringify(logged));
  assert.deepEqual(printed, []);
});

test('Gemini: each connection says what it asked for and why it closed', async () => {
  _setClient({ live: { connect: async ({ callbacks }) => { setTimeout(() => callbacks.onclose({ code: 1006, reason: '' }), 5); return { close() {}, sendRealtimeInput() {} }; } } });
  const e = new GeminiEngine({ label: 't', target: 'es', vocabulary: [] });
  const lines = [];
  e.on('debug', (m) => lines.push(m));
  e.on('error', () => {});
  e.start();
  await sleep(100);
  e.stop();
  assert.match(lines[0], /^connecting to \S+ \(new session, speech translated to es, 'full' setup\)$/);
  assert.match(lines[1], /^connection closed \(1006\) before it was ready$/);
});
