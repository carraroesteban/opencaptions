// 🎧 Listen in any language. The AI speaks the room's main translation in a natural voice (Gemini Live Translate);
// for every other language the phone reads the captions aloud with its own voice (Web Speech API): free, offline,
// on every modern phone. Each finished caption is read once; when it falls behind (a fast speaker, a slow voice) it
// skips ahead to the newest caption instead of drifting further and further from the room.

const synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;

/** The best voice the device has for a language: a natural/premium one if installed, local before network. */
function pickVoice(lang) {
  const voices = synth?.getVoices() || [];
  const base = lang.split('-')[0].toLowerCase();
  const mine = voices.filter((v) => v.lang?.toLowerCase().replace('_', '-').split('-')[0] === base);
  const score = (v) => (/natural|neural|premium|enhanced|siri/i.test(v.name) ? 4 : 0) + (/google/i.test(v.name) ? 2 : 0) + (v.localService ? 1 : 0)
    + (base === 'es' && /-(419|mx|ar|us|co)\b/i.test(v.lang) ? 1 : 0) + (base === 'pt' && /-br\b/i.test(v.lang) ? 1 : 0);
  return mine.sort((a, b) => score(b) - score(a))[0] || null;
}

/** Does this device have a voice for the language? (Voices load late on some browsers: call again later.) */
export const canSpeak = (lang) => !!synth && !!lang && lang !== 'orig' && !!pickVoice(lang);

export class Speaker {
  constructor() { this.lang = ''; this.on = false; this.queue = []; this.busy = false; }

  /** Start reading in `lang`. Call from a tap: iOS only lets a page speak after the person asked for it. */
  start(lang) {
    this.lang = lang;
    this.on = true;
    this.queue = [];
    synth.cancel();
    const u = new SpeechSynthesisUtterance(' '); // unlocks speech on iOS inside the tap
    u.volume = 0;
    synth.speak(u);
  }

  stop() { this.on = false; this.queue = []; this.busy = false; synth?.cancel(); }

  /** A finished caption to read. */
  say(text) {
    if (!this.on || !text?.trim()) return;
    this.queue.push(text.trim());
    if (this.queue.length > 2) this.queue.splice(0, this.queue.length - 2); // behind: keep only the newest
    if (!this.busy) this.#next();
  }

  #next() {
    const text = this.queue.shift();
    if (!text || !this.on) { this.busy = false; return; }
    this.busy = true;
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(this.lang);
    if (v) u.voice = v;
    u.lang = v?.lang || this.lang;
    u.rate = this.queue.length ? 1.25 : 1.08; // a little brisk, faster when captions are waiting
    u.onend = u.onerror = () => this.#next();
    synth.speak(u);
  }
}
