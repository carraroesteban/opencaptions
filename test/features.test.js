// Audience AI (summary / ask) and agenda parsing.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.ADMIN_TOKEN ||= 't';
process.env.INGEST_TOKEN ||= 't';
const { config } = await import('../src/config.js');
const assist = await import('../src/assist.js');
const { parseSchedule, Schedule } = await import('../src/schedule.js');

const segs = [
  { id: 'o1', channel: 'orig', text: 'Welcome to Nerdearla, today we talk about observability in Kubernetes.', start: 0, end: 4000, final: true },
  { id: 'o2', channel: 'orig', text: 'We use OpenTelemetry for traces and Prometheus for metrics.', start: 5000, end: 9000, final: true },
  { id: 'e1', channel: 'es', text: 'Bienvenidos a Nerdearla, hoy hablamos de observabilidad en Kubernetes.', start: 0, end: 4500, final: true },
  { id: 'e2', channel: 'es', text: 'Usamos OpenTelemetry para trazas y Prometheus para métricas.', start: 5000, end: 9500, final: true },
];

test('summary uses the model output and is cached for all viewers', async () => {
  config.engine = 'gemini';
  let calls = 0;
  assist._setClient({ models: { generateContent: async () => { calls++; return { text: '{"headline":"Observabilidad","bullets":["OpenTelemetry para trazas","Prometheus para métricas"],"terms":["OpenTelemetry"]}', usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 } }; } } });
  const a = await assist.summarize({ segs, key: 'k1', lang: 'es', scope: 'full', live: true });
  const b = await assist.summarize({ segs, key: 'k1', lang: 'es', scope: 'full', live: true });
  assert.equal(a.ai, true);
  assert.deepEqual(a.bullets, ['OpenTelemetry para trazas', 'Prometheus para métricas']);
  assert.equal(calls, 1, 'second viewer served from cache');
  assert.equal(b.headline, 'Observabilidad');
});

test('summary falls back to transcript highlights when the model fails', async () => {
  config.engine = 'gemini';
  assist._setClient({ models: { generateContent: async () => { throw new Error('503 unavailable'); } } });
  const s = await assist.summarize({ segs, key: 'k2', lang: 'es', scope: 'full', live: true });
  assert.equal(s.ai, false);
  assert.ok(s.bullets.length > 0);
  assert.ok(s.bullets.every((b) => segs.some((x) => x.text === b)), 'extractive bullets are real transcript lines');
});

test('ask is grounded, rate-limited per client and validates input', async () => {
  config.engine = 'gemini';
  assist._setClient({ models: { generateContent: async ({ contents }) => {
    assert.match(contents, /Question: which tool for traces\?/);
    return { text: '{"found":true,"answer":"OpenTelemetry [0:05]","quotes":[{"at":"0:05","text":"We use OpenTelemetry for traces"}]}' };
  } } });
  const r = await assist.ask({ segs, lang: 'en', question: 'which tool for traces?', clientKey: 'c1' });
  assert.equal(r.found, true);
  assert.match(r.answer, /OpenTelemetry/);
  await assert.rejects(assist.ask({ segs, lang: 'en', question: 'x', clientKey: 'c1' }), /too short/);
  let limited = false;
  for (let i = 0; i < 10; i++) {
    try { await assist.ask({ segs, lang: 'en', question: 'which tool for traces?', clientKey: 'c2' }); } catch (e) { if (e.status === 429) limited = true; }
  }
  assert.ok(limited, 'per-client limit kicks in');
});

test('ask without a model returns matching transcript quotes', async () => {
  config.engine = 'mock';
  const r = await assist.ask({ segs, lang: 'es', question: 'Prometheus metrics?', clientKey: 'c3' });
  assert.equal(r.ai, false);
  assert.match(r.quotes[0].text, /Prometheus/);
});

test('agenda: CSV with header, HH:MM times, quotes and validation', () => {
  const now = new Date('2026-09-25T12:00:00');
  const e = parseSchedule('stage,start,title,speaker\nmain,10:00,"Keynote, apertura",Org\nsala-a,2026-09-25 11:30,Rust,Ana\n', now);
  assert.equal(e.length, 2);
  assert.equal(e[0].title, 'Keynote, apertura');
  assert.equal(new Date(e[0].start).getHours(), 10);
  assert.equal(e[1].stage, 'sala-a');
  assert.throws(() => parseSchedule('main,25:99,x', now), /invalid start/);
  assert.throws(() => parseSchedule('../x,10:00,t', now), /invalid room/);
  assert.throws(() => parseSchedule('main,10:00,', now), /missing title/);
});

test('agenda: current and next slot per room', () => {
  const sch = new Schedule('/nonexistent/schedule.json');
  const t0 = Date.parse('2026-09-25T10:00:00Z');
  sch.entries = parseSchedule([
    { stage: 'main', start: t0, title: 'A' },
    { stage: 'main', start: t0 + 3600_000, title: 'B' },
    { stage: 'sala', start: t0, title: 'C' },
  ]);
  assert.equal(sch.slot('main', t0 + 60_000).current.title, 'A');
  assert.equal(sch.slot('main', t0 + 60_000).next.title, 'B');
  assert.equal(sch.slot('main', t0 + 3700_000).current.title, 'B');
  assert.equal(sch.slot('main', t0 - 1).current, null);
  assert.equal(sch.slot('sala', t0 + 5 * 3600_000).current, null, 'stale slot at end of day');
});
