// Local speech recognition: no cloud, the room's audio never leaves this machine (ENGINE=local, docs/local.md).
//
// Whisper is not a streaming model, so we make it stream:
//   1. An energy detector cuts the room's audio into utterances: a pause of LOCAL_END_SILENCE_MS ends one, and a
//      speaker who never pauses is cut at the quietest moment after LOCAL_MAX_UTTERANCE_SEC.
//   2. While someone speaks, the utterance so far is re-transcribed every LOCAL_STEP_MS. Words that two consecutive
//      passes agree on are committed ('input' events, "local agreement"); the rest is shown as provisional text
//      ('interim'), so viewers see words appear about as fast as the speech server can keep up.
//   3. When the utterance ends, one final pass on the whole utterance commits the remaining words.
//
// Same events and status shape as the Gemini engine: input {text, finished, lang}, interim {text, lang}, state,
// log, error. Transcription only: translation happens in the Stage's text translators (see src/local/llm.js).
import { EventEmitter } from 'node:events';
import { config } from '../config.js';
import { rms } from '../audio.js';
import { transcribe, asrReachable, asrInfo, withAsrSlot, isNetworkError } from '../local/asr.js';

const CHUNK_MS = 100;
const PRE_CHUNKS = 3; // 300 ms of audio before the first loud chunk, so the first syllable isn't clipped
const MIN_VOICED_MS = 300; // shorter blips (a cough, a door) are not sent to the speech server
const MIN_PARTIAL_MS = 1000; // first provisional pass after 1 s of speech
const MAX_BACKLOG = 40; // utterances kept while the speech server is unreachable (≈ a few minutes of speech)
const IDLE_END_MS = 1500; // audio stopped arriving mid-utterance (ingest hiccup): finish what we have
const COLLAPSE_MIN_WORDS = 6; // a pass with under a third of the words an earlier pass heard in the same audio…
const COLLAPSE_RATIO = 1 / 3; // …is a failed decode (seen live: 22 provisional words, then "la"), not a correction

/** Lowercase, no accents, no punctuation: for comparing words across passes. */
export const normWord = (w) => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]/gu, '');
const words = (s) => String(s || '').split(/\s+/).filter(Boolean);

/** Did a pass lose most of what an earlier pass of the same (shorter) audio heard? */
export const collapsed = (hyp, best) => !!best && best.length >= COLLAPSE_MIN_WORDS && hyp.length < best.length * COLLAPSE_RATIO;

/**
 * Where does `hyp` continue after the words already committed? Whisper re-transcribes the whole utterance on
 * every pass and may shift a word or two, so we anchor on the last committed words instead of trusting indexes.
 */
export function continuation(hyp, committed) {
  if (!committed.length) return 0;
  const h = hyp.map(normWord), c = committed.map(normWord);
  for (let m = Math.min(3, c.length); m >= 1; m--) {
    const tail = c.slice(-m);
    let best = -1, bestD = Infinity;
    for (let j = m; j <= h.length; j++) {
      let ok = true;
      for (let k = 0; k < m && ok; k++) ok = h[j - m + k] === tail[k];
      const d = Math.abs(j - c.length);
      if (ok && d < bestD) { best = j; bestD = d; }
    }
    if (best >= 0 && bestD <= Math.max(3, Math.ceil(c.length * 0.3))) return best;
  }
  return Math.min(c.length, h.length);
}

/** Longest prefix of `hyp` that repeats the end of `prev` (≥ 2 words, or 1 long word): overlap after a cut. */
export function overlap(prev, hyp) {
  const p = prev.map(normWord), h = hyp.map(normWord);
  for (let n = Math.min(p.length, h.length, 8); n >= 1; n--) {
    let ok = true;
    for (let k = 0; k < n && ok; k++) ok = p[p.length - n + k] === h[k];
    if (ok && (n >= 2 || h[0].length >= 5)) return n;
  }
  return 0;
}

