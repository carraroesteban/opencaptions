// Connectors (src/integrations.js): captions into Zoom, YouTube Live and Teams, and webhooks, against a fake platform.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-integrations-'));
let Integrations, validate, lines;
before(async () => ({ Integrations, validate, lines } = await import('../src/integrations.js')));
// Connectors are saved (they survive restarts): every test starts with none.
beforeEach(() => fs.rmSync(path.join(process.env.DATA_DIR, 'secrets.json'), { force: true }));

const ZOOM = 'https://wmcapi.zoom.us/closedcaption?id=200610693&ns=GZHkEA==&expire=86400&spparams=id%2Cns%2Cexpire&signature=nYtX';
const YT = 'http://upload.youtube.com/closedcaption?cid=abcd-efgh-ijkl';
const TEAMS = 'https://api.captions.office.microsoft.com/cartcaption?meetingid=04751eac&token=04751eac&lang=en-us';

/** A room that emits captions like src/stage.js does. */
function room(id = 'main') {
  const st = new EventEmitter();
  Object.assign(st, { id, def: { name: 'Main stage' }, source: 'en', talk: { id: 't1', title: 'Keynote', startedAt: 1 } });
  st.channelFor = (l) => (!l || l === 'orig' ? 'orig' : l);
  return st;
}
const caption = (st, text, channel = 'orig') => st.emit('caption', { id: Math.random().toString(36), channel, lang: channel === 'orig' ? 'en' : channel, text, start: 0, end: 1000, final: true });

/** Records requests; answers with the statuses in `replies` (then 200). */
function platform(replies = []) {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url: new URL(url), init }); const status = replies.shift() ?? 200; return { ok: status < 300, status, text: async () => '' }; };
  return { calls, fetchImpl };
}
const settle = () => new Promise((r) => setTimeout(r, 50));

