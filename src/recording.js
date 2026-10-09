// Caption a recording: an audio or video file from anyone's computer becomes a normal transcript of a room (the same
// meta.json + captions.jsonl as a live talk, so exports, the .zip, the report and the AI summary work on it), much
// faster than real time. Nothing goes through a live room, and live rooms come first for the AI on this machine.
//
//   upload (POST /api/recordings, the file as the request body) → a temporary folder, checked with ffmpeg (it must
//   be audio or video; its length) → estimate → start (room, spoken language, caption languages) →
//   1. decode: ffmpeg → 16 kHz mono PCM in the temporary folder, and the loudness of every 100 ms
//   2. transcribe in pieces cut at pauses, as fast as the AI allows:
//        gemini  ≤ 5½ min pieces as Opus, several at once, to the regular API (inline, or the Files API for a big
//                piece), which returns subtitle lines with timestamps
//        local   ≤ 25 s pieces to the Whisper server (src/local/asr.js), one after another, when no live room waits
//        mock    the simulated talk of src/engines/mock.js, timed on the recording's own speech
//   3. caption lines: at most two lines of 42 characters and 7 s each, timed on the speech inside each piece
//   4. translate whole sentences (Gemini: 25 per request; a local model: one at a time with the previous ones), while
//      the transcription goes on, then lay each translation over the times of its sentence's lines
//   5. save as a talk of the room. The temporary folder is deleted when the job ends, fails or is cancelled.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { Type, createPartFromUri } from '@google/genai';
import { config } from './config.js';
import { ffmpegBin } from './pull.js';
import { rms } from './audio.js';
import { getClient } from './genai.js';
import { translateText } from './translate.js';
import { transcribe as whisper, withAsrSlot, wavFile, isNetworkError, asrInfo } from './local/asr.js';
import { promptLanguage } from './languages.js';
import { CORPUS } from './engines/mock.js';
import { toSRT, toVTT, toTXT } from './store.js';

const FRAME_MS = 100, FRAME_BYTES = 3200, BYTES_PER_MS = 32; // 16 kHz mono PCM16
export const MAX_CHARS = 84; // a caption: two lines of 42 characters
const MAX_CUE_MS = 7000;
// Containers ffmpeg may open (-format_whitelist): audio and video files only. Not playlists (hls, concat…), which
// could make ffmpeg read other files on this computer or fetch addresses.
const FORMATS = 'mov,matroska,mp3,wav,w64,ogg,flac,aac,aiff,caf,asf,avi,flv,mpegts,mpeg,amr,ac3,eac3,dts,wv,au';
const INLINE_MAX = 14 * 1024 * 1024; // a piece bigger than this goes through the Files API (requests: 20 MB, base64)
// Where to cut the recording: at a pause once a piece is this long, and at the quietest moment before the longest.
// A pause of `breakMs` always ends a local piece (no long silences sent to Whisper, which invents words in them).
const PIECES = {
  gemini: { minMs: 240_000, maxMs: 330_000, pauseMs: 600, breakMs: Infinity },
  local: { minMs: 8_000, maxMs: 25_000, pauseMs: 400, breakMs: 1_500 },
  mock: { minMs: 3_000, maxMs: 12_000, pauseMs: 300, breakMs: 1_500 },
};
const BATCH = 25; // sentences per Gemini translation request
// Uploads come in pieces of 16 MB: each request ends well within Node's 5-minute request timeout and under the
// 100 MB a Cloudflare tunnel lets through, and an upload that breaks off can carry on where it stopped.
export const CHUNK_BYTES = 16 * 1024 * 1024;
const UPLOAD_IDLE_MS = 10 * 60_000; // an upload that stopped arriving: deleted after this long
const READY_TTL_MS = 30 * 60_000; // uploaded but never started: deleted after this long
const KEEP_MS = 2 * 3600_000; // finished jobs stay listed (and exportable, for npm run subtitle) this long
const MAX_OPEN = 4; // uploads waiting, queued or running at once
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ai = null;
const client = () => ai ?? getClient(); // tests can inject their own (_setClient)
/** Test hook: inject a fake Gemini client. */
export const _setClient = (c) => { ai = c; };

// USD per 1M tokens on the paid tier (ai.google.dev/gemini-api/docs/pricing, October 2026): [audio in, text in, out].
// 3.6–3.8 Flash cost twice as much from January 2027. An unknown model is priced like the dearest Flash.
const PRICES = {
  'gemini-3.5-flash-lite': [0.30, 0.30, 2.50], 'gemini-3.1-flash-lite': [0.50, 0.25, 1.50],
  'gemini-3.8-flash': [0.75, 0.75, 3.75], 'gemini-3.7-flash': [0.75, 0.75, 3.75], 'gemini-3.6-flash': [0.75, 0.75, 3.75],
  'gemini-3.5-flash': [1.50, 1.50, 9.00], 'gemini-2.5-flash-lite': [0.30, 0.10, 0.40], 'gemini-2.5-flash': [1.00, 0.30, 2.50],
};
const price = (model) => PRICES[model] || PRICES[Object.keys(PRICES).find((k) => String(model).startsWith(k))] || [1.5, 1.5, 9];

/** A refusal the dashboard can show in its own words: `code` names it, `status` is the HTTP status. */
export class RecordingError extends Error {
  /** @param {number} status @param {string} code @param {string} message */
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
    /** @type {number | undefined} where an upload stands, when a piece came at the wrong place */
    this.size = undefined;
  }
}

// ---------------------------------------------------------------- reading the file

/**
 * Run a program; resolves with its exit code and the end of what it printed on stderr.
 * @param {string} bin @param {string[]} args @param {{ timeoutMs?: number, signal?: AbortSignal }} [o]
 */
function run(bin, args, { timeoutMs = 30_000, signal } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (b) => { err = (err + b).slice(-20_000); });
    const t = setTimeout(() => p.kill('SIGKILL'), timeoutMs);
    const stop = () => p.kill('SIGKILL');
    signal?.addEventListener('abort', stop, { once: true });
    p.on('error', reject);
    p.on('close', (code) => { clearTimeout(t); signal?.removeEventListener('abort', stop); resolve({ code, err }); });
  });
}

/** A WAV that is already 16 kHz mono 16-bit (read without ffmpeg): where its samples are. */
export function wavInfo(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const head = Buffer.alloc(4096);
    const n = fs.readSync(fd, head, 0, head.length, 0);
    if (head.toString('ascii', 0, 4) !== 'RIFF' || head.toString('ascii', 8, 12) !== 'WAVE') return null;
    let p = 12, fmt = null;
    while (p + 8 <= n) {
      const id = head.toString('ascii', p, p + 4), size = head.readUInt32LE(p + 4);
      if (id === 'fmt ') fmt = { format: head.readUInt16LE(p + 8), channels: head.readUInt16LE(p + 10), rate: head.readUInt32LE(p + 12), bits: head.readUInt16LE(p + 22) };
      if (id === 'data') {
        const total = fs.fstatSync(fd).size;
        const ok = fmt && fmt.format === 1 && fmt.channels === 1 && fmt.rate === 16000 && fmt.bits === 16;
        return ok ? { offset: p + 8, length: Math.min(size || total, total - p - 8) & ~1 } : null;
      }
      p += 8 + size + (size & 1);
    }
    return null;
  } catch { return null; } finally { if (fd !== undefined) fs.closeSync(fd); }
}

/**
 * Is this an audio or video file, and how long is it? ffmpeg reads its header (only the containers in FORMATS, only
 * from a file). Without ffmpeg, only 16 kHz mono WAV files can be read.
 * @returns {Promise<{ durationMs: number | null, format: string, audio: string, video: boolean }>}
 */
