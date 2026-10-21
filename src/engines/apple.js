// Local speech recognition with Apple's SpeechAnalyzer, built into macOS 26+ (local mode on a Mac, docs/local.md).
// Unlike Whisper it streams by itself: the room's audio goes to the helper (src/local/apple.swift) as it arrives,
// and it answers with the words in progress (rewritten as it hears more) and, at its own pace, the settled text.
// Apple may keep a fast speaker's words in progress for 20 s (seen), and captions are translated once committed,
// so a finished sentence that two updates agree on is committed early ('input'); the rest shows as 'interim'.
// Same events and status shape as the local Whisper engine (src/engines/local.js).
//
// Apple doesn't detect the language: each helper listens for one. A room with its language set gets one helper. On
// "auto", two listen to the same sound: the language believed spoken (the lead, the one heard last in this room, else
// the Mac's) and the room's next likely one. The lead captions as usual; each sentence it's about to caption is read
// first. One that reads as the other language (a Spanish talk through the English model writes "la cultura, de
// gente…") isn't captioned: the other helper takes over at that second, with what it heard from there (every word
// has its time), and leads from then on. A talk that switches between Spanish and English gets each sentence from the
// right model, with no garbled sentence at the switch and nothing said twice or lost.
import { EventEmitter } from 'node:events';
import { appleListen, jsonLines, macLanguage } from '../local/apple.js';
import { continuation, normWord } from './local.js';
import { guessLang, leans, langScores } from '../langid.js';

const CHUNK_MS = 100;
// A moment estimated from words in progress comes out late (their stretch runs to the end of the sound heard so far,
// pauses included): at a handover it counts this much earlier. Settled words have exact times.
const EARLY_S = 1.2;
const IDLE_END_MS = 1500; // audio stopped arriving (ingest hiccup): settle what was heard
// Words, without the runs of lone punctuation it writes for music and noise (", , ,, ,").
const words = (s) => String(s || '').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
/** Which of the two languages a sentence is in, or null when it doesn't clearly say (other scripts: by their script). */
const lean = (text, a, b) => { const l = leans(text, a, b) || guessLang(text, [a, b]); return l === a || l === b ? l : null; };

/**
 * Where the other helper takes over in its words [{ w, s, e }]: at the start of the sentence going on at `t` (the
 * moment already captioned, an estimate) if most of it comes after `t`, else at the next sentence. A sentence longer
 * than a few seconds (words without a full stop yet) is cut at `t` itself.
 */
function takeOver(all, t) {
  const i = all.findIndex((x) => x.e > t);
  if (i < 0) return all.length;
  let j = i;
  while (j > 0 && !endsSentence(all[j - 1].w)) j--;
  let k = i;
  while (k < all.length - 1 && !endsSentence(all[k].w)) k++;
  if (all[k].e - all[j].s > 6) return i;
  return all[k].e - t >= t - all[j].s ? j : k + 1;
}

/**
 * A helper's line as words with their times, on the room's clock: [{ w, s, e }]. Settled sentences time every word;
 * words in progress come as one stretch, spread over it by length. Without times (older Macs' recognizer), none.
 */
