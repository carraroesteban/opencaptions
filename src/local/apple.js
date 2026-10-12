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

// ---------- translation and voice: one helper each for every room, answers in order ----------
/** Requests to a long-lived `helper <mode>`; each answer line goes to `each` until it returns something (the result). */
function service(mode) {
  let proc = null;
  const waiting = new Map();
  let nextId = 0;
  return async (req, each, timeoutMs) => {
    if (!proc) {
      const p = spawn(await appleHelper(), [mode], { stdio: ['pipe', 'pipe', 'ignore'] });
      proc = p;
      jsonLines(p.stdout, (o) => { if (waiting.get(o.id)?.(o)) waiting.delete(o.id); });
      p.stdin.on('error', () => {});
      p.on('close', () => {
        if (proc === p) proc = null;
        for (const w of waiting.values()) w({ error: `Apple ${mode} stopped` });
        waiting.clear();
      });
    }
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { waiting.delete(id); reject(new Error(`Apple ${mode} timed out`)); }, timeoutMs);
      waiting.set(id, (o) => {
        const r = o.error ? undefined : each(o);
        if (!o.error && r === undefined) return false;
        clearTimeout(timer);
        if (o.error) reject(new Error(o.error)); else resolve(r);
        return true;
      });
      proc.stdin.write(`${JSON.stringify({ id, ...req })}\n`);
    });
  };
}

const translator = service('translate');
/** Translate one sentence with Apple's Translation framework (languages downloaded in System Settings). */
export const appleTranslate = (text, from, to, timeoutMs = 15_000) => translator({ text, from, to }, (o) => o.text, timeoutMs);

const speaker = service('speak');
/**
 * Read a sentence aloud with the Mac's best voice for `lang` (rate 1 = normal): 24 kHz mono PCM16 to onPcm, the format
 * phones play for 🎧. Resolves with the voice's name. About 0.1 s after the text (2 s the first time a voice loads).
 */
export const appleSpeak = (text, lang, rate, onPcm, timeoutMs = 15_000) =>
  speaker({ text, lang, rate }, (o) => (o.pcm ? void onPcm(Buffer.from(o.pcm, 'base64')) : o.voice ?? ''), timeoutMs);

const LEAD_MS = 1000; // audio goes out this far ahead of the listener's ear: phones skip what is over 3 s ahead (PcmPlayer)

/**
 * A room's translated voice in one language, like AirPods' Live Translation: each finished translated sentence read
 * aloud and sent to phones at the pace it's spoken (Apple makes a sentence in a tenth of a second). Behind a fast
 * speaker, it keeps only the two newest sentences waiting and reads a little faster, like the phones' own voice
 * (public/speak.js).
 * @param {string} lang
 * @param {(pcm: Buffer) => void} onPcm
 * @param {(msg: string) => void} onError  once per new problem (no voice for the language…)
 */
export function appleVoice(lang, onPcm, onError, speak = appleSpeak) {
  const queue = [];
  let busy = false;
  let stopped = false;
  let end = 0; // when the last audio sent will have been heard
  let lastError = '';
  const next = async () => {
    const text = queue.shift();
    if (!text || stopped) { busy = false; return; }
    busy = true;
    try {
      await speak(text, lang, queue.length ? 1.15 : 1, (pcm) => {
        const now = Date.now();
        setTimeout(() => stopped || onPcm(pcm), Math.max(0, end - now - LEAD_MS));
        end = Math.max(end, now) + pcm.length / 48; // ms of 24 kHz PCM16
      });
      lastError = '';
    } catch (e) {
      if (e.message !== lastError) onError(e.message);
      lastError = e.message;
    }
    setTimeout(next, Math.max(0, end - Date.now() - LEAD_MS)); // the next sentence as this one is nearly heard
  };
  return {
    say(text) {
      if (stopped || !text?.trim()) return;
      queue.push(text.trim());
      if (queue.length > 2) queue.splice(0, queue.length - 2);
      if (!busy) next();
    },
    stop() { stopped = true; queue.length = 0; },
  };
}