export async function probe(file) {
  const bin = ffmpegBin();
  if (!bin) {
    const w = wavInfo(file);
    if (w) return { durationMs: Math.round(w.length / BYTES_PER_MS), format: 'wav', audio: 'pcm_s16le', video: false };
    throw new RecordingError(503, 'no-ffmpeg', 'Reading this file needs ffmpeg (macOS: brew install ffmpeg · Debian/Ubuntu: apt install ffmpeg, or npm install again for the bundled one). 16 kHz mono WAV files work without it.');
  }
  // No output file: ffmpeg describes the input and exits with an error, which is expected.
  const { err } = await run(bin, ['-hide_banner', '-nostdin', '-protocol_whitelist', 'file', '-format_whitelist', FORMATS, '-i', file], { timeoutMs: 20_000 });
  const input = /Input #0, ([^\s,]+)/.exec(err);
  const audio = /Stream #0:\d+[^:]*: Audio: (\w+)/.exec(err);
  if (!input) throw new RecordingError(415, 'not-media', 'This isn’t an audio or video file OpenCaptions can read.');
  if (!audio) throw new RecordingError(415, 'no-audio', 'This file has no sound: choose an audio or video file with someone speaking.');
  const d = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(err);
  const durationMs = d ? Math.round(((+d[1] * 60 + +d[2]) * 60 + +d[3]) * 1000) : null; // "N/A": some browser recordings
  return { durationMs: durationMs || null, format: input[1], audio: audio[1], video: /Stream #0:\d+[^:]*: Video: (?!mjpeg|png)/.test(err) };
}

/**
 * The whole sound of the file as 16 kHz mono PCM in `pcmPath`, and the loudness of every 100 ms. As fast as ffmpeg
 * decodes (minutes of audio per second), at a lower CPU priority than the live rooms.
 * @param {string} input @param {string} pcmPath
 * @param {{ signal?: AbortSignal, onProgress?: (fraction: number) => void, durationMs?: number | null }} [o]
 * @returns {Promise<{ levels: Float32Array, durationMs: number }>}
 */
export function decode(input, pcmPath, { signal, onProgress = () => {}, durationMs = null } = {}) {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(pcmPath);
    const levels = [];
    let carry = Buffer.alloc(0), bytes = 0, failed = null, ended = false;
    const onData = (b) => {
      bytes += b.length;
      const buf = carry.length ? Buffer.concat([carry, b]) : b;
      let o = 0;
      for (; o + FRAME_BYTES <= buf.length; o += FRAME_BYTES) levels.push(rms(buf.subarray(o, o + FRAME_BYTES)));
      carry = Buffer.from(buf.subarray(o));
      if (durationMs) onProgress(Math.min(1, bytes / (durationMs * BYTES_PER_MS)));
    };
    const finish = () => {
      if (failed || ended) return;
      ended = true;
      out.end(() => {
        if (signal?.aborted) return reject(new RecordingError(499, 'canceled', 'cancelled'));
        if (carry.length >= 2) levels.push(rms(carry));
        resolve({ levels: Float32Array.from(levels), durationMs: Math.round(bytes / BYTES_PER_MS) });
      });
    };
    const fail = (e) => { if (failed) return; failed = e; out.destroy(); reject(e); };
    const bin = ffmpegBin();
    const wav = bin ? null : wavInfo(input);
    let src;
    if (bin) {
      const proc = spawn(bin, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-protocol_whitelist', 'file', '-format_whitelist', FORMATS,
        '-i', input, '-vn', '-sn', '-dn', '-ac', '1', '-ar', '16000', '-f', 's16le', 'pipe:1'], { stdio: ['ignore', 'pipe', 'pipe'] });
      try { os.setPriority(proc.pid, 10); } catch { /* not allowed here: normal priority */ }
      let err = '';
      proc.stderr.on('data', (b) => { err = (err + b).slice(-2000); });
      proc.on('error', (e) => fail(e));
      const stop = () => proc.kill('SIGKILL');
      signal?.addEventListener('abort', stop, { once: true });
      proc.on('close', (code) => {
        signal?.removeEventListener('abort', stop);
        if (code && !signal?.aborted) fail(new RecordingError(422, 'decode', `ffmpeg couldn’t read the sound: ${err.trim().split('\n').pop() || `exit ${code}`}`));
      });
      src = proc.stdout;
    } else if (wav) {
      src = fs.createReadStream(input, { start: wav.offset, end: wav.offset + wav.length - 1 });
      signal?.addEventListener('abort', () => src.destroy(), { once: true });
      src.on('error', fail);
    } else return fail(new RecordingError(503, 'no-ffmpeg', 'Reading this file needs ffmpeg.'));
    src.on('data', onData);
    src.on('end', finish);
    src.on('close', () => { if (signal?.aborted) finish(); });
    src.pipe(out);
  });
}

/** Bytes of the decoded sound between two 100 ms frames. */
function readPcm(pcmPath, from, to) {
  const fd = fs.openSync(pcmPath, 'r');
  try {
    const buf = Buffer.alloc(Math.max(0, (to - from) * FRAME_BYTES));
    const n = fs.readSync(fd, buf, 0, buf.length, from * FRAME_BYTES);
    return buf.subarray(0, n);
  } finally { fs.closeSync(fd); }
}

/** PCM → Ogg Opus at 24 kbit/s (Gemini hears 16 kbit/s anyway): a 5-minute piece is about 1 MB instead of 10. */
function encodeOpus(pcm, signal) {
  const bin = ffmpegBin();
  if (!bin) return Promise.resolve({ data: wavFile(pcm), mimeType: 'audio/wav' });
  return new Promise((resolve) => {
    const p = spawn(bin, ['-hide_banner', '-loglevel', 'error', '-f', 's16le', '-ar', '16000', '-ac', '1', '-i', 'pipe:0',
      '-c:a', 'libopus', '-b:a', '24k', '-application', 'voip', '-f', 'ogg', 'pipe:1'], { stdio: ['pipe', 'pipe', 'ignore'] });
    const parts = [];
    const stop = () => p.kill('SIGKILL');
    signal?.addEventListener('abort', stop, { once: true });
    p.stdout.on('data', (b) => parts.push(b));
    p.stdin.on('error', () => {}); // ffmpeg ended early: WAV below
    p.on('error', () => resolve({ data: wavFile(pcm), mimeType: 'audio/wav' }));
    p.on('close', (code) => {
      signal?.removeEventListener('abort', stop);
      resolve(code === 0 && parts.length ? { data: Buffer.concat(parts), mimeType: 'audio/ogg' } : { data: wavFile(pcm), mimeType: 'audio/wav' }); // no libopus: WAV
    });
    p.stdin.end(pcm);
  });
}

// ---------------------------------------------------------------- where the speech is

/** Loudness above which a 100 ms frame counts as speech in this recording: three times its quiet floor, within bounds. */
export function speechThreshold(levels) {
  if (!levels.length) return config.speechRms;
  const sorted = Float32Array.from(levels).sort();
  return Math.min(config.speechRms, Math.max(0.004, sorted[Math.floor(sorted.length * 0.1)] * 3));
}

/**
 * Cut the recording into pieces to transcribe, in 100 ms frames [from, to): silence before a piece is skipped; a
 * piece ends at a pause once it is `minMs` long (or at any pause of `breakMs`), and at its quietest moment before
 * `maxMs`. Pieces with less than 300 ms of speech are left out.
 * @param {ArrayLike<number>} levels
 * @param {number} thr
 * @param {{ minMs: number, maxMs: number, pauseMs: number, breakMs: number }} o
 */
export function cutPieces(levels, thr, { minMs, maxMs, pauseMs, breakMs }) {
  const n = levels.length, minF = minMs / FRAME_MS, maxF = maxMs / FRAME_MS;
  const pauseF = Math.max(1, Math.round(pauseMs / FRAME_MS)), breakF = breakMs / FRAME_MS;
  const loud = (i) => levels[i] >= thr;
  const out = [];
  let i = 0;
  while (i < n) {
    while (i < n && !loud(i)) i++;
    if (i >= n) break;
    const from = Math.max(out.length ? out[out.length - 1].to : 0, i - 2); // 200 ms before the first word
    let cut = n, quiet = 0;
    for (let j = i; j < n; j++) {
      quiet = loud(j) ? 0 : quiet + 1;
      if (quiet >= pauseF && (j - from >= minF || quiet >= breakF)) { cut = j - quiet + 1 + Math.min(3, quiet); break; } // keep 300 ms of the pause
      if (j + 1 - from >= maxF) {
        let q = j;
        for (let k = j; k >= from + Math.floor(maxF * 0.6); k--) if (levels[k] < levels[q]) q = k;
        cut = q + 1;
        break;
      }
    }
    let voiced = 0;
    for (let k = from; k < cut; k++) if (loud(k)) voiced++;
    if (voiced >= 3) out.push({ from, to: cut, voiced });
    i = cut;
  }
  return out;
}

