// Audio sources → 16 kHz mono PCM16LE stream.
//  • 16 kHz mono 16-bit WAV files are read natively (no ffmpeg needed — bundled samples just work).
//  • Anything else (mp3/mp4/webm, SRT/RTMP/HLS/HTTP streams from vMix/OBS, Icecast…) goes through ffmpeg:
//    $FFMPEG_PATH → system `ffmpeg` → the `ffmpeg-static` npm binary (installed automatically).
import { spawn, spawnSync } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const CHUNK = 3200; // 100 ms

let cachedBin;
export function ffmpegBin() {
  if (cachedBin !== undefined) return cachedBin;
  const candidates = [process.env.FFMPEG_PATH, 'ffmpeg'];
  try { candidates.push(require('ffmpeg-static')); } catch { /* optional dependency */ }
  cachedBin = null;
  for (const c of candidates.filter(Boolean)) {
    try {
      if (spawnSync(c, ['-version'], { stdio: 'ignore' }).status === 0) { cachedBin = c; break; }
    } catch { /* try next */ }
  }
  return cachedBin;
}

const isUrl = (s) => /^[a-z][a-z0-9+.-]*:\/\//i.test(s) && !s.startsWith('file://');

export function ffmpegArgs(input, { realtime = false, loop = false, start = 0 } = {}) {
  const file = !isUrl(input);
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin'];
  if (file || realtime) args.push('-re');
  if (file && loop) args.push('-stream_loop', '-1');
  if (/^https?:/i.test(input)) args.push('-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5');
  if (start) args.push('-ss', String(start));
  args.push('-i', input.replace(/^file:\/\//, ''), '-vn', '-ac', '1', '-ar', '16000', '-f', 's16le', 'pipe:1');
  return args;
}

/** Parse a WAV header; returns { offset, length } of PCM data if it is 16 kHz mono s16, else null. */
function wavPcm16k(path) {
  if (!/\.wav$/i.test(path)) return null;
  const fd = fs.openSync(path, 'r');
  try {
    const head = Buffer.alloc(4096);
    const n = fs.readSync(fd, head, 0, head.length, 0);
    if (head.toString('ascii', 0, 4) !== 'RIFF' || head.toString('ascii', 8, 12) !== 'WAVE') return null;
    let p = 12, fmt = null;
    while (p + 8 <= n) {
      const id = head.toString('ascii', p, p + 4);
      const size = head.readUInt32LE(p + 4);
      if (id === 'fmt ') fmt = { format: head.readUInt16LE(p + 8), channels: head.readUInt16LE(p + 10), rate: head.readUInt32LE(p + 12), bits: head.readUInt16LE(p + 22) };
      if (id === 'data') {
        if (!fmt || fmt.format !== 1 || fmt.channels !== 1 || fmt.rate !== 16000 || fmt.bits !== 16) return null;
        const total = fs.statSync(path).size;
        return { offset: p + 8, length: Math.min(size || total, total - p - 8) };
      }
      p += 8 + size + (size & 1);
    }
    return null;
  } finally { fs.closeSync(fd); }
}

/**
 * Open any input as a real-time paced PCM stream.
 * @returns {PassThrough & { stopAudio(): void }} emits 'data' (PCM16LE 16 kHz mono), 'end', 'error'
 */
export function openAudio(input, { realtime = true, loop = false, start = 0 } = {}) {
  const out = new PassThrough();
  const file = !isUrl(input);
  const path = input.replace(/^file:\/\//, '');
  if (file && !fs.existsSync(path)) {
    process.nextTick(() => out.destroy(new Error(`file not found: ${path}`)));
    out.stopAudio = () => {};
    return out;
  }

  const wav = file ? wavPcm16k(path) : null;
  if (wav) {
    const data = fs.readFileSync(path).subarray(wav.offset, wav.offset + wav.length);
    let pos = Math.min(data.length, Math.floor((start * 16000)) * 2);
    const t0 = Date.now();
    let sent = 0;
    const tick = () => {
      // Send whatever is due since t0 (drift-free pacing), 100 ms at a time.
      const due = realtime ? Math.floor((Date.now() - t0) / 100) + 1 : sent + 10;
      while (sent < due) {
        if (pos >= data.length) {
          if (!loop) { clearInterval(timer); out.end(); return; }
          pos = 0;
        }
        out.write(data.subarray(pos, Math.min(pos + CHUNK, data.length)));
        pos += CHUNK;
        sent++;
      }
    };
    const timer = setInterval(tick, 50);
    tick();
    out.stopAudio = () => { clearInterval(timer); out.end(); };
    return out;
  }

  const bin = ffmpegBin();
  if (!bin) {
    process.nextTick(() => out.destroy(new Error('ffmpeg not found. Install it (macOS: brew install ffmpeg · Debian/Ubuntu: apt install ffmpeg) or run `npm install` again to get the bundled ffmpeg-static. 16 kHz mono WAV files work without ffmpeg.')));
    out.stopAudio = () => {};
    return out;
  }
  const proc = spawn(bin, ffmpegArgs(input, { realtime, loop, start }), { stdio: ['ignore', 'pipe', 'pipe'] });
  proc.stdout.pipe(out);
  let err = '';
  proc.stderr.on('data', (b) => { err = (err + b.toString()).slice(-400); out.emit('log', b.toString().trim()); });
  proc.on('error', (e) => out.destroy(new Error(`ffmpeg failed to start: ${e.message}`)));
  proc.on('close', (code) => { if (code && code !== 255 && !out.destroyed) out.destroy(new Error(`ffmpeg exited with code ${code}: ${err.trim()}`)); });
  out.stopAudio = () => { try { proc.kill('SIGKILL'); } catch { /* ignore */ } };
  return out;
}

/** Server-side ingest for a stage: pulls a URL/file and restarts it with backoff. */
export class PullSource {
  constructor(stage, url, { loop = false } = {}) {
    this.stage = stage;
    this.url = url;
    this.loop = loop;
    this.token = Symbol('pull');
    this.stopped = false;
    this.backoff = 1000;
    this.#open();
  }

  #open() {
    if (this.stopped) return;
    const src = (this.src = openAudio(this.url, { realtime: !isUrl(this.url), loop: this.loop }));
    this.stage.attachIngest({ kind: 'pull', label: this.url, token: this.token, detach: () => this.stop() });
    src.on('data', (b) => { this.backoff = 1000; this.stage.pushAudio(b); });
    src.on('log', (m) => this.stage.log('warn', `ffmpeg: ${m.slice(0, 200)}`));
    const again = (why) => {
      if (this.src !== src) return;
      this.src = null;
      this.stage.detachIngest({ token: this.token });
      if (this.stopped) return;
      this.stage.log('warn', `pull ${why}, retrying in ${this.backoff / 1000}s`);
      this.timer = setTimeout(() => this.#open(), this.backoff);
      this.backoff = Math.min(this.backoff * 2, 30000);
    };
    src.on('error', (e) => { this.stage.log('error', `pull: ${e.message}`); again('failed'); });
    src.on('end', () => again('ended'));
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    clearTimeout(this.timer);
    this.src?.stopAudio();
    this.src = null;
    this.stage.detachIngest({ token: this.token });
  }
}
