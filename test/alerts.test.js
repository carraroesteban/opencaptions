// Alerts on the organizer's phone (src/alerts.js): when they fire, that they fire once and say when it's over, and
// that a room the agenda says is off doesn't buzz anyone's phone at the end of the day.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-alerts-'));
const { Alerts, mergeChannels, publicConfig, deliver } = await import('../src/alerts.js');

const room = (o = {}) => ({ id: 'main', name: 'Main Stage', ingest: true, alerts: [], dueTalk: null, expected: true, ...o });
function setup(lang = 'en') {
  const sent = [];
  const a = new Alerts({ send: async (ch, m) => { sent.push(m); } });
  a.cfg = { lang, channels: [{ type: 'webhook', url: 'https://example.org/hook' }], snoozeUntil: 0 };
  return { a, sent };
}

test('a room losing its audio: nothing for a minute, then one alert, then one "it\'s back"', () => {
  const { a, sent } = setup();
  const t0 = 1_000_000;
  a.observe({ stages: [room()] }, t0);
  for (let s = 5; s < 60; s += 5) a.observe({ stages: [room({ ingest: false })] }, t0 + s * 1000);
  assert.equal(sent.length, 0, 'a reconnect within a minute is not news');
  a.observe({ stages: [room({ ingest: false })] }, t0 + 66_000);
  a.observe({ stages: [room({ ingest: false })] }, t0 + 120_000);
  assert.equal(sent.length, 1, 'once');
  assert.equal(sent[0].title, 'Main Stage: audio disconnected');
  assert.equal(sent[0].severity, 'urgent');
  a.observe({ stages: [room()] }, t0 + 130_000);
  assert.equal(sent.length, 2);
  assert.equal(sent[1].resolved, true);
  assert.equal(sent[1].title, 'Main Stage: audio is back');
});

test('a source that connected only for a moment, between two checks, still counts', () => {
  const { a, sent } = setup();
  for (let s = 0; s <= 70; s += 5) a.observe({ stages: [room({ ingest: false, had: true })] }, s * 1000);
  assert.equal(sent.length, 1);
});

test('quiet when the agenda says the room is off, and for rooms that never had audio', () => {
  const { a, sent } = setup();
  a.observe({ stages: [room(), room({ id: 'b', name: 'Room B', ingest: false })] }, 0);
  for (let s = 5; s < 600; s += 5) a.observe({ stages: [room({ ingest: false, expected: false }), room({ id: 'b', name: 'Room B', ingest: false })] }, s * 1000);
  assert.equal(sent.length, 0);
});

test('no sound, a muted mic, a failing AI: each after its own wait, in Spanish', () => {
  const { a, sent } = setup('es');
  for (let s = 0; s <= 200; s += 5) a.observe({ stages: [room({ alerts: ['no-audio'] }), room({ id: 'b', name: 'Sala B', alerts: ['muted?'] }), room({ id: 'c', name: 'Sala C', alerts: ['reconnecting'] })] }, s * 1000);
  assert.deepEqual(sent.map((m) => m.title).sort(), ['Main Stage: sin sonido', 'Sala B: ¿micrófono silenciado?', 'Sala C: los subtítulos fallan'].sort());
});

test('a talk running over: one alert when it\'s 5 minutes late', () => {
  const { a, sent } = setup();
  const start = 10 * 60_000;
  for (let s = 600; s < 900; s += 5) a.observe({ stages: [room({ dueTalk: { title: 'Designing cities', start } })] }, s * 1000);
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /"Designing cities" is due/);
});

test('offline backup and the public address changing are reported', () => {
  const { a, sent } = setup();
  a.observe({ stages: [], failover: { active: 'gemini', online: true }, tunnel: { mode: 'quick', state: 'on', url: 'https://a.trycloudflare.com' } }, 0);
  a.observe({ stages: [], failover: { active: 'local', online: false }, tunnel: { mode: 'quick', state: 'on', url: 'https://b.trycloudflare.com' } }, 5000);
  assert.deepEqual(sent.map((m) => m.title), ['Switched to the offline backup', 'The public address changed']);
  assert.match(sent[1].text, /b\.trycloudflare\.com.*print them again/);
});

test('flood limit: twenty messages, then one summary; snoozed: none', () => {
  const { a, sent } = setup();
  const many = Array.from({ length: 30 }, (_, i) => room({ id: `r${i}`, name: `Room ${i}`, alerts: ['reconnecting'] }));
  for (let s = 0; s <= 70; s += 5) a.observe({ stages: many }, s * 1000);
  assert.equal(sent.length, 20);
  const b = setup();
  b.a.cfg.snoozeUntil = Date.now() + 3600_000;
  for (let s = 0; s <= 70; s += 5) b.a.observe({ stages: many }, s * 1000);
  assert.equal(b.sent.length, 0);
});

test('channels: validated, and the dashboard never sees a token or a full webhook address', () => {
  assert.throws(() => mergeChannels([{ type: 'ntfy', topic: 'short' }], []), /8 to 64/);
  assert.throws(() => mergeChannels([{ type: 'telegram', token: 'nope', chat: '1' }], []), /BotFather/);
  const ch = mergeChannels([{ type: 'ntfy', topic: 'oc-alerts-7f3k2p9q' }, { type: 'telegram', token: '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij', chat: '-1001' }, { type: 'slack', url: 'https://hooks.slack.com/services/T0/B0/secretpart' }], []);
  const pub = JSON.stringify(publicConfig({ lang: 'en', channels: ch, snoozeUntil: 0 }));
  assert.ok(!pub.includes('ABCDEFGHIJ') && !pub.includes('secretpart'), pub);
  // Sending the masked values back keeps the saved secrets.
  const again = mergeChannels(JSON.parse(pub).channels, ch);
  assert.equal(again.find((c) => c.type === 'telegram').token, ch[1].token);
  assert.equal(again.find((c) => c.type === 'slack').url, ch[2].url);
});

test('delivery formats: ntfy as JSON (Spanish titles), Telegram, Slack, Discord and a plain webhook', async () => {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, o) => { calls.push({ url, body: JSON.parse(o.body) }); return new Response('ok'); };
  try {
    const m = { key: 'main:muted', room: 'main', severity: 'urgent', title: 'Sala A: ¿micrófono silenciado?', text: '…' };
    await deliver({ type: 'ntfy', topic: 'oc-alerts-7f3k2p9q' }, m);
    await deliver({ type: 'telegram', token: '1:abc', chat: '42' }, m);
    await deliver({ type: 'slack', url: 'https://hooks.slack.com/x' }, m);
    await deliver({ type: 'discord', url: 'https://discord.com/api/webhooks/x' }, m);
    await deliver({ type: 'webhook', url: 'https://example.org/hook' }, m);
  } finally { globalThis.fetch = real; }
  assert.deepEqual(calls[0], { url: 'https://ntfy.sh/', body: { topic: 'oc-alerts-7f3k2p9q', title: 'Sala A: ¿micrófono silenciado?', message: '…', priority: 4, tags: ['warning'] } });
  assert.equal(calls[1].url, 'https://api.telegram.org/bot1:abc/sendMessage');
  assert.equal(calls[1].body.chat_id, '42');
  assert.match(calls[2].body.text, /^\*Sala A/);
  assert.match(calls[3].body.content, /^\*\*Sala A/);
  assert.deepEqual([calls[4].body.source, calls[4].body.event, calls[4].body.room], ['opencaptions', 'main:muted', 'main']);
});