const endsSentence = (t) => /[.?!…。？！]["'”’»)\]]*\s*$/.test(String(t || ''));

/**
 * Text → caption lines of at most `max` characters, cut where it reads best: after a sentence, then after a comma or
 * a colon, then between words, as near as possible to equal lengths.
 */
export function splitLine(text, max = MAX_CHARS) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s ? [s] : [];
  const target = s.length / Math.ceil(s.length / max);
  let best = -1, bestScore = Infinity;
  for (let p = s.indexOf(' '); p > 0 && p <= max; p = s.indexOf(' ', p + 1)) {
    if (p < Math.min(12, max / 3)) continue;
    const head = s.slice(0, p);
    // Subtitlers end a line with its sentence (or clause) rather than make lines even, and not on a short word
    // that belongs with the next line ("and I", "de la").
    const bonus = endsSentence(head) ? 45 : /[,;:—–]["'”’»)]?$/.test(head) ? 20 : /(^|\s)[\p{L}]{1,3}$/u.test(head) ? -10 : 0;
    const score = Math.abs(p - target) - bonus;
    if (score < bestScore) { bestScore = score; best = p; }
  }
  const cut = best > 0 ? best : max; // no space (Chinese, Japanese…): a hard cut
  return [s.slice(0, cut).trim(), ...splitLine(s.slice(cut), max)];
}

/**
 * Parts of a text placed in time: by the speech inside [start, end), as the share of its characters, with each
 * change of line moved to a pause nearby (≤ 1.5 s away) when there is one; without enough speech, evenly.
 */
export function spread(parts, start, end, levels, thr) {
  const total = parts.reduce((a, p) => a + p.length + 1, 0) || 1;
  const voiced = [];
  for (let f = Math.floor(start / FRAME_MS); f < Math.ceil(end / FRAME_MS) && f < levels.length; f++) if (levels[f] >= thr) voiced.push(f);
  const clamp = (x) => Math.round(Math.max(start, Math.min(x, end)));
  if (voiced.length < parts.length * 2) {
    let acc = 0;
    return parts.map((text) => {
      const s = start + (acc / total) * (end - start);
      acc += text.length + 1;
      return { start: clamp(s), end: clamp(start + (acc / total) * (end - start)), text };
    });
  }
  const gaps = []; // index in `voiced` of the first frame after a pause of ≥ 200 ms
  for (let i = 1; i < voiced.length; i++) if (voiced[i] - voiced[i - 1] > 2) gaps.push(i);
  const cuts = [0];
  let acc = 0;
  for (const text of parts.slice(0, -1)) {
    acc += text.length + 1;
    let k = Math.round((acc / total) * voiced.length);
    const near = gaps.filter((g) => g > cuts[cuts.length - 1] && g < voiced.length && Math.abs(voiced[g] - voiced[Math.min(k, voiced.length - 1)]) <= 15);
    if (near.length) k = near.reduce((b, g) => (Math.abs(g - k) < Math.abs(b - k) ? g : b));
    cuts.push(Math.max(cuts[cuts.length - 1] + 1, Math.min(k, voiced.length - (parts.length - cuts.length))));
  }
  cuts.push(voiced.length);
  return parts.map((text, i) => {
    const s = voiced[cuts[i]] * FRAME_MS, e = (voiced[cuts[i + 1] - 1] + 1) * FRAME_MS;
    return { start: clamp(s), end: Math.max(clamp(s) + 1, clamp(e)), text };
  });
}

/**
 * Transcribed segments (times in ms from the start of the recording) → caption lines: long segments are split into
 * lines placed on the speech, lines don't overlap, and short ones stay on screen long enough to read (≈ 55 ms per
 * character, at least 1 s) when the next one leaves room.
 */
export function buildCues(segments, levels, thr) {
  const cues = [];
  for (const seg of [...segments].sort((a, b) => a.start - b.start)) {
    let parts = splitLine(seg.text);
    if (!parts.length) continue;
    const need = Math.ceil((seg.end - seg.start) / MAX_CUE_MS);
    if (need > parts.length && seg.text.split(/\s+/).length >= need * 3) parts = splitLine(seg.text, Math.max(24, Math.ceil(seg.text.length / need) + 8));
    cues.push(...(parts.length === 1 ? [{ start: seg.start, end: seg.end, text: parts[0] }] : spread(parts, seg.start, seg.end, levels, thr)));
  }
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i], next = cues[i + 1];
    if (next && c.end > next.start) c.end = Math.max(c.start + 1, next.start);
    const read = Math.max(1000, c.text.length * 55);
    if (c.end - c.start < read) c.end = Math.max(c.end, Math.min(c.start + read, next ? next.start : c.start + read));
  }
  return cues;
}

/** Caption lines → sentences to translate whole: a sentence ends with its punctuation, a pause of 2 s or 6 lines. */
export function sentences(cues) {
  const out = [];
  let cur = null;
  cues.forEach((c, i) => {
    if (!cur) out.push((cur = { cues: [], text: '' }));
    cur.cues.push(c);
    cur.text = cur.text ? `${cur.text} ${c.text}` : c.text;
    const next = cues[i + 1];
    if (!next || endsSentence(c.text) || next.start - c.end > 2000 || cur.cues.length >= 6 || cur.text.length >= 400) cur = null;
  });
  return out;
}

/**
 * A translated sentence over the times of its original lines: cut at the word boundaries nearest to where the
 * original lines end (by length), so each piece shows while its original is spoken. A translation too long for that
 * many lines is split into more, spread over the sentence.
 */
