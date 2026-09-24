// Turns a stream of transcription fragments into readable caption segments
// (partial → final), with timestamps for SRT/VTT export.
import { EventEmitter } from 'node:events';

const SENTENCE_END = /[.?!…。？！](["')\]»]?)(\s|$)/g;

export class CaptionTrack extends EventEmitter {
  /**
   * @param {object} o
   * @param {string} o.channel   'orig' | target language code
   * @param {import('./glossary.js').Glossary} o.glossary
   * @param {() => number} o.clock  ms since talk start
   */
  constructor({ channel, glossary, clock, minChars = 24, maxChars = 150, idleMs = 1300 }) {
    super();
    this.channel = channel;
    this.glossary = glossary;
    this.clock = clock;
    this.minChars = minChars;
    this.maxChars = maxChars;
    this.idleMs = idleMs;
    this.seq = 0;
    this.finals = [];
    this.cur = null; // { id, raw, start, end, lang }
    this.timer = null;
  }

  reset() {
    this.flush('reset');
    this.finals = [];
  }

  /** Low-latency provisional text (replaced when the confirmed transcription arrives). */
  interim(text, { lang = null } = {}) {
    if (!text) return;
    const prev = this.interimText || '';
    // Cumulative (usual) or delta-style updates.
    this.interimText = !prev || text.startsWith(prev) || !/^\s/.test(text) ? text : prev + text;
    const now = this.clock();
    if (!this.cur) this.cur = { id: `${this.channel}-${Date.now().toString(36)}-${++this.seq}`, raw: '', start: now, end: now, lang };
    this.#emit(false);
    this.#arm();
  }

  /** Replace the whole current segment (provisional sentence translation), or commit it with final=true. */
  replace(text, { final = false, lang = null } = {}) {
    clearTimeout(this.timer);
    this.timer = null;
    text = (text || '').trim();
    if (!text) return;
    const now = this.clock();
    if (!this.cur) this.cur = { id: `${this.channel}-${Date.now().toString(36)}-${++this.seq}`, raw: '', start: now, end: now, lang };
    this.cur.raw = text;
    this.cur.end = now;
    if (lang) this.cur.lang = lang;
    this.#emit(final);
    if (final) this.cur = null;
  }

  push(text, { finished = false, lang = null } = {}) {
    if (text) this.interimText = '';
    if (text) {
      const now = this.clock();
      if (!this.cur) this.cur = { id: `${this.channel}-${Date.now().toString(36)}-${++this.seq}`, raw: '', start: now, end: now, lang };
      const c = this.cur;
      // Accept both delta-style and cumulative-style fragments.
      if (c.raw && text.length > c.raw.length && text.startsWith(c.raw)) c.raw = text;
      else c.raw = joinText(c.raw, text);
      c.end = now;
      if (lang) c.lang = lang;
      this.#split();
      if (this.cur) this.#emit(false);
    }
    if (finished) this.flush('finished');
    else this.#arm();
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    this.interimText = '';
    if (!this.cur) return;
    if (this.cur.raw.trim()) this.#emit(true);
    this.cur = null;
  }

  history(n = 30) {
    return this.finals.slice(-n);
  }

  #arm() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush('idle'), this.idleMs);
  }

  #split() {
    const c = this.cur;
    // 1) Too long → cut at the best boundary.
    while (c.raw.length > this.maxChars) {
      const cut = bestCut(c.raw, this.minChars, this.maxChars);
      const head = c.raw.slice(0, cut);
      const tail = c.raw.slice(cut).replace(/^\s+/, '');
      c.raw = head;
      this.#emit(true);
      this.cur = { id: `${this.channel}-${Date.now().toString(36)}-${++this.seq}`, raw: tail, start: c.end, end: c.end, lang: c.lang };
      return this.#split();
    }
    // 2) Ends a sentence and is long enough → finalize.
    const t = c.raw.trimEnd();
    if (t.length >= this.minChars && /[.?!…。？！]["')\]»]?$/.test(t)) {
      this.#emit(true);
      this.cur = null;
    }
  }

  #emit(final) {
    const c = this.cur;
    const lang = c.lang || this.channel;
    const rawText = final ? c.raw.trim() : joinText(c.raw, this.interimText ? ' ' + this.interimText.trim() : '').trim();
    const text = this.glossary ? this.glossary.apply(rawText, this.channel, lang) : rawText;
    const seg = { id: c.id, channel: this.channel, lang, text, start: c.start, end: Math.max(c.end, c.start + 1200), final };
    if (final) {
      if (!text) return;
      this.finals.push(seg);
      if (this.finals.length > 5000) this.finals.splice(0, 1000);
    }
    this.emit('caption', seg);
  }
}

function joinText(a, b) {
  if (!a) return b.replace(/^\s+/, '');
  if (/\s$/.test(a) || /^\s/.test(b) || /^[,.;:!?)\]}»…]/.test(b)) return a + b;
  // CJK / no-space scripts: plain concat. Latin fragments without spaces are usually sub-word tokens.
  return a + b;
}

function bestCut(s, min, max) {
  const win = s.slice(0, max);
  let cut = -1;
  SENTENCE_END.lastIndex = 0;
  let m;
  while ((m = SENTENCE_END.exec(win))) if (m.index + 1 >= min) cut = m.index + 1 + m[1].length;
  if (cut > 0) return cut;
  const comma = Math.max(win.lastIndexOf(', '), win.lastIndexOf('; '), win.lastIndexOf(': '));
  if (comma >= min) return comma + 1;
  const sp = win.lastIndexOf(' ');
  return sp >= min ? sp : max;
}
