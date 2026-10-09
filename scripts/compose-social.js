#!/usr/bin/env node
// The social-media video (vertical 1080×1920, ~29 s, English and Spanish): AI-generated scene-setting shots, the real
// screens filmed by scripts/record-social.js, a voiceover with burned-in subtitles, and the end card.
//
//   node scripts/record-social.js            # the real screens → dist/social/scenes/
//   node scripts/compose-social.js [en|es]   # → dist/social/opencaptions-<lang>.mp4 (+ .jpg cover)
//
// dist/social/assets/ holds what was generated outside this repo: ai1-hall.mp4, ai2-phone.mp4, ai3-audience.mp4
// (5-second 9:16 clips) and vo-en.mp3 / vo-es.mp3 (the voiceover). The AI shots carry an "AI-generated" tag.
// Text is drawn by Chrome (the brand fonts) and laid over the footage by ffmpeg, which needs no text filters.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import WebSocket from 'ws';
import * as tty from '../src/tty.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOCIAL = path.join(ROOT, 'dist', 'social');
const ASSETS = path.join(SOCIAL, 'assets'), SCENES = path.join(SOCIAL, 'scenes');
const W = 1080, H = 1920, FPS = 30;
const LEAD = 0.3;    // a moment of picture before the voice starts
const TAIL = 2.1;    // the end card stays after the voice ends
const PHONE_AT = 13; // where in the recorded talk the phone scene starts (a few sentences are on screen)
const DASH_AT = 9;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CHROME = [process.env.CHROME, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => p && fs.existsSync(p));

// Voiceover timing (seconds into vo-<lang>.mp3, from its pauses, each stretch checked with Whisper). `at` = where each part of the story starts.
const LANGS = {
  en: {
    cues: [
      [0, 2.2, 'Ever sat through a talk and missed half of it?'],
      [2.69, 5.0, 'With OpenCaptions, everyone scans a QR code,'],
      [5.0, 7.39, 'and the talk appears on their phone,'],
      [7.53, 9.61, 'live, in their own language.'],
      [10.1, 11.37, 'No app to install.'],
      [11.74, 13.32, 'More than 80 languages.'],
      [13.83, 16.69, 'Organizers run every room from one laptop,'],
      [16.87, 18.71, 'with alerts if something goes wrong.'],
      [19.22, 20.25, 'Want it fully private?'],
      [20.62, 22.95, 'It can run entirely on your own computer.'],
    ],
    at: { phone: 2.69, noApp: 10.1, dash: 13.83, local: 19.22, end: 23.59, voEnd: 26.64 },
    aiTag: 'AI-generated scene',
    kit: 'Scan the QR code',
    phones: [['The talk, in English', 0.42], ['…or in Spanish', 0.58]],
    dash: 'Every room, one laptop',
    local: { title: 'On your own computer', chips: ['Private', 'Free', 'Works offline'] },
    end: { line: 'Live captions and translation for events', chips: ['Free', 'Open source', '82 languages'] },
  },
  es: {
    cues: [
      [0, 2.52, '¿Alguna vez te perdiste la mitad de una charla?'],
      [3.03, 5.98, 'Con OpenCaptions, todos escanean un código QR'],
      [5.98, 8.06, 'y la charla aparece en su teléfono,'],
      [8.23, 9.72, 'en vivo y en su idioma.'],
      [10.1, 11.24, 'Sin instalar nada.'],
      [11.54, 13.07, 'En más de 80 idiomas.'],
      [13.42, 14.88, 'Los organizadores manejan'],
      [15.0, 17.43, 'todas las salas desde una sola computadora,'],
      [17.66, 19.23, 'con alertas si algo falla.'],
      [19.54, 20.98, '¿Quieres privacidad total?'],
      [21.3, 23.84, 'Todo puede funcionar en tu propia computadora.'],
    ],
    at: { phone: 3.03, noApp: 10.1, dash: 13.42, local: 19.54, end: 24.14, voEnd: 27.04 },
    aiTag: 'Escena generada con IA',
    kit: 'Escanea el código QR',
    phones: [['Tu teléfono, en tu idioma', 1]],
    dash: 'Todas las salas, una computadora',
    local: { title: 'En tu propia computadora', chips: ['Privado', 'Gratis', 'Sin internet'] },
    end: { line: 'Subtítulos y traducción en vivo para eventos', chips: ['Gratis', 'Código abierto', '82 idiomas'] },
  },
};

