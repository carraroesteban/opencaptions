// Client for a Whisper speech-recognition server running on this machine or the local network — the "ears" of
// the local engine (ENGINE=local, see docs/local.md). Two HTTP dialects are supported:
//   • whisper.cpp's whisper-server:        POST /inference            (default: http://127.0.0.1:8178/inference)
//     The bundled scripts/local-asr-server.js speaks the same dialect.
//   • OpenAI-compatible servers:           POST /v1/audio/transcriptions   (speaches / faster-whisper-server,
//     LocalAI, vLLM, whisper.cpp started with --inference-path /v1/audio/transcriptions…)
// The dialect is picked from the URL path (override with LOCAL_ASR_API=whispercpp|openai).
import { config } from '../config.js';
import { SAMPLE_RATE } from '../audio.js';

// Whisper reports languages by name ("spanish"); captions route by ISO code ("es").
const WHISPER_LANGS = {
  english: 'en', chinese: 'zh', german: 'de', spanish: 'es', russian: 'ru', korean: 'ko', french: 'fr', japanese: 'ja',
  portuguese: 'pt', turkish: 'tr', polish: 'pl', catalan: 'ca', dutch: 'nl', arabic: 'ar', swedish: 'sv', italian: 'it',
  indonesian: 'id', hindi: 'hi', finnish: 'fi', vietnamese: 'vi', hebrew: 'he', ukrainian: 'uk', greek: 'el', malay: 'ms',
  czech: 'cs', romanian: 'ro', danish: 'da', hungarian: 'hu', tamil: 'ta', norwegian: 'no', thai: 'th', urdu: 'ur',
  croatian: 'hr', bulgarian: 'bg', lithuanian: 'lt', latin: 'la', maori: 'mi', malayalam: 'ml', welsh: 'cy', slovak: 'sk',
  telugu: 'te', persian: 'fa', latvian: 'lv', bengali: 'bn', serbian: 'sr', azerbaijani: 'az', slovenian: 'sl', kannada: 'kn',
  estonian: 'et', macedonian: 'mk', breton: 'br', basque: 'eu', icelandic: 'is', armenian: 'hy', nepali: 'ne', mongolian: 'mn',
  bosnian: 'bs', kazakh: 'kk', albanian: 'sq', swahili: 'sw', galician: 'gl', marathi: 'mr', punjabi: 'pa', sinhala: 'si',
  khmer: 'km', shona: 'sn', yoruba: 'yo', somali: 'so', afrikaans: 'af', occitan: 'oc', georgian: 'ka', belarusian: 'be',
  tajik: 'tg', sindhi: 'sd', gujarati: 'gu', amharic: 'am', yiddish: 'yi', lao: 'lo', uzbek: 'uz', faroese: 'fo',
  'haitian creole': 'ht', pashto: 'ps', turkmen: 'tk', nynorsk: 'nn', maltese: 'mt', sanskrit: 'sa', luxembourgish: 'lb',
  myanmar: 'my', tibetan: 'bo', tagalog: 'tl', malagasy: 'mg', assamese: 'as', tatar: 'tt', hawaiian: 'haw', lingala: 'ln',
  hausa: 'ha', bashkir: 'ba', javanese: 'jw', sundanese: 'su', cantonese: 'yue',
};

/** "spanish" | "es" | "<|es|>" | "es-AR" → "es" (or null). */
export function langCode(v) {
  if (!v) return null;
  const s = String(v).toLowerCase().replace(/[<|>]/g, '').trim();
  if (WHISPER_LANGS[s]) return WHISPER_LANGS[s];
  const code = s.split(/[-_]/)[0];
  return /^[a-z]{2,3}$/.test(code) ? code : null;
}

