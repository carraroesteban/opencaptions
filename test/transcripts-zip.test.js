// Every transcript in one .zip (GET /api/transcripts.zip, src/zip.js): the archive opens, holds a folder per room
// and per talk with SRT, VTT and TXT in each language, its files equal the single-talk exports, and only an admin
// gets it. In Just for me, only the personal room's talks. The server runs with AUTH=token, so even these
// requests from 127.0.0.1 need a password.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { Zip, ZipTooLarge, crc32, safeName } from '../src/zip.js';

const PORT = 29000 + Math.floor(Math.random() * 2000);
const base = `http://127.0.0.1:${PORT}`;
const ADMIN = 'admin-password-for-zip-tests', CREW = 'crew-password-for-zip-tests';
let srv, dataDir;

/** Read an archive the way unzip does: from the end record, through the central directory, to each local header.
 * Checks every file's size and CRC (against gzip's, which zlib computes on its own) and returns name → contents. */
function readZip(buf) {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end >= 0, 'end of central directory record');
  const count = buf.readUInt16LE(end + 10), size = buf.readUInt32LE(end + 12), start = buf.readUInt32LE(end + 16);
  assert.equal(start + size, end, 'the central directory ends where the end record starts');
  const files = new Map();
  for (let i = 0, p = start; i < count; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50, 'central directory header');
    const flags = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24), offset = buf.readUInt32LE(p + 42);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    assert.ok(flags & 0x0800, `${name}: the UTF-8 name flag`);
    assert.equal(buf.readUInt32LE(offset), 0x04034b50, `${name}: local header`);
    const lnlen = buf.readUInt16LE(offset + 26), lxlen = buf.readUInt16LE(offset + 28);
    assert.equal(buf.toString('utf8', offset + 30, offset + 30 + lnlen), name, `${name}: the same name in both headers`);
    assert.deepEqual([buf.readUInt16LE(offset + 6), buf.readUInt16LE(offset + 8), buf.readUInt32LE(offset + 14), buf.readUInt32LE(offset + 18), buf.readUInt32LE(offset + 22)],
      [flags, method, crc, csize, usize], `${name}: flags, method, CRC and sizes in both headers`);
    const body = buf.subarray(offset + 30 + lnlen + lxlen, offset + 30 + lnlen + lxlen + csize);
    const data = method === 8 ? zlib.inflateRawSync(body) : body;
    assert.equal(data.length, usize, `${name}: size`);
    assert.equal(crc, zlib.gzipSync(data).readUInt32LE(zlib.gzipSync(data).length - 8), `${name}: CRC-32`);
    assert.ok(!files.has(name), `${name}: only once`);
    files.set(name, data);
    p += 46 + nlen + xlen + clen;
  }
  return files;
}

/** `unzip -t` on an archive, where unzip is installed (macOS and Linux; not on Windows runners). */
function unzipTest(t, buf) {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'oc-zip-')), 'test.zip');
  fs.writeFileSync(f, buf);
  try {
    const r = spawnSync('unzip', ['-t', f], { encoding: 'utf8' });
    if (r.error) return t.diagnostic('unzip is not installed: checked by parsing only');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /No errors detected/);
  } finally { fs.rmSync(path.dirname(f), { recursive: true, force: true }); }
}

test('zip: CRC-32, UTF-8 names, deflated and stored files, read back intact', (t) => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926); // the standard check value
  const z = new Zip();
  const big = 'Hola, ¿qué tal? '.repeat(2000);
  const random = crypto.randomBytes(500); // doesn't deflate smaller: stored
  z.add('Sala Ñandú/2026-10-08 10.30 Café/original.txt', big);
  z.add('Sala Ñandú/vacío.txt', '');
  z.add('data/random.bin', random);
  const buf = z.toBuffer();
  const files = readZip(buf);
  assert.deepEqual([...files.keys()], ['Sala Ñandú/2026-10-08 10.30 Café/original.txt', 'Sala Ñandú/vacío.txt', 'data/random.bin']);
  assert.equal(files.get('Sala Ñandú/2026-10-08 10.30 Café/original.txt').toString('utf8'), big);
  assert.equal(files.get('Sala Ñandú/vacío.txt').length, 0);
  assert.deepEqual(files.get('data/random.bin'), random);
  assert.ok(buf.length < big.length / 10, 'text is deflated');
  unzipTest(t, buf);
});

test('zip: past its size limit, add() refuses instead of building it', () => {
  const z = new Zip({ maxBytes: 2000 });
  z.add('a.bin', crypto.randomBytes(1000));
  assert.throws(() => z.add('b.bin', crypto.randomBytes(1000)), ZipTooLarge);
  assert.equal(z.count, 1, 'the file that didn’t fit isn’t half in');
  assert.equal(readZip(z.toBuffer()).size, 1);
});

