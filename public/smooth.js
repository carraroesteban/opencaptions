// Smooth captions, shared by every page that shows them (phones, stage screen, overlay, floating window, Just for me).
//
// The AI delivers words in bursts (a few at a time, every second or so) and sometimes rewrites the last ones. Shown
// as they come, captions jump: nothing, then five words at once, and a line that re-wraps when its start is cut.
// Professional live captions don't do that, and neither does this:
//   • Pacer: words come out one by one at the speaker's own pace (measured from how fast they arrive), catching up
//     quietly when behind, never more than ~1.2 s late. A word the AI keeps rewriting waits a moment until it settles.
//   • RollUp: TV-style lines. Lines never re-wrap: new words go on the last line, and when it's full everything slides
//     up one line. Old lines leave from the top, whole, so the visible ones never move sideways.

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const hidden = () => typeof document !== 'undefined' && document.hidden;
// Languages written without spaces (Chinese, Japanese, Thai, Lao, Khmer, Burmese): split into words with Intl.Segmenter.
const NO_SPACES = /[぀-ヿ㐀-鿿豈-﫿฀-๿຀-໿ក-៿က-႟]/;
const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'word' }) : null;

/** Text → words, each keeping its trailing space, so joining them gives the text back. */
export function tokens(text) {
  const out = [];
  for (const t of String(text ?? '').trim().match(/\S+\s*/g) || []) {
    if (segmenter && t.length > 6 && NO_SPACES.test(t)) {
      // Small groups (2–3 characters) read better than single characters, and keep the DOM small.
      let cur = '';
      for (const { segment } of segmenter.segment(t)) {
        cur += segment;
        if (cur.trim().length >= 2) { out.push(cur); cur = ''; }
      }
      if (cur) out.push(cur);
    } else out.push(t);
  }
  return out;
}
const norm = (w) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/**
 * Releases each caption's words at a steady pace. Feed it the server's caption messages; it calls
 * onUpdate({ ...seg, text, final }) whenever what's shown changes (final only once every word is out).
 */
export class Pacer {
  /**
   * @param {(seg: any) => void} onUpdate
   * @param {{ keep?: number, now?: () => number, auto?: boolean }} [o] now/auto: a clock and manual step() for tests
   */
  constructor(onUpdate, { keep = 80, now = () => performance.now(), auto = true } = {}) {
    this.onUpdate = onUpdate;
    this.now = now;
    this.auto = auto;
    this.keep = keep; // captions remembered (older ones are fully shown anyway)
    this.list = [];
    this.byId = new Map();
    this.timer = 0;
    this.acc = 0;
    this.at = 0;
    this.wps = 2.6; // arrival rate, words per second (measured)
    this.lastIn = 0;
  }

  clear() { this.list = []; this.byId.clear(); this.acc = 0; }

  /** Captions that were already said (history on connect): shown at once. */
  load(segs) {
    this.clear();
    for (const s of segs) if (s?.text != null) this.#take(s, true);
  }

  /** A caption from the server (new, growing, rewritten or final). */
  push(seg) {
    this.#take(seg, hidden()); // a background tab has nothing to animate: keep up silently
    this.#run();
  }