const wanted = process.argv.slice(2).filter((a) => LANGS[a]);
const langs = wanted.length ? wanted : Object.keys(LANGS);
for (const f of ['ai1-hall.mp4', 'ai2-phone.mp4', 'ai3-audience.mp4', ...langs.map((l) => `vo-${l}.mp3`)]) {
  if (!fs.existsSync(path.join(ASSETS, f))) { tty.fail(`missing dist/social/assets/${f}`); process.exit(1); }
}
for (const f of ['phone-es.mp4', 'phone-en.mp4', 'dashboard.mp4', 'kit.png']) {
  if (!fs.existsSync(path.join(SCENES, f))) { tty.fail(`missing dist/social/scenes/${f}: run node scripts/record-social.js`); process.exit(1); }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-compose-'));
const done = [];
process.on('exit', () => { for (const f of done.reverse()) try { f(); } catch { /* best effort */ } });
const ff = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
const enc = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(FPS)];

// ---------- text and frames, drawn by Chrome ----------
const port = 9400 + Math.floor(Math.random() * 400);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-compose-chrome-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars', '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
done.push(() => { chrome.kill(); setTimeout(() => fs.rmSync(profile, { recursive: true, force: true }), 300); });
let info;
for (let i = 0; i < 100 && !info; i++) { try { info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { await sleep(100); } }
const ws = new WebSocket(info.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
await new Promise((r) => ws.once('open', r));
done.push(() => ws.close());
let seq = 0;
const pending = new Map();
ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } });
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params, sessionId })); });
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const c = (m, p) => send(m, p, sessionId);
await c('Page.enable');
await c('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await c('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });

const url = (p) => pathToFileURL(path.join(ROOT, p)).href;
const CSS = `
  @font-face { font-family: 'Atkinson'; src: url(${url('public/fonts/atkinsonnext/latin-normal-3.woff2')}) format('woff2'); font-weight: 200 800; }
  @font-face { font-family: 'Bricolage'; src: url(${url('public/fonts/bricolage/latin-normal-2.woff2')}) format('woff2'); font-weight: 200 800; }
  :root { --ink: #111014; --paper: #FAF8F3; --lime: #D4FF3A; --graphite: #26252C; --fog: #E8E5DD; }
  html, body { margin: 0; width: ${W}px; height: ${H}px; background: transparent; overflow: hidden; }
  body { position: relative; font-family: 'Atkinson', sans-serif; color: var(--paper); }
  .label { position: absolute; left: 60px; right: 60px; top: 64px; text-align: center; font: 800 58px/1.1 'Bricolage', sans-serif; letter-spacing: -.01em; }
  .label span { background: var(--lime); color: var(--ink); padding: 4px 18px 8px; border-radius: 14px; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
  .chip { display: inline-block; border: 2px solid currentColor; border-radius: 999px; padding: 10px 26px 12px; font: 700 36px/1 'Atkinson'; margin: 0 8px 14px; }`;