test('only each platform’s own caption links are accepted', async () => {
  assert.ok(await validate({ type: 'zoom', url: ZOOM }));
  assert.ok(await validate({ type: 'youtube', url: YT }));
  assert.ok(await validate({ type: 'teams', url: TEAMS }));
  await assert.rejects(validate({ type: 'zoom', url: 'https://evil.example/closedcaption?id=1' }), /isn't a Zoom caption link/);
  await assert.rejects(validate({ type: 'zoom', url: 'https://zoom.us.evil.example/closedcaption' }), /isn't a Zoom/);
  await assert.rejects(validate({ type: 'youtube', url: 'http://upload.youtube.com/closedcaption' }), /no stream id/);
  await assert.rejects(validate({ type: 'webhook', url: 'https://127.0.0.1:9/hook' }), /private|loopback/);
  await assert.rejects(validate({ type: 'webhook', url: 'not a link' }), /whole link/);
  await assert.rejects(validate({ type: 'fax', url: ZOOM }), /type/);
});

test('Zoom: plain text, seq +1 per caption (not per retry), language as a region code', async () => {
  const st = room();
  const p = platform([500]); // the first try fails once
  const ints = new Integrations({ stages: new Map([['main', st]]), fetchImpl: p.fetchImpl });
  await ints.add({ type: 'zoom', stage: 'main', url: ZOOM, lang: 'orig' });
  caption(st, 'Hello everyone.');
  caption(st, 'Welcome to the event.');
  await new Promise((r) => setTimeout(r, 1500)); // the retry waits a random 125–375 ms: room for a busy machine
  assert.deepEqual(p.calls.map((c) => [c.url.searchParams.get('seq'), c.init.body]), [['1', 'Hello everyone.'], ['1', 'Hello everyone.'], ['2', 'Welcome to the event.']]);
  assert.equal(p.calls[0].url.searchParams.get('lang'), 'en-US');
  assert.equal(p.calls[0].url.searchParams.get('signature'), 'nYtX', 'the token’s own parameters are kept');
  assert.match(p.calls[0].init.headers['content-type'], /^text\/plain/);
  assert.equal(ints.list()[0].status.sent, 2);
});

test('YouTube: a UTC timestamp line, the text and a final newline; no charset', async () => {
  const st = room();
  const p = platform();
  const ints = new Integrations({ stages: new Map([['main', st]]), fetchImpl: p.fetchImpl });
  await ints.add({ type: 'youtube', stage: 'main', url: YT, lang: 'es' });
  caption(st, 'Hello.', 'orig'); // another language: not sent
  caption(st, 'Hola a todos.', 'es');
  await settle();
  assert.equal(p.calls.length, 1);
  const [stamp, text, end] = p.calls[0].init.body.split('\n');
  assert.match(stamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$/);
  assert.ok(Math.abs(Date.parse(stamp + 'Z') - Date.now()) < 5000, 'UTC, close to now');
  assert.equal(text, 'Hola a todos.');
  assert.equal(end, '');
  assert.equal(p.calls[0].init.headers['content-type'], 'text/plain');
  assert.equal(p.calls[0].url.searchParams.get('cid'), 'abcd-efgh-ijkl');
});

test('Teams: long captions are split into lines of at most 120 characters', async () => {
  assert.deepEqual(lines('a b c', 120), ['a b c']);
  const long = 'word '.repeat(60).trim();
  assert.ok(lines(long, 120).every((l) => l.length <= 120));
  assert.equal(lines(long, 120).join(' '), long);
  const st = room();
  const p = platform();
  const ints = new Integrations({ stages: new Map([['main', st]]), fetchImpl: p.fetchImpl });
  await ints.add({ type: 'teams', stage: 'main', url: TEAMS });
  caption(st, long);
  await settle();
  assert.ok(p.calls.length >= 2);
  assert.equal(p.calls[0].url.searchParams.get('meetingid'), '04751eac');
  assert.equal(p.calls[0].url.searchParams.get('seq'), null, 'Teams: the CART link is used as it is');
});

test('a wrong or expired link stops retrying and shows why', async () => {
  const st = room();
  const p = platform([403]);
  const ints = new Integrations({ stages: new Map([['main', st]]), fetchImpl: p.fetchImpl });
  await ints.add({ type: 'zoom', stage: 'main', url: ZOOM });
  caption(st, 'Hello.');
  await settle();
  assert.equal(p.calls.length, 1);
  assert.equal(ints.list()[0].status.state, 'error');
  assert.match(ints.list()[0].status.lastError, /403/);
});

test('webhooks: signed JSON for each caption and for each finished talk', async () => {
  const st = room();
  const p = platform();
  const ints = new Integrations({ stages: new Map([['main', st]]), fetchImpl: p.fetchImpl, talkUrl: (s, t) => `https://captions.example/talk.html?stage=${s}&talk=${t}` });
  const c = await ints.add({ type: 'webhook', stage: 'main', url: 'https://93.184.215.14/hook' });
  assert.ok(c.secret, 'the secret is shown when it’s created');
  assert.ok(!JSON.stringify(ints.list()).includes(c.secret), '… and never again');
  caption(st, 'Hello.');
  st.talk = { id: 't2', title: 'Next', startedAt: 2 };
  st.emit('talk');
  await settle();
  const bodies = p.calls.map((x) => JSON.parse(x.init.body));
  assert.deepEqual(bodies.map((b) => b.event), ['caption', 'talk.ended']);
  assert.equal(bodies[0].text, 'Hello.');
  assert.equal(bodies[1].transcript, 'https://captions.example/talk.html?stage=main&talk=t1');
  const sig = crypto.createHmac('sha256', c.secret).update(p.calls[0].init.body).digest('hex');
  assert.equal(p.calls[0].init.headers['x-opencaptions-signature'], `sha256=${sig}`);
});

test('links are kept as secrets and shown masked; removing stops sending', async () => {
  const st = room();
  const p = platform();
  const ints = new Integrations({ stages: new Map([['main', st]]), fetchImpl: p.fetchImpl });
  const c = await ints.add({ type: 'zoom', stage: 'main', url: ZOOM });
  assert.ok(!JSON.stringify(ints.list()).includes('signature='));
  assert.ok(fs.readFileSync(path.join(process.env.DATA_DIR, 'secrets.json'), 'utf8').includes('wmcapi.zoom.us'));
  assert.ok(ints.remove(c.id));
  caption(st, 'Hello.');
  await settle();
  assert.equal(p.calls.filter((x) => x.url.hostname === 'wmcapi.zoom.us').length, 0);
});

test('connectors survive a restart', async () => {
  const st = room();
  const p = platform();
  await new Integrations({ stages: new Map([['main', st]]), fetchImpl: p.fetchImpl }).add({ type: 'teams', stage: 'main', url: TEAMS });
  const st2 = room();
  const again = new Integrations({ stages: new Map([['main', st2]]), fetchImpl: p.fetchImpl }); // as after a restart
  assert.equal(again.list().length, 1);
  caption(st2, 'Still connected.');
  await settle();
  assert.equal(p.calls.at(-1).init.body, 'Still connected.');
});