export class LocalEngine extends EventEmitter {
  /**
   * @param {object} o
   * @param {string} o.label         room id, for logs
   * @param {string} o.target        the session's caption language
   * @param {string} [o.source]      the room's pinned language, or 'auto'
   * @param {string[]} [o.vocabulary] names and terms Whisper should expect (glossary + agenda)
   * @param {string[]} [o.languages]  languages that make sense in this room (a detected language outside this set is
   *                                  re-transcribed in the room's current language: Whisper may hear Galician in Spanish)
   * @param {Function} [o.transcriber] (pcm, opts) → { text, lang, noSpeech }: the speech server client (tests inject a fake)
   * @param {() => Promise<boolean>} [o.ping] is the speech server up? (tests inject a fake)
   */
  constructor({ label, target, source = 'auto', vocabulary = [], languages = [], transcriber = transcribe, ping = asrReachable }) {
    super();
    this.transcribe = transcriber; // injectable for tests
    this.ping = ping;
    this.label = label;
    this.target = target;
    this.source = source && source !== 'auto' ? source : null;
    this.vocabulary = vocabulary;
    this.languages = new Set(languages.filter((l) => l && l !== 'orig'));
    this.state = 'idle';
    this.stateSince = Date.now();
    this.stopped = true;
    this.pre = [];
    this.utt = null; // utterance being spoken
    this.finals = []; // utterances waiting for their final pass (in order)
    this.busy = false;
    this.inflight = null;
    this.context = ''; // recent committed text: Whisper's prompt, for continuity between utterances
    this.lastWords = [];
    this.lastLang = this.source;
    this.backoff = 1000;
    this.seq = 0;
    this.stats = {
      reconnects: 0, resumes: 0, errors: 0, lastError: '', connectedAt: 0, audioMs: 0, lastInputAt: 0, lastOutputAt: 0, tokens: 0,
      requests: 0, partials: 0, finals: 0, skipped: 0, dropped: 0, collapses: 0, avgMs: null,
    };
  }

