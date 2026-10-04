#!/usr/bin/env node
// npm run local — OpenCaptions with AI that runs on this computer: no API key, no cloud, no cost per hour.
//
// Prepares and starts, as needed:
//   • a Whisper speech server — whisper.cpp's whisper-server or WhisperKit (Apple Silicon) when installed,
//     otherwise the bundled one (scripts/local-asr-server.js + a Whisper model downloaded once);
//   • Ollama with a translation model (default gemma3:4b, ~3 GB, downloaded once);
// then OpenCaptions itself with ENGINE=local. Ctrl+C stops everything it started.
//
//   npm run local                         everything, then the server on http://localhost:8080
//   npm run local -- --check              everything, then a 30-second end-to-end test instead of the server
//   npm run local -- --asr builtin        speech backend: auto (default) | builtin | whispercpp | whisperkit
//   npm run local -- --asr-model small    Whisper size: tiny | base | small | medium | large-v3-turbo
//   npm run local -- --llm-model qwen2.5:7b     text model for translation, summaries and questions
//   npm run local -- --mt-model translategemma  a separate model just for caption translation (+3.3 GB)
//   npm run local -- --build-whisper      build whisper.cpp from source first (GPU on Apple Silicon; git + cmake)
//   npm run local -- --no-llm             transcription only (no translations or summaries)
// Details: docs/local.md
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env'), quiet: true });
const LOCAL = path.join(ROOT, 'local');
const MODELS = path.join(LOCAL, 'models');
const LOGS = path.join(LOCAL, 'logs');
const RUNTIME = path.join(LOCAL, 'runtime');
const env = process.env;
const argv = process.argv.slice(2);
const flag = (k) => argv.includes(`--${k}`);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const win = process.platform === 'win32';
const appleSilicon = process.platform === 'darwin' && process.arch === 'arm64';
const cores = os.availableParallelism?.() || os.cpus().length;
const tty = process.stdout.isTTY;
const c = (code, s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const ok = (s) => console.log(`${c(32, '✓')} ${s}`);
const info = (s) => console.log(`${c(36, '•')} ${s}`);
const warn = (s) => console.log(`${c(33, '⚠')} ${s}`);
const die = (s) => { console.log(`${c(31, '✗')} ${s}`); cleanup(); process.exit(1); };
fs.mkdirSync(MODELS, { recursive: true });
fs.mkdirSync(LOGS, { recursive: true });

// ---------- helpers ----------
const children = [];
function cleanup() { for (const p of children) { try { p.kill(); } catch { /* gone */ } } }
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(0); });
process.on('exit', cleanup);

