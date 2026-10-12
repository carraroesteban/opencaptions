#!/usr/bin/env node
// npm run local — OpenCaptions with AI that runs on this computer: no API key, no cloud, no cost per hour.
//
// Prepares and starts, as needed:
//   • a Whisper speech server — whisper.cpp's whisper-server or WhisperKit (Apple Silicon) when installed,
//     else on Apple-chip Macs with macOS 26+ the speech recognition and translation built into the Mac (nothing to
//     download), otherwise the bundled one (scripts/local-asr-server.js + a Whisper model downloaded once);
//   • Ollama with a translation model (default gemma3:4b, ~3 GB, downloaded once);
// then OpenCaptions itself with ENGINE=local. Ctrl+C stops everything it started.
//
//   npm run local                         everything, then the server on http://localhost:8080
//   npm run local -- --check              everything, then a 30-second end-to-end test instead of the server
//   npm run local -- --asr builtin        speech backend: auto (default) | builtin | whispercpp | whisperkit | apple
//   npm run local -- --asr-model small    Whisper size: tiny | base | small | medium | large-v3-turbo
//   npm run local -- --llm-model qwen2.5:7b     text model for translation, summaries and questions
//   npm run local -- --mt-model translategemma  a separate model just for caption translation (+3.3 GB)
//   npm run local -- --build-whisper      build whisper.cpp from source first (GPU on Apple Silicon; git + cmake)
//   npm run local -- --no-llm             transcription only (no translations or summaries)
//   npm run local -- --fallback           Gemini as usual, this computer as the backup when the internet goes down
// Details: docs/local.md
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import * as tty from '../src/tty.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env'), quiet: true });
// The preparation itself is shared with the dashboard's "Run it on this computer" button.
const { prepareSpeech, prepareText, children, stopAll } = await import('../src/local/setup.js');
const env = process.env;
const argv = process.argv.slice(2);
const flag = (k) => argv.includes(`--${k}`);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const die = (s) => { tty.fail(s); stopAll(); process.exit(1); };
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stopAll(); process.exit(0); });

async function prepare() {
  const speech = await prepareSpeech({ asr: opt('asr', 'auto'), asrModel: opt('asr-model', env.LOCAL_ASR_SIZE || ''), buildWhisper: flag('build-whisper') }, tty);
  if (flag('no-llm') || /^(off|0|false|no)$/i.test(env.LOCAL_LLM || '')) { tty.warn('no text model: captions in the spoken language only (no translations or summaries)'); return { speech, text: null }; }
  const mtModel = opt('mt-model', env.LOCAL_MT_MODEL || '');
  const text = await prepareText({ model: opt('llm-model', env.LOCAL_LLM_MODEL || 'gemma3:4b'), mtModel }, tty).catch((e) => {
    if (e.code !== 'no-ollama') throw e;
    if (speech.api === 'apple') { tty.info('translations: Apple\'s, built into this Mac (Ollama adds AI summaries and answers)'); return null; }
    throw new Error(`${e.message}\n  macOS:   brew install ollama     (or the app: https://ollama.com/download)\n  Linux:   curl -fsSL https://ollama.com/install.sh | sh\n  Windows: https://ollama.com/download\n  Then run npm run local again. Or: npm run local -- --no-llm (no translations).`);
  });
  if (!mtModel && text) tty.info('tip: for better translations add a translation model: npm run local -- --mt-model translategemma (+3.3 GB)');
  return { speech, text };
}

// ---------- go ----------
// --fallback: Gemini stays the main engine; the local servers wait on standby for an internet outage.
const fallback = flag('fallback') && !flag('check');
// The server's own config decides, so a key pasted in the dashboard (data/secrets.json, DATA_DIR) counts as well as .env's.
if (fallback) {
  const { config } = await import('../src/config.js');
  if (!config.geminiApiKey && !config.vertex) die('--fallback keeps Gemini as the main engine: paste a Gemini key in the dashboard (Settings) or set GEMINI_API_KEY in .env first (npm run setup)');
}
console.log(fallback
  ? `\n${tty.title('Gemini + offline backup')} ${tty.c.gray('· if the internet goes down, captions keep running on this computer')}\n`
  : `\n${tty.title('local mode')} ${tty.c.gray('· speech recognition and translation on this computer')}\n`);
const { speech, text } = await prepare().catch((e) => die(e.message));
const childEnv = {
  ...(fallback ? { ENGINE: 'gemini', FALLBACK: 'local' } : { ENGINE: 'local' }),
  LOCAL_ASR_URL: speech.url,
  LOCAL_ASR_API: speech.api || '',
  LOCAL_ASR_LABEL: speech.label,
  ...(speech.model ? { LOCAL_ASR_MODEL: speech.model } : {}),
  ...(text ? { LOCAL_LLM_URL: text.url, LOCAL_LLM_MODEL: text.model, LOCAL_MT_MODEL: text.mtModel || '' } : { LOCAL_LLM: 'off' }),
  ...(flag('fresh') ? { FRESH: '1' } : {}), // a clean start in a temporary data folder (see src/config.js)
};
console.log('');
const script = flag('check') ? path.join(ROOT, 'scripts', 'check-local.js') : path.join(ROOT, 'src', 'server.js');
const own = ['--asr', '--asr-model', '--llm-model', '--mt-model']; // flags with a value
const extra = flag('check') ? argv.filter((a, i) => ![...own, '--check', '--build-whisper', '--no-llm', '--fallback'].includes(a) && !own.includes(argv[i - 1])) : [];
tty.info(flag('check') ? 'running the end-to-end check…' : fallback ? 'starting OpenCaptions — Gemini first, this computer as the backup' : 'starting OpenCaptions — nothing leaves this computer');
const app = spawn(process.execPath, [script, ...extra], { cwd: ROOT, env: { ...env, ...childEnv }, stdio: 'inherit' });
children.push(app); // stopping the launcher (Ctrl+C, kill <pid>) stops OpenCaptions too
app.on('exit', (code) => { stopAll(); process.exit(code ?? 0); });