export function asrInfo() {
  const url = config.localAsrUrl;
  let api = config.localAsrApi;
  if (!api) api = /\/v1\/audio\/transcriptions\/?$/.test(new URL(url).pathname) ? 'openai' : 'whispercpp';
  const model = config.localAsrModel || (api === 'openai' ? 'whisper-1' : 'whisper');
  return { url, api, model, label: config.localAsrLabel || config.localAsrModel || (api === 'openai' ? 'Whisper' : 'whisper.cpp') };
}

/** PCM16LE mono 16 kHz → WAV file bytes. */
export function wavFile(pcm) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SAMPLE_RATE, 24); h.writeUInt32LE(SAMPLE_RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

// Whisper "hears" these on silence, music or applause (they come from its training data: YouTube subtitles).
// A sentence is dropped only when it is one of these phrases from start to end, so a speaker who says "the consumer
// will subscribe to the topic" or "nos vemos en el próximo slide" is still transcribed.
const HALLUCINATIONS = [
  /^(thanks|thank you)( (so|very) much)? for watching( this video)?$/i,
  /^(please (like (and|&) )?subscribe|like (and|&) subscribe|subscribe to (my|our|the) channel)$/i,
  /^(muchas )?gracias por (ver|mirar)( el v[ií]deo)?$/i,
  /^(no olvides )?(suscr[ií]bete|suscr[ií]banse)( al canal)?( y dale (a )?like)?$/i,
  /^(y )?dale (a )?like( al v[ií]deo)?$/i,
  /^activa la campanita$/i,
  /^obrigad[oa] por assistir$/i,
  /^inscreva-se( no canal)?$/i,
  /^(nos vemos|see you|at[eé]) (en el|in the|no) pr[oó]ximo( v[ií]deo| video)?$/i,
  /^(subt[ií]tulos|legendas|subtitles|captions)( realizados| hechos| creados| by| pela| por| de)[^.!?]{0,60}(amara|comunidad|comunidade|community)/i,
  /amara\.org/i,
];
const isHallucination = (sentence) => {
  const core = sentence.trim().replace(/^[¡¿"'«\s]+|[.!?…"'»\s]+$/g, '');
  return core && core.split(/\s+/).length <= 14 && HALLUCINATIONS.some((re) => re.test(core));
};

/** Remove non-speech annotations, known hallucinated sentences and repetition loops. */
export function cleanTranscript(text) {
  let s = String(text || '')
    .replace(/\[[^\]]*\]|\((?:m[uú]sica|music|risas|laughs?|applause|aplausos|silencio|silence|inaudible)[^)]*\)|[♪♫]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return '';
  const sentences = s.split(/(?<=[.!?…])\s+/); // "Node.js", "Amara.org", "3.5" stay whole
  s = sentences.filter((x) => !isHallucination(x)).join(' ').replace(/\s+/g, ' ').trim();
  return collapseRepeats(s);
}

/** "the the the the the …" / "no, no, no, no, no, …" → keep at most 3 repetitions of any 1–3 word pattern. */
export function collapseRepeats(s) {
  const w = s.split(' ');
  const norm = (x) => x.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  for (let n = 1; n <= 3; n++) {
    for (let i = 0; i + n <= w.length; i++) {
      let reps = 1;
      while (i + (reps + 1) * n <= w.length && w.slice(i + reps * n, i + (reps + 1) * n).map(norm).join(' ') === w.slice(i, i + n).map(norm).join(' ')) reps++;
      if (reps > 3) w.splice(i + 3 * n, (reps - 3) * n);
    }
  }
  return w.join(' ');
}

function parseResult(j) {
  const segments = Array.isArray(j.segments) ? j.segments : [];
  const probs = segments.map((s) => Number(s.no_speech_prob)).filter(Number.isFinite);
  return {
    raw: String(j.text || ''),
    text: cleanTranscript(j.text),
    lang: langCode(j.language || j.detected_language || j.lang),
    // Every segment says "probably not speech" → treat as silence (whisper.cpp and OpenAI-style servers report it).
    noSpeech: probs.length ? Math.min(...probs) : 0,
    duration: Number(j.duration) || 0,
  };
}

/**
 * Transcribe one utterance.
 * @param {Buffer} pcm  PCM16LE mono 16 kHz
 * @param {object} o
 * @param {string|null} [o.language]  ISO code, or null to auto-detect
 * @param {string} [o.prompt]          words Whisper should expect (names, previous sentence)
 * @param {boolean} [o.final]          final pass: allow Whisper's temperature fallback (slower, more robust)
 * @param {AbortSignal} [o.signal]     aborting also stops whisper.cpp's work on the request
 */
export async function transcribe(pcm, { language = null, prompt = '', final = true, signal } = {}) {
  const { url, api, model } = asrInfo();
  const form = new FormData();
  form.append('file', new Blob([wavFile(pcm)], { type: 'audio/wav' }), 'audio.wav');
  form.append('response_format', 'verbose_json');
  form.append('temperature', '0');
  if (api === 'openai') {
    form.append('model', model);
    if (language) form.append('language', language);
  } else {
    form.append('language', language || 'auto');
    form.append('no_language_probabilities', 'true'); // skip an extra language-detection pass
    form.append('token_timestamps', 'false');
    form.append('suppress_nst', 'true'); // fewer "[Music]"-style hallucinations
    if (!final) form.append('temperature_inc', '0'); // provisional passes: no slow re-decoding fallback
  }
  if (prompt) form.append('prompt', prompt.slice(-400));
  const timeout = AbortSignal.timeout(config.localAsrTimeoutMs);
  const res = await fetch(url, { method: 'POST', body: form, signal: signal ? anySignal([signal, timeout]) : timeout });
  const body = await res.text();
  if (!res.ok) throw Object.assign(new Error(`speech server HTTP ${res.status}: ${body.slice(0, 200)}`), { status: res.status });
  let j;
  try { j = JSON.parse(body); } catch { j = { text: body }; } // response_format text / plain servers
  return parseResult(j);
}

/** AbortSignal.any() arrived in Node 20.3; this project supports every Node 20. */
function anySignal(signals) {
  if (AbortSignal.any) return AbortSignal.any(signals);
  const c = new AbortController();
  for (const sig of signals) {
    if (sig.aborted) { c.abort(sig.reason); break; }
    sig.addEventListener('abort', () => c.abort(sig.reason), { once: true });
  }
  return c.signal;
}

/** A connection problem (server down, restarting, unreachable), as opposed to an error the server reported. */
export function isNetworkError(e) {
  const code = String(e?.cause?.code || e?.code || '');
  return /fetch failed/i.test(e?.message || '') || /^(ECONN|ENOTFOUND|EHOSTUNREACH|ENETUNREACH|EPIPE|EAI_AGAIN|UND_ERR_SOCKET|UND_ERR_CONNECT)/.test(code);
}

/** true if the speech server answers at all (any HTTP status). */
export async function asrReachable(timeoutMs = 3000) {
  const { url } = asrInfo();
  try {
    await fetch(new URL(url).origin + '/', { signal: AbortSignal.timeout(timeoutMs) });
    return true;
  } catch {
    return false;
  }
}

// ---------- scheduling across rooms ----------
// One speech server usually works on one request at a time (whisper.cpp holds a lock), so we queue here:
// final passes (they commit words) in arrival order; provisional passes only when the server is idle.
const slots = { active: 0, waiters: [] };
export const asrLoad = () => ({ active: slots.active, queued: slots.waiters.length });

export async function withAsrSlot(fn, { final = true } = {}) {
  const max = Math.max(1, config.localAsrConcurrency);
  if (!final && (slots.active >= max || slots.waiters.length)) return undefined; // busy: skip this provisional pass
  if (slots.active >= max) await new Promise((r) => slots.waiters.push(r));
  slots.active++;
  try {
    return await fn();
  } finally {
    slots.active--;
    slots.waiters.shift()?.();
  }
}