export function placeTranslation(sent, translated) {
  const text = String(translated || '').replace(/\s+/g, ' ').trim();
  const src = sent.cues;
  if (!text || !src.length) return [];
  const words = text.split(' ');
  const start = src[0].start, end = src[src.length - 1].end;
  if (src.length === 1 || words.length < src.length || Math.ceil(text.length / (MAX_CHARS + 16)) > src.length) {
    const parts = src.length === 1 && text.length <= MAX_CHARS + 16 ? [text] : splitLine(text);
    if (parts.length === 1) return [{ start, end, text }];
    const total = parts.reduce((a, p) => a + p.length + 1, 0);
    let acc = 0;
    return parts.map((p) => {
      const s = start + (acc / total) * (end - start);
      acc += p.length + 1;
      return { start: Math.round(s), end: Math.round(start + (acc / total) * (end - start)), text: p };
    });
  }
  const weights = src.map((c) => c.text.length + 1);
  const sum = weights.reduce((a, b) => a + b, 0);
  const ends = []; // word index where each line but the last ends
  let acc = 0, w = 0;
  for (let i = 0; i < src.length - 1; i++) {
    acc += weights[i];
    const goal = (acc / sum) * text.length;
    let pos = 0, bestW = w + 1, bestD = Infinity;
    for (let k = 0; k < words.length; k++) {
      pos += words[k].length + 1;
      if (k + 1 <= w || k + 1 > words.length - (src.length - 1 - i)) continue; // ≥ 1 word per line
      const d = Math.abs(pos - goal) - (/[,;:.?!…]["'”’»)]?$/.test(words[k]) ? 8 : 0);
      if (d < bestD) { bestD = d; bestW = k + 1; }
    }
    ends.push((w = bestW));
  }
  ends.push(words.length);
  let from = 0;
  return src.map((c, i) => {
    const part = words.slice(from, ends[i]).join(' ');
    from = ends[i];
    return { start: c.start, end: c.end, text: part };
  }).filter((c) => c.text);
}

// ---------------------------------------------------------------- estimates

// What a local machine managed on the last recordings (ms of work per minute of audio): estimates learn from it.
const learned = { asr: null, mt: null };
const EMA = (prev, v) => (prev == null ? v : Math.round(prev * 0.6 + v * 0.4));

/**
 * The numbers behind an estimate, for the dashboard to redo it as languages are ticked: seconds = fixedSec +
 * minutes × (secPerMin + languages × secPerMinPerLang), and the same for US$ (Gemini only; null otherwise).
 */
export function rates(engine = config.engine) {
  if (engine === 'gemini') {
    const [audioIn, textIn, out] = price(config.recordingModel);
    const [, mtIn, mtOut] = price(config.textModel);
    // Per minute: 1,920 audio tokens and a prompt; ≈ 500 tokens of timed lines out. A translation: ≈ 350 in, 300 out.
    const pieces = Math.max(1, config.recordingConcurrency);
    return {
      engine, model: config.recordingModel, fixedSec: 12, secPerMin: 2.5 / pieces, secPerMinPerLang: 1.2 / pieces,
      usdPerMin: (1920 * audioIn + 80 * textIn + 500 * out) / 1e6, usdPerMinPerLang: (350 * mtIn + 300 * mtOut) / 1e6,
    };
  }
  if (engine === 'local') {
    return {
      engine, model: asrInfo().label, fixedSec: 3, usdPerMin: null, usdPerMinPerLang: null,
      secPerMin: (learned.asr ?? 12_000) / 1000, // whisper-small on a recent laptop: ≈ 5× faster than real time
      secPerMinPerLang: (learned.mt ?? 9_000) / 1000, // a 4B model: ≈ 1 s per sentence, ≈ 10 sentences a minute
    };
  }
  return { engine, model: 'mock', fixedSec: 1, secPerMin: 0.05, secPerMinPerLang: 0, usdPerMin: null, usdPerMinPerLang: null };
}

/** @param {{ durationMs: number | null, languages: number, engine?: string }} o  languages = how many need translating */
export function estimate({ durationMs, languages, engine = config.engine }) {
  const r = rates(engine), min = (durationMs || 0) / 60000;
  return {
    seconds: Math.round(r.fixedSec + min * (r.secPerMin + languages * r.secPerMinPerLang)),
    usd: r.usdPerMin == null ? null : Math.max(0.01, +(min * (r.usdPerMin + languages * r.usdPerMinPerLang)).toFixed(2)),
  };
}

// ---------------------------------------------------------------- the AI

const isQuota = (e) => e?.status === 429 || /429|RESOURCE_EXHAUSTED|quota|rate/i.test(e?.message || '');
const isRetryable = (e) => isQuota(e) || [500, 502, 503, 504].includes(e?.status) || /timeout|ECONNRESET|fetch failed|UNAVAILABLE|INTERNAL|overloaded/i.test(e?.message || '');

/** Try a request up to 4 times when the error is passing (quota, overload, the network). */
async function retry(fn, signal) {
  for (let attempt = 0; ; attempt++) {
    if (signal?.aborted) throw new RecordingError(499, 'canceled', 'cancelled');
    try { return await fn(); } catch (e) {
      if (signal?.aborted) throw new RecordingError(499, 'canceled', 'cancelled');
      if (attempt >= 3 || !isRetryable(e)) throw e;
      await sleep((isQuota(e) ? 5000 : 1500) * 2 ** attempt);
    }
  }
}

// Thinking: as little as the model allows. Gemini 3 Flash refuses MINIMAL, older models refuse thinkingConfig at all.
const THINKING = [{ thinkingLevel: 'MINIMAL' }, { thinkingLevel: 'LOW' }, null];
const thinkingFor = new Map(); // model → index in THINKING that it accepted
async function generate(req, signal) {
  for (let i = thinkingFor.get(req.model) ?? 0; i < THINKING.length; i++) {
    const cfg = { ...req.config, abortSignal: signal };
    if (THINKING[i]) cfg.thinkingConfig = THINKING[i]; else delete cfg.thinkingConfig;
    try {
      const res = await client().models.generateContent({ ...req, config: cfg });
      thinkingFor.set(req.model, i);
      return res;
    } catch (e) {
      if (i < THINKING.length - 1 && /think/i.test(e?.message || '') && !isQuota(e)) continue;
      throw e;
    }
  }
}

function usd(model, u = {}) {
  const [audioIn, textIn, out] = price(model);
  const details = u.promptTokensDetails || [];
  const audio = details.filter((d) => d.modality === 'AUDIO').reduce((a, d) => a + (d.tokenCount || 0), 0);
  const prompt = u.promptTokenCount || 0;
  return (audio * audioIn + Math.max(0, prompt - audio) * textIn + ((u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0)) * out) / 1e6;
}

/** "02:31.5", "1:02:31", "151.5" or 151.5 → seconds (NaN if it isn't a time). */
export function parseTime(v) {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim().replace(',', '.');
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const m = /^(?:(\d+):)?(\d{1,3}):(\d{1,2}(?:\.\d+)?)$/.exec(s);
  return m ? (Number(m[1] || 0) * 60 + Number(m[2])) * 60 + Number(m[3]) : NaN;
}

const TRANSCRIPT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    language: { type: Type.STRING },
    segments: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { start: { type: Type.STRING }, end: { type: Type.STRING }, text: { type: Type.STRING } }, required: ['start', 'end', 'text'] } },
  },
  required: ['language', 'segments'],
};

/** Gemini's answer → segments in ms from the start of the piece. Times past the end are scaled back; broken ones spread. */
export function geminiSegments(json, pieceMs) {
  const segs = (Array.isArray(json?.segments) ? json.segments : [])
    .map((x) => ({ start: parseTime(x.start) * 1000, end: parseTime(x.end) * 1000, text: String(x.text || '').replace(/\s+/g, ' ').trim() }))
    .filter((x) => x.text);
  if (!segs.length) return [];
  const timed = segs.filter((x) => Number.isFinite(x.start));
  const last = Math.max(...timed.map((x) => (Number.isFinite(x.end) ? x.end : x.start)), 0);
  const scale = last > pieceMs * 1.1 ? pieceMs / last : 1; // a model that counted wrong, consistently
  if (timed.length < segs.length / 2) { // no usable times: by length, over the whole piece
    const total = segs.reduce((a, x) => a + x.text.length, 0);
    let acc = 0;
    return segs.map((x) => ({ text: x.text, start: (acc / total) * pieceMs, end: ((acc += x.text.length) / total) * pieceMs }));
  }
  let prev = 0;
  return segs.map((x, i) => {
    const start = Math.min(pieceMs, Math.max(prev, (Number.isFinite(x.start) ? x.start : prev) * scale));
    const nextStart = segs[i + 1] && Number.isFinite(segs[i + 1].start) ? segs[i + 1].start * scale : pieceMs;
    let end = Number.isFinite(x.end) ? x.end * scale : nextStart;
    if (end <= start) end = Math.min(pieceMs, start + Math.max(800, x.text.length * 60));
    prev = start;
    return { start: Math.round(start), end: Math.round(Math.min(pieceMs, end)), text: x.text };
  });
}

/** The few closing segments of an answer cut off at its token limit, read as far as they go. */
function salvage(text) {
  const segs = [];
  for (const m of String(text).matchAll(/\{\s*"start"\s*:\s*"([^"]*)"\s*,\s*"end"\s*:\s*"([^"]*)"\s*,\s*"text"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}/g)) {
    try { segs.push({ start: m[1], end: m[2], text: JSON.parse(`"${m[3]}"`) }); } catch { /* skip */ }
  }
  const lang = /"language"\s*:\s*"([^"]*)"/.exec(text)?.[1] || '';
  return { language: lang, segments: segs };
}

const fmtTime = (ms) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

async function geminiTranscribe({ pcm, pieceMs, source, vocabulary, signal, onCost }) {
  const audio = await encodeOpus(pcm, signal);
  const ai = client();
  let part, uploaded = null;
  if (audio.data.length <= INLINE_MAX) part = { inlineData: { mimeType: audio.mimeType, data: audio.data.toString('base64') } };
  else {
    // Big piece (a WAV without ffmpeg's Opus): the Files API, deleted again right after.
    uploaded = await retry(() => ai.files.upload({ file: new Blob([audio.data], { type: audio.mimeType }), config: { mimeType: audio.mimeType, displayName: `opencaptions-${crypto.randomUUID()}` } }), signal);
    for (let i = 0; uploaded.state === 'PROCESSING' && i < 90; i++) { await sleep(2000); uploaded = await ai.files.get({ name: uploaded.name }); }
    if (uploaded.state === 'FAILED') throw new Error('Gemini couldn’t process the uploaded audio');
    part = createPartFromUri(uploaded.uri, uploaded.mimeType);
  }
  const hint = source && source !== 'auto' ? `, which is ${promptLanguage(source)}` : '';
  const prompt = [
    `Transcribe this recording of a talk word for word, in the language spoken${hint}.`,
    `Split it into subtitle lines: each at most ${MAX_CHARS} characters and 7 seconds long, ending at a natural pause or at the end of a sentence.`,
    `For each line give start and end as MM:SS.s (minutes, seconds and tenths) from the beginning of this clip, which lasts ${fmtTime(pieceMs)}, as precisely as you can.`,
    'Punctuate and capitalize normally. Leave out music, noise and silence; no speaker names, notes or descriptions.',
    'language: the ISO 639-1 code of the language spoken, like "en" or "es".',
    vocabulary.length ? `Names and terms that may be said: ${vocabulary.slice(0, 80).join(', ')}.` : '',
  ].filter(Boolean).join('\n');
  try {
    const res = await retry(() => generate({
      model: config.recordingModel,
      contents: [{ role: 'user', parts: [part, { text: prompt }] }],
      config: { temperature: 0, maxOutputTokens: 32_768, responseMimeType: 'application/json', responseSchema: TRANSCRIPT_SCHEMA },
    }, signal), signal);
    onCost(usd(config.recordingModel, res.usageMetadata));
    let json;
    try { json = JSON.parse(res.text || '{}'); } catch { json = salvage(res.text || ''); }
    return { lang: String(json.language || '').toLowerCase().split(/[-_]/)[0] || null, segments: geminiSegments(json, pieceMs) };
  } finally {
    if (uploaded?.name) ai.files.delete({ name: uploaded.name }).catch(() => {});
  }
}