let n = 0;
async function png(body, name = `t${n++}`) {
  const file = path.join(tmp, `${name}.html`), out = path.join(tmp, `${name}.png`);
  fs.writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${body}</body></html>`);
  await c('Page.navigate', { url: pathToFileURL(file).href });
  await sleep(250);
  await c('Runtime.evaluate', { expression: 'Promise.all([document.fonts.ready, ...[...document.images].map((i) => i.decode().catch(() => {}))])', awaitPromise: true });
  fs.writeFileSync(out, Buffer.from((await c('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  return out;
}
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const cuePng = (text) => png(`<div style="position:absolute;left:70px;right:70px;bottom:150px;text-align:center">
  <span style="display:inline;font:700 60px/1.42 'Atkinson';background:rgba(17,16,20,.86);padding:8px 26px 12px;border-radius:20px;box-decoration-break:clone;-webkit-box-decoration-break:clone">${esc(text)}</span></div>`);
const labelPng = (text) => png(`<div class="label"><span>${esc(text)}</span></div>`);
const tagPng = (text) => png(`<div style="position:absolute;top:64px;left:56px;font:700 30px/1 'Atkinson';color:var(--fog);background:rgba(17,16,20,.6);padding:12px 20px 14px;border-radius:999px">✦ ${esc(text)}</div>`);
// A device around a screen: ink everywhere except the screen, with a graphite bezel.
const PHONE = { x: 189, y: 220, w: 702, h: 1520, r: 70, bezel: 18 };
const DASH = { x: 40, y: 400, w: 1000, h: 1006, r: 30, bezel: 14 };
const DASH_CROP = { x: 0, y: 385, w: 900, h: 905 }; // the Live section of the 900×1500 recording: totals and room cards
const framePng = (b) => png(`<svg width="${W}" height="${H}" style="position:absolute;inset:0">
  <defs><mask id="m"><rect width="${W}" height="${H}" fill="#fff"/><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${b.r}" fill="#000"/></mask></defs>
  <rect width="${W}" height="${H}" fill="#111014" mask="url(#m)"/>
  <rect x="${b.x - b.bezel}" y="${b.y - b.bezel}" width="${b.w + 2 * b.bezel}" height="${b.h + 2 * b.bezel}" rx="${b.r + b.bezel}" fill="#26252C" stroke="#3A3940" stroke-width="2" mask="url(#m)"/></svg>`);

// The A4 poster cut out of the kit page (its coordinates in kit.png), on ink.
const POSTER = { x: 110, y: 250, w: 860, crop: { x: 146, y: 662, w: 788, h: 1118 }, qr: { x: 394, y: 543 } };
POSTER.s = POSTER.w / POSTER.crop.w;
const poster = await png(`<div style="position:absolute;inset:0;background:var(--ink)"></div>
  <div style="position:absolute;left:${POSTER.x}px;top:${POSTER.y}px;width:${POSTER.w}px;height:${Math.round(POSTER.crop.h * POSTER.s)}px;border-radius:18px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.55)">
    <img src="${pathToFileURL(path.join(SCENES, 'kit.png')).href}" style="position:absolute;left:${-POSTER.crop.x * POSTER.s}px;top:${-POSTER.crop.y * POSTER.s}px;width:${1080 * POSTER.s}px"></div>`, 'poster');

// ---------- one video per language ----------
const tag = {};
for (const lang of langs) {
  const L = LANGS[lang];
  const sp = tty.spinner(`${lang}: drawing text`);
  const at = Object.fromEntries(Object.entries(L.at).map(([k, v]) => [k, v + LEAD]));
  const cut = (t) => t - 0.15; // cut just before the sentence that goes with the next picture
  const T = { s1: cut(at.phone), s2: cut(at.noApp), s3: cut(at.dash), s4: cut(at.local), s5: cut(at.end), total: at.voEnd + TAIL };
  const dur = { hall: T.s1, phone: T.s2 - T.s1, noApp: T.s3 - T.s2, dash: T.s4 - T.s3, local: T.s5 - T.s4, end: T.total - T.s5 };
  tag[lang] ??= await tagPng(L.aiTag);
  const phoneFrame = await framePng(PHONE), dashFrame = await framePng(DASH);
  const kitLabel = await labelPng(L.kit), dashLabel = await labelPng(L.dash);
  const phoneLabels = [];
  for (const [text, share] of L.phones) phoneLabels.push({ file: await labelPng(text), share });
  const local = await png(`<div style="position:absolute;inset:0;background:var(--ink)"></div>
    <div style="position:absolute;left:70px;right:70px;top:300px;background:var(--paper);color:var(--ink);border-radius:44px;overflow:hidden;text-align:center">
      <img src="${url('public/art/local.webp')}" style="display:block;width:100%;height:auto">
      <div style="padding:20px 40px 50px"><div style="font:800 76px/1.05 'Bricolage';letter-spacing:-.015em;margin:10px 0 34px">${esc(L.local.title)}</div>
      ${L.local.chips.map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div></div>`);
  const end = await png(`<div style="position:absolute;inset:0;background:rgba(17,16,20,.86)"></div>
    <div style="position:absolute;left:80px;right:80px;top:640px;text-align:center">
      <div style="display:flex;align-items:center;justify-content:center;gap:26px"><img src="${url('public/brand/mark-dark.svg')}" style="height:132px;width:auto"><span style="font:800 104px/1 'Bricolage';letter-spacing:-.02em">OpenCaptions</span></div>
      <div style="font:700 50px/1.3 'Atkinson';margin:56px 0 46px;color:var(--fog)">${esc(L.end.line)}</div>
      <div style="color:var(--lime)">${L.end.chips.map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div>
      <div style="font:800 58px/1 'Bricolage';margin-top:70px">opencaptions.kvza.ar</div></div>`);
  const cues = [];
  for (const [a, b, text] of L.cues) cues.push({ a: a + LEAD, b: b + LEAD, file: await cuePng(text) });
  sp.succeed(`${lang}: text drawn`);

  // ---------- the scenes ----------
  const sc = tty.spinner(`${lang}: scenes`);
  const seg = (name) => path.join(tmp, `${lang}-${name}.mp4`);
  const ai = (clip, d, out) => ff(['-i', path.join(ASSETS, clip), '-i', tag[lang], '-filter_complex',
    `[0:v]scale=${W}:${H}:flags=lanczos,fps=${FPS},trim=0:${d.toFixed(3)},setpts=PTS-STARTPTS[v];[v][1:v]overlay=0:0`, '-an', ...enc, out]);
  ai('ai1-hall.mp4', dur.hall, seg('1'));
  // The QR kit's poster on its own (clear of the label and the subtitles), slowly closer to its code, then the
  // phone(s) reading the talk.
  const KIT = 1.6, kf = Math.round(KIT * FPS), q = { x: POSTER.x + POSTER.qr.x * POSTER.s, y: POSTER.y + POSTER.qr.y * POSTER.s };
  ff(['-loop', '1', '-i', poster, '-i', kitLabel, '-filter_complex',
    `[0:v]scale=${W * 2}:${H * 2},zoompan=z='1+0.1*on/${kf}':d=${kf}:s=${W}x${H}:fps=${FPS}:` +
    `x='${2 * q.x}*(1-1/zoom)':y='${2 * q.y}*(1-1/zoom)'[k];[k][1:v]overlay=0:0`, '-t', String(KIT), ...enc, seg('2a')]);
  const phoneParts = [];
  let from = PHONE_AT;
  const phoneTotal = dur.phone - KIT;
  for (const [i, p] of phoneLabels.entries()) {
    const d = phoneTotal * p.share, clip = i === 0 && L.phones.length > 1 ? 'phone-en.mp4' : 'phone-es.mp4';
    const out = seg(`2b${i}`);
    ff(['-ss', from.toFixed(3), '-i', path.join(SCENES, clip), '-i', phoneFrame, '-i', p.file, '-filter_complex',
      `color=c=#111014:s=${W}x${H}:r=${FPS}[bg];[0:v]scale=${PHONE.w}:${PHONE.h}:flags=lanczos,setsar=1[ph];[bg][ph]overlay=${PHONE.x}:${PHONE.y}:shortest=1[a];[a][1:v]overlay=0:0[b];[b][2:v]overlay=0:0`,
      '-t', d.toFixed(3), ...enc, out]);
    phoneParts.push(out);
    from += d;
  }
  ai('ai2-phone.mp4', dur.noApp, seg('3'));
  ff(['-ss', String(DASH_AT), '-i', path.join(SCENES, 'dashboard.mp4'), '-i', dashFrame, '-i', dashLabel, '-filter_complex',
    `color=c=#111014:s=${W}x${H}:r=${FPS}[bg];[0:v]crop=${DASH_CROP.w}:${DASH_CROP.h}:${DASH_CROP.x}:${DASH_CROP.y},scale=${DASH.w}:${DASH.h}:flags=lanczos,setsar=1[d];[bg][d]overlay=${DASH.x}:${DASH.y}:shortest=1[a];[a][1:v]overlay=0:0[b];[b][2:v]overlay=0:0`,
    '-t', dur.dash.toFixed(3), ...enc, seg('4')]);
  const lf = Math.round(dur.local * FPS);
  ff(['-loop', '1', '-i', local, '-filter_complex', `[0:v]scale=${W * 2}:${H * 2},zoompan=z='1+0.04*on/${lf}':d=${lf}:s=${W}x${H}:fps=${FPS}:x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2'`,
    '-t', dur.local.toFixed(3), ...enc, seg('5')]);
  // The audience, then the end card fading in over it as the voice says the name.
  ff(['-i', path.join(ASSETS, 'ai3-audience.mp4'), '-i', tag[lang], '-loop', '1', '-i', end, '-filter_complex',
    `[0:v]scale=${W}:${H}:flags=lanczos,fps=${FPS},tpad=stop_mode=clone:stop_duration=3,trim=0:${dur.end.toFixed(3)},setpts=PTS-STARTPTS[v];[v][1:v]overlay=0:0[a];` +
    `[2:v]format=rgba,fade=in:st=0.15:d=0.6:alpha=1,trim=0:${dur.end.toFixed(3)},setpts=PTS-STARTPTS[e];[a][e]overlay=0:0`, '-t', dur.end.toFixed(3), ...enc, seg('6')]);
  sc.succeed(`${lang}: scenes`);

  // ---------- together: scenes, subtitles, voice ----------
  const cm = tty.spinner(`${lang}: composing`);
  const parts = [seg('1'), seg('2a'), ...phoneParts, seg('3'), seg('4'), seg('5'), seg('6')];
  const list = path.join(tmp, `${lang}-list.txt`);
  fs.writeFileSync(list, parts.map((p) => `file '${p}'`).join('\n'));
  const joined = path.join(tmp, `${lang}-joined.mp4`);
  ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', joined]);
  const inputs = ['-i', joined, '-i', path.join(ASSETS, `vo-${lang}.mp3`), ...cues.flatMap((q) => ['-i', q.file])];
  let chain = '[0:v]null[v0]';
  cues.forEach((q, i) => { chain += `;[v${i}][${i + 2}:v]overlay=0:0:enable='between(t,${q.a.toFixed(2)},${q.b.toFixed(2)})'[v${i + 1}]`; });
  const ms = Math.round(LEAD * 1000);
  chain += `;[1:a]adelay=${ms}|${ms},apad,atrim=0:${T.total.toFixed(3)},loudnorm=I=-14:TP=-1.5:LRA=11[a]`;
  const out = path.join(SOCIAL, `opencaptions-${lang}.mp4`);
  ff([...inputs, '-filter_complex', chain, '-map', `[v${cues.length}]`, '-map', '[a]', ...enc, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-t', T.total.toFixed(3), '-movflags', '+faststart', out]);
  ff(['-ss', (T.s1 + KIT + 2.4).toFixed(2), '-i', out, '-frames:v', '1', '-q:v', '3', out.replace(/\.mp4$/, '.jpg')]);
  cm.succeed(`${lang}: ${path.relative(ROOT, out)} (${T.total.toFixed(1)} s, ${Math.round(fs.statSync(out).size / 1024)} KB)`);
}
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(0);
