// Caption translation with a fast text model (Gemini Flash-Lite).
//
// Strategy: translate WHOLE sentences for quality, and while a sentence is still being spoken show a
// provisional translation of what we have so far (re-translated every ~1.5 s, only when there is quota
// headroom). The final translation replaces the provisional one. Captions therefore stay within
// ≈ transcription latency + one short request of the speaker, and never drift behind.
//
// Rate limits: a process-wide limiter (MT_RPM, 0 = unlimited) plus adaptive back-off on 429/quota errors.
// Partial (provisional) requests are the first thing sacrificed; final sentences are retried and never
// replaced by text in the wrong language.
import { getClient } from './genai.js';
import { config } from './config.js';
import { chat as localChat, cleanTranslation, llmBusy, llmInfo } from './local/llm.js';

let ai = null;
const client = () => ai ?? getClient(); // tests can inject their own (_setClient)
/** Test hook: inject a fake client. */
export const _setClient = (c) => { ai = c; };

const NAMES = { es: 'Spanish (neutral Latin American)', en: 'English', pt: 'Portuguese (Brazil)', fr: 'French', de: 'German', it: 'Italian' };
const langName = (c) => NAMES[c] || c;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- process-wide rate limiter ----------
const limiter = {
  times: [],
  cooldownUntil: 0,
  used() {
    const now = Date.now();
    while (this.times.length && now - this.times[0] > 60000) this.times.shift();
    return this.times.length;
  },
  /** true if a request may be sent now; `share` = fraction of the budget this kind of request may use. */
  allow(share = 1) {
    if (Date.now() < this.cooldownUntil) return false;
    if (!config.mtRpm) return true;
    return this.used() < config.mtRpm * share;
  },
  take() { this.times.push(Date.now()); },
  backoff(ms) { this.cooldownUntil = Math.max(this.cooldownUntil, Date.now() + ms); },
};

let thinkingSupported = true;
function withTimeout(promise, ms) {
  let t;
  return Promise.race([promise, new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`timeout after ${ms} ms`)), ms); })]).finally(() => clearTimeout(t));
}

const EMA = (prev, v) => (prev == null ? v : Math.round(prev * 0.7 + v * 0.3));
const isQuota = (e) => e?.status === 429 || /429|RESOURCE_EXHAUSTED|quota|rate/i.test(e?.message || '');

// Gemini 3.5 Flash-Lite paid tier (Sept 2026 pricing page): $0.30 / 1M input tokens, $2.50 / 1M output tokens.
const USD_IN = 0.30 / 1e6, USD_OUT = 2.5 / 1e6;

/**
 * @param {object} o
 * @param {string} o.text
 * @param {string | null} o.from
 * @param {string} o.to
 * @param {string[]} [o.context]     previous sentences, for context only
 * @param {string[]} [o.vocabulary]
 * @param {boolean} [o.partial]      the sentence is still being spoken
 * @param {{ usd?: number, firstChunkMs?: number | null } | null} [o.stats]  cost and timing counters to update
 * @param {(soFar: string) => void} [o.onChunk]  streaming: called with the translation so far as it arrives (Gemini only)
 * @returns {Promise<string>}
 */
