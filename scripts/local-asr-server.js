#!/usr/bin/env node
// A small Whisper speech-recognition server for OpenCaptions' local mode, for machines without whisper.cpp.
// It runs Whisper (ONNX, int8) with sherpa-onnx — prebuilt for macOS, Linux and Windows, no compiler, no Python —
// and speaks the same HTTP API as whisper.cpp's whisper-server, plus the OpenAI transcription API:
//   POST /inference                  multipart: file (WAV), language ("auto" or "es"…), response_format
//   POST /v1/audio/transcriptions    same fields, OpenAI style
//   GET  /health
//
//   node scripts/local-asr-server.js --model local/models/sherpa-onnx-whisper-small [--port 8178] [--threads 4]
//
// `npm run local` downloads a model and starts this server for you when whisper.cpp isn't installed.
// It runs on the CPU and ignores `prompt` (sherpa-onnx's Whisper has no prompt input). On Apple Silicon, WhisperKit
// (brew install whisperkit-cli) or whisper.cpp (npm run local -- --build-whisper) are faster and use the prompt.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const modelDir = path.resolve(ROOT, arg('model', process.env.LOCAL_ASR_MODEL_DIR || 'local/models/sherpa-onnx-whisper-small'));
const port = Number(arg('port', process.env.LOCAL_ASR_PORT || 8178));
const host = arg('host', '127.0.0.1');
const threads = Number(arg('threads', Math.max(1, Math.min(4, os.availableParallelism?.() || os.cpus().length))));

// sherpa-onnx is installed on demand by `npm run local` into local/runtime (kept out of the main dependencies).
function loadSherpa() {
  let err = null;
  for (const base of [path.join(ROOT, 'local', 'runtime', 'package.json'), path.join(ROOT, 'package.json')]) {
    try {
      const m = createRequire(base)('sherpa-onnx-node');
      if (m?.OfflineRecognizer) return m;
      err ||= new Error('sherpa-onnx-node loaded without its native part for this platform');
    } catch (e) { err ||= e; }
  }
  console.error(`✗ couldn't load the speech engine (sherpa-onnx-node): ${err?.message?.split('\n')[0]}`);
  console.error('  Reinstall it: delete the local/runtime folder and run npm run local again   (or: npm install --prefix local/runtime sherpa-onnx-node)');
  process.exit(1);
}
const sherpa = loadSherpa();

function modelFiles(dir) {
  if (!fs.existsSync(dir)) { console.error(`✗ model folder not found: ${dir}`); process.exit(1); }
  const files = fs.readdirSync(dir);
  const pick = (suffixes) => { for (const s of suffixes) { const f = files.find((x) => x.endsWith(s)); if (f) return path.join(dir, f); } return null; };
  const m = { encoder: pick(['encoder.int8.onnx', 'encoder.onnx']), decoder: pick(['decoder.int8.onnx', 'decoder.onnx']), tokens: pick(['tokens.txt']) };
  if (!m.encoder || !m.decoder || !m.tokens) { console.error(`✗ ${dir} doesn't look like a sherpa-onnx Whisper model (encoder, decoder, tokens)`); process.exit(1); }
  return m;
}
const files = modelFiles(modelDir);
const modelName = `whisper-${path.basename(modelDir).replace(/^sherpa-onnx-whisper-/, '')}`;

// One recognizer per language ('' = auto-detect); Whisper takes the language at load time here.
const recognizers = new Map();
function recognizer(lang) {
  const key = lang || '';
  if (!recognizers.has(key)) {
    if (recognizers.size >= 3) recognizers.delete(recognizers.keys().next().value);
    recognizers.set(key, new sherpa.OfflineRecognizer({
      featConfig: { sampleRate: 16000, featureDim: 80 },
      modelConfig: { whisper: { encoder: files.encoder, decoder: files.decoder, language: key, task: 'transcribe', tailPaddings: -1 }, tokens: files.tokens, numThreads: threads, provider: 'cpu', debug: 0 },
    }));
  }
  return recognizers.get(key);
}