  /** What's shown now, oldest first: [{ id, text, final, spk, … }]. */
  shown(n = 12) { return this.list.slice(-n).map((e) => this.#view(e)); }

  #take(seg, instant) {
    const now = this.now();
    const words = tokens(seg.text);
    let e = this.byId.get(seg.id);
    let added = words.length;
    if (!e) {
      e = { seg, words, shown: 0, revisedAt: 0, last: null };
      this.list.push(e);
      this.byId.set(seg.id, e);
      while (this.list.length > this.keep) this.byId.delete(this.list.shift().seg.id);
    } else {
      added = Math.max(0, words.length - e.words.length);
      let i = 0;
      while (i < e.shown && i < words.length && norm(words[i]) === norm(e.words[i])) i++;
      // Words already on screen changed (not just the last one growing, "conf" → "conference"): this caption's
      // tail is unstable, hold it back a little.
      const grew = i === e.shown - 1 && i === e.words.length - 1 && i < words.length && norm(words[i]).startsWith(norm(e.words[i]));
      if (i < e.shown && !grew) e.revisedAt = now;
      e.seg = seg;
      e.words = words;
      e.shown = Math.min(e.shown, words.length);
    }
    // How fast words arrive (≈ how fast the person speaks), smoothed; long gaps (pauses) don't count.
    const gap = (now - this.lastIn) / 1000;
    if (added && this.lastIn && gap > 0.05 && gap < 4) this.wps = Math.min(8, Math.max(1.2, this.wps * 0.8 + (added / gap) * 0.2));
    if (added) this.lastIn = now;
    if (instant) e.shown = words.length;
    this.#emit(e);
  }

  // Words ready to show. A caption whose shown words were just rewritten keeps its last two back for a moment.
  #ready(e, now) {
    const hold = !e.seg.final && now - e.revisedAt < 700 ? 2 : 0;
    return Math.max(e.shown, e.words.length - hold);
  }

  #backlog(now) {
    let ready = 0, all = 0;
    for (const e of this.list) { ready += this.#ready(e, now) - e.shown; all += e.words.length - e.shown; }
    return { ready, all };
  }