export async function translateText({ text, from, to, context = [], vocabulary = [], partial = false, stats = null, onChunk = null }) {
  if (config.engine === 'mock') return `(${to}) ${text}`;
  if (config.engine === 'local') return translateLocal({ text, from, to, context, vocabulary, partial });
  const sys = [
    `You translate live conference captions from ${from ? langName(from) : 'the speaker\'s language'} to ${langName(to)}.`,
    partial
      ? 'The sentence is still being spoken and may be cut off: translate exactly what is there, do not complete it.'
      : 'Translate the sentence naturally and faithfully, as a professional subtitler would.',
    'Keep people\'s names, brand and product names, acronyms and specialist terms the way people in the speaker\'s field usually write them; do not translate names.',
    'Output only the translation — no quotes, notes or explanations.',
    vocabulary.length ? `Glossary / proper nouns: ${vocabulary.slice(0, 80).join(', ')}.` : '',
  ].filter(Boolean).join('\n');
  const ctx = context.length ? `Previous sentences (context only, do not translate):\n${context.join(' ')}\n\n` : '';
  const call = async (thinking) => {
    limiter.take();
    const cfg = { systemInstruction: sys, temperature: 0.1, maxOutputTokens: 512, abortSignal: AbortSignal.timeout(config.mtTimeoutMs) };
    if (thinking) cfg.thinkingConfig = { thinkingLevel: 'MINIMAL' }; // captions need speed, not reasoning
    const req = { model: config.textModel, contents: `${ctx}Translate:\n${text}`, config: cfg };
    let out = '', u = {};
    if (onChunk) {
      // Streaming: show the translation as the model writes it (the words appear a few hundred ms sooner).
      const t0 = Date.now();
      const stream = await withTimeout(client().models.generateContentStream(req), config.mtTimeoutMs + 500);
      for await (const chunk of stream) {
        if (chunk.usageMetadata) u = chunk.usageMetadata;
        if (!chunk.text) continue;
        if (!out && stats) stats.firstChunkMs = EMA(stats.firstChunkMs, Date.now() - t0);
        out += chunk.text;
        onChunk(out.trimStart().replace(/^["“]/, ''));
      }
    } else {
      const res = await withTimeout(client().models.generateContent(req), config.mtTimeoutMs + 500);
      out = res.text || '';
      u = res.usageMetadata || {};
    }
    if (stats) stats.usd = (stats.usd || 0) + (u.promptTokenCount || 0) * USD_IN + ((u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0)) * USD_OUT;
    return out.trim().replace(/^["“]|["”]$/g, '');
  };
  try {
    return await call(thinkingSupported);
  } catch (e) {
    // Model doesn't accept thinkingConfig → remember and retry once without it.
    if (thinkingSupported && /think/i.test(e.message || '') && !isQuota(e)) {
      thinkingSupported = false;
      console.log(`[translate] ${config.textModel} rejected thinkingConfig; continuing without it`);
      return call(false);
    }
    throw e;
  }
}

/**
 * Same job on a model running on this machine (ENGINE=local). Small models need a blunter prompt, and their
 * answer is cleaned of the labels and notes they like to add. No quota, no cost: the limit is the machine.
 */
// TranslateGemma (Google, 2026: Gemma 3 fine-tuned for translation) is trained on exactly this prompt, with plain
// language names and codes; extra instructions (glossary, context) would be translated along with the text.
const TG_NAMES = { es: 'Spanish', en: 'English', pt: 'Portuguese', fr: 'French', de: 'German', it: 'Italian', ca: 'Catalan', gl: 'Galician', ja: 'Japanese', zh: 'Chinese', ko: 'Korean', nl: 'Dutch' };
export function translateGemmaPrompt({ text, from, to }) {
  const name = (c) => TG_NAMES[String(c).split('-')[0]] || c;
  const src = name(from), dst = name(to);
  return `You are a professional ${src} (${from}) to ${dst} (${to}) translator. Your goal is to accurately convey the meaning and nuances of the original ${src} text while adhering to ${dst} grammar, vocabulary, and cultural sensitivities.\n`
    + `Produce only the ${dst} translation, without any additional explanations or commentary. Please translate the following ${src} text into ${dst}:\n\n\n${text}`;
}

async function translateLocal({ text, from, to, context, vocabulary, partial }) {
  const model = llmInfo().mtModel;
  const request = { model, maxTokens: Math.min(400, 32 + Math.ceil(text.length / 2)), temperature: 0.1, timeoutMs: config.mtTimeoutMs, priority: partial ? 0 : 2 };
  // Its prompt needs the source language; until Whisper has detected one, the generic prompt below is used.
  if (/translategemma/i.test(model) && from) return guardLength(text, cleanTranslation((await localChat({ ...request, user: translateGemmaPrompt({ text, from, to }) })).text));
  const system = [
    `You are a professional live-caption translator. Translate the user's text from ${from ? langName(from) : 'the speaker\'s language'} into ${langName(to)}.`,
    partial ? 'The sentence is still being spoken and may be cut off: translate only what is there, do not complete it.' : '',
    'Keep people\'s names, brand and product names, acronyms and specialist terms the way people in the speaker\'s field write them; do not translate names.',
    vocabulary.length ? `Names and terms to keep as written: ${vocabulary.slice(0, 40).join(', ')}.` : '',
    `Reply with the ${langName(to)} translation only: no quotes, no notes, no explanations, no original text.`,
  ].filter(Boolean).join('\n');
  const ctx = context.length ? `Previous sentences, for context only (do not translate them): ${context.join(' ')}\n\n` : '';
  const out = await localChat({ ...request, system, user: `${ctx}Translate into ${langName(to)}:\n${text}` });
  return guardLength(text, cleanTranslation(out.text));
}

/** A small model stuck in a loop: a translation is never several times longer than its source. */
function guardLength(source, result) {
  const limit = Math.round(source.length * 2.5) + 40;
  return result.length > limit ? `${result.slice(0, limit).replace(/\s+\S*$/, '')}…` : result;
}

const SENTENCE_END = /[.?!…]["')\]»]?(?=\s|$)/g;

/** Sentence-level translator for one (room, target language). */
export class SentenceTranslator {
  /**
   * @param {object} o
   * @param {string | null} o.from  the talk's language, or null when it's detected
   * @param {string} o.to  caption language
   * @param {string[]} [o.vocabulary]  glossary and agenda terms
   * @param {(text: string, id?: number) => void} o.onPartial  provisional translation of the sentence in progress
   * @param {(text: string, id?: number) => void} o.onFinal  final translation of a sentence
   * @param {(message: string) => void} [o.onError]
   * @param {() => boolean} [o.canFallback] true when a Live session already produces this language, so on
   *   quota errors we hand over to it instead of retrying (see Stage#onOutput).
   * @param {(on: boolean) => void} [o.onDegraded]  the Live fallback starts or stops covering this language
   */
  constructor({ from, to, vocabulary = [], onPartial, onFinal, onError = () => {}, canFallback = () => false, onDegraded }) {
    this.from = from;
    this.to = to;
    this.vocabulary = vocabulary;
    this.onPartial = onPartial;
    this.onFinal = onFinal;
    this.onError = onError;
    this.canFallback = canFallback;
    this.onDegraded = onDegraded;
    /** @type {object | null} a caption parked by Stage when the speaker switched to this language */
    this.detached = null;
    this.detachedTimer = undefined;
    this.degradedUntil = 0;
    this.buf = '';
    this.spoken = from;
    this.openId = 1; // id of the sentence currently being spoken
    this.finals = []; // queue of { id, text }
    this.busyFinal = false;
    this.partialInFlight = false;
    this.lastPartialAt = 0;
    this.context = [];
    this.stats = { requests: 0, errors: 0, quotaErrors: 0, avgMs: null, firstChunkMs: null, dropped: 0, usd: 0 };
    this.shown = { id: 0, len: 0 }; // the provisional translation on screen: sentence id and length
  }

  /** Rate-limited and a Live fallback exists → the Stage shows Live Translate's own captions meanwhile. */
  degraded() { return Date.now() < this.degradedUntil; }

  #degrade(ms) {
    if (!this.canFallback()) return false;
    const was = this.degraded();
    this.degradedUntil = Math.max(this.degradedUntil, Date.now() + ms);
    if (!was) this.onDegraded?.(true);
    clearTimeout(this.recoverTimer);
    this.recoverTimer = setTimeout(() => this.onDegraded?.(false), this.degradedUntil - Date.now() + 50);
    return true;
  }

  /**
   * @param {string} text  newly transcribed words
   * @param {{ finished?: boolean, spoken?: string | null }} [opts]  end of the speaker's turn; the language heard
   */
  feed(text, { finished = false, spoken = null } = {}) {
    if (spoken) this.spoken = spoken;
    if (this.degraded()) { this.buf = ''; clearTimeout(this.idle); return; } // Live fallback is covering this language
    this.buf += text;
    clearTimeout(this.idle);
    // Cut complete sentences off the buffer.
    let cut = -1;
    SENTENCE_END.lastIndex = 0;
    let m;
    while ((m = SENTENCE_END.exec(this.buf))) if (m.index >= 8) cut = m.index + m[0].length;
    if (cut > 0) this.#finalize(this.buf.slice(0, cut));
    if (this.buf.length > 220) {
      const i = Math.max(this.buf.lastIndexOf(', ', 200), this.buf.lastIndexOf(' ', 200));
      this.#finalize(this.buf.slice(0, i > 60 ? i + 1 : 200));
    }
    if (finished) return this.#finalize(this.buf);
    this.idle = setTimeout(() => this.#finalize(this.buf), 3000); // speaker paused (Gemini fragments can be ~2 s apart)
    this.#maybePartial();
  }

  flush() { clearTimeout(this.idle); this.#finalize(this.buf); }

  /** A final translation is still coming for text already fed (its track must not be flushed meanwhile). */
  pending() { return this.busyFinal || this.finals.length > 0 || this.buf.trim().length > 0; }

  #finalize(text) {
    this.buf = this.buf.slice(text.length);
    text = text.trim();
    if (!text) return;
    this.finals.push({ id: this.openId++, text, from: this.spoken });
    this.#pumpFinals();
  }

  async #pumpFinals() {
    if (this.busyFinal || !this.finals.length) return;
    this.busyFinal = true;
    // Fell behind? Merge the backlog into one request so latency stays bounded.
    const batch = this.finals.splice(0);
    const item = { id: batch[batch.length - 1].id, text: batch.map((b) => b.text).join(' '), from: batch[0].from };
    let out = null;
    let quotaHits = 0;
    for (let attempt = 0; attempt < 4 && out == null; attempt++) {
      while (!limiter.allow(1)) await sleep(250);
      const t0 = Date.now();
      try {
        this.stats.requests++;
        // Stream the sentence into its caption, but only once it has caught up with the provisional translation
        // already on screen: a caption must never shrink and grow again.
        const shown = this.shown.id === item.id ? this.shown.len : 0;
        const onChunk = config.mtStream ? (soFar) => { if (soFar.length >= shown) { this.shown = { id: item.id, len: soFar.length }; this.onPartial(soFar, item.id); } } : null;
        out = await translateText({ text: item.text, from: item.from, to: this.to, context: this.context, vocabulary: this.vocabulary, stats: this.stats, onChunk });
        this.stats.avgMs = this.stats.avgMs == null ? Date.now() - t0 : Math.round(this.stats.avgMs * 0.7 + (Date.now() - t0) * 0.3);
      } catch (e) {
        this.stats.errors++;
        const wait = isQuota(e) ? 2000 * 2 ** quotaHits++ : 500;
        if (isQuota(e)) { this.stats.quotaErrors++; limiter.backoff(wait); }
        if (isQuota(e) && this.#degrade(45000)) {
          this.onError?.(`rate limited → using Live Translate captions for ${this.to} for 45 s`);
          this.finals = [];
          break;
        }
        this.onError?.(`${isQuota(e) ? 'rate limited' : 'error'} (attempt ${attempt + 1}/4): ${(e.message || String(e)).slice(0, 160)}`);
        await sleep(wait);
        // New sentences finished meanwhile? fold them in so we don't fall further behind.
        if (this.finals.length) { const more = this.finals.splice(0); item.id = more[more.length - 1].id; item.text += ' ' + more.map((b) => b.text).join(' '); }
      }
    }
    if (out) {
      this.context.push(item.text);
      if (this.context.length > 2) this.context.shift();
      this.onFinal(out, item.id);
    } else if (this.degraded()) {
      this.stats.dropped++;
    } else {
      this.stats.dropped++;
      this.onError?.(`dropped a sentence after 4 attempts: "${item.text.slice(0, 60)}…"`);
    }
    this.busyFinal = false;
    this.#pumpFinals();
  }

  async #maybePartial() {
    const text = this.buf.trim();
    if (this.partialInFlight || this.busyFinal || this.finals.length || this.degraded()) return; // finals first
    if (text.length < 18 || Date.now() - this.lastPartialAt < config.mtPartialMs) return;
    if (!limiter.allow(0.6)) return; // keep 40% of the budget for final sentences
    if (config.engine === 'local' && llmBusy()) return; // a local model is already busy: final sentences first
    this.partialInFlight = true;
    this.lastPartialAt = Date.now();
    const id = this.openId;
    try {
      this.stats.requests++;
      const out = await translateText({ text, from: this.spoken, to: this.to, context: this.context, vocabulary: this.vocabulary, partial: true, stats: this.stats });
      if (out && id === this.openId && this.buf.trim().startsWith(text.slice(0, 10))) { this.shown = { id, len: out.length }; this.onPartial(out, id); }
    } catch (e) {
      this.stats.errors++;
      if (isQuota(e)) { this.stats.quotaErrors++; limiter.backoff(10000); this.#degrade(45000); }
    } finally {
      this.partialInFlight = false;
    }
  }
}