test('zip: file and folder names that open on Windows, macOS and Linux', () => {
  assert.equal(safeName('Opening: the future / of AI?'), 'Opening the future of AI');
  assert.equal(safeName('  .NET en 2026.  '), 'NET en 2026');
  assert.equal(safeName('..'), '_');
  assert.equal(safeName('', 'main'), 'main');
  assert.equal(safeName('CON'), '_CON');
  assert.equal(safeName('a\u0000b\tc'), 'a b c');
  assert.equal(safeName('Café «Ñandú»'), 'Café «Ñandú»');
  assert.equal([...safeName('ñ'.repeat(200))].length, 80);
});

// ---------------------------------------------------------------- the endpoint
const at = (iso) => Date.parse(iso);
const TALKS = [
  { stage: 'main', id: 'talk-opening', title: 'Opening: the future / of AI?', startedAt: at('2026-10-07T14:05:00Z'), languages: ['orig', 'es', 'en'],
    segs: [
      { channel: 'orig', text: 'Bienvenidos a la apertura.', spk: 'Ana Pérez' },
      { channel: 'es', text: 'Bienvenidos a la apertura.', spk: 'Ana Pérez' },
      { channel: 'en', text: 'Welcome to the opening.', spk: 'Ana Pérez' },
      { channel: 'orig', text: 'Hoy hablamos de Q&A y <herramientas>.', spk: 'Ana Pérez' },
      { channel: 'es', text: 'Hoy hablamos de Q&A y <herramientas>.', spk: 'Ana Pérez' },
      { channel: 'en', text: 'Today we talk about Q&A and <tools>.', spk: 'Ana Pérez' },
      { channel: 'orig', text: 'Gracias, Ana.', spk: 'Host' },
      { channel: 'en', text: 'Thank you, Ana.', spk: 'Host' },
    ] },
  { stage: 'main', id: 'talk-untitled', title: '', startedAt: at('2026-10-08T09:00:00Z'), languages: ['orig', 'es', 'en'],
    segs: [{ channel: 'orig', text: 'Good morning.' }, { channel: 'orig', text: 'Let’s begin.' }] },
  { stage: 'room-a', id: 'talk-cafe', title: 'Café con Ñandú', startedAt: at('2026-10-07T16:30:00Z'), languages: ['orig', 'es', 'en', 'pt'],
    segs: [{ channel: 'orig', text: 'Hola.' }, { channel: 'pt', text: 'Olá.' }] },
  { stage: 'room-b', id: 'talk-only-translated', title: 'No original', startedAt: at('2026-10-07T18:00:00Z'), languages: ['orig', 'es'],
    segs: [{ channel: 'es', text: 'Solo traducido.' }] }, // no captions of what was said: not a talk, as in the report
  { stage: 'me', id: 'talk-call', title: 'Call with the bank', startedAt: at('2026-10-08T11:00:00Z'), languages: ['orig', 'en'],
    segs: [{ channel: 'orig', text: 'A private call.' }] },
];

/** Saved talks on disk, as the store writes them (meta.json and captions.jsonl, one folder per talk). */
function seed(talk) {
  const d = path.join(dataDir, 'transcripts', talk.stage, talk.id);
  fs.mkdirSync(d, { recursive: true });
  const { segs, ...meta } = talk;
  fs.writeFileSync(path.join(d, 'meta.json'), JSON.stringify({ speaker: '', ...meta }));
  const n = {};
  fs.writeFileSync(path.join(d, 'captions.jsonl'), segs.map((s) => {
    const i = (n[s.channel] = (n[s.channel] || 0) + 1);
    return JSON.stringify({ id: `${s.channel}-${i}`, lang: s.channel, ...s, start: i * 3000, end: i * 3000 + 2500, final: true });
  }).join('\n') + '\n');
}

