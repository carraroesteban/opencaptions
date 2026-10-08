// Loads event configuration (config/event.json) + environment variables.
import dotenv from 'dotenv';
dotenv.config({ quiet: true });
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);

function readJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(ROOT, p), 'utf8'));
  } catch (e) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Cannot read ${p}: ${e.message}`, { cause: e });
  }
}

const eventPath = process.env.EVENT_CONFIG || 'config/event.json';
const event = readJson(eventPath);

const env = process.env;
// Agenda times like "14:30" are read in the event's time zone (Docker containers default to UTC).
if (event.timezone && !env.TZ) env.TZ = event.timezone;
const DEFAULT_TARGETS = event.defaultTargets || ['es', 'en'];
const vertex = /^(1|true)$/i.test(env.GOOGLE_GENAI_USE_VERTEXAI || '');
// FRESH=1 (or --fresh): start from nothing, to test OpenCaptions as a first-time user. The data folder is a new
// temporary one, deleted when the server stops; the real one (data/) isn't touched, and .env still applies.
const fresh = flag('fresh') || /^(1|true|yes|on)$/i.test(env.FRESH || '');
const dataDir = fresh ? freshDir() : path.resolve(ROOT, env.DATA_DIR || 'data');
function freshDir() {
  const base = os.tmpdir();
  // Leftovers of a run that couldn't clean up (killed, crashed): older than a day.
  for (const d of fs.readdirSync(base).filter((x) => x.startsWith('opencaptions-fresh-'))) {
    try { if (Date.now() - fs.statSync(path.join(base, d)).mtimeMs > 86400000) fs.rmSync(path.join(base, d), { recursive: true, force: true }); } catch { /* someone else's */ }
  }
  const dir = fs.mkdtempSync(path.join(base, 'opencaptions-fresh-'));
  process.on('exit', () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* already gone */ } });
  return dir;
}
// A Gemini key typed in the dashboard (welcome wizard or Settings) is kept in data/secrets.json and wins over
// GEMINI_API_KEY, so nobody has to edit .env. See src/aikey.js.
const savedKey = String(readJson(path.join(dataDir, 'secrets.json'), {}).geminiApiKey || '');
const geminiApiKey = savedKey || env.GEMINI_API_KEY || '';
// gemini (cloud) | local (Whisper + a local text model, see docs/local.md) | mock (simulated, no AI at all)
const engine = flag('mock') ? 'mock' : flag('local') ? 'local' : (env.ENGINE || (geminiApiKey || vertex ? 'gemini' : 'mock'));
// Settings whose default depends on the engine. Recomputed when the offline backup switches engines.
const engineDefaults = (eng) => ({
  // Give up on (and retry) a translation request after this long.
  mtTimeoutMs: Number(env.MT_TIMEOUT_MS ?? event.mtTimeoutMs ?? (eng === 'local' ? 30000 : 5000)),
  // Show the model's low-latency interim transcription as provisional text on the original channel.
  useInterim: (env.USE_INTERIM ?? String(event.useInterim ?? (eng === 'local' ? '1' : '0'))) === '1', // local: on (Whisper's provisional words)
});

export const config = {
  port: Number(env.PORT || 8080),
  host: env.HOST || '0.0.0.0',
  // On a hosting platform the public address is known without asking: Render, Fly.io and Railway say it.
  publicUrl: (env.PUBLIC_URL || event.publicUrl || env.RENDER_EXTERNAL_URL || (env.FLY_APP_NAME ? `https://${env.FLY_APP_NAME}.fly.dev` : '')
    || (env.RAILWAY_PUBLIC_DOMAIN ? `https://${env.RAILWAY_PUBLIC_DOMAIN}` : '')).replace(/\/$/, ''),
  engine,
  // The engine chosen at start. `engine` itself can change at runtime (offline backup, see src/failover.js).
  primaryEngine: engine,
  // Offline backup: 'local' = when the internet goes down, switch rooms from Gemini to the local engine
  // (Whisper + Ollama on this machine) and back when it returns. `npm run local -- --fallback` sets it up.
  fallback: (env.FALLBACK || event.fallback || '').toLowerCase(),
  geminiApiKey,
  // Where the key came from: 'dashboard' (data/secrets.json), 'env' (GEMINI_API_KEY) or '' (none).
  keySource: savedKey ? 'dashboard' : env.GEMINI_API_KEY ? 'env' : '',
  // Enterprise: use Vertex AI in your own Google Cloud project instead of an API key.
  vertex,
  gcpProject: env.GOOGLE_CLOUD_PROJECT || '',
  gcpLocation: env.GOOGLE_CLOUD_LOCATION || 'us-central1',
  // Data governance: keep transcripts on disk at all (false = captions are only streamed, never stored)
  storeTranscripts: !/^(0|false|no)$/i.test(env.STORE_TRANSCRIPTS || 'true'),
  // Delete stored transcripts older than N days (0 = keep forever).
  retentionDays: Number(env.RETENTION_DAYS || 0),
  model: env.GEMINI_MODEL || event.model || 'gemini-3.5-live-translate-preview',
  ingestToken: env.INGEST_TOKEN || '',
  adminToken: env.ADMIN_TOKEN || '',
  // The crew's password: the dashboard's live controls only (next talk, restart a room…), never the setup.
  crewToken: env.CREW_TOKEN || '',
  dataDir,
  fresh,
  // Stop streaming audio to the model after this many seconds of silence (saves cost between talks).
  silenceGateSec: Number(env.SILENCE_GATE_SEC ?? event.silenceGateSec ?? 30),
  // Pause captions while a room plays music (walk-in music, videos between talks): src/voice.js. Per room: musicGuard.
  musicGuard: !/^(0|false|off|no)$/i.test(String(env.MUSIC_GUARD ?? event.musicGuard ?? 'on')),
  // Close model sessions entirely after this many seconds without speech / ingest.
  idleCloseSec: Number(env.IDLE_CLOSE_SEC ?? event.idleCloseSec ?? 300),
  // RMS threshold (0..1) to consider a 100ms chunk "speech".
  speechRms: Number(env.SPEECH_RMS ?? event.speechRms ?? 0.012),
  // Caption translation: 'text' (default: fast text MT per clause, 1 Live session/room), 'live' or 'hybrid'.
  translationMode: env.TRANSLATION_MODE || event.translation || 'text',
  // Text-translation request budget per minute across the whole server (0 = unlimited; set it to your
  // AI Studio limit on the free tier, e.g. 15). Provisional translations use at most 60% of it.
  mtRpm: Number(env.MT_RPM ?? event.mtRpm ?? 0),
  // Stream each sentence's translation into the caption as the model writes it (Gemini). 0 = wait for the whole answer.
  mtStream: !/^(0|false|no|off)$/i.test(env.MT_STREAM ?? String(event.mtStream ?? '1')),
  // How often the in-progress sentence is re-translated as a provisional caption (ms).
  mtPartialMs: Number(env.MT_PARTIAL_MS ?? event.mtPartialMs ?? 1500),
  textModel: env.TEXT_MODEL || event.textModel || 'gemini-3.5-flash-lite',
  ...engineDefaults(engine),
  // Optional: shorten the model's end-of-speech wait (ms) to cut caption latency, e.g. 300.
  vadSilenceMs: Number(env.VAD_SILENCE_MS ?? event.vadSilenceMs ?? 0),
  transcriptionMode: env.TRANSCRIPTION_MODE || event.transcriptionMode || '', // '' | 'VERBATIM' | 'SMART'
  // ---- Local engine (ENGINE=local): nothing leaves this machine. See docs/local.md. ----
  // Speech: whisper.cpp's whisper-server (…/inference), scripts/local-asr-server.js, or an OpenAI-compatible
  // /v1/audio/transcriptions server.
  localAsrUrl: env.LOCAL_ASR_URL || 'http://127.0.0.1:8178/inference',
  localAsrApi: env.LOCAL_ASR_API || '', // '' = from the URL | 'whispercpp' | 'openai'
  localAsrModel: env.LOCAL_ASR_MODEL || '', // sent as `model` to OpenAI-compatible servers (e.g. Systran/faster-whisper-small)
  localAsrLabel: env.LOCAL_ASR_LABEL || '', // name shown on the dashboard (npm run local sets it)
  localAsrConcurrency: Number(env.LOCAL_ASR_CONCURRENCY || 1),
  localAsrTimeoutMs: Number(env.LOCAL_ASR_TIMEOUT_MS || 30000),
  localStepMs: Number(env.LOCAL_STEP_MS || 1000), // re-transcribe the sentence in progress this often
  localEndSilenceMs: Number(env.LOCAL_END_SILENCE_MS || 700), // a pause this long ends an utterance
  localMaxUtteranceSec: Number(env.LOCAL_MAX_UTTERANCE_SEC || 12), // long monologues are cut at a quiet moment
  // Translation + audience assistant: Ollama (default) or an OpenAI-compatible server (URL ending in /v1).
  localLlmOff: /^(off|0|false|no)$/i.test(env.LOCAL_LLM || ''), // transcription only: no translations or summaries
  localLlmUrl: env.LOCAL_LLM_URL || 'http://127.0.0.1:11434',
  localLlmApi: env.LOCAL_LLM_API || '', // '' = from the URL | 'ollama' | 'openai'
  localLlmModel: env.LOCAL_LLM_MODEL || 'gemma3:4b',
  // Optional separate model for caption translation, e.g. translategemma (a Gemma 3 fine-tuned for translation).
  // Summaries and questions keep using LOCAL_LLM_MODEL.
  localMtModel: env.LOCAL_MT_MODEL || '',
  localLlmConcurrency: Number(env.LOCAL_LLM_CONCURRENCY || 1),
  localLlmTimeoutMs: Number(env.LOCAL_LLM_TIMEOUT_MS || 60000),
  localLlmContext: Number(env.LOCAL_LLM_CONTEXT || 8192), // Ollama num_ctx (tokens)
  localLlmKeepAlive: env.LOCAL_LLM_KEEP_ALIVE || '30m',
  event: {
    name: event.eventName || 'OpenCaptions',
    // false until someone names the event (config/event.json, npm run setup or the welcome wizard)
    named: !!event.eventName,
    accent: event.accent || '#D4FF3A',
    languages: event.languages || { es: 'Español', en: 'English', pt: 'Português' },
    defaultTargets: DEFAULT_TARGETS,
    publicTranscripts: event.publicTranscripts || '',
    schedule: event.schedule || null,
    stages: (event.stages || []).map(normalizeStage),
  },
  glossaryPath: path.resolve(ROOT, env.GLOSSARY || event.glossary || 'config/glossary.json'),
  // Stages can also be defined with env STAGES="main:Principal,sala2:Sala 2" (handy for sharding across hosts).
};

