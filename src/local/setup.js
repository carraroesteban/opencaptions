// Prepares the AI that runs on this computer (docs/local.md): a Whisper speech server and Ollama with a text model.
// Used by `npm run local` (scripts/local.js: progress in the terminal) and by the dashboard's "Run it on this
// computer" button (src/server.js: progress on the page). `ui` is src/tty.js, or a stand-in with the same
// info / ok / warn / progress / spinner functions. Failures throw; nothing here exits the process.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'); // not config.js: the npm run local launcher doesn't load the server's settings

const env = process.env;
// Downloaded models and runtimes. The desktop apps keep them next to the data folder (LOCAL_DIR), so an update,
// which replaces the app's files, doesn't download them again.
export const LOCAL = path.resolve(env.LOCAL_DIR || path.join(ROOT, 'local'));
const MODELS = path.join(LOCAL, 'models');
const LOGS = path.join(LOCAL, 'logs');
const RUNTIME = path.join(LOCAL, 'runtime');
const win = process.platform === 'win32';
const appleSilicon = process.platform === 'darwin' && process.arch === 'arm64';
const cores = os.availableParallelism?.() || os.cpus().length;
export const DEFAULT_PORT = 8178;
const rel = (p) => path.relative(ROOT, p);

// ---------- helpers ----------
/** Servers started here; they stop with this process. */
export const children = [];
export function stopAll() { for (const p of children) { try { p.kill(); } catch { /* gone */ } } }
process.on('exit', stopAll);

export function which(bin) {
  const r = spawnSync(win ? 'where' : 'which', [bin], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : null;
}

export async function reachable(url, ms = 2500) {
  try { await fetch(new URL(url).origin + '/', { signal: AbortSignal.timeout(ms) }); return true; } catch { return false; }
}

/** Wait until check() passes, with a spinner. Gives up at once if the server we started (proc) has exited. */
async function waitFor(ui, check, ms, label, proc = null) {
  const t0 = Date.now();
  const sp = ui.spinner(label);
  while (Date.now() - t0 < ms) {
    if (proc && (proc.exitCode !== null || proc.signalCode !== null)) break;
    if (await check()) { sp.stop(); return true; }
    await new Promise((r) => setTimeout(r, 500));
  }
  sp.stop();
  return false;
}

/** The last lines a server wrote in this run (each run starts with a "--- <date> <command>" line in its log). */
export function logTail(file, n = 15) {
  try {
    const text = fs.readFileSync(file, 'utf8');
    const run = text.slice(text.lastIndexOf('\n--- ') + 1).split('\n').slice(1).join('\n').trim();
    return run.split('\n').slice(-n).map((l) => `    ${l}`).join('\n');
  } catch { return ''; }
}

/** Start a background server; its output goes to <LOCAL>/logs/<name>.log. */
function start(ui, name, cmd, args, extraEnv = {}) {
  fs.mkdirSync(LOGS, { recursive: true });
  const file = path.join(LOGS, `${name}.log`);
  const out = fs.openSync(file, 'a');
  fs.writeSync(out, `\n--- ${new Date().toISOString()} ${cmd} ${args.join(' ')}\n`);
  /** @type {import('node:child_process').ChildProcess & { ready?: boolean }} set ready once it answers */
  const p = spawn(cmd, args, { cwd: ROOT, env: { ...env, ...extraEnv }, stdio: ['ignore', out, out], windowsHide: true });
  fs.closeSync(out); // the child has its own copy
  // Failures while starting are reported by the caller; this is for a server that stops later.
  p.on('exit', (code) => { if (code && !p.killed && p.ready) ui.warn(`${name} stopped (code ${code}) — see ${rel(file)}:\n${logTail(file)}`); });
  p.on('error', () => { /* reported by waitFor's timeout */ });
  children.push(p);
  return { process: p, log: file };
}

/** Run a command to the end (without blocking: the server keeps captioning meanwhile). */
async function run(ui, cmd, args, label, { shell = false } = {}) {
  ui.info(label);
  const code = await new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: ROOT, stdio: 'inherit', shell, windowsHide: true });
    p.on('error', () => resolve(-1));
    p.on('close', resolve);
  });
  if (code !== 0) throw new Error(`${label} failed`);
}