  // ---------- lifecycle (same shape as GeminiEngine) ----------
  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.#connect();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    clearTimeout(this.idleTimer);
    this.inflight?.ctrl.abort();
    this.finals = [];
    this.utt = null;
    this.pre = [];
    this.#setState('idle');
  }

  /** Stall watchdog / manual ↻. A slow speech server isn't stuck, so only reconnect when we aren't working. */
  restart(reason = 'restart') {
    if (this.stopped) return;
    if (this.state === 'live' && (this.busy || this.finals.length)) return;
    this.emit('log', `restarting (${reason})`);
    this.stats.reconnects++;
    this.#connect();
  }

  /** The room went quiet (silence gate) or the ingest left: finish the utterance in progress. */
  endAudio() {
    if (this.utt) this.#endUtterance();
  }

  status() {
    return { target: this.target, echo: false, state: this.state, stateSince: this.stateSince, level: 'full', ...this.stats };
  }

  async #connect() {
    clearTimeout(this.retryTimer);
    this.#setState(this.stats.connectedAt ? 'reconnecting' : 'connecting');
    const ok = await this.ping();
    if (this.stopped) return;
    if (ok) {
      // The backoff is only reset by a transcription that works: a server that answers pings but fails every
      // request must not be retried in a tight loop.
      this.stats.connectedAt ||= Date.now();
      this.#setState('live');
      this.#pump();
      return;
    }
    const msg = `speech server not reachable at ${asrInfo().url} (start it with: npm run local)`;
    if (this.stats.lastError !== msg) this.emit('log', msg);
    this.stats.lastError = msg;
    this.#retryLater();
  }

  #retryLater() {
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.#connect(), this.backoff);
    this.backoff = Math.min(this.backoff * 2, 15000);
  }

  // ---------- audio → utterances ----------
  sendAudio(chunk) {
    if (this.stopped) return;
    this.stats.audioMs += CHUNK_MS;
    const lvl = rms(chunk);
    clearTimeout(this.idleTimer);
    if (!this.utt) {
      if (lvl < config.speechRms) {
        this.pre.push([chunk, lvl]);
        if (this.pre.length > PRE_CHUNKS) this.pre.shift();
        return;
      }
      const pre = this.pre.splice(0);
      this.utt = this.#newUtterance(pre.map((p) => p[0]).concat(chunk), pre.map((p) => p[1]).concat(lvl));
      this.utt.voicedMs = CHUNK_MS;
    } else {
      const u = this.utt;
      u.chunks.push(chunk);
      u.levels.push(lvl);
      // Hysteresis: soft syllables in the middle of a sentence still count as speech.
      if (lvl >= config.speechRms * 0.6) { u.voicedMs += CHUNK_MS; u.silentMs = 0; } else u.silentMs += CHUNK_MS;
      u.sinceStep += CHUNK_MS;
      if (u.silentMs >= config.localEndSilenceMs) return this.#endUtterance();
      if (u.chunks.length * CHUNK_MS >= config.localMaxUtteranceSec * 1000) return this.#cutUtterance();
      if (u.sinceStep >= config.localStepMs && u.chunks.length * CHUNK_MS >= MIN_PARTIAL_MS && u.voicedMs >= MIN_PARTIAL_MS / 2) {
        u.sinceStep = 0;
        this.#requestPartial(u);
      }
    }
    this.idleTimer = setTimeout(() => this.utt && this.#endUtterance(), IDLE_END_MS);
  }

  #newUtterance(chunks = [], levels = [], cont = false) {
    // best: the longest provisional hypothesis, the fallback if Whisper's later passes collapse.
    return { id: ++this.seq, chunks, levels, voicedMs: 0, silentMs: 0, sinceStep: 0, committed: [], prevHyp: null, best: null, lang: null, cont, carry: null, final: false };
  }

  #endUtterance() {
    const u = this.utt;
    this.utt = null;
    clearTimeout(this.idleTimer);
    // Keep 300 ms of trailing silence: long silences make Whisper hallucinate.
    const extra = Math.floor(u.silentMs / CHUNK_MS) - 3;
    if (extra > 0) { u.chunks.splice(-extra); u.levels.splice(-extra); }
    if (u.voicedMs < MIN_VOICED_MS && !u.committed.length) return;
    this.#queueFinal(u);
  }

  /** A monologue without pauses: cut at the quietest 100 ms of the last 3 s and keep listening. */
  #cutUtterance() {
    const u = this.utt;
    const n = u.chunks.length;
    let cut = n - 1, min = Infinity;
    for (let i = Math.max(Math.floor(n / 2), n - 30); i < n - 1; i++) if (u.levels[i] < min) { min = u.levels[i]; cut = i; }
    const next = this.#newUtterance(u.chunks.slice(cut + 1), u.levels.slice(cut + 1), true);
    next.voicedMs = next.levels.filter((l) => l >= config.speechRms * 0.6).length * CHUNK_MS;
    next.lang = u.lang;
    u.chunks = u.chunks.slice(0, cut + 1);
    u.levels = u.levels.slice(0, cut + 1);
    this.utt = next;
    this.#queueFinal(u);
  }

  #queueFinal(u) {
    u.final = true;
    this.finals.push(u);
    if (this.finals.length > MAX_BACKLOG) { this.finals.shift(); this.stats.dropped++; }
    // A provisional pass in flight only delays this final one: cancel it (whisper.cpp stops working on it too).
    if (this.inflight && !this.inflight.final) this.inflight.ctrl.abort();
    this.#pump();
  }

  #requestPartial(u) {
    if (this.busy || this.finals.length || this.state !== 'live') { this.stats.skipped++; return; }
    this.#run(u, false);
  }

  async #pump() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (!this.stopped && this.state === 'live' && this.finals.length) {
        if (this.busy) await new Promise((r) => { this.onIdle = () => r(undefined); });
        if (this.stopped || this.state !== 'live' || !this.finals.length) break;
        await this.#run(this.finals.shift(), true);
      }
    } finally {
      this.pumping = false;
    }
  }

  async #run(u, final) {
    this.busy = true;
    const ctrl = new AbortController();
    this.inflight = { u, final, ctrl };
    const t0 = Date.now();
    try {
      const r = await withAsrSlot(() => this.transcribe(Buffer.concat(u.chunks), {
        language: u.forceLang || this.source || null,
        prompt: u.noPrompt ? '' : this.#prompt(),
        final,
        signal: ctrl.signal,
      }), { final });
      if (r === undefined) { this.stats.skipped++; return; } // speech server busy with other rooms
      this.backoff = 1000;
      const ms = Date.now() - t0;
      this.stats.requests++;
      this.stats[final ? 'finals' : 'partials']++;
      this.stats.avgMs = this.stats.avgMs == null ? ms : Math.round(this.stats.avgMs * 0.7 + ms * 0.3);
      if (this.stopped) return;
      if (final) this.#onFinal(u, r);
      else if (!u.final && this.utt === u) this.#onPartial(u, r);
    } catch (e) {
      if (this.stopped || (ctrl.signal.aborted && !final)) return; // cancelled in favour of a final pass
      this.stats.errors++;
      this.stats.lastError = e.message;
      if (isNetworkError(e)) {
        if (final) this.finals.unshift(u);
        if (this.state === 'live') this.emit('log', `speech server connection lost (${e.cause?.code || e.message}); retrying`);
        this.#setState('reconnecting');
        this.#retryLater();
      } else if (final && !u.retried) {
        u.retried = true;
        this.finals.unshift(u); // one retry (timeout, a 500)
        this.emit('error', `speech server: ${e.message}`);
      } else {
        this.emit('error', `speech server: ${e.message}`);
        if (final) this.#commit(u, [], true, u.lang); // give up on this utterance but close the caption
      }
    } finally {
      this.busy = false;
      this.inflight = null;
      const idle = this.onIdle;
      this.onIdle = null;
      idle?.();
      if (!this.stopped && this.finals.length) this.#pump();
    }
  }

  // ---------- transcriptions → committed and provisional words ----------
  #prompt() {
    // Whisper conditions on this text: names to spell correctly, and the previous sentence for continuity.
    const vocab = this.vocabulary.slice(0, 30).join(', ');
    return [vocab && `${vocab}.`, this.context].filter(Boolean).join(' ').slice(-400);
  }

  #langOk(lang) {
    return !lang || !this.languages.size || this.languages.has(lang);
  }

  /** Words of a pass, minus anything that repeats the previous utterance (only after a forced cut). */
  #hypothesis(u, text) {
    const hyp = words(text);
    if (!u.cont) return hyp;
    u.carry ??= this.lastWords.slice();
    return hyp.slice(overlap(u.carry, hyp));
  }

  #onPartial(u, r) {
    if (!r.text || r.noSpeech > 0.8 || !this.#langOk(r.lang)) return;
    if (r.lang) u.lang = r.lang;
    const hyp = this.#hypothesis(u, r.text);
    // A collapsed pass must not replace the words viewers are reading: skip it, the next pass or the final decides.
    if (collapsed(hyp, u.best)) { this.#noteCollapse(u, hyp, 'provisional'); return; }
    if (!u.best || hyp.length >= u.best.length) u.best = hyp;
    const tail = hyp.slice(continuation(hyp, u.committed));
    let agreed = 0;
    if (u.prevHyp) {
      const prev = u.prevHyp.slice(continuation(u.prevHyp, u.committed));
      while (agreed < tail.length && agreed < prev.length && normWord(tail[agreed]) === normWord(prev[agreed])) agreed++;
    }
    u.prevHyp = hyp;
    if (agreed) this.#commit(u, tail.slice(0, agreed), false, u.lang);
    const rest = tail.slice(agreed).join(' ');
    if (rest) this.emit('interim', { text: rest, lang: u.lang || this.lastLang });
  }

  #onFinal(u, r) {
    // Whisper heard a language this room doesn't use (e.g. Galician for Spanish): redo it in the room's language.
    if (r.text && !this.#langOk(r.lang) && !u.forceLang && this.#langOk(this.lastLang) && this.lastLang) {
      u.forceLang = this.lastLang;
      this.finals.unshift(u);
      return;
    }
    let silent = !r.text || (r.noSpeech > 0.8 && !u.committed.length);
    const lang = (this.#langOk(r.lang) && r.lang) || u.forceLang || u.lang || this.lastLang;
    let hyp = silent ? [] : this.#hypothesis(u, r.text);
    if (collapsed(hyp, u.best)) {
      // Once more without the prompt (previous sentences can make Whisper stop early); then keep what it heard before.
      if (!u.noPrompt) { u.noPrompt = true; this.#noteCollapse(u, hyp, 'final'); this.finals.unshift(u); return; }
      this.emit('log', `final pass still lost the words (${hyp.length} of ${u.best.length}): keeping the provisional ones`);
      hyp = u.best;
      silent = false;
    }
    this.#commit(u, hyp.slice(continuation(hyp, u.committed)), true, lang);
    if (lang && !silent) this.lastLang = lang;
  }

  #noteCollapse(u, hyp, pass) {
    this.stats.collapses++;
    if (u.collapseLogged) return;
    u.collapseLogged = true;
    this.emit('log', `${pass} pass returned ${hyp.length} word(s) ("${hyp.join(' ').slice(0, 40)}") for audio an earlier pass heard as ${u.best.length}; ignoring it`);
  }

  #commit(u, ws, finished, lang) {
    if (ws.length) {
      u.committed.push(...ws);
      this.lastWords = [...this.lastWords, ...ws].slice(-12);
      this.context = `${this.context} ${ws.join(' ')}`.trim().slice(-300);
    } else if (!finished || !u.committed.length) {
      return; // nothing new, and nothing to close
    }
    this.stats.lastInputAt = Date.now();
    this.emit('input', { text: ws.length ? ` ${ws.join(' ')}` : '', finished, lang: lang || this.lastLang || null });
  }

  #setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.stateSince = Date.now();
    this.emit('state', s);
  }
}
