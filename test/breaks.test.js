// Breaks and music (src/stage.js, src/switcher.js): captions pause on purpose, and screens and phones say so.
// The real server with the simulated AI; audio goes in through the ingest WebSocket like on event day.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import WebSocket, { WebSocketServer } from 'ws';
import { isBreakScene, vmixProgram, obsAuth, validate } from '../src/switcher.js';

const PORT = 23000 + Math.floor(Math.random() * 2000);
const base = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const h = { authorization: 'Bearer t', 'content-type': 'application/json' };
const api = async (method, url, body) => { const r = await fetch(base + url, { method, headers: h, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const room = async (id) => (await api('GET', '/api/status')).body.stages.find((s) => s.id === id);
const until = async (fn, ms = 8000) => { for (let t = 0; t < ms; t += 100) { const v = await fn(); if (v) return v; await sleep(100); } return null; };
let srv, dataDir;

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-breaks-'));
  // The agenda: a coffee break for every room that started a minute ago, and the next talk in ten minutes.
  const at = (min) => new Date(Date.now() + min * 60_000).toISOString();
  fs.writeFileSync(path.join(dataDir, 'schedule.json'), JSON.stringify([
    { stage: 'room-c', start: at(-30), title: 'Earlier talk', speaker: 'Ana' },
    { stage: '*', start: at(-1), title: 'Coffee break', speaker: '', break: true },
    { stage: 'room-c', start: at(10), title: 'After the coffee', speaker: 'Bo' },
  ]));
  fs.copyFileSync('test/fixtures/glossary.json', path.join(dataDir, 'glossary.json'));
  srv = spawn(process.execPath, ['src/server.js'], {
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', ENGINE: 'mock', DATA_DIR: dataDir, SCHEDULE: path.join(dataDir, 'schedule.json'), EVENT_CONFIG: 'test/fixtures/event.json', GLOSSARY: path.join(dataDir, 'glossary.json'), ADMIN_TOKEN: 't', INGEST_TOKEN: 't', PUBLIC_URL: '', GEMINI_API_KEY: '', TUNNEL: '', FALLBACK: '' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/healthz`)).ok) return; } catch { /* starting */ }
    await sleep(100);
  }
  throw new Error('server did not start');
});

after(() => {
  srv?.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

/** A phone on a room: collects pause messages and captions. */
async function phone(stage) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws/view?stage=${stage}&langs=orig`);
  const got = { hello: null, pauses: [], captions: [] };
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString());
    if (m.type === 'hello') got.hello = m;
    else if (m.type === 'pause') got.pauses.push(m);
    else if (m.type === 'caption') got.captions.push(m);
  });
  await new Promise((r) => ws.once('open', r));
  await until(() => got.hello);
  return { ws, got };
}

async function ingest(stage) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws/ingest?stage=${stage}&kind=cli&label=test`, { headers: { authorization: 'Bearer t' } });
  await new Promise((r) => ws.once('open', r));
  return ws;
}
const talk = fs.readFileSync('samples/talk-en.wav').subarray(44);

test('the agenda: a break for every room, shown with the next talk, once the room is quiet', async () => {
  const st = await until(async () => (await room('room-c'))?.brk);
  assert.equal(st.by, 'agenda');
  assert.equal(st.title, 'Coffee break');
  const p = await phone('room-c');
  assert.equal(p.got.hello.pause.brk.title, 'Coffee break');
  assert.equal(p.got.hello.pause.brk.next.title, 'After the coffee', 'the next talk, skipping the break');
  p.ws.close();
  const sched = await (await fetch(`${base}/api/schedule`)).json();
  assert.ok(sched.some((e) => e.stage === '*' && e.break), 'the agenda keeps the break for every room');
});

test('the crew pauses a room: phones are told, no captions while on break, and resuming brings them back', async () => {
  const p = await phone('main');
  assert.equal((await api('POST', '/api/stages/main/break', { on: true })).status, 200);
  await until(() => p.got.pauses.some((x) => x.brk?.by === 'crew'));
  assert.equal((await room('main')).brk.by, 'crew');
  const ing = await ingest('main');
  for (let o = 0; o < 8 * 32000; o += 3200) { ing.send(talk.subarray(o, o + 3200)); await sleep(5); }
  await sleep(1500);
  assert.equal(p.got.captions.length, 0, 'speech during a break is not captioned');
  assert.equal((await room('main')).gated, true);
  await api('POST', '/api/stages/main/break', { on: false });
  await until(() => p.got.pauses.at(-1)?.brk === null);
  for (let o = 0; o < 8 * 32000; o += 3200) { ing.send(talk.subarray(o, o + 3200)); await sleep(5); }
  assert.ok(await until(() => p.got.captions.length > 0), 'captions are back after the break');
  ing.close(); p.ws.close();
});

test('the room’s own computer calls a break (the B key on the audio page)', async () => {
  const ing = await ingest('room-a');
  ing.send(JSON.stringify({ type: 'break', on: true }));
  const st = await until(async () => (await room('room-a'))?.brk);
  assert.equal(st.by, 'room');
  ing.send(JSON.stringify({ type: 'break', on: false }));
  assert.ok(await until(async () => !(await room('room-a')).brk));
  // A new talk ends a break too.
  await api('POST', '/api/stages/room-a/break', { on: true });
  await api('POST', '/api/stages/room-a/talk', { title: 'Next one' });
  assert.equal((await room('room-a')).brk, null);
  ing.close();
});

test('music in the room pauses captions; "it’s a talk" captions anyway', async () => {
  // Synthetic chords, sent faster than real time: the detector counts audio, not the clock.
  const pcm = Buffer.alloc(16 * 32000);
  for (let i = 0; i < pcm.length / 2; i++) {
    const t = i / 16000, base0 = [261.6, 220, 174.6, 196][Math.floor(t * 2) % 4];
    let v = 0;
    for (const f of [base0, base0 * 1.26, base0 * 1.5]) for (let k = 1; k <= 4; k++) v += Math.sin(2 * Math.PI * f * k * t) / (k * k * 3);
    pcm.writeInt16LE(Math.round(v * 0.25 * 16000), i * 2);
  }
  const p = await phone('room-b');
  const ing = await ingest('room-b');
  for (let o = 0; o < pcm.length; o += 3200) { ing.send(pcm.subarray(o, o + 3200)); await sleep(2); }
  assert.ok(await until(async () => (await room('room-b')).music), 'music detected');
  assert.ok(p.got.pauses.some((x) => x.music), 'phones are told');
  assert.equal((await api('POST', '/api/stages/room-b/music', { caption: true })).status, 200);
  const st = await room('room-b');
  assert.equal(st.music, false);
  assert.equal(st.musicOverride, true);
  ing.close(); p.ws.close();
});

test('vision mixers: scene names, vMix XML, OBS authentication', () => {
  assert.ok(isBreakScene('BREAK - Coffee'));
  assert.ok(isBreakScene('Pausa café'));
  assert.ok(isBreakScene('Publicidad 2'));
  assert.ok(!isBreakScene('Keynote cam 1'));
  assert.ok(!isBreakScene('Breakout room'), 'whole words only');
  assert.ok(isBreakScene('Sponsors', 'sponsors'));
  const xml = '<vmix><inputs><input key="a" number="1" type="Capture" title="Cam &amp; slides">x</input><input key="b" number="2" type="Image" title="BREAK slide">y</input></inputs><active>2</active><preview>1</preview></vmix>';
  assert.equal(vmixProgram(xml), 'BREAK slide');
  assert.equal(vmixProgram(xml.replace('<active>2', '<active>1')), 'Cam & slides');
  // obs-websocket v5 docs: base64(sha256(base64(sha256(password + salt)) + challenge)).
  assert.equal(obsAuth('supersecretpassword', 'lM1GncleQOaCu9lT1yeUZhFYnqhsLLP1G5lAGo3ixaI=', '+IxH4CnCiqpX1rM9scsNynZzbOe4KhDeYcTNS3PDaeY='), '1Ct943GAT+6YQUUX47Ia/ncufilbe6+oD6lY+5kaCu4=');
  assert.equal(validate({ type: 'vmix', url: '192.168.1.20' }), 'http://192.168.1.20:8088/api');
  assert.equal(validate({ type: 'obs', url: '192.168.1.21' }), 'ws://192.168.1.21:4455/');
  assert.throws(() => validate({ type: 'obs', url: 'ftp://x' }), /OBS/);
});

test('vMix: switching to a break input pauses the room, switching back resumes it', async () => {
  let active = 1;
  const vmix = http.createServer((req, res) => res.end(`<vmix><inputs><input number="1" title="Main cam"/><input number="2" title="Break loop"/></inputs><active>${active}</active></vmix>`));
  await new Promise((r) => vmix.listen(0, '127.0.0.1', r));
  const add = await api('POST', '/api/switchers', { type: 'vmix', stage: 'room-a', url: `127.0.0.1:${vmix.address().port}` });
  assert.equal(add.status, 200, JSON.stringify(add.body));
  assert.ok(await until(async () => (await api('GET', '/api/switchers')).body.switchers[0]?.status.scene === 'Main cam'));
  assert.equal((await room('room-a')).brk, null);
  active = 2;
  const st = await until(async () => (await room('room-a')).brk);
  assert.deepEqual([st.by, st.title], ['switcher', 'Break loop']);
  active = 1;
  assert.ok(await until(async () => !(await room('room-a')).brk), 'back on the main camera: the break ends');
  await api('DELETE', `/api/switchers/${add.body.id}`);
  vmix.close();
});

test('OBS: the program scene (with a password) pauses the room', async () => {
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise((r) => wss.once('listening', r));
  let client;
  wss.on('connection', (ws) => {
    client = ws;
    ws.send(JSON.stringify({ op: 0, d: { rpcVersion: 1, authentication: { salt: 'c2FsdA==', challenge: 'Y2hhbA==' } } }));
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.op === 1) {
        if (m.d.authentication !== obsAuth('pw', 'c2FsdA==', 'Y2hhbA==')) return ws.close(4009, 'auth');
        ws.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }));
      } else if (m.op === 6) ws.send(JSON.stringify({ op: 7, d: { requestType: m.d.requestType, requestId: m.d.requestId, requestStatus: { result: true, code: 100 }, responseData: { currentProgramSceneName: 'Speaker' } } }));
    });
  });
  const add = await api('POST', '/api/switchers', { type: 'obs', stage: 'room-b', url: `127.0.0.1:${wss.address().port}`, password: 'pw' });
  assert.equal(add.status, 200);
  assert.ok(await until(async () => (await api('GET', '/api/switchers')).body.switchers.find((x) => x.id === add.body.id)?.status.scene === 'Speaker'));
  assert.ok(!JSON.stringify((await api('GET', '/api/switchers')).body).includes('"pw"'), 'the password is never sent back');
  client.send(JSON.stringify({ op: 5, d: { eventType: 'CurrentProgramSceneChanged', eventIntent: 4, eventData: { sceneName: 'Intermission' } } }));
  const st = await until(async () => (await room('room-b')).brk);
  assert.deepEqual([st.by, st.title], ['switcher', 'Intermission']);
  await api('DELETE', `/api/switchers/${add.body.id}`);
  assert.equal((await room('room-b')).brk, null, 'removing the mixer ends its break');
  wss.close();
});