function timed(o, t0) {
  if (!Array.isArray(o.w)) return null;
  const out = [];
  for (const [piece, s, e] of o.w) {
    const ws = words(piece);
    const total = ws.reduce((a, x) => a + x.length + 1, 0) || 1;
    let at = 0;
    for (const w of ws) {
      const from = s + ((e - s) * at) / total;
      at += w.length + 1;
      out.push({ w, s: t0 + from, e: t0 + s + ((e - s) * at) / total });
    }
  }
  return out;
}
const endsSentence = (w) => /[.?!…]["'»”)]*$/.test(w);

export class AppleEngine extends EventEmitter {
  /**
   * @param {object} o
   * @param {string} o.label          room id, for logs
   * @param {string} o.target         the session's caption language
   * @param {string} [o.source]       the room's pinned language, or 'auto'
   * @param {string[]} [o.vocabulary] names and terms to expect (glossary + agenda)
   * @param {string[]} [o.languages]  "auto": the languages it may hear (the room's and the event's), likeliest first
   * @param {string} [o.heard]        "auto": the language heard last in this room, to start with
   * @param {typeof appleListen} [o.listen]  starts a helper (tests inject a fake process)
   */
  constructor({ label, target, source = 'auto', vocabulary = [], languages = [], heard = '', listen = appleListen }) {
    super();
    this.label = label;
    this.target = target;
    this.auto = !source || source === 'auto';
    this.lang = this.auto ? heard || macLanguage() : source;
    this.languages = [...new Set([this.lang, ...languages])];
    // "auto": the second helper's language, the likeliest other one. None: one helper, as for a set language.
    this.lang2 = this.auto ? this.languages.find((l) => l !== this.lang) || '' : '';
    this.vocabulary = vocabulary;
    this.listen = listen;
    this.state = 'idle';
    this.stateSince = Date.now();
    this.stopped = true;
    this.proc = null; // the lead helper
    this.proc2 = null; // "auto": the other language's
    this.sent = 0; // seconds of sound sent so far: helpers that start later count from their own start (p.t0)
    this.doneUntil = -1; // the moment (seconds of sound) captioned up to: where the other helper would take over
    this.backoff = 1000;
    this.committed = []; // words of Apple's unsettled text already committed early
    this.prevTail = [];
    this.stats = {
      reconnects: 0, resumes: 0, errors: 0, lastError: '', connectedAt: 0, audioMs: 0, lastInputAt: 0, lastOutputAt: 0, tokens: 0,
      requests: 0, partials: 0, finals: 0, skipped: 0, dropped: 0, collapses: 0, avgMs: null,
    };
  }

  /** Two helpers listening, the other one ready to take over. */
  get dual() { return !!this.proc2?.ready; }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.#connect();
    if (this.lang2) this.#connect2();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    clearTimeout(this.retry2);
    clearTimeout(this.idleTimer);
    clearTimeout(this.soloTimer);
    this.#kill();
    this.#kill2();
    this.#setState('idle');
  }

  /** Stall watchdog / manual ↻: fresh helpers. */
  restart(reason = 'restart') {
    if (this.stopped) return;
    this.emit('log', `restarting (${reason})`);
    this.stats.reconnects++;
    this.#kill();
    this.#connect();
    if (this.lang2) { this.#kill2(); this.#connect2(); }
  }

  /** The room went quiet (silence gate) or the ingest left: settle the sentence in progress. */
  endAudio() {
    clearTimeout(this.idleTimer);
    if (this.state === 'live') this.proc?.kill('SIGUSR1');
    if (this.proc2?.ready) this.proc2.kill('SIGUSR1');
  }

  status() {
    return { target: this.target, echo: false, state: this.state, stateSince: this.stateSince, level: 'full', ...this.stats };
  }

  sendAudio(chunk) {
    if (this.stopped) return;
    // Still starting: the room's first words are kept (up to 5 s) and heard by both helpers once they listen.
    if (this.state !== 'live') { (this.early ??= []).push(chunk); if (this.early.length > 50) this.early.shift(); return; }
    this.stats.audioMs += CHUNK_MS;
    this.proc.stdin.write(chunk);
    if (this.proc2?.ready) this.proc2.stdin.write(chunk);
    this.sent += CHUNK_MS / 1000;
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.endAudio(), IDLE_END_MS);
  }

  #kill() {
    const p = this.proc;
    this.proc = null;
    if (p) { p.removeAllListeners('close'); p.stdin.end(); p.kill(); }
  }

  #kill2() {
    const p = this.proc2;
    this.proc2 = null;
    if (p) { p.removeAllListeners('close'); p.stdin.end(); p.kill(); }
  }

  async #connect() {
    clearTimeout(this.retryTimer);
    this.#setState(this.stats.connectedAt ? 'reconnecting' : 'connecting');
    const gen = (this.gen = (this.gen || 0) + 1); // a restart while this one starts: only the newest helper stays
    let p;
    try {
      p = await this.listen({ lang: this.lang, vocabulary: this.vocabulary });
    } catch (e) {
      if (gen === this.gen) this.#failed(e.message);
      return;
    }
    if (this.stopped || gen !== this.gen) { p.kill(); return; }
    this.proc = p;
    this.#attach(p, this.lang);
    p.on('close', (code) => {
      if (this.proc === p) {
        this.proc = null;
        this.#failed(p.lastError || `Apple speech helper stopped (code ${code})`);
      } else if (this.proc2 === p) { // it was the lead, swapped to second by a language switch
        this.proc2 = null;
        if (!this.stopped) this.retry2 = setTimeout(() => this.#connect2(), 5000);
      }
    });
  }

  /** "auto": the other language's helper. If it can't start, the lead works alone (and the room's log says why). */
  async #connect2() {
    clearTimeout(this.retry2);
    const gen = (this.gen2 = (this.gen2 || 0) + 1);
    let p;
    try {
      p = await this.listen({ lang: this.lang2, vocabulary: this.vocabulary });
    } catch (e) {
      if (gen === this.gen2 && !this.stopped) {
        this.emit('log', `the ${this.lang2} helper didn't start (${e.message}): listening in ${this.lang} only`);
        this.retry2 = setTimeout(() => this.#connect2(), 15000);
      }
      return;
    }
    if (this.stopped || gen !== this.gen2) { p.kill(); return; }
    this.proc2 = p;
    this.#attach(p, this.lang2);
    p.on('close', (code) => {
      if (this.proc2 === p) {
        this.proc2 = null;
        if (!this.stopped) this.retry2 = setTimeout(() => this.#connect2(), 5000);
      } else if (this.proc === p) { // it leads now (a language switch): as the lead's helper stopping
        this.proc = null;
        this.#failed(p.lastError || `Apple speech helper stopped (code ${code})`);
      }
    });
  }

  /** One helper's lines. Which one leads can change (a language switch), so each line asks. */
  #attach(p, lang) {
    p.lang = lang;
    p.settled = []; // not leading: the words it settled, with their times, in case it takes over
    p.progress = []; // not leading: its words in progress, with their times
    p.stdin.on('error', () => {}); // it exited: 'close' restarts it
    p.stderr?.on('data', () => {}); // system frameworks' chatter
    jsonLines(p.stdout, (o) => {
      const lead = p === this.proc;
      if (o.ready) {
        p.ready = true;
        p.t0 = this.sent; // its clock starts with the first sound it gets
        this.emit('log', lead ? `listening for ${o.ready} (${o.engine})` : `also listening for ${o.ready}: it takes over when the speech is in that language`);
        // "auto": live once both listen, so the first sentence already has its second opinion (or after 5 s without it).
        if (!this.proc?.ready || this.state === 'live') return;
        clearTimeout(this.soloTimer);
        if (this.lang2 && !this.proc2?.ready) { this.soloTimer = setTimeout(() => this.#live(), 5000); return; }
        this.#live();
      } else if (typeof o.partial === 'string' || o.final) {
        const ts = timed(o, p.t0 ?? 0);
        if (!lead) { // ready to take over: keep what it heard after the moment already captioned
          if (o.final) { p.settled.push(...(ts || [])); p.progress = []; } else p.progress = ts || [];
          p.settled = p.settled.filter((x) => x.e > this.doneUntil - 30); // the last half minute is plenty
          return;
        }
        if (o.final) {
          this.backoff = 1000;
          this.stats.finals++;
          this.stats.requests++;
          this.#onFinal(ts ? ts.map((x) => x.w) : words(o.final), ts);
        } else {
          this.stats.partials++;
          this.#onPartial(ts ? ts.map((x) => x.w) : words(o.partial), ts);
        }
      } else if (o.log) this.emit('log', o.log);
      else if (o.error) p.lastError = o.error;
    });
  }

  #onFinal(hyp, ts) {
    const from = continuation(hyp, this.committed);
    const rest = hyp.slice(from);
    if (rest.length && this.#otherLanguage(rest, ts?.at(-1)?.e)) return; // the other helper took over
    this.#commit(rest, true);
    if (ts?.length) { this.doneUntil = ts.at(-1).e; this.doneExact = true; }
    this.committed = [];
    this.prevTail = [];
  }

  #onPartial(hyp, ts) {
    const from = continuation(hyp, this.committed);
    const tail = hyp.slice(from);
    // A long stretch in progress in the other language (videos often go 20 s without a full stop): hand over now, when
    // both helpers' words say so, rather than at the end of the sentence.
    if (tail.length >= 8 && this.#otherLanguage(tail, ts?.at(-1)?.e, true)) return;
    // The last finished sentence with words after it, if the previous update had it too, word for word.
    let k = -1;
    for (let i = tail.length - 3; i >= 0; i--) if (endsSentence(tail[i])) { k = i; break; }
    const agreed = k >= 0 && this.prevTail.length > k && tail.slice(0, k + 1).every((w, i) => normWord(w) === normWord(this.prevTail[i]));
    this.prevTail = tail;
    if (agreed) {
      if (this.#otherLanguage(tail.slice(0, k + 1), ts?.[from + k]?.e)) return;
      this.#commit(tail.slice(0, k + 1), false);
      this.committed.push(...tail.slice(0, k + 1));
      if (ts?.[from + k]) { this.doneUntil = ts[from + k].e; this.doneExact = false; }
      this.prevTail = tail.slice(k + 1);
    }
    const rest = tail.slice(agreed ? k + 1 : 0).join(' ');
    if (rest) this.emit('interim', { text: rest, lang: this.said() });
  }

  /**
   * Two helpers: does this sentence, about to be captioned, read as the other helper's language? Then it isn't
   * captioned: the other helper takes over from the moment already captioned. Its settled words after that moment
   * are captioned now; its words in progress before it count as said (they were, in the other language).
   * @param {boolean} [both]  words still in progress: only when the other helper's words clearly say so too
   */
  #otherLanguage(ws, end, both = false) {
    const lead = this.proc, other = this.proc2;
    if (!this.dual || !lead) return false;
    const text = ws.join(' ');
    if (both) {
      const heard = other.progress.concat(other.settled.filter((x) => x.e > this.doneUntil)).map((x) => x.w).join(' ');
      if (lean(text, lead.lang, other.lang) !== other.lang || lean(heard, lead.lang, other.lang) !== other.lang) return false;
    }
    let elsewhere = both || lean(text, lead.lang, other.lang) === other.lang;
    // Not plainly the other language: compare with what the other helper heard over the same seconds. Its version
    // clearly in its own language, and pointing there more than this one points to the lead's ("Hola a todos y
    // bienvenidos" against the English model's "All those, Ibien Benidos"), decides.
    if (!elsewhere && end != null) {
      const heard = [...other.settled, ...other.progress].filter((x) => x.e > this.doneUntil && x.s < end).map((x) => x.w).join(' ');
      const [mineL, mineO] = langScores(text, lead.lang, other.lang);
      const [hisL, hisO] = langScores(heard, lead.lang, other.lang);
      elsewhere = lean(heard, lead.lang, other.lang) === other.lang && hisO - hisL - (mineL - mineO) >= 2;
    }
    if (!elsewhere) return false;
    this.emit('log', `the speech is in ${other.lang} now, not ${lead.lang}`);
    this.emit('heard', other.lang);
    [this.proc, this.proc2] = [other, lead];
    [this.lang, this.lang2] = [other.lang, lead.lang];
    lead.settled = [];
    lead.progress = [];
    // It takes over at a sentence of its own: the one going on at the moment already captioned if most of it comes
    // after (that moment is an estimate: words in progress only come with a stretch of time), else the next one. What
    // it settled from there is captioned now; its words in progress are the captions' words in progress.
    const all = [...other.settled, ...other.progress];
    const from = takeOver(all, this.doneUntil - (this.doneExact ? 0 : EARLY_S));
    const settled = other.settled.slice(Math.min(from, other.settled.length));
    const said = other.progress.slice(0, Math.max(0, from - other.settled.length));
    const fresh = other.progress.slice(said.length);
    other.settled = [];
    other.progress = [];
    if (settled.length) {
      this.#commit(settled.map((x) => x.w), true);
      this.doneUntil = settled.at(-1).e;
      this.doneExact = true;
    }
    this.committed = said.map((x) => x.w);
    this.prevTail = [];
    if (fresh.length) this.emit('interim', { text: fresh.map((x) => x.w).join(' '), lang: this.said() });
    return true;
  }

  /** The language of what it writes: the room's when set; on "auto" it doesn't vouch (the room tells it from the words). */
  said() { return this.auto ? undefined : this.lang; }

  #commit(ws, finished) {
    if (!ws.length && !finished) return;
    // The other helper settles what it heard now and then, so its words carry exact times for a handover (its own
    // words in progress only come with a stretch of time, which grows long when nobody speaks its language).
    if (this.dual && ws.length && Date.now() - (this.nudgedAt || 0) > 4000) { this.nudgedAt = Date.now(); this.proc2.kill('SIGUSR1'); }
    this.stats.lastInputAt = Date.now();
    this.emit('input', { text: ws.length ? ` ${ws.join(' ')}` : '', finished, lang: this.said() });
  }

  #live() {
    clearTimeout(this.soloTimer);
    if (this.stopped || !this.proc?.ready) return;
    this.stats.connectedAt ||= Date.now();
    this.#setState('live');
    const early = this.early || [];
    this.early = null;
    for (const c of early) this.sendAudio(c);
  }

  #failed(msg) {
    if (this.stopped) return;
    this.stats.errors++;
    if (this.stats.lastError !== msg) this.emit('error', `Apple speech: ${msg}`);
    this.stats.lastError = msg;
    this.#setState('reconnecting');
    this.retryTimer = setTimeout(() => this.#connect(), this.backoff);
    this.backoff = Math.min(this.backoff * 2, 15000);
  }

  #setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.stateSince = Date.now();
    this.emit('state', s);
  }
}
