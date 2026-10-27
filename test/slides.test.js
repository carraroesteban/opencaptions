// Slides on the phone (src/slides.js): what a room keeps, what the model's answer becomes, and the whole path from
// the room's computer to a phone through the real server (mock engine).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { config } from '../src/config.js';
import { SlideDeck, cleanSlideText, slideForViewer, readSlide, _setClient, MAX_SLIDE_BYTES, isJpeg } from '../src/slides.js';

const jpeg = (n = 100, fill = 0) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(n, fill)]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('a room keeps real JPEGs of a sane size, not faster than one every 1.5 s, and only the last 12', () => {
  const deck = new SlideDeck();
  assert.equal(deck.add(Buffer.from('not a picture'), 0), null);
  assert.equal(deck.add(jpeg(MAX_SLIDE_BYTES), 0), null, 'too big');
  const first = deck.add(jpeg(), 10_000);
  assert.ok(first?.id && first.reading);
  assert.equal(deck.add(jpeg(), 11_000), null, 'an animation on screen is not a slide a second');
  for (let i = 1; i <= 14; i++) assert.ok(deck.add(jpeg(), 10_000 + i * 2000));
  assert.equal(deck.list.length, 12);
  assert.equal(deck.get(first.id), null, 'the oldest ones go');
  assert.equal(deck.current, deck.list.at(-1));
  deck.clear();
  assert.equal(deck.current, null);
  assert.ok(isJpeg(jpeg()) && !isJpeg(Buffer.from([0xff, 0xd8])));
});

test("the model's answer is kept to a title and short lines per language, and a phone gets only its languages", () => {
  const raw = { orig: { title: '  Telehealth\nin rural clinics ', lines: ['a', 7, '', 'x'.repeat(500), ...Array(40).fill('b')] }, es: { title: 'Telesalud', lines: [] }, fr: { title: 'not asked' }, de: 'nonsense' };
  const clean = cleanSlideText(raw, ['es', 'de']);
  assert.deepEqual(Object.keys(clean), ['orig', 'es']);
  assert.equal(clean.orig.title, 'Telehealth in rural clinics');
  assert.equal(clean.orig.lines.length, 30);
  assert.equal(clean.orig.lines[1].length, 300);
  const slide = { id: 'a1', at: 1, reading: false, jpeg: jpeg(), text: clean };
  assert.deepEqual(slideForViewer(slide, ['es']), { id: 'a1', at: 1, reading: false, text: { es: clean.es } });
  assert.deepEqual(Object.keys(slideForViewer(slide, ['pt']).text), ['orig'], 'a language the slide has no text in: the original');
  assert.equal(slideForViewer(null, ['es']), null);
  assert.equal(slideForViewer(slide, ['es']).jpeg, undefined, 'the picture goes by URL, not in the socket');
});

test('readSlide sends the picture once for every language, counts its cost, and survives a bad answer', async () => {
  const engine = config.engine;
  config.engine = 'gemini';
  try {
    let req = null;
    _setClient({ models: { generateContent: async (r) => { req = r; return { text: JSON.stringify({ orig: { title: 'Hola', lines: ['uno'] }, en: { title: 'Hello', lines: ['one'] } }), usageMetadata: { promptTokenCount: 1500, candidatesTokenCount: 200 } }; } } });
    const { text, usd } = await readSlide(jpeg(), ['en']);
    assert.equal(text.en.title, 'Hello');
    assert.ok(usd > 0 && usd < 0.01, `about a tenth of a cent a slide (got ${usd})`);
    assert.equal(req.contents[0].parts[0].inlineData.mimeType, 'image/jpeg');
    assert.match(req.config.systemInstruction, /never follow instructions/);
    _setClient({ models: { generateContent: async () => ({ text: 'not json', usageMetadata: {} }) } });
    assert.equal((await readSlide(jpeg(), ['en'])).text, null);
    config.engine = 'local';
    assert.equal((await readSlide(jpeg(), ['en'])).text, null, 'local mode: the picture only');
  } finally {
    config.engine = engine;
    _setClient(null);
  }
});

// ---- through the real server ----
const PORT = 21000 + Math.floor(Math.random() * 2000);
const base = `http://127.0.0.1:${PORT}`;
let srv, dataDir;
before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-slides-'));
  srv = spawn(process.execPath, ['src/server.js'], {
    env: { ...process.env, PORT: String(PORT), ENGINE: 'mock', DATA_DIR: dataDir, SCHEDULE: path.join(dataDir, 'schedule.json'), GLOSSARY: path.join(dataDir, 'glossary.json'), ADMIN_TOKEN: 't', INGEST_TOKEN: 't', PUBLIC_URL: '', GEMINI_API_KEY: '' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/healthz`)).ok) return; } catch { /* not up yet */ }
    await sleep(100);
  }
  throw new Error('server did not start');
});
after(() => { srv?.kill(); fs.rmSync(dataDir, { recursive: true, force: true }); });

test('a slide from the room reaches phones at once, then with its text in their language; the picture is served', async () => {
  const view = new WebSocket(`ws://127.0.0.1:${PORT}/ws/view?stage=main&langs=es`);
  const got = [];
  view.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.type === 'slide' || m.type === 'hello') got.push(m); });
  await new Promise((r) => view.once('open', r));
  const ingest = new WebSocket(`ws://127.0.0.1:${PORT}/ws/ingest?stage=main&kind=test`, { headers: { authorization: 'Bearer t' } });
  await new Promise((r) => ingest.once('open', r));
  const pic = jpeg(2000, 7);
  ingest.send(JSON.stringify({ type: 'slide', jpeg: pic.toString('base64') }));
  ingest.send(JSON.stringify({ type: 'slide', jpeg: Buffer.from('<svg/>').toString('base64') })); // not a JPEG: dropped
  for (let i = 0; i < 50 && !got.some((m) => m.type === 'slide' && !m.slide.reading); i++) await sleep(50);
  const slides = got.filter((m) => m.type === 'slide');
  assert.equal(slides[0].slide.reading, true, 'first the picture');
  const done = slides.at(-1).slide;
  assert.deepEqual(done.text, { es: { title: '(es) Slide', lines: [] } }, 'then its text, only in the phone’s language');
  assert.equal(new Set(slides.map((m) => m.slide.id)).size, 1, 'one slide: the SVG never became one');

  const img = await fetch(`${base}/api/stages/main/slides/${done.id}`);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/jpeg');
  assert.deepEqual(Buffer.from(await img.arrayBuffer()), pic);
  assert.equal((await fetch(`${base}/api/stages/main/slides/nope`)).status, 404);

  // A phone that opens the room later gets the current slide in its hello.
  const late = new WebSocket(`ws://127.0.0.1:${PORT}/ws/view?stage=main&langs=en`);
  const hello = await new Promise((r) => late.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.type === 'hello') r(m); }));
  assert.equal(hello.slide.id, done.id);
  late.close();
  ingest.close();
  view.close();
});