  #run() {
    if (!this.at) this.at = this.now();
    if (this.timer || !this.auto) return;
    this.at = this.now();
    this.timer = setInterval(() => this.step(), 40);
  }

  /** Release the words due now (every 40 ms; tests call it by hand). */
  step() {
    const now = this.now();
    const dt = Math.min(0.25, (now - this.at) / 1000);
    this.at = now;
    let { ready, all } = this.#backlog(now);
    if (!all || hidden()) {
      if (hidden()) for (const e of this.list) if (e.shown < e.words.length) { e.shown = e.words.length; this.#emit(e); }
      clearInterval(this.timer); this.timer = 0; this.acc = 0;
      return;
    }
    if (!ready) return; // only held words left: wait for them to settle
    // Too far behind (a burst after a reconnect): jump, leaving a few words to flow.
    if (ready > 30) {
      let skip = ready - 8;
      for (const e of this.list) {
        const n = Math.min(skip, this.#ready(e, now) - e.shown);
        if (n > 0) { e.shown += n; skip -= n; this.#emit(e); }
      }
      ready = 8;
    }
    // The speaker's pace, a little faster so it never drifts behind, and never more than ~1.2 s of words waiting.
    const rate = Math.min(30, Math.max(this.wps * 1.15, ready / 1.2, 1.5));
    this.acc = Math.min(this.acc + dt * rate, ready);
    while (this.acc >= 1) {
      const e = this.list.find((x) => x.shown < this.#ready(x, now));
      if (!e) break;
      e.shown++;
      this.acc--;
      this.#emit(e);
    }
  }

  #view(e) {
    return { ...e.seg, text: e.words.slice(0, e.shown).join('').trim(), final: !!e.seg.final && e.shown >= e.words.length };
  }

  #emit(e) {
    const v = this.#view(e);
    const key = `${v.final}|${v.text}`;
    if (key === e.last) return;
    e.last = key;
    if (v.text || v.final) this.onUpdate(v);
  }
}

/**
 * TV-style roll-up captions in a box of fixed height (the box clips; its content sits at the bottom).
 * render(captions) takes the paced captions, oldest first, and updates only what changed.
 */
export class RollUp {
  /** @param {HTMLElement} clip  @param {{ live?: boolean }} [o] live: highlight the word being spoken */
  constructor(clip, { live = true } = {}) {
    this.clip = clip;
    this.live = live;
    this.box = Object.assign(document.createElement('div'), { className: 'roll' });
    clip.replaceChildren(this.box);
    this.segs = new Map(); // id → { el, cut } (cut: words already rolled off the top)
    this.gone = new Set(); // captions that rolled off entirely: never drawn again
    this.h = 0;
    this.trimAt = 0;
  }

  clear() { this.box.replaceChildren(); this.segs.clear(); this.gone.clear(); this.h = 0; }

  render(caps) {
    for (const c of caps) this.#seg(c);
    // The word being spoken: last word of the last caption still in progress.
    const live = this.live ? caps.findLast((c) => !c.final && c.text) : null;
    for (const el of this.box.querySelectorAll('.live-word')) if (el.parentElement?.dataset.id !== live?.id || el !== el.parentElement.lastElementChild) el.classList.remove('live-word');
    if (live) {
      const w = this.segs.get(live.id)?.el.lastElementChild;
      if (w) { w.classList.add('live-word'); w.dataset.w = w.textContent.trim(); }
    }
    this.#slide();
    if (performance.now() - this.trimAt > 1500) this.#trim();
  }

  #seg(c) {
    let s = this.segs.get(c.id);
    if (!s) {
      if (this.gone.has(c.id)) return;
      s = { el: Object.assign(document.createElement('span'), { className: 'cap' }), cut: 0 };
      s.el.dataset.id = c.id;
      if (this.box.lastChild) this.box.append(' ');
      this.box.append(s.el);
      this.segs.set(c.id, s);
    }
    const words = tokens(c.text).slice(s.cut);
    const spans = s.el.children;
    words.forEach((w, i) => {
      if (spans[i]) { if (spans[i].textContent !== w) { spans[i].textContent = w; spans[i].dataset.w = w.trim(); } }
      else s.el.append(Object.assign(document.createElement('span'), { textContent: w }));
    });
    while (spans.length > words.length) spans[spans.length - 1].remove();
  }

  // A new line pushed everything up: start where it was and slide (FLIP), so the eye can follow.
  #slide() {
    const h = this.box.offsetHeight;
    // One or two new lines slide; a bigger jump (a burst after a reconnect) just appears.
    if (this.h && h > this.h && h - this.h <= this.clip.clientHeight && !reduced()) {
      this.box.style.transition = 'none';
      this.box.style.transform = `translateY(${h - this.h}px)`;
      void this.box.offsetHeight;
      this.box.style.transition = 'transform .32s cubic-bezier(.2, .7, .2, 1)';
      this.box.style.transform = '';
    }
    this.h = h;
  }

  // Lines far above the visible ones go, whole lines only: what's left wraps exactly as before.
  #trim() {
    this.trimAt = performance.now();
    const visTop = this.box.offsetHeight - this.clip.clientHeight;
    const first = this.box.querySelector('.cap > span');
    if (!first) return;
    const lh = first.offsetHeight || 40;
    if (visTop < lh * 4) return;
    const limit = visTop - lh * 2;
    // Measure everything first: removing a line moves the ones below it up.
    const doomed = [];
    let cut = null;
    for (const [id, s] of this.segs) {
      let n = 0;
      for (const w of s.el.children) { if (w.offsetTop >= limit) break; n++; }
      if (n && n >= s.el.children.length) { doomed.push(id); continue; }
      if (n) cut = { s, n };
      break;
    }
    for (const id of doomed) {
      const s = this.segs.get(id);
      if (s.el.previousSibling?.nodeType === 3) s.el.previousSibling.remove();
      s.el.remove();
      this.segs.delete(id);
      this.gone.add(id);
      if (this.gone.size > 500) this.gone.delete(this.gone.values().next().value);
    }
    if (cut) {
      for (let i = 0; i < cut.n; i++) cut.s.el.firstElementChild.remove();
      cut.s.cut += cut.n;
    }
    const nf = this.box.firstChild;
    if (nf?.nodeType === 3) nf.remove();
    this.h = this.box.offsetHeight;
  }
}