const as = (token) => (token ? { authorization: `Bearer ${token}` } : {});
const call = (method, url, body, token = ADMIN) => fetch(base + url, { method, headers: { 'content-type': 'application/json', ...as(token) }, body: body ? JSON.stringify(body) : undefined });
async function download(query = '', token = ADMIN) {
  const r = await fetch(`${base}/api/transcripts.zip${query}`, { headers: as(token) });
  return { status: r.status, headers: r.headers, buf: Buffer.from(await r.arrayBuffer()) };
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-zip-'));
  for (const talk of TALKS) seed(talk);
  srv = spawn(process.execPath, ['src/server.js'], {
    env: {
      ...process.env, PORT: String(PORT), ENGINE: 'mock', DATA_DIR: dataDir, SCHEDULE: path.join(dataDir, 's.json'), AUTH: 'token', TZ: 'UTC',
      EVENT_CONFIG: process.env.EVENT_CONFIG || 'test/fixtures/event.json', ADMIN_TOKEN: ADMIN, CREW_TOKEN: CREW, INGEST_TOKEN: 'ingest-password-for-zip-tests',
      PUBLIC_URL: '', FALLBACK: '', TUNNEL: '', GEMINI_API_KEY: '',
    },
    stdio: 'ignore',
  });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/healthz`)).ok) break; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  // The personal room exists in event mode too (its captions are private there): created as Just for me does.
  assert.equal((await call('POST', '/api/stages', { id: 'me', name: 'Just for me', targets: ['en'] })).status, 200);
});
after(() => { srv?.kill(); fs.rmSync(dataDir, { recursive: true, force: true }); });

const EVENT_FILES = [
  'Main Stage/2026-10-07 14.05 Opening the future of AI/en.srt', 'Main Stage/2026-10-07 14.05 Opening the future of AI/en.txt', 'Main Stage/2026-10-07 14.05 Opening the future of AI/en.vtt',
  'Main Stage/2026-10-07 14.05 Opening the future of AI/es.srt', 'Main Stage/2026-10-07 14.05 Opening the future of AI/es.txt', 'Main Stage/2026-10-07 14.05 Opening the future of AI/es.vtt',
  'Main Stage/2026-10-07 14.05 Opening the future of AI/original.srt', 'Main Stage/2026-10-07 14.05 Opening the future of AI/original.txt', 'Main Stage/2026-10-07 14.05 Opening the future of AI/original.vtt',
  'Main Stage/2026-10-08 09.00/original.srt', 'Main Stage/2026-10-08 09.00/original.txt', 'Main Stage/2026-10-08 09.00/original.vtt',
  'Room A/2026-10-07 16.30 Café con Ñandú/original.srt', 'Room A/2026-10-07 16.30 Café con Ñandú/original.txt', 'Room A/2026-10-07 16.30 Café con Ñandú/original.vtt',
  'Room A/2026-10-07 16.30 Café con Ñandú/pt.srt', 'Room A/2026-10-07 16.30 Café con Ñandú/pt.txt', 'Room A/2026-10-07 16.30 Café con Ñandú/pt.vtt',
];

test('transcripts.zip: a folder per room and per talk, SRT, VTT and TXT in each language; it opens', async (t) => {
  const r = await download();
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/zip');
  assert.equal(r.headers.get('content-disposition'), 'attachment; filename="opencaptions-transcripts.zip"');
  const files = readZip(r.buf);
  assert.deepEqual([...files.keys()].sort(), EVENT_FILES, 'the event’s rooms only: not the personal room, nor a talk without original captions');
  unzipTest(t, r.buf);
});

test('transcripts.zip: its files are the single-talk exports, byte for byte', async () => {
  const files = readZip((await download()).buf);
  const dir = 'Main Stage/2026-10-07 14.05 Opening the future of AI';
  for (const [lang, file] of [['es', 'es'], ['en', 'en'], ['orig', 'original']]) {
    for (const fmt of ['txt', 'srt', 'vtt']) {
      const single = await (await fetch(`${base}/api/stages/main/export.${fmt}?lang=${lang}&talk=talk-opening`, { headers: as(ADMIN) })).text();
      assert.equal(files.get(`${dir}/${file}.${fmt}`).toString('utf8'), single, `${file}.${fmt}`);
    }
  }
  assert.match(files.get(`${dir}/original.txt`).toString('utf8'), /^Ana Pérez: Bienvenidos a la apertura\./);
  assert.match(files.get(`${dir}/en.vtt`).toString('utf8'), /^WEBVTT[\s\S]*Q&amp;A and &lt;tools&gt;/);
});

test('transcripts.zip: ?day= and ?room= keep one day or one room; nothing to give is a 404', async () => {
  const day = await download('?day=2026-10-08');
  assert.equal(day.headers.get('content-disposition'), 'attachment; filename="opencaptions-transcripts-2026-10-08.zip"');
  assert.deepEqual([...readZip(day.buf).keys()].sort(), EVENT_FILES.filter((f) => f.includes('2026-10-08')));
  const room = await download('?room=room-a');
  assert.equal(room.headers.get('content-disposition'), 'attachment; filename="opencaptions-transcripts-room-a.zip"');
  assert.deepEqual([...readZip(room.buf).keys()].sort(), EVENT_FILES.filter((f) => f.startsWith('Room A/')));
  assert.equal((await download('?room=room-a&day=2026-10-08')).status, 404, 'Room A had nothing that day');
  assert.equal((await download('?room=no-such-room')).status, 404);
  assert.equal((await download('?room=me')).status, 404, 'the personal room isn’t one of the event’s rooms');
});

test('transcripts.zip: admin only (the crew gets 403, the audience 401)', async () => {
  assert.equal((await download('', CREW)).status, 403);
  assert.equal((await download('', null)).status, 401);
  assert.equal((await download('', 'wrong-password')).status, 401);
});

test('transcripts.zip in Just for me: only the personal room', async () => {
  const setMode = (mode) => call('PUT', '/api/setup', { mode });
  assert.equal((await setMode('personal')).status, 200);
  try {
    const r = await download();
    assert.equal(r.status, 200);
    assert.deepEqual([...readZip(r.buf).keys()].sort(), ['Just for me/2026-10-08 11.00 Call with the bank/original.srt', 'Just for me/2026-10-08 11.00 Call with the bank/original.txt', 'Just for me/2026-10-08 11.00 Call with the bank/original.vtt']);
    assert.equal((await download('?room=main')).status, 404, 'the event’s rooms aren’t there in Just for me');
    assert.equal((await download('', CREW)).status, 403);
  } finally {
    assert.equal((await setMode('event')).status, 200);
  }
});
