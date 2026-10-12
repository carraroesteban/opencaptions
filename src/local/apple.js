// Apple's speech recognition and translation, built into macOS 26 and later (docs/local.md): nothing to download
// for languages the Mac already has. The work is done by the small Swift helper next to this file (apple.swift),
// compiled once with the Mac's own swiftc into <LOCAL>/bin; the Mac app ships it prebuilt (scripts/package-desktop.js).
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { LOCAL } from './setup.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, 'apple.swift');
const PREBUILT = path.join(HERE, 'opencaptions-apple'); // the Mac app's copy
/** Could this computer run it at all? macOS 26 is Darwin 25. */
export const appleSupported = () => process.platform === 'darwin' && Number(os.release().split('.')[0]) >= 25;

const run = (file, args, opts = {}) => new Promise((resolve, reject) => {
  execFile(file, args, { timeout: 180_000, maxBuffer: 4e6, ...opts }, (e, stdout, stderr) => (e ? reject(Object.assign(e, { stderr })) : resolve(stdout)));
});

let building = null;
/** The helper's path, compiling it the first time (about 5 s; needs the Mac's developer tools for swiftc). */
export function appleHelper() {
  if (!appleSupported()) return Promise.reject(new Error('Apple\'s on-device speech needs macOS 26 or later'));
  const BUILT = path.join(LOCAL, 'bin', 'opencaptions-apple'); // not at load time: setup.js imports this file too
  const fresh = (p) => fs.existsSync(p) && fs.statSync(p).mtimeMs >= fs.statSync(SRC).mtimeMs;
  if (fresh(PREBUILT)) return Promise.resolve(PREBUILT);
  if (fresh(BUILT)) return Promise.resolve(BUILT);
  building ??= (async () => {
    fs.mkdirSync(path.dirname(BUILT), { recursive: true });
    const tmp = `${BUILT}.${process.pid}.tmp`;
    try {
      await run('xcrun', ['swiftc', '-parse-as-library', '-O', SRC, '-o', tmp]);
    } catch (e) {
      throw new Error(`couldn't build the Apple speech helper (needs Apple's developer tools: xcode-select --install): ${String(e.stderr || e.message).trim().split('\n').slice(-3).join(' ')}`, { cause: e });
    }
    fs.renameSync(tmp, BUILT);
    return BUILT;
  })().finally(() => { building = null; });
  return building;
}

/** One JSON object per line from a helper's stdout. */
export function jsonLines(stream, each) {
  readline.createInterface({ input: stream }).on('line', (l) => {
    let o;
    try { o = JSON.parse(l); } catch { return; }
    each(o);
  });
}

/**
 * What this Mac can do for a language: { speech, installed: [...], supported: [...], locale, status, translation: { es: 'installed' } }.
 * status: installed | supported (Apple downloads it on first use) | unsupported.
 */
export async function appleCheck(lang = 'en', to = []) {
  return JSON.parse(await run(await appleHelper(), ['check', '--lang', lang, '--to', to.join(',')], { timeout: 30_000 }));
}

/** The Mac's own language ("en" for en_AR): what to listen for when a room doesn't say. */
export const macLanguage = () => (Intl.DateTimeFormat().resolvedOptions().locale || 'en').split('-')[0];

/**
 * Start `helper listen`: write PCM16 16 kHz mono to its stdin, read {ready} {partial} {final} {log} {error} lines.
 * @returns {Promise<import('node:child_process').ChildProcessWithoutNullStreams>}
 */
export async function appleListen({ lang, vocabulary = [] }) {
  const args = ['listen', '--lang', lang];
  if (vocabulary.length) args.push('--vocab', JSON.stringify(vocabulary.slice(0, 100)));
  return spawn(await appleHelper(), args, { stdio: ['pipe', 'pipe', 'pipe'] });
}

/**
 * A whole piece of audio at once (captioning a recording, src/recording.js): the same shape as asr.js's transcribe().
 * @param {Buffer} pcm
 * @param {{ language?: string | null, signal?: AbortSignal }} [o]
 */
export async function appleTranscribe(pcm, { language = null, signal } = {}) {
  const lang = language || macLanguage();
  const p = await appleListen({ lang });
  const segments = [];
  let error = '';
  jsonLines(p.stdout, (o) => {
    if (o.final) segments.push({ start: o.start, end: o.end, text: o.final });
    if (o.error) error = o.error;
  });
  const done = new Promise((resolve) => p.on('close', resolve));
  const abort = () => p.kill();
  signal?.addEventListener('abort', abort, { once: true });
  p.stdin.on('error', () => {}); // it exited early: reported below
  p.stdin.end(pcm);
  await done;
  signal?.removeEventListener('abort', abort);
  if (signal?.aborted) throw new Error('aborted');
  if (error) throw new Error(`Apple speech: ${error}`);
  const text = segments.map((s) => s.text).join(' ');
  return { raw: text, text, lang, noSpeech: 0, duration: pcm.length / 32000, segments };
}

// ---------- translation: one helper for every room, sentences in order ----------
let tr = null;
const waiting = new Map();
let nextId = 0;

/** Translate one sentence with Apple's Translation framework (languages downloaded in System Settings). */
export async function appleTranslate(text, from, to, timeoutMs = 15_000) {
  if (!tr) {
    const p = spawn(await appleHelper(), ['translate'], { stdio: ['pipe', 'pipe', 'ignore'] });
    tr = p;
    jsonLines(p.stdout, (o) => {
      const w = waiting.get(o.id);
      if (!w) return;
      waiting.delete(o.id);
      if (o.error) w.reject(new Error(o.error)); else w.resolve(o.text);
    });
    p.stdin.on('error', () => {});
    p.on('close', () => {
      if (tr === p) tr = null;
      for (const w of waiting.values()) w.reject(new Error('Apple translation stopped'));
      waiting.clear();
    });
  }
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { waiting.delete(id); reject(new Error('Apple translation timed out')); }, timeoutMs);
    waiting.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
    tr.stdin.write(`${JSON.stringify({ id, text, from, to })}\n`);
  });
}