const TRANSLATIONS_SCHEMA = { type: Type.ARRAY, items: { type: Type.STRING } };

/** Sentences → translations with Gemini, in order, one request for the batch. Null if the answer doesn't line up. */
async function geminiTranslateBatch({ texts, from, to, context, vocabulary, signal, onCost }) {
  const system = [
    `You translate the subtitles of a recorded talk from ${from ? promptLanguage(from) : 'the speaker’s language'} to ${promptLanguage(to)}, as a professional subtitler would: naturally and faithfully.`,
    'You get a JSON array of consecutive sentences. Reply with a JSON array of their translations: the same number of items, in the same order, one per item. Never merge, split, skip or add items.',
    'Keep people’s names, brand and product names, acronyms and specialist terms the way people in the speaker’s field write them; do not translate names.',
    vocabulary.length ? `Glossary / proper nouns: ${vocabulary.slice(0, 80).join(', ')}.` : '',
  ].filter(Boolean).join('\n');
  const ctx = context.length ? `Previous sentences (context only, do not translate): ${context.join(' ')}\n\n` : '';
  const res = await retry(() => generate({
    model: config.textModel,
    contents: `${ctx}${JSON.stringify(texts)}`,
    config: { systemInstruction: system, temperature: 0.1, maxOutputTokens: 16_384, responseMimeType: 'application/json', responseSchema: TRANSLATIONS_SCHEMA },
  }, signal), signal);
  onCost(usd(config.textModel, res.usageMetadata));
  let out;
  try { out = JSON.parse(res.text || '[]'); } catch { return null; }
  return Array.isArray(out) && out.length === texts.length && out.every((x) => typeof x === 'string' && x.trim()) ? out.map((x) => x.trim()) : null;
}

// ---------------------------------------------------------------- mock: the simulated talk, timed on the real speech

const corpusFor = (lang) => CORPUS.map((c) => c[lang] || c.en);
/** Mock "transcription": whole sentences of the simulated talk, about as many words as the piece has speech for. */
function mockTranscribe(piece, index, source) {
  const sents = corpusFor(source);
  const want = Math.max(1, Math.round((piece.voiced * FRAME_MS / 1000) * 2.6)); // ≈ 2.6 words per second
  const out = [];
  let words = 0;
  for (let k = index * 3; words < want * 0.7 || !out.length; k++) {
    const s = sents[k % sents.length];
    out.push(s);
    words += s.split(' ').length;
  }
  return out.join(' ');
}
/** Mock translation: the simulated talk's own translation of each sentence, or "(xx) text". */
function mockTranslate(text, from, to) {
  return String(text).split(/(?<=[.?!…])\s+/).map((s) => {
    const i = corpusFor(from).indexOf(s);
    return i >= 0 && CORPUS[i][to] ? CORPUS[i][to] : `(${to}) ${s}`;
  }).join(' ');
}

// ---------------------------------------------------------------- jobs

async function pool(items, n, fn, signal) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      if (signal?.aborted) throw new RecordingError(499, 'canceled', 'cancelled');
      const k = next++;
      await fn(items[k], k);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, worker));
}

const TMP_PREFIX = 'opencaptions-rec-';
/** Temporary folders left by a server that couldn't clean up (killed, crashed): older than a day. */
function cleanLeftovers() {
  const base = os.tmpdir();
  try {
    for (const d of fs.readdirSync(base).filter((x) => x.startsWith(TMP_PREFIX))) {
      try { if (Date.now() - fs.statSync(path.join(base, d)).mtimeMs > 86400000) fs.rmSync(path.join(base, d), { recursive: true, force: true }); } catch { /* someone else's */ }
    }
  } catch { /* no temp folder listing */ }
}