/** Switch the engine at runtime (offline backup). Rooms must be reconfigured to pick it up. */
export function setEngine(eng) {
  config.engine = eng;
  Object.assign(config, engineDefaults(eng));
}

export function normalizeStage(s) {
  return {
    id: String(s.id).toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
    name: s.name || s.id,
    source: s.source || 'auto', // 'auto' or a BCP-47 code the talk is spoken in ('en', 'es', ...)
    targets: (s.targets && s.targets.length ? s.targets : DEFAULT_TARGETS).map(String),
    pull: s.pull || '', // optional URL/file the server pulls audio from with ffmpeg (srt://, rtmp://, http(s)://, file)
    loop: !!s.loop,
    title: s.title || '',
    vocabulary: s.vocabulary || [],
    translation: s.translation || undefined,
    musicGuard: s.musicGuard === false ? false : undefined, // false: caption music too (a concert, a music class)
  };
}

if (env.STAGES) {
  config.event.stages = env.STAGES.split(',').filter(Boolean).map((chunk) => {
    const [id, name, source, targets] = chunk.split(':');
    return normalizeStage({ id, name, source, targets: targets ? targets.split('+') : undefined });
  });
}

export function loadGlossary() {
  return readJson(config.glossaryPath, { vocabulary: [], replacements: [] });
}

export function langName(code) {
  return config.event.languages[code] || code;
}