/** WAV (PCM 16-bit, any rate, any channels) → Float32 mono 16 kHz. */
function decodeWav(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('expected a WAV file');
  let off = 12, fmt = null, data = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4), size = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') fmt = { format: buf.readUInt16LE(off + 8), channels: buf.readUInt16LE(off + 10), rate: buf.readUInt32LE(off + 12), bits: buf.readUInt16LE(off + 22) };
    if (id === 'data') { data = buf.subarray(off + 8, Math.min(buf.length, off + 8 + size)); break; }
    off += 8 + size + (size % 2);
  }
  if (!fmt || !data) throw new Error('WAV without fmt/data');
  if (fmt.format !== 1 || fmt.bits !== 16) throw new Error('only 16-bit PCM WAV is supported');
  const frames = Math.floor(data.length / (2 * fmt.channels));
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let v = 0;
    for (let c = 0; c < fmt.channels; c++) v += data.readInt16LE((i * fmt.channels + c) * 2);
    mono[i] = v / fmt.channels / 32768;
  }
  if (fmt.rate === 16000) return mono;
  const out = new Float32Array(Math.floor((frames * 16000) / fmt.rate));
  const ratio = fmt.rate / 16000;
  for (let i = 0; i < out.length; i++) {
    const x = i * ratio, i0 = Math.floor(x), f = x - i0;
    out[i] = mono[i0] * (1 - f) + (mono[Math.min(i0 + 1, frames - 1)] || 0) * f;
  }
  return out;
}

// One decode at a time: the CPU is the bottleneck, parallel decodes only make every request slower.
/** @type {Promise<unknown>} */
let chain = Promise.resolve();
/** @type {<T>(fn: () => Promise<T> | T) => Promise<T>} one recognition at a time */
const serial = (fn) => { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; };

async function handleTranscription(req, res) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  // Let the platform's fetch implementation parse multipart/form-data for us.
  const form = await new Request('http://local/', { method: 'POST', headers: { 'content-type': req.headers['content-type'] || '' }, body: Buffer.concat(chunks) }).formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') return send(res, 400, { error: "no 'file' field in the request" });
  const language = String(form.get('language') || 'auto').toLowerCase();
  const format = String(form.get('response_format') || 'json');
  const samples = decodeWav(Buffer.from(await file.arrayBuffer()));
  const duration = samples.length / 16000;
  const t0 = Date.now();
  const result = await serial(async () => {
    if (req.socket.destroyed) return null; // the client gave up (e.g. a provisional pass replaced by a final one)
    const rec = recognizer(language === 'auto' ? '' : language.split(/[-_]/)[0]);
    const stream = rec.createStream();
    stream.acceptWaveform({ samples, sampleRate: 16000 });
    return rec.decodeAsync(stream);
  });
  if (!result) return;
  const text = String(result.text || '').trim();
  const lang = String(result.lang || '').replace(/[<|>]/g, '') || (language === 'auto' ? '' : language);
  if (process.env.OC_ASR_LOG) console.log(`${duration.toFixed(1)}s → ${Date.now() - t0} ms [${lang}] ${text.slice(0, 80)}`);
  if (format === 'text') return send(res, 200, text, 'text/plain; charset=utf-8');
  if (format === 'verbose_json') {
    return send(res, 200, { task: 'transcribe', language: lang, duration, text, segments: [{ id: 0, start: 0, end: duration, text, no_speech_prob: 0 }] });
  }
  return send(res, 200, { text, language: lang });
}

function send(res, status, body, type = 'application/json') {
  if (res.headersSent || res.destroyed) return;
  res.writeHead(status, { 'content-type': type });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://local');
  try {
    if (req.method === 'POST' && (url.pathname === '/inference' || url.pathname === '/v1/audio/transcriptions')) return await handleTranscription(req, res);
    if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true, model: modelName, threads });
    if (req.method === 'GET' && url.pathname === '/') return send(res, 200, `OpenCaptions local speech server · ${modelName} · POST /inference\n`, 'text/plain');
    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, 400, { error: e.message });
  }
});

const t0 = Date.now();
recognizer(''); // load the model before accepting requests
server.listen(port, host, () => {
  console.log(`OpenCaptions speech server · ${modelName} (${path.relative(ROOT, files.encoder)}) · ${threads} threads · loaded in ${Date.now() - t0} ms`);
  console.log(`listening on http://${host}:${port}/inference`);
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(0));