const cleanTitle = (t) => String(t ?? '').replace(/[\p{Cc}<>]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
const LANG_RE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;

export class Recordings {
  /**
   * @param {object} o
   * @param {import('./store.js').Store} o.store
   * @param {import('./glossary.js').Glossary} o.glossary
   * @param {(id: string) => any} o.room  the room's definition (name, targets, vocabulary…), or null if there's none
   * @param {() => boolean} [o.busy]  a live room is captioning now: use fewer Gemini requests at once
   * @param {(m: string) => void} [o.log]
   */
  constructor({ store, glossary, room, busy = () => false, log = (m) => console.log(`[recording] ${m}`) }) {
    this.store = store;
    this.glossary = glossary;
    this.room = room;
    this.busy = busy;
    this.log = log;
    /** @type {Map<string, any>} */
    this.jobs = new Map();
    this.queue = Promise.resolve();
    cleanLeftovers();
    process.on('exit', () => { for (const j of this.jobs.values()) this.#rmDir(j); });
    setInterval(() => this.#expire(), 60_000).unref();
  }

  get maxBytes() { return config.recordingMaxMb * 1024 * 1024; }

  /** Uploads waiting, queued or running: each holds a file in the temporary folder. */
  open() { return [...this.jobs.values()].filter((j) => ['ready', 'queued', 'running'].includes(j.state)).length; }

  /**
   * A new upload: a temporary folder for a file of `size` bytes, which then arrives in pieces (append).
   * @param {{ name?: string, size?: number }} o  the file's name on the person's computer, and its size
   */
  create({ name = '', size = 0 } = {}) {
    if (this.open() >= MAX_OPEN) throw new RecordingError(429, 'busy', `Already ${MAX_OPEN} recordings waiting or in progress: let them finish, or cancel one.`);
    size = Number(size);
    if (!Number.isSafeInteger(size) || size <= 0) throw new RecordingError(400, 'empty', 'The file is empty.');
    if (size > this.maxBytes) throw new RecordingError(413, 'too-big', `The file is bigger than ${config.recordingMaxMb} MB (RECORDING_MAX_MB).`);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), TMP_PREFIX));
    const input = path.join(dir, 'input'); // no extension of the person's choosing: ffmpeg looks at the contents
    fs.writeFileSync(input, '');
    const job = {
      id: crypto.randomBytes(9).toString('base64url'), name: cleanTitle(path.basename(String(name || 'recording'))) || 'recording', dir, input,
      state: 'uploading', size: 0, total: size, createdAt: Date.now(), touchedAt: Date.now(), appending: false,
    };
    this.jobs.set(job.id, job);
    return { ...this.view(job), chunkBytes: CHUNK_BYTES };
  }

  /**
   * The next piece of an upload, at `offset` (where the previous one ended; a piece that broke off is sent again).
   * After the last one the file is checked with ffmpeg: audio or video, and how long.
   * @param {string} id
   * @param {number} offset
   * @param {import('node:stream').Readable} body
   */
  async append(id, offset, body) {
    const job = this.jobs.get(id);
    if (!job) throw new RecordingError(404, 'unknown', 'unknown recording');
    if (job.state !== 'uploading') throw new RecordingError(409, 'uploaded', 'This file is already uploaded.');
    if (job.appending) throw new RecordingError(409, 'busy', 'Another piece of this file is still arriving.');
    if (offset !== job.size) throw Object.assign(new RecordingError(409, 'offset', `expected the piece at byte ${job.size}`), { size: job.size });
    job.appending = true;
    job.touchedAt = Date.now();
    try {
      const n = await new Promise((resolve, reject) => {
        const out = fs.createWriteStream(job.input, { flags: 'r+', start: offset });
        let got = 0, over = false;
        const onData = (b) => {
          got += b.length;
          if (offset + got > job.total || got > CHUNK_BYTES) {
            over = true;
            body.off('data', onData);
            body.unpipe(out);
            body.pause();
            out.destroy();
            reject(new RecordingError(413, 'too-big', 'This piece goes past the size the upload announced.'));
          }
        };
        body.on('data', onData);
        body.on('error', reject);
        body.on('close', () => { if (!over && !(/** @type {any} */ (body)).complete) reject(new RecordingError(400, 'aborted', 'the upload was interrupted')); });
        out.on('error', reject);
        out.on('finish', () => { if (!over) resolve(got); });
        body.pipe(out);
      });
      job.size += n;
      job.touchedAt = Date.now();
    } finally { job.appending = false; }
    if (job.size < job.total) return { ...this.view(job), chunkBytes: CHUNK_BYTES };
    try {
      fs.truncateSync(job.input, job.total); // nothing left over from a piece that broke off
      const info = await probe(job.input);
      Object.assign(job, info, { state: 'ready', touchedAt: Date.now() });
      this.log(`${job.name}: ${(job.size / 1e6).toFixed(1)} MB, ${info.format}/${info.audio}, ${job.durationMs ? `${Math.round(job.durationMs / 1000)} s` : 'length unknown'}`);
      return this.view(job);
    } catch (e) {
      this.#drop(job);
      throw e;
    }
  }

  /**
   * Start captioning an upload. One job runs at a time; the next ones wait their turn.
   * @param {string} id
   * @param {{ room?: string, source?: string, targets?: string[], title?: string }} o  room '' = keep it only here
   *   (in memory, for its export), as `npm run subtitle` does without --room
   */
  start(id, { room = '', source = 'auto', targets, title } = {}) {
    const job = this.jobs.get(id);
    if (!job) throw new RecordingError(404, 'unknown', 'unknown recording');
    if (job.state !== 'ready') throw new RecordingError(409, 'started', 'This recording has already started.');
    const def = room ? this.room(room) : null;
    if (room && !def) throw new RecordingError(404, 'unknown-room', 'unknown room');
    if (room && !this.store.enabled) throw new RecordingError(409, 'no-store', 'Transcripts aren’t saved on this server (STORE_TRANSCRIPTS=false).');
    source = String(source || 'auto');
    if (source !== 'auto' && !LANG_RE.test(source)) throw new RecordingError(400, 'bad-language', 'source must be auto or a language code');
    targets = [...new Set((Array.isArray(targets) ? targets : def?.targets || config.event.defaultTargets).map(String))];
    if (targets.length > 12 || !targets.every((l) => LANG_RE.test(l))) throw new RecordingError(400, 'bad-language', 'targets must be language codes');
    Object.assign(job, {
      state: 'queued', room, source, targets, title: cleanTitle(title) || cleanTitle(job.name.replace(/\.[^.]+$/, '')), engine: config.engine,
      phase: 'queued', progress: 0, parts: { decode: 0, transcribe: 0, translate: 0 }, costUsd: 0, abort: new AbortController(),
      vocabulary: this.glossary.vocabulary([...(def?.vocabulary || [])]),
    });
    job.estimate = estimate({ durationMs: job.durationMs, languages: targets.filter((l) => l !== source).length, engine: job.engine });
    const prev = this.queue;
    this.queue = prev.then(() => this.#run(job));
    return this.view(job);
  }

  /** Stop a job (or throw away an upload): its temporary folder is deleted. */
  cancel(id) {
    const job = this.jobs.get(id);
    if (!job) return false;
    if (['ready', 'uploading'].includes(job.state)) { this.#drop(job); return true; }
    if (['queued', 'running'].includes(job.state)) { job.abort.abort(); job.state = 'canceled'; job.phase = 'canceled'; this.#rmDir(job); }
    else this.jobs.delete(id); // finished: forget it
    return true;
  }

  get(id) { const j = this.jobs.get(id); return j ? this.view(j) : null; }
  list() { return [...this.jobs.values()].filter((j) => j.state !== 'uploading').sort((a, b) => b.createdAt - a.createdAt).map((j) => this.view(j)); }

  /** A finished job's captions in one language, as SRT, VTT, TXT or JSON (for npm run subtitle without a room). */
  export(id, lang, fmt) {
    const job = this.jobs.get(id);
    if (!job?.segs) return null;
    const ch = lang && lang !== 'orig' && job.targets.includes(lang) ? lang : 'orig';
    const segs = job.segs.filter((s) => s.channel === ch);
    return fmt === 'srt' ? toSRT(segs) : fmt === 'vtt' ? toVTT(segs) : fmt === 'txt' ? toTXT(segs) : fmt === 'json' ? job.segs : null;
  }

  /** What the dashboard and the API see of a job. */
  view(j) {
    const elapsed = j.startedAt ? (j.finishedAt || Date.now()) - j.startedAt : 0;
    const p = j.progress || 0;
    const etaMs = j.state === 'running' ? Math.max(0, p > 0.08 ? elapsed * (1 - p) / p : (j.estimate?.seconds || 0) * 1000 - elapsed) : null;
    const languages = (j.targets || []).filter((l) => l !== (j.source || 'auto')).length;
    return {
      id: j.id, name: j.name, size: j.size, total: j.total, durationMs: j.durationMs ?? null, format: j.format, video: !!j.video,
      state: j.state, phase: j.phase || j.state, progress: +p.toFixed(3), etaMs: etaMs == null ? null : Math.round(etaMs),
      room: j.room ?? null, source: j.source ?? null, lang: j.lang ?? null, targets: j.targets ?? null, title: j.title ?? null,
      engine: j.engine || config.engine, estimate: j.estimate || estimate({ durationMs: j.durationMs, languages: languages || config.event.defaultTargets.length }),
      rates: rates(j.engine || config.engine), costUsd: j.costUsd ? +j.costUsd.toFixed(4) : 0, createdAt: j.createdAt, startedAt: j.startedAt || null,
      finishedAt: j.finishedAt || null, elapsedMs: elapsed || null, error: j.error || null, code: j.code || null,
      talk: j.talk || null, captions: j.segs ? j.segs.filter((s) => s.channel === 'orig').length : null,
    };
  }

  // ---- internals

  /**
   * Delete the job's temporary folder. On Windows a file still open can't be deleted (ffmpeg reading the recording when
   * a job is cancelled mid-decode): the folder stays on the job, and the job's own cleanup, once the decoder has
   * stopped, tries again with a few short retries (Windows frees the file a moment after the process exits).
   */
  #rmDir(job, { retry = false } = {}) {
    if (!job.dir) return;
    try {
      fs.rmSync(job.dir, { recursive: true, force: true, ...(retry ? { maxRetries: 5, retryDelay: 100 } : {}) });
      job.dir = null;
    } catch (e) { if (retry) this.log(`${job.name}: temporary folder not deleted (${e.code || e.message}): ${job.dir}`); }
  }
  #drop(job) { this.#rmDir(job); this.jobs.delete(job.id); }

  #expire() {
    const now = Date.now();
    for (const j of this.jobs.values()) {
      if (j.state === 'uploading' && !j.appending && now - j.touchedAt > UPLOAD_IDLE_MS) { this.log(`${j.name}: upload stopped, deleted`); this.#drop(j); }
      else if (j.state === 'ready' && now - j.touchedAt > READY_TTL_MS) { this.log(`${j.name}: never started, deleted`); this.#drop(j); }
      else if (['done', 'failed', 'canceled'].includes(j.state) && now - (j.finishedAt || j.createdAt) > KEEP_MS) this.jobs.delete(j.id);
    }
  }

  #progress(job) {
    const r = job.rates, min = Math.max(0.01, (job.durationMs || 60000) / 60000);
    const langs = job.translating.length;
    const w = { decode: 0.15 * min + 0.3, transcribe: r.fixedSec + min * r.secPerMin, translate: min * langs * r.secPerMinPerLang };
    const sum = w.decode + w.transcribe + w.translate || 1;
    const p = job.parts;
    job.progress = Math.max(job.progress || 0, Math.min(0.99, (w.decode * p.decode + w.transcribe * p.transcribe + w.translate * p.translate * p.transcribe) / sum)); // never backwards
  }

  async #run(job) {
    if (job.state !== 'queued') return; // cancelled while waiting
    const signal = job.abort.signal;
    job.state = 'running';
    job.startedAt = Date.now();
    job.rates = rates(job.engine);
    job.translating = job.targets.filter((l) => l !== job.source);
    const t0 = Date.now();
    const timing = { decode: 0, transcribe: 0, translate: 0 };
    try {
      // 1. decode
      job.phase = 'decode';
      this.#progress(job);
      const pcmPath = path.join(job.dir, 'audio.pcm');
      const { levels, durationMs } = await decode(job.input, pcmPath, { signal, durationMs: job.durationMs, onProgress: (x) => { job.parts.decode = x; this.#progress(job); } });
      fs.rmSync(job.input, { force: true }); // the sound is all we need: the big video goes now
      job.durationMs = durationMs;
      job.parts.decode = 1;
      timing.decode = Date.now() - t0;
      const thr = speechThreshold(levels);
      const pieces = cutPieces(levels, thr, PIECES[job.engine] || PIECES.local);
      if (!pieces.length) throw new RecordingError(422, 'no-speech', 'No one speaks in this recording (it’s silent or too quiet).');

      // 2 + 3. transcribe, piece by piece, into caption lines
      job.phase = 'transcribe';
      const pieceCues = new Array(pieces.length);
      let prefix = 0, piecesDone = 0, transcribed = false;
      const langVotes = new Map();
      const waiting = new Set(); // translation loops waiting for more sentences
      const changed = () => { for (const r of waiting) r(); waiting.clear(); };
      const settle = () => new Promise((r) => waiting.add(r));
      const cuesSoFar = () => pieceCues.slice(0, prefix).flat();
      const done = (i, segs, lang) => {
        pieceCues[i] = buildCues(segs, levels, thr);
        if (lang) langVotes.set(lang, (langVotes.get(lang) || 0) + pieces[i].voiced);
        while (prefix < pieces.length && pieceCues[prefix]) prefix++;
        piecesDone++;
        job.parts.transcribe = piecesDone / pieces.length;
        this.#progress(job);
        changed();
      };
      const spoken = () => (job.source !== 'auto' ? job.source : [...langVotes].sort((a, b) => b[1] - a[1])[0]?.[0] || null);
      let firstError = null; // what went wrong first: it stops the rest, and is what the person reads
      const stop = (e) => { firstError ??= e; job.abort.abort(); changed(); };
      const transcribing = this.#transcribe(job, pieces, pcmPath, done, spoken, signal)
        .then(() => { transcribed = true; timing.transcribe = Date.now() - t0 - timing.decode; changed(); }, stop);

      // 4. translate sentences as soon as they're complete (the last one may still grow), while transcription goes on
      const channels = { orig: null };
      const translatedSentences = new Map(job.translating.map((l) => [l, 0]));
      const mtProgress = () => {
        const total = sentences(cuesSoFar()).length * job.translating.length;
        job.parts.translate = total ? [...translatedSentences.values()].reduce((a, b) => a + b, 0) / total : 0;
        this.#progress(job);
      };
      const translateLoop = async (to) => {
        const out = [];
        const prior = []; // the previous sentences and their translations (local models)
        let k = 0;
        for (;;) {
          if (signal.aborted) throw new RecordingError(499, 'canceled', 'cancelled');
          const sents = sentences(cuesSoFar());
          const stable = transcribed ? sents.length : sents.length - 1;
          if (k < stable && spoken() === to) { // spoken in this caption language (detected): its own lines, untranslated
            out.push(...sents[k].cues.map((c) => ({ ...c })));
            translatedSentences.set(to, translatedSentences.get(to) + 1);
            k++;
            continue;
          }
          if (k < stable) {
            if (job.engine === 'gemini') {
              // Batches of 25 in order while pieces arrive; once all are in, the rest several at once.
              const from = spoken();
              if (!transcribed && stable - k < BATCH) { await settle(); continue; }
              const batches = [];
              for (let b = k; b < stable && (transcribed || batches.length === 0); b += BATCH) batches.push(sents.slice(b, Math.min(stable, b + BATCH)));
              const lim = transcribed ? Math.max(1, Math.ceil(this.#concurrency() / job.translating.length)) : 1;
              const results = new Array(batches.length);
              await pool(batches, lim, async (batch, bi) => {
                const first = sents.indexOf(batch[0]);
                const context = sents.slice(Math.max(0, first - 2), first).map((s) => s.text);
                results[bi] = await this.#translateGemini(job, batch.map((s) => s.text), from, to, context, signal);
                translatedSentences.set(to, translatedSentences.get(to) + batch.length);
                mtProgress();
              }, signal);
              batches.forEach((batch, bi) => batch.forEach((s, si) => out.push(...placeTranslation(s, results[bi][si]))));
              k += batches.reduce((a, b) => a + b.length, 0);
            } else {
              const s = sents[k];
              const text = job.engine === 'mock' ? mockTranslate(s.text, spoken() || 'en', to)
                : await translateText({ text: s.text, from: spoken(), to, prior: prior.slice(-2), vocabulary: job.vocabulary, priority: 1 });
              prior.push({ text: s.text, out: text });
              out.push(...placeTranslation(s, text));
              k++;
              translatedSentences.set(to, translatedSentences.get(to) + 1);
              mtProgress();
            }
            continue;
          }
          if (transcribed) return out;
          await settle();
        }
      };
      const translating = Promise.all(job.translating.map(async (to) => [to, await translateLoop(to)])).catch(stop);
      await transcribing;
      if (firstError) throw firstError;
      channels.orig = cuesSoFar();
      if (!channels.orig.length) throw new RecordingError(422, 'no-speech', 'No words were recognized in this recording.');
      job.lang = spoken();
      job.phase = 'translate';
      this.#progress(job);
      const translated = await translating;
      if (firstError) throw firstError;
      for (const [to, cues] of translated || []) channels[to] = cues;
      for (const to of job.targets.filter((l) => l === job.source)) channels[to] = channels.orig.map((c) => ({ ...c })); // spoken in a caption language
      timing.translate = Date.now() - t0 - timing.decode - timing.transcribe;

      // 5. save
      if (signal.aborted) throw new RecordingError(499, 'canceled', 'cancelled');
      job.phase = 'save';
      job.segs = this.#segments(job, channels);
      if (job.room) this.#save(job);
      job.state = 'done';
      job.phase = 'done';
      job.progress = 1;
      job.finishedAt = Date.now();
      if (job.engine === 'local') {
        const min = Math.max(0.05, job.durationMs / 60000);
        learned.asr = EMA(learned.asr, timing.transcribe / min);
        if (job.translating.length) learned.mt = EMA(learned.mt, Math.max(0, timing.translate + timing.transcribe * 0.5) / min / job.translating.length);
      }
      this.log(`${job.name}: ${Math.round(job.durationMs / 1000)} s of audio captioned in ${((job.finishedAt - job.startedAt) / 1000).toFixed(1)} s (${job.engine}: decode ${timing.decode} ms, `
        + `transcribe ${timing.transcribe} ms, then translate ${timing.translate} ms; ${pieces.length} pieces, ${channels.orig.length} lines, ${job.translating.length} languages${job.costUsd ? `, US$ ${job.costUsd.toFixed(4)}` : ''})`);
    } catch (e) {
      job.finishedAt = Date.now();
      if (signal.aborted && job.state === 'canceled') this.log(`${job.name}: cancelled`);
      else {
        job.state = 'failed';
        job.phase = 'failed';
        job.code = e instanceof RecordingError ? e.code : isNetworkError(e) && job.engine === 'local' ? 'asr-down' : isQuota(e) ? 'quota' : 'error';
        job.error = job.code === 'asr-down' ? 'The local speech server isn’t answering: start it with npm run local.' : String(e?.message || e).slice(0, 300);
        this.log(`${job.name}: failed: ${job.error}`);
      }
    } finally {
      this.#rmDir(job, { retry: true });
    }
  }

  #concurrency() { return this.busy() ? Math.max(1, Math.floor(config.recordingConcurrency / 2)) : config.recordingConcurrency; }

  /** Every piece through the engine: done(i, segments in ms from the start of the recording, language heard). */
  async #transcribe(job, pieces, pcmPath, done, spoken, signal) {
    if (job.engine === 'mock') {
      for (const [i, p] of pieces.entries()) {
        const text = mockTranscribe(p, i, job.source === 'auto' ? 'en' : job.source);
        done(i, [{ start: p.from * FRAME_MS, end: p.to * FRAME_MS, text }], job.source === 'auto' ? 'en' : job.source);
        if (i % 20 === 19) await new Promise((r) => setImmediate(r));
      }
      return;
    }
    if (job.engine === 'gemini') {
      await pool(pieces, this.#concurrency(), async (p, i) => {
        const pieceMs = (p.to - p.from) * FRAME_MS;
        const r = await geminiTranscribe({ pcm: readPcm(pcmPath, p.from, p.to), pieceMs, source: job.source, vocabulary: job.vocabulary, signal, onCost: (x) => { job.costUsd += x; } });
        done(i, r.segments.map((s) => ({ ...s, start: s.start + p.from * FRAME_MS, end: s.end + p.from * FRAME_MS })), r.lang);
      }, signal);
      return;
    }
    // Local Whisper: one piece after another (the server works on one at a time), the previous words as its prompt.
    let prev = '';
    for (const [i, p] of pieces.entries()) {
      if (signal.aborted) throw new RecordingError(499, 'canceled', 'cancelled');
      const pcm = readPcm(pcmPath, p.from, p.to);
      const language = job.source !== 'auto' ? job.source : spoken();
      const prompt = [job.vocabulary.slice(0, 20).join(', '), prev].filter(Boolean).join('. ');
      let r;
      for (let attempt = 0; ; attempt++) {
        try { r = await withAsrSlot(() => whisper(pcm, { language, prompt, final: true, signal }), { background: true }); break; } catch (e) {
          if (signal.aborted) throw new RecordingError(499, 'canceled', 'cancelled');
          if (attempt >= 2) throw e;
          await sleep(1000 * (attempt + 1));
        }
      }
      const off = p.from * FRAME_MS, end = p.to * FRAME_MS;
      const quiet = r.noSpeech > 0.8 && r.text.split(/\s+/).length < 4; // Whisper hearing words in noise
      const segs = quiet || !r.text ? [] : r.segments.length > 1
        ? r.segments.map((s) => ({ start: Math.min(end, off + s.start * 1000), end: Math.min(end, off + s.end * 1000), text: s.text }))
        : [{ start: off, end, text: r.text }];
      if (r.text && !quiet) prev = r.text.slice(-200);
      done(i, segs, r.lang);
    }
  }

  async #translateGemini(job, texts, from, to, context, signal) {
    const onCost = (x) => { job.costUsd += x; };
    const out = await geminiTranslateBatch({ texts, from, to, context, vocabulary: job.vocabulary, signal, onCost });
    if (out) return out;
    if (texts.length > 1) { // didn't line up: halves, and in the end one sentence at a time
      const half = Math.ceil(texts.length / 2);
      return [...await this.#translateGemini(job, texts.slice(0, half), from, to, context, signal), ...await this.#translateGemini(job, texts.slice(half), from, to, [...context, ...texts.slice(0, half)].slice(-2), signal)];
    }
    const stats = { usd: 0 };
    const one = await retry(() => translateText({ text: texts[0], from, to, context, vocabulary: job.vocabulary, stats }), signal);
    job.costUsd += stats.usd;
    return [one];
  }

  /** Caption lines of every language → stored segments, as a live talk's: ids, the glossary's corrections, time order. */
  #segments(job, channels) {
    const stamp = Date.now().toString(36);
    const segs = [];
    for (const [ch, cues] of Object.entries(channels)) {
      const lang = ch === 'orig' ? job.lang || job.source || 'und' : ch;
      cues.sort((a, b) => a.start - b.start);
      cues.forEach((c, i) => {
        const next = cues[i + 1];
        const end = next && c.end > next.start ? Math.max(c.start + 1, next.start) : c.end;
        const text = this.glossary.apply(c.text, ch, lang);
        if (text) segs.push({ id: `${ch}-r${stamp}-${i + 1}`, channel: ch, lang, text, start: c.start, end, final: true });
      });
    }
    return segs.sort((a, b) => a.start - b.start || (a.channel === 'orig' ? -1 : b.channel === 'orig' ? 1 : 0));
  }

  /** The transcript as a talk of the room: meta.json + captions.jsonl, like a live talk's. */
  #save(job) {
    let id = new Date(job.startedAt).toISOString().replace(/[:.]/g, '-');
    if (this.store.hasTalk(job.room, id)) id += '-2';
    const talk = { id, title: job.title, speaker: '', startedAt: job.startedAt, source: 'recording', file: job.name, durationMs: job.durationMs, engine: job.engine, costUsd: +job.costUsd.toFixed(4) };
    this.store.openTalk(job.room, talk, ['orig', ...job.targets]);
    for (const seg of job.segs) this.store.append(job.room, id, seg);
    job.talk = { stage: job.room, id };
  }
}

/**
 * The HTTP API (admin only):
 *   POST   /api/recordings                    { name, size } → a new upload, and the size of its pieces
 *   PUT    /api/recordings/:id/data?offset=N  a piece of the file (the request body); after the last one the file is
 *                                             checked, and the answer has its length and an estimate
 *   POST   /api/recordings/:id/start          { room, source, targets, title }
 *   GET    /api/recordings/:id                state, phase, progress, ETA; the transcript (room and talk) when done
 *   GET    /api/recordings                    uploads and jobs of the last two hours
 *   DELETE /api/recordings/:id                cancel it; its temporary files are deleted
 *   GET    /api/recordings/:id/export.:fmt?lang=en   srt | vtt | txt | json, also without a room (npm run subtitle)
 * @param {import('express').Express} app
 * @param {{ admin: import('express').RequestHandler, recordings: Recordings }} o
 */
export function mountRecordings(app, { admin, recordings }) {
  const fail = (res, e) => {
    if (e instanceof RecordingError) return res.status(e.status).json({ error: e.message, code: e.code, ...(e.size != null ? { size: e.size } : {}) });
    console.warn('[recording]', e);
    return res.status(500).json({ error: String(e?.message || e) });
  };
  app.post('/api/recordings', admin, (req, res) => {
    try { res.json(recordings.create({ name: req.body?.name, size: req.body?.size })); } catch (e) { fail(res, e); }
  });
  app.put('/api/recordings/:id/data', admin, async (req, res) => {
    try {
      if (req.is('json') || req.is('multipart')) return res.status(415).json({ error: 'send the bytes themselves as the request body (application/octet-stream)', code: 'body' });
      res.json(await recordings.append(req.params.id, Number(req.query.offset), req));
    } catch (e) {
      if (e?.code === 'too-big') res.set('Connection', 'close'); // don't read the rest of the body
      fail(res, e);
    }
  });
  app.get('/api/recordings', admin, (req, res) => res.set('Cache-Control', 'no-store').json({ engine: config.engine, maxMb: config.recordingMaxMb, chunkBytes: CHUNK_BYTES, rates: rates(), jobs: recordings.list() }));
  app.get('/api/recordings/:id', admin, (req, res) => {
    const j = recordings.get(req.params.id);
    return j ? res.set('Cache-Control', 'no-store').json(j) : res.status(404).json({ error: 'unknown recording', code: 'unknown' });
  });
  app.post('/api/recordings/:id/start', admin, (req, res) => {
    try { res.json(recordings.start(req.params.id, req.body || {})); } catch (e) { fail(res, e); }
  });
  app.delete('/api/recordings/:id', admin, (req, res) => (recordings.cancel(req.params.id) ? res.json({ ok: true }) : res.status(404).json({ error: 'unknown recording', code: 'unknown' })));
  app.get('/api/recordings/:id/export.:fmt', admin, (req, res) => {
    const fmt = req.params.fmt;
    if (!['srt', 'vtt', 'txt', 'json'].includes(fmt)) return res.status(400).json({ error: 'fmt must be srt|vtt|txt|json' });
    const body = recordings.export(req.params.id, String(req.query.lang || 'orig'), fmt);
    if (body == null) return res.status(404).json({ error: 'no captions for this recording (yet)', code: 'unknown' });
    if (fmt === 'json') return res.json(body);
    res.type({ srt: 'application/x-subrip', vtt: 'text/vtt', txt: 'text/plain' }[fmt]).send(body);
  });
}