/** npm without a shell (paths with spaces stay intact, also on Windows, where npm is a .cmd script). */
function npm(ui, args, label) {
  if (/npm-cli\.c?js$/.test(env.npm_execpath || '')) return run(ui, process.execPath, [env.npm_execpath, ...args], label);
  if (!win) return run(ui, 'npm', args, label);
  const q = (a) => (/[\s"&|<>^]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a);
  return run(ui, ['npm.cmd', ...args].map(q).join(' '), [], label, { shell: true });
}

async function download(ui, url, dest, label) {
  if (fs.existsSync(dest)) return;
  const bar = ui.progress(`Downloading ${label} (once)`);
  const tmp = `${dest}.part`;
  let f = null;
  try {
    const res = await fetch(url);
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const total = Number(res.headers.get('content-length')) || 0;
    f = fs.createWriteStream(tmp);
    let got = 0;
    for await (const chunk of res.body) {
      got += chunk.length;
      if (!f.write(chunk)) await new Promise((r) => f.once('drain', r));
      bar.update(got, total);
    }
    await new Promise((r) => f.end(r));
    if (total && fs.statSync(tmp).size !== total) throw new Error('incomplete download');
    bar.succeed(`Downloaded ${label}`);
  } catch (e) {
    // Node's fetch ignores HTTPS_PROXY (corporate networks); curl doesn't, and resumes what was downloaded.
    if (f && !f.writableFinished) await new Promise((r) => f.end(r));
    bar.fail(`Download of ${label} interrupted`);
    const manual = `download failed (${e.cause?.code || e.message}) — ${url}\n  Download it by hand and save it as ${dest}`;
    if (!which('curl')) throw new Error(manual, { cause: e });
    ui.warn(`download failed (${e.cause?.code || e.message}); retrying with curl`);
    await run(ui, 'curl', ['-fL', '--retry', '3', '-C', '-', '-o', tmp, url], `downloading ${label} with curl`).catch(() => { throw new Error(manual); });
  }
  fs.renameSync(tmp, dest);
}

// ---------- speech ----------
/**
 * A Whisper speech server: LOCAL_ASR_URL, one already on port 8178, whisper.cpp, WhisperKit, or the bundled one.
 * @param {{ asr?: string, asrModel?: string, buildWhisper?: boolean }} o
 * @returns {Promise<{ url: string, api: string, label: string, model?: string }>}
 */
export async function prepareSpeech({ asr = 'auto', asrModel = env.LOCAL_ASR_SIZE || '', buildWhisper = false } = {}, ui) {
  fs.mkdirSync(MODELS, { recursive: true });
  if (env.LOCAL_ASR_URL) {
    if (!(await reachable(env.LOCAL_ASR_URL))) throw new Error(`LOCAL_ASR_URL=${env.LOCAL_ASR_URL} is not reachable. Start that server, or remove LOCAL_ASR_URL from .env to let OpenCaptions manage one.`);
    return { url: env.LOCAL_ASR_URL, api: env.LOCAL_ASR_API || '', label: env.LOCAL_ASR_LABEL || env.LOCAL_ASR_MODEL || 'your speech server' };
  }
  const defaultUrl = `http://127.0.0.1:${DEFAULT_PORT}/inference`;
  if (await reachable(defaultUrl)) {
    if (asr !== 'auto') throw new Error(`port ${DEFAULT_PORT} is already in use (a speech server from an earlier run?). Stop that program, or run npm run local without --asr to use it.`);
    const h = /** @type {any} */ (await fetch(`http://127.0.0.1:${DEFAULT_PORT}/health`).then((r) => r.json()).catch(() => ({})));
    ui.ok(`speech server already running on port ${DEFAULT_PORT}${h.model ? ` (${h.model})` : ''}`);
    return { url: defaultUrl, api: 'whispercpp', label: h.model || 'whisper' };
  }
  if (buildWhisper) await buildWhisperCpp(ui);
  const whisperServer = which('whisper-server') || [path.join(LOCAL, 'whisper.cpp', 'build', 'bin', win ? 'Release\\whisper-server.exe' : 'whisper-server')].find((p) => fs.existsSync(p));
  if ((asr === 'auto' || asr === 'whispercpp') && whisperServer) return startWhisperCpp(ui, whisperServer, asrModel);
  if (asr === 'whispercpp') throw new Error('whisper-server not found. Build it with: npm run local -- --build-whisper   (needs git and cmake)');
  const whisperKit = appleSilicon && which('whisperkit-cli');
  if ((asr === 'auto' || asr === 'whisperkit') && whisperKit) return startWhisperKit(ui, whisperKit, asrModel);
  if (asr === 'whisperkit') throw new Error('whisperkit-cli not found. Install it with: brew install whisperkit-cli   (Apple Silicon)');
  return startBuiltin(ui, asrModel);
}

async function buildWhisperCpp(ui) {
  if (!which('git') || !which('cmake')) throw new Error('building whisper.cpp needs git and cmake (macOS: xcode-select --install && brew install cmake)');
  const src = path.join(LOCAL, 'whisper.cpp');
  if (!fs.existsSync(src)) await run(ui, 'git', ['clone', '--depth', '1', 'https://github.com/ggml-org/whisper.cpp', src], 'cloning whisper.cpp');
  await run(ui, 'cmake', ['-S', src, '-B', path.join(src, 'build'), '-DCMAKE_BUILD_TYPE=Release', '-DWHISPER_BUILD_SERVER=ON', '-DWHISPER_BUILD_EXAMPLES=ON', '-DWHISPER_BUILD_TESTS=OFF', '-DWHISPER_SDL2=OFF'], 'configuring whisper.cpp');
  await run(ui, 'cmake', ['--build', path.join(src, 'build'), '--target', 'whisper-server', '--config', 'Release', '-j', String(cores)], 'building whisper-server (a few minutes, once)');
}

async function startWhisperCpp(ui, bin, asrModel) {
  // Quantized turbo on Apple Silicon (GPU): best accuracy at real-time speed. On CPUs, smaller models keep up.
  let size = asrModel || (appleSilicon ? 'large-v3-turbo-q5_0' : cores >= 8 ? 'small' : 'base');
  if (size === 'turbo' || size === 'large-v3-turbo') size = 'large-v3-turbo-q5_0';
  const file = path.join(MODELS, `ggml-${size}.bin`);
  await download(ui, `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${size}.bin`, file, `Whisper ${size} for whisper.cpp`);
  const s = start(ui, 'whisper-server', bin, ['-m', file, '--host', '127.0.0.1', '--port', String(DEFAULT_PORT), '-t', String(Math.min(8, cores)), '-l', 'auto']);
  const url = `http://127.0.0.1:${DEFAULT_PORT}/inference`;
  if (!(await waitFor(ui, () => reachable(url), 120_000, 'loading the Whisper model', s.process))) throw new Error(`whisper-server didn't start — see ${rel(s.log)}:\n${logTail(s.log)}`);
  s.process.ready = true;
  ui.ok(`speech   whisper.cpp · ${size} · ${url}`);
  return { url, api: 'whispercpp', label: `whisper.cpp ${size}` };
}

async function startWhisperKit(ui, bin, asrModel) {
  const port = 50060;
  if (await reachable(`http://127.0.0.1:${port}/`)) {
    // Most likely a WhisperKit server from an earlier run that is still up: use it.
    if (await fetch(`http://127.0.0.1:${port}/health`).then((r) => r.ok).catch(() => false)) {
      ui.ok(`speech   WhisperKit already running on port ${port}`);
      return { url: `http://127.0.0.1:${port}/v1/audio/transcriptions`, api: 'openai', label: 'WhisperKit', model: asrModel || 'whisper-1' };
    }
    throw new Error(`port ${port} (WhisperKit's) is in use by another program. Stop it, or use the bundled speech server: npm run local -- --asr builtin`);
  }
  const args = ['serve', '--host', '127.0.0.1', '--port', String(port), ...(asrModel ? ['--model', asrModel] : [])];
  const s = start(ui, 'whisperkit', bin, args);
  ui.info('WhisperKit is starting: the first time it downloads its model and compiles it for the Neural Engine (several minutes).');
  const url = `http://127.0.0.1:${port}/v1/audio/transcriptions`;
  if (!(await waitFor(ui, () => fetch(`http://127.0.0.1:${port}/health`).then((r) => r.ok).catch(() => false), 20 * 60_000, 'WhisperKit preparing its model', s.process))) {
    throw new Error(`WhisperKit didn't start — see ${rel(s.log)}:\n${logTail(s.log)}\n  Try the bundled speech server instead: npm run local -- --asr builtin`);
  }
  s.process.ready = true;
  ui.ok(`speech   WhisperKit${asrModel ? ` · ${asrModel}` : ''} (Neural Engine) · ${url}`);
  // WhisperKit serves the model it loaded at start; the request's `model` field is only logged.
  return { url, api: 'openai', label: `WhisperKit${asrModel ? ` ${asrModel}` : ''}`, model: asrModel || 'whisper-1' };
}

async function startBuiltin(ui, asrModel) {
  // sherpa-onnx (Whisper on ONNX Runtime, CPU): prebuilt for macOS, Linux and Windows, kept out of the main install.
  // The engine's prebuilt binary lives in a per-platform package (sherpa-onnx-darwin-arm64, -linux-x64, -win-x64…).
  const platformPkg = `sherpa-onnx-${win ? 'win' : process.platform}-${process.arch}`;
  const installed = ['sherpa-onnx-node', platformPkg].every((p) => fs.existsSync(path.join(RUNTIME, 'node_modules', p, 'package.json')));
  if (!installed) {
    fs.mkdirSync(RUNTIME, { recursive: true });
    if (!fs.existsSync(path.join(RUNTIME, 'package.json'))) fs.writeFileSync(path.join(RUNTIME, 'package.json'), '{ "name": "opencaptions-local-runtime", "private": true }\n');
    await npm(ui, ['install', '--prefix', RUNTIME, '--no-audit', '--no-fund', 'sherpa-onnx-node@^1.13.8'], 'installing the speech engine (sherpa-onnx, ~35 MB, once)');
  }
  let size = asrModel || (appleSilicon || cores >= 8 ? 'small' : 'base');
  if (size === 'large-v3-turbo') size = 'turbo';
  const name = `sherpa-onnx-whisper-${size}`;
  const dir = path.join(MODELS, name);
  if (!fs.existsSync(dir)) {
    const tar = path.join(MODELS, `${name}.tar.bz2`);
    await download(ui, `https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/${name}.tar.bz2`, tar, `Whisper ${size}`);
    // Unpack into a scratch folder and move it into place at the end, so an interrupted run is simply redone.
    const tmp = path.join(MODELS, `.unpack-${size}`);
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp, { recursive: true });
    await run(ui, 'tar', ['xjf', tar, '-C', tmp], 'unpacking the model (about a minute)');
    // Keep the int8 model only (what the server loads): saves hundreds of MB.
    for (const f of fs.readdirSync(path.join(tmp, name))) if (/(encoder|decoder)\.onnx$/.test(f) && !/int8/.test(f)) fs.rmSync(path.join(tmp, name, f), { force: true });
    fs.renameSync(path.join(tmp, name), dir);
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(tar, { force: true });
  }
  const s = start(ui, 'speech-server', process.execPath, [path.join(ROOT, 'scripts', 'local-asr-server.js'), '--model', dir, '--port', String(DEFAULT_PORT), '--threads', String(Math.min(appleSilicon ? 6 : 4, cores))], { LOCAL_DIR: LOCAL });
  const url = `http://127.0.0.1:${DEFAULT_PORT}/inference`;
  if (!(await waitFor(ui, () => reachable(url), 120_000, 'loading the Whisper model', s.process))) {
    throw new Error(`the speech server didn't start — see ${rel(s.log)}:\n${logTail(s.log)}\n  If the model is damaged, delete ${dir} and try again.`);
  }
  s.process.ready = true;
  ui.ok(`speech   bundled Whisper ${size} (CPU) · ${url}`);
  if (appleSilicon) ui.info('tip: for more speed on this Mac, brew install whisperkit-cli (Neural Engine) or npm run local -- --build-whisper (GPU)');
  return { url, api: 'whispercpp', label: `whisper ${size}` };
}

// ---------- text model (translation, summaries) ----------
/** Ollama's program: on the PATH, or where its desktop app puts it (the app may not have added it to the PATH). */
export function findOllama() {
  const apps = process.platform === 'darwin' ? ['/Applications/Ollama.app/Contents/Resources/ollama', path.join(os.homedir(), 'Applications/Ollama.app/Contents/Resources/ollama')]
    : win ? [path.join(env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe')] : [];
  return which('ollama') || apps.find((p) => fs.existsSync(p)) || null;
}

/**
 * Ollama (started if needed) with the text model pulled and loaded, or an OpenAI-compatible server at LOCAL_LLM_URL.
 * Throws an error with code 'no-ollama' when Ollama isn't installed.
 * @param {{ model?: string, mtModel?: string }} o
 */
export async function prepareText({ model = env.LOCAL_LLM_MODEL || 'gemma3:4b', mtModel = env.LOCAL_MT_MODEL || '' } = {}, ui) {
  const url = env.LOCAL_LLM_URL || 'http://127.0.0.1:11434';
  const isOllama = !/\/v1(\/|$)/.test(new URL(url).pathname) && env.LOCAL_LLM_API !== 'openai';
  if (!isOllama) {
    if (!(await reachable(url))) throw new Error(`LOCAL_LLM_URL=${url} is not reachable. Start that server (LM Studio, llama-server…) or remove LOCAL_LLM_URL to use Ollama.`);
    ui.ok(`text     ${[model, mtModel].filter(Boolean).join(' + ')} · ${url}`);
    return { url, model, mtModel };
  }
  const origin = new URL(url).origin;
  if (!(await reachable(origin))) {
    const bin = findOllama();
    if (!bin) throw Object.assign(new Error('Ollama is not installed (it runs the translation model).'), { code: 'no-ollama' });
    // One request at a time is all OpenCaptions sends: a single slot keeps the model's memory small.
    const s = start(ui, 'ollama', bin, ['serve'], { OLLAMA_HOST: new URL(origin).host, OLLAMA_KEEP_ALIVE: '30m', OLLAMA_NUM_PARALLEL: env.OLLAMA_NUM_PARALLEL || '1' });
    if (!(await waitFor(ui, () => reachable(origin), 30_000, 'starting Ollama', s.process))) throw new Error(`Ollama didn't start — see ${rel(s.log)}:\n${logTail(s.log)}`);
    s.process.ready = true;
  }
  const tags = /** @type {any} */ (await fetch(`${origin}/api/tags`).then((r) => r.json()).catch(() => ({ models: [] })));
  const names = (tags.models || []).map((m) => m.name);
  for (const m of new Set([model, mtModel].filter(Boolean))) {
    if (!names.some((n) => n === m || n === `${m}:latest`)) await pull(ui, origin, m);
    // Load it now, with the same context size OpenCaptions will ask for (a different one makes Ollama reload it).
    const t0 = Date.now();
    const options = { num_predict: 3, num_ctx: Number(env.LOCAL_LLM_CONTEXT || 8192) };
    const sp = ui.spinner(`loading ${m}`);
    const res = await fetch(`${origin}/api/chat`, { method: 'POST', body: JSON.stringify({ model: m, stream: false, keep_alive: env.LOCAL_LLM_KEEP_ALIVE || '30m', messages: [{ role: 'user', content: 'Reply with OK.' }], options }) })
      .then(async (r) => (r.ok ? null : `HTTP ${r.status} ${(await r.text()).slice(0, 200)}`), (e) => e.message);
    sp.stop();
    if (res) ui.warn(`Ollama couldn't load ${m}: ${res}\n  Captions will work; translations and summaries may not. A smaller model: --llm-model gemma3:1b`);
    else ui.ok(`text     Ollama · ${m}${m === mtModel ? ' (caption translation)' : ''} (loaded in ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }
  return { url, model, mtModel };
}

async function pull(ui, origin, model) {
  const bar = ui.progress(`Downloading the translation model ${model} (once, a few GB)`);
  const res = await fetch(`${origin}/api/pull`, { method: 'POST', body: JSON.stringify({ model, stream: true }) });
  if (!res.ok || !res.body) { bar.fail(); throw new Error(`ollama pull ${model} failed (${res.status})`); }
  let buf = '';
  for await (const chunk of res.body) {
    buf += Buffer.from(chunk).toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      const j = JSON.parse(line);
      if (j.error) { bar.fail(); throw new Error(`ollama pull ${model}: ${j.error}`); }
      // Ollama downloads in layers: show the big one's progress, and its other steps as the label.
      if (j.total) bar.update(j.completed || 0, j.total, `Downloading ${model}`);
      else if (j.status) bar.update(0, 0, `${model}: ${j.status}`);
    }
  }
  bar.succeed(`Downloaded ${model}`);
}