test('backup audio: takes over when the main source stops, hands back when it has been healthy for 10 s', async () => {
  const connect = async (role) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws/ingest?stage=main&kind=cli&label=${role}&role=${role === 'backup' ? 'backup' : ''}`, { headers: { authorization: 'Bearer t' } });
    await new Promise((r) => ws.once('open', r));
    return ws;
  };
  const main = await connect('main'), backup = await connect('backup');
  const on = { main: true, backup: true };
  let o = 0;
  const feed = setInterval(() => { // both send the talk in real time, like two outputs of the same desk
    const chunk = talk.subarray(o % (talk.length - 3200), (o % (talk.length - 3200)) + 3200);
    o += 3200;
    if (on.main && main.readyState === 1) main.send(chunk);
    if (on.backup && backup.readyState === 1) backup.send(chunk);
  }, 100);
  try {
    await sleep(1500);
    let st = await room('main');
    assert.equal(st.ingest.role, 'primary');
    assert.equal(st.backup.active, false, 'the backup waits');
    on.main = false; // the main computer stops sending (a crash, a cable)
    st = await until(async () => { const x = await room('main'); return x.ingest.role === 'backup' && x; }, 6000);
    assert.ok(st, 'the backup took over');
    assert.ok(st.alerts.includes('on-backup'));
    on.main = true;
    assert.ok(await until(async () => (await room('main')).ingest.role === 'primary', 16000), 'the main source is back after 10 s of sound');
    main.close();
    assert.ok(await until(async () => (await room('main')).ingest?.role === 'backup', 3000), 'main disconnected: the backup at once');
  } finally {
    clearInterval(feed);
    main.close(); backup.close();
  }
});

test('corrections: the crew fixes a live caption, phones replace it, the transcript keeps the fix', async () => {
  // Captions of the talk in progress in the main room (said in the tests above).
  let caps = (await api('GET', '/api/stages/main/captions?channel=orig&n=5')).body;
  if (!caps.captions.length) {
    const ing = await ingest('main');
    for (let o = 0; o < 10 * 32000; o += 3200) { ing.send(talk.subarray(o, o + 3200)); await sleep(5); }
    await until(async () => (caps = (await api('GET', '/api/stages/main/captions?channel=orig&n=5')).body).captions.length);
    ing.close();
  }
  const c = caps.captions.at(-1);
  const p = await phone('main');
  const r = await api('PATCH', `/api/stages/main/captions/${encodeURIComponent(c.id)}`, { channel: 'orig', text: 'Fixed by the crew: Nerdearla.' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const got = await until(() => p.got.captions.find((x) => x.id === c.id));
  assert.equal(got.text, 'Fixed by the crew: Nerdearla.');
  assert.equal(got.final, true);
  p.ws.close();
  const txt = await (await fetch(`${base}/api/stages/main/export.txt`, { headers: h })).text();
  assert.ok(txt.includes('Fixed by the crew: Nerdearla.'));
  assert.equal(txt.split('Fixed by the crew').length, 2, 'the corrected sentence appears once');
  // After the event: an admin cleans up a saved transcript.
  const talkId = caps.talk;
  await api('POST', '/api/stages/main/talk', { title: 'Another talk' });
  const r2 = await api('PATCH', `/api/stages/main/talks/${talkId}/captions/${encodeURIComponent(c.id)}`, { channel: 'orig', text: 'Cleaned up afterwards.' });
  assert.equal(r2.status, 200);
  const old = await (await fetch(`${base}/api/stages/main/export.txt?talk=${talkId}`, { headers: h })).text();
  assert.ok(old.includes('Cleaned up afterwards.') && !old.includes('Fixed by the crew'));
  assert.equal((await api('PATCH', '/api/stages/main/captions/nope', { text: 'x' })).status, 404);
  assert.equal((await api('PATCH', `/api/stages/main/captions/${encodeURIComponent(c.id)}`, { text: '  ' })).status, 400);
});

test('"always write it this way": one glossary correction, undoable', async () => {
  const r = await api('POST', '/api/glossary/replacements', { from: 'Nerdarla', to: 'Nerdearla' });
  assert.equal(r.status, 200);
  const g = (await api('GET', '/api/glossary')).body;
  assert.ok(g.replacements.some((x) => x.from === 'Nerdarla' && x.to === 'Nerdearla'));
  assert.ok(g.vocabulary.includes('Nerdearla'), 'also helps the AI recognize it');
  assert.equal((await api('POST', '/api/glossary/replacements', { from: 'x', to: 'x' })).status, 400);
});
