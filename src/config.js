// Loads event configuration (config/event.json) + environment variables.
import dotenv from 'dotenv';
dotenv.config({ quiet: true });
import fs from 'node:fs';
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
    throw new Error(`Cannot read ${p}: ${e.message}`);
  }
}

const eventPath = process.env.EVENT_CONFIG || 'config/event.json';
const event = readJson(eventPath);

const env = process.env;
const DEFAULT_TARGETS = event.defaultTargets || ['es', 'en'];
const vertex = /^(1|true)$/i.test(env.GOOGLE_GENAI_USE_VERTEXAI || '');
const engine = flag('mock') ? 'mock' : (env.ENGINE || (env.GEMINI_API_KEY || vertex ? 'gemini' : 'mock'));

export const config = {
  port: Number(env.PORT || 8080),
  host: env.HOST || '0.0.0.0',
  publicUrl: (env.PUBLIC_URL || event.publicUrl || '').replace(/\/$/, ''),
  engine,
  geminiApiKey: env.GEMINI_API_KEY || '',
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
  dataDir: path.resolve(ROOT, env.DATA_DIR || 'data'),
  // Stop streaming audio to the model after this many seconds of silence (saves cost between talks).
  silenceGateSec: Number(env.SILENCE_GATE_SEC ?? event.silenceGateSec ?? 30),
  // Close model sessions entirely after this many seconds without speech / ingest.
  idleCloseSec: Number(env.IDLE_CLOSE_SEC ?? event.idleCloseSec ?? 300),
  // RMS threshold (0..1) to consider a 100ms chunk "speech".
  speechRms: Number(env.SPEECH_RMS ?? event.speechRms ?? 0.012),
  // Caption translation: 'text' (default: fast text MT per clause, 1 Live session/room), 'live' or 'hybrid'.
  translationMode: env.TRANSLATION_MODE || event.translation || 'text',
  // Text-translation request budget per minute across the whole server (0 = unlimited; set it to your
  // AI Studio limit on the free tier, e.g. 15). Provisional translations use at most 60% of it.
  mtRpm: Number(env.MT_RPM ?? event.mtRpm ?? 0),
  // How often the in-progress sentence is re-translated as a provisional caption (ms).
  mtPartialMs: Number(env.MT_PARTIAL_MS ?? event.mtPartialMs ?? 1500),
  // Give up on (and retry) a translation request after this long.
  mtTimeoutMs: Number(env.MT_TIMEOUT_MS ?? event.mtTimeoutMs ?? 5000),
  textModel: env.TEXT_MODEL || event.textModel || 'gemini-3.5-flash-lite',
  // Optional: shorten the model's end-of-speech wait (ms) to cut caption latency, e.g. 300.
  // Show the model's low-latency interim transcription as provisional text on the original channel.
  useInterim: (env.USE_INTERIM ?? String(event.useInterim ?? '0')) === '1',
  vadSilenceMs: Number(env.VAD_SILENCE_MS ?? event.vadSilenceMs ?? 0),
  transcriptionMode: env.TRANSCRIPTION_MODE || event.transcriptionMode || '', // '' | 'VERBATIM' | 'SMART'
  event: {
    name: event.eventName || 'OpenCaptions',
    accent: event.accent || '#7c5cff',
    languages: event.languages || { es: 'Español', en: 'English', pt: 'Português' },
    defaultTargets: DEFAULT_TARGETS,
    stages: (event.stages || []).map(normalizeStage),
  },
  glossaryPath: path.resolve(ROOT, env.GLOSSARY || event.glossary || 'config/glossary.json'),
  // Stages can also be defined with env STAGES="main:Principal,sala2:Sala 2" (handy for sharding across hosts).
};

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