function which(bin) {
  const r = spawnSync(win ? 'where' : 'which', [bin], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : null;
}

async function reachable(url, ms = 2500) {
  try { await fetch(new URL(url).origin + '/', { signal: AbortSignal.timeout(ms) }); return true; } catch { return false; }
}

/** Wait until check() passes. Gives up at once if the server we started (proc) has exited. */
async function waitFor(check, ms, label, proc = null) {
  const t0 = Date.now();
  let shown = 0;
  while (Date.now() - t0 < ms) {
    if (proc && (proc.exitCode !== null || proc.signalCode !== null)) break;
    if (await check()) { if (shown) process.stdout.write('\n'); return true; }
    if (Date.now() - t0 > 3000 && Date.now() - shown > 15000) { process.stdout.write(`${shown ? '\n' : ''}  … ${label} (${Math.round((Date.now() - t0) / 1000)} s)`); shown = Date.now(); }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (shown) process.stdout.write('\n');
  return false;
}

/** The last lines a server wrote in this run (each run starts with a "--- <date> <command>" line in its log). */
function logTail(file, n = 15) {
  try {
    const text = fs.readFileSync(file, 'utf8');
    const run = text.slice(text.lastIndexOf('\n--- ') + 1).split('\n').slice(1).join('\n').trim();
    return run.split('\n').slice(-n).map((l) => `    ${l}`).join('\n');
  } catch { return ''; }
}

/** Start a background server; its output goes to local/logs/<name>.log. */
function start(name, cmd, args, extraEnv = {}) {
  const file = path.join(LOGS, `${name}.log`);
  const out = fs.openSync(file, 'a');
  fs.writeSync(out, `\n--- ${new Date().toISOString()} ${cmd} ${args.join(' ')}\n`);
  const p = spawn(cmd, args, { cwd: ROOT, env: { ...env, ...extraEnv }, stdio: ['ignore', out, out], windowsHide: true });
  // Failures while starting are reported by the caller; this is for a server that stops later.
  p.on('exit', (code) => { if (code && !p.killed && p.ready) warn(`${name} stopped (code ${code}) — see ${path.relative(ROOT, file)}:\n${logTail(file)}`); });
  children.push(p);
  return { process: p, log: file };
}

function run(cmd, args, label) {
  info(label);
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) die(`${label} failed${r.error ? ` (${r.error.message})` : ''}`);
}

/** npm without a shell (paths with spaces stay intact, also on Windows, where npm is a .cmd script). */
function npm(args, label) {
  if (/npm-cli\.c?js$/.test(env.npm_execpath || '')) return run(process.execPath, [env.npm_execpath, ...args], label);
  if (!win) return run('npm', args, label);
  info(label);
  const q = (a) => (/[\s"&|<>^]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a);
  const r = spawnSync(['npm.cmd', ...args].map(q).join(' '), { cwd: ROOT, stdio: 'inherit', shell: true });
  if (r.status !== 0) die(`${label} failed`);
}

async function download(url, dest, label) {
  if (fs.existsSync(dest)) return;
  info(`downloading ${label} (once)…`);
  const tmp = `${dest}.part`;
  let f = null;
  try {
    const res = await fetch(url);
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const total = Number(res.headers.get('content-length')) || 0;
    f = fs.createWriteStream(tmp);
    let got = 0, last = 0;
    for await (const chunk of res.body) {
      got += chunk.length;
      if (!f.write(chunk)) await new Promise((r) => f.once('drain', r));
      if (tty && Date.now() - last > 500) {
        last = Date.now();
        process.stdout.write(`\r  ${(got / 1e6).toFixed(0)} MB${total ? ` / ${(total / 1e6).toFixed(0)} MB (${Math.round((got / total) * 100)} %)` : ''}   `);
      }
    }
    await new Promise((r) => f.end(r));
    if (tty) process.stdout.write('\n');
    if (total && fs.statSync(tmp).size !== total) throw new Error('incomplete download');
  } catch (e) {
    // Node's fetch ignores HTTPS_PROXY (corporate networks); curl doesn't, and resumes what was downloaded.
    if (f && !f.writableFinished) await new Promise((r) => f.end(r));
    if (tty) process.stdout.write('\n');
    if (!which('curl')) die(`download failed (${e.cause?.code || e.message}) — ${url}\n  Download it by hand and save it as ${path.relative(ROOT, dest)}`);
    warn(`download failed (${e.cause?.code || e.message}); retrying with curl`);
    const r = spawnSync('curl', ['-fL', '--retry', '3', '-C', '-', '-o', tmp, url], { stdio: 'inherit' });
    if (r.status !== 0) die(`download failed — ${url}\n  Download it by hand and save it as ${path.relative(ROOT, dest)}`);
  }
  fs.renameSync(tmp, dest);
}

// ---------- speech ----------
const DEFAULT_PORT = 8178;
const asrPref = opt('asr', 'auto');
const asrModel = opt('asr-model', env.LOCAL_ASR_SIZE || '');

async function prepareSpeech() {
  if (env.LOCAL_ASR_URL) {
    if (!(await reachable(env.LOCAL_ASR_URL))) die(`LOCAL_ASR_URL=${env.LOCAL_ASR_URL} is not reachable. Start that server, or remove LOCAL_ASR_URL from .env to let npm run local manage one.`);
    return { url: env.LOCAL_ASR_URL, api: env.LOCAL_ASR_API || '', label: env.LOCAL_ASR_LABEL || env.LOCAL_ASR_MODEL || 'your speech server' };
  }
  const defaultUrl = `http://127.0.0.1:${DEFAULT_PORT}/inference`;
  if (await reachable(defaultUrl)) {
    if (asrPref !== 'auto') die(`port ${DEFAULT_PORT} is already in use (a speech server from an earlier run?). Stop that program, or run npm run local without --asr to use it.`);
    const h = await fetch(`http://127.0.0.1:${DEFAULT_PORT}/health`).then((r) => r.json()).catch(() => ({}));
    ok(`speech server already running on port ${DEFAULT_PORT}${h.model ? ` (${h.model})` : ''}`);
    return { url: defaultUrl, api: 'whispercpp', label: h.model || 'whisper' };
  }
  if (flag('build-whisper')) buildWhisperCpp();
  const whisperServer = which('whisper-server') || [path.join(LOCAL, 'whisper.cpp', 'build', 'bin', win ? 'Release\\whisper-server.exe' : 'whisper-server')].find((p) => fs.existsSync(p));
  if ((asrPref === 'auto' || asrPref === 'whispercpp') && whisperServer) return startWhisperCpp(whisperServer);
  if (asrPref === 'whispercpp') die('whisper-server not found. Build it with: npm run local -- --build-whisper   (needs git and cmake)');
  const whisperKit = appleSilicon && which('whisperkit-cli');
  if ((asrPref === 'auto' || asrPref === 'whisperkit') && whisperKit) return startWhisperKit(whisperKit);
  if (asrPref === 'whisperkit') die('whisperkit-cli not found. Install it with: brew install whisperkit-cli   (Apple Silicon)');
  return startBuiltin();
}

function buildWhisperCpp() {
  if (!which('git') || !which('cmake')) die('building whisper.cpp needs git and cmake (macOS: xcode-select --install && brew install cmake)');
  const src = path.join(LOCAL, 'whisper.cpp');
  if (!fs.existsSync(src)) run('git', ['clone', '--depth', '1', 'https://github.com/ggml-org/whisper.cpp', src], 'cloning whisper.cpp');
  run('cmake', ['-S', src, '-B', path.join(src, 'build'), '-DCMAKE_BUILD_TYPE=Release', '-DWHISPER_BUILD_SERVER=ON', '-DWHISPER_BUILD_EXAMPLES=ON', '-DWHISPER_BUILD_TESTS=OFF', '-DWHISPER_SDL2=OFF'], 'configuring whisper.cpp');
  run('cmake', ['--build', path.join(src, 'build'), '--target', 'whisper-server', '--config', 'Release', '-j', String(cores)], 'building whisper-server (a few minutes, once)');
}

async function startWhisperCpp(bin) {
  // Quantized turbo on Apple Silicon (GPU): best accuracy at real-time speed. On CPUs, smaller models keep up.
  let size = asrModel || (appleSilicon ? 'large-v3-turbo-q5_0' : cores >= 8 ? 'small' : 'base');
  if (size === 'turbo' || size === 'large-v3-turbo') size = 'large-v3-turbo-q5_0';
  const file = path.join(MODELS, `ggml-${size}.bin`);
  await download(`https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${size}.bin`, file, `Whisper ${size} for whisper.cpp`);
  const s = start('whisper-server', bin, ['-m', file, '--host', '127.0.0.1', '--port', String(DEFAULT_PORT), '-t', String(Math.min(8, cores)), '-l', 'auto']);
  const url = `http://127.0.0.1:${DEFAULT_PORT}/inference`;
  if (!(await waitFor(() => reachable(url), 120_000, 'loading the Whisper model', s.process))) die(`whisper-server didn't start — see ${path.relative(ROOT, s.log)}:\n${logTail(s.log)}`);
  s.process.ready = true;
  ok(`speech   whisper.cpp · ${size} · ${url}`);
  return { url, api: 'whispercpp', label: `whisper.cpp ${size}` };
}

async function startWhisperKit(bin) {
  const port = 50060;
  if (await reachable(`http://127.0.0.1:${port}/`)) {
    // Most likely a WhisperKit server from an earlier run that is still up: use it.
    if (await fetch(`http://127.0.0.1:${port}/health`).then((r) => r.ok).catch(() => false)) {
      ok(`speech   WhisperKit already running on port ${port}`);
      return { url: `http://127.0.0.1:${port}/v1/audio/transcriptions`, api: 'openai', label: 'WhisperKit', model: asrModel || 'whisper-1' };
    }
    die(`port ${port} (WhisperKit's) is in use by another program. Stop it, or use the bundled speech server: npm run local -- --asr builtin`);
  }
  const args = ['serve', '--host', '127.0.0.1', '--port', String(port), ...(asrModel ? ['--model', asrModel] : [])];
  const s = start('whisperkit', bin, args);
  info('WhisperKit is starting: the first time it downloads its model and compiles it for the Neural Engine (several minutes).');
  const url = `http://127.0.0.1:${port}/v1/audio/transcriptions`;
  if (!(await waitFor(() => fetch(`http://127.0.0.1:${port}/health`).then((r) => r.ok).catch(() => false), 20 * 60_000, 'WhisperKit preparing its model', s.process))) {
    die(`WhisperKit didn't start — see ${path.relative(ROOT, s.log)}:\n${logTail(s.log)}\n  Try the bundled speech server instead: npm run local -- --asr builtin`);
  }
  s.process.ready = true;
  ok(`speech   WhisperKit${asrModel ? ` · ${asrModel}` : ''} (Neural Engine) · ${url}`);
  // WhisperKit serves the model it loaded at start; the request's `model` field is only logged.
  return { url, api: 'openai', label: `WhisperKit${asrModel ? ` ${asrModel}` : ''}`, model: asrModel || 'whisper-1' };
}

async function startBuiltin() {
  // sherpa-onnx (Whisper on ONNX Runtime, CPU): prebuilt for macOS, Linux and Windows, kept out of the main install.
  // The engine's prebuilt binary lives in a per-platform package (sherpa-onnx-darwin-arm64, -linux-x64, -win-x64…).
  const platformPkg = `sherpa-onnx-${win ? 'win' : process.platform}-${process.arch}`;
  const installed = ['sherpa-onnx-node', platformPkg].every((p) => fs.existsSync(path.join(RUNTIME, 'node_modules', p, 'package.json')));
  if (!installed) {
    fs.mkdirSync(RUNTIME, { recursive: true });
    if (!fs.existsSync(path.join(RUNTIME, 'package.json'))) fs.writeFileSync(path.join(RUNTIME, 'package.json'), '{ "name": "opencaptions-local-runtime", "private": true }\n');
    npm(['install', '--prefix', RUNTIME, '--no-audit', '--no-fund', 'sherpa-onnx-node@^1.13.8'], 'installing the speech engine (sherpa-onnx, ~35 MB, once)');
  }
  let size = asrModel || (appleSilicon || cores >= 8 ? 'small' : 'base');
  if (size === 'large-v3-turbo') size = 'turbo';
  const name = `sherpa-onnx-whisper-${size}`;
  const dir = path.join(MODELS, name);
  if (!fs.existsSync(dir)) {
    const tar = path.join(MODELS, `${name}.tar.bz2`);
    await download(`https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/${name}.tar.bz2`, tar, `Whisper ${size}`);
    // Unpack into a scratch folder and move it into place at the end, so an interrupted run is simply redone.
    const tmp = path.join(MODELS, `.unpack-${size}`);
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp, { recursive: true });
    run('tar', ['xjf', tar, '-C', tmp], 'unpacking the model (about a minute)');
    // Keep the int8 model only (what the server loads): saves hundreds of MB.
    for (const f of fs.readdirSync(path.join(tmp, name))) if (/(encoder|decoder)\.onnx$/.test(f) && !/int8/.test(f)) fs.rmSync(path.join(tmp, name, f), { force: true });
    fs.renameSync(path.join(tmp, name), dir);
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(tar, { force: true });
  }
  const s = start('speech-server', process.execPath, [path.join(ROOT, 'scripts', 'local-asr-server.js'), '--model', dir, '--port', String(DEFAULT_PORT), '--threads', String(Math.min(appleSilicon ? 6 : 4, cores))]);
  const url = `http://127.0.0.1:${DEFAULT_PORT}/inference`;
  if (!(await waitFor(() => reachable(url), 120_000, 'loading the Whisper model', s.process))) {
    die(`the speech server didn't start — see ${path.relative(ROOT, s.log)}:\n${logTail(s.log)}\n  If the model is damaged, delete ${path.relative(ROOT, dir)} and run npm run local again.`);
  }
  s.process.ready = true;
  ok(`speech   bundled Whisper ${size} (CPU) · ${url}`);
  if (appleSilicon) info('tip: for more speed on this Mac, brew install whisperkit-cli (Neural Engine) or npm run local -- --build-whisper (GPU)');
  return { url, api: 'whispercpp', label: `whisper ${size}` };
}

// ---------- text model (translation, summaries) ----------
async function prepareText() {
  if (flag('no-llm') || /^(off|0|false|no)$/i.test(env.LOCAL_LLM || '')) { warn('no text model: captions in the spoken language only (no translations or summaries)'); return null; }
  const model = opt('llm-model', env.LOCAL_LLM_MODEL || 'gemma3:4b');
  const mtModel = opt('mt-model', env.LOCAL_MT_MODEL || '');
  const url = env.LOCAL_LLM_URL || 'http://127.0.0.1:11434';
  const isOllama = !/\/v1(\/|$)/.test(new URL(url).pathname) && env.LOCAL_LLM_API !== 'openai';
  if (!isOllama) {
    if (!(await reachable(url))) die(`LOCAL_LLM_URL=${url} is not reachable. Start that server (LM Studio, llama-server…) or remove LOCAL_LLM_URL to use Ollama.`);
    ok(`text     ${[model, mtModel].filter(Boolean).join(' + ')} · ${url}`);
    return { url, model, mtModel };
  }
  const origin = new URL(url).origin;
  if (!(await reachable(origin))) {
    const bin = which('ollama');
    if (!bin) {
      die(`Ollama is not installed (it runs the translation model).\n  macOS:   brew install ollama     (or the app: https://ollama.com/download)\n  Linux:   curl -fsSL https://ollama.com/install.sh | sh\n  Windows: https://ollama.com/download\n  Then run npm run local again. Or: npm run local -- --no-llm (no translations).`);
    }
    // One request at a time is all OpenCaptions sends: a single slot keeps the model's memory small.
    const s = start('ollama', bin, ['serve'], { OLLAMA_HOST: new URL(origin).host, OLLAMA_KEEP_ALIVE: '30m', OLLAMA_NUM_PARALLEL: env.OLLAMA_NUM_PARALLEL || '1' });
    if (!(await waitFor(() => reachable(origin), 30_000, 'starting Ollama', s.process))) die(`Ollama didn't start — see ${path.relative(ROOT, s.log)}:\n${logTail(s.log)}`);
    s.process.ready = true;
  }
  const tags = await fetch(`${origin}/api/tags`).then((r) => r.json()).catch(() => ({ models: [] }));
  const names = (tags.models || []).map((m) => m.name);
  for (const m of new Set([model, mtModel].filter(Boolean))) {
    if (!names.some((n) => n === m || n === `${m}:latest`)) await pull(origin, m);
    // Load it now, with the same context size OpenCaptions will ask for (a different one makes Ollama reload it).
    const t0 = Date.now();
    const options = { num_predict: 3, num_ctx: Number(env.LOCAL_LLM_CONTEXT || 8192) };
    const res = await fetch(`${origin}/api/chat`, { method: 'POST', body: JSON.stringify({ model: m, stream: false, keep_alive: env.LOCAL_LLM_KEEP_ALIVE || '30m', messages: [{ role: 'user', content: 'Reply with OK.' }], options }) })
      .then(async (r) => (r.ok ? null : `HTTP ${r.status} ${(await r.text()).slice(0, 200)}`), (e) => e.message);
    if (res) warn(`Ollama couldn't load ${m}: ${res}\n  Captions will work; translations and summaries may not. A smaller model: --llm-model gemma3:1b`);
    else ok(`text     Ollama · ${m}${m === mtModel ? ' (caption translation)' : ''} (loaded in ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }
  if (!mtModel) info('tip: for better translations add a translation model: npm run local -- --mt-model translategemma (+3.3 GB)');
  return { url, model, mtModel };
}

async function pull(origin, model) {
  info(`downloading the translation model ${model} with Ollama (once, a few GB)…`);
  const res = await fetch(`${origin}/api/pull`, { method: 'POST', body: JSON.stringify({ model, stream: true }) });
  if (!res.ok || !res.body) die(`ollama pull ${model} failed (${res.status})`);
  let buf = '', last = 0;
  for await (const chunk of res.body) {
    buf += Buffer.from(chunk).toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      const j = JSON.parse(line);
      if (j.error) die(`ollama pull ${model}: ${j.error}`);
      if (tty && j.total && Date.now() - last > 500) { last = Date.now(); process.stdout.write(`\r  ${j.status} ${Math.round(((j.completed || 0) / j.total) * 100)} % of ${(j.total / 1e9).toFixed(1)} GB   `); }
    }
  }
  if (tty) process.stdout.write('\n');
}

// ---------- go ----------
console.log(`\n${c(1, 'OpenCaptions · local mode')} — speech recognition and translation on this computer\n`);
const speech = await prepareSpeech();
const text = await prepareText();
const childEnv = {
  ENGINE: 'local',
  LOCAL_ASR_URL: speech.url,
  LOCAL_ASR_API: speech.api || '',
  LOCAL_ASR_LABEL: speech.label,
  ...(speech.model ? { LOCAL_ASR_MODEL: speech.model } : {}),
  ...(text ? { LOCAL_LLM_URL: text.url, LOCAL_LLM_MODEL: text.model, LOCAL_MT_MODEL: text.mtModel || '' } : { LOCAL_LLM: 'off' }),
};
console.log('');
const script = flag('check') ? path.join(ROOT, 'scripts', 'check-local.js') : path.join(ROOT, 'src', 'server.js');
const own = ['--asr', '--asr-model', '--llm-model', '--mt-model']; // flags with a value
const extra = flag('check') ? argv.filter((a, i) => ![...own, '--check', '--build-whisper', '--no-llm'].includes(a) && !own.includes(argv[i - 1])) : [];
info(flag('check') ? 'running the end-to-end check…' : 'starting OpenCaptions — nothing leaves this computer');
const app = spawn(process.execPath, [script, ...extra], { cwd: ROOT, env: { ...env, ...childEnv }, stdio: 'inherit' });
children.push(app); // stopping the launcher (Ctrl+C, kill <pid>) stops OpenCaptions too
app.on('exit', (code) => { cleanup(); process.exit(code ?? 0); });
