// The dashboard's "Run it on this computer" button (POST /api/local/start): prepares the speech server and Ollama
// with src/local/setup.js while the server keeps running, and reports each step and download for the page to show.
// Captions start as soon as speech is ready ("captions only"); translations join once Ollama and its model are
// there. Without Ollama it checks every few seconds, so installing the Ollama app is all it takes.
import { EventEmitter } from 'node:events';
import * as tty from '../tty.js';
import * as setup from './setup.js';

export class LocalMode extends EventEmitter {
  /**
   * @param {object} o
   * @param {(part: { speech?: any, text?: any }) => void} o.apply  use what is ready (switch rooms to the local engine)
   * @param {typeof setup.prepareSpeech} [o.prepareSpeech]
   * @param {typeof setup.prepareText} [o.prepareText]
   * @param {number} [o.retryMs]  how often to look for Ollama while it's missing
   */
  constructor({ apply, prepareSpeech = setup.prepareSpeech, prepareText = setup.prepareText, retryMs = 5000 }) {
    super();
    this.apply = apply;
    this.prepareSpeech = prepareSpeech;
    this.prepareText = prepareText;
    this.retryMs = retryMs;
    // state: speech (idle | working | ready | error); text: translations (off | working | missing | ready | error)
    this.s = { state: 'idle', text: 'off', step: '', done: 0, total: 0, error: '' };
    this.timer = null;
  }

  status() { return { ...this.s }; }

  #set(patch) { Object.assign(this.s, patch); this.emit('change', this.status()); }

  /** tty's interface (src/local/setup.js reports through it): the terminal as usual, plus this status. */
  get ui() {
    const step = (s) => this.#set({ step: String(s).split('\n')[0], done: 0, total: 0 });
    return {
      ok: (s) => { tty.ok(s); step(s); },
      info: (s) => { tty.info(s); step(s); },
      warn: (s) => { tty.warn(s); },
      spinner: (label) => { step(label); return { stop() {} }; },
      progress: (label) => {
        const bar = tty.progress(label);
        step(label);
        let last = 0;
        return {
          update: (got, total = 0, status) => {
            bar.update(got, total, status);
            if (Date.now() - last < 250 && got < total) return; // the page polls; no need for every chunk
            last = Date.now();
            this.#set({ done: got, total, ...(status ? { step: status } : {}) });
          },
          succeed: (s) => { bar.succeed(s); step(s ?? label); },
          fail: (s) => { bar.fail(s); },
        };
      },
    };
  }

  /** Prepare and switch. Calling it again while it works, or once it's done, changes nothing. */
  async start() {
    if (this.s.state === 'working' || this.s.state === 'ready') return this.status();
    this.#set({ state: 'working', error: '', step: 'Starting' });
    try {
      const speech = await this.prepareSpeech({}, this.ui);
      this.apply({ speech });
      this.#set({ state: 'ready', step: '' });
    } catch (e) {
      this.#set({ state: 'error', error: e.message });
      return this.status();
    }
    this.#text();
    return this.status();
  }

  async #text() {
    clearTimeout(this.timer);
    if (this.s.text === 'working') return;
    this.#set({ text: 'working' });
    try {
      const text = await this.prepareText({}, this.ui);
      if (this.s.state !== 'ready') return; // gone back to Gemini meanwhile
      this.apply({ text });
      this.#set({ text: 'ready', step: '', done: 0, total: 0 });
    } catch (e) {
      const missing = e.code === 'no-ollama';
      this.#set({ text: missing ? 'missing' : 'error', step: '', done: 0, total: 0, error: missing ? '' : e.message });
      // Ollama installed later is picked up by itself; after an error (a failed download), the button retries.
      if (missing) { this.timer = setTimeout(() => this.#text(), this.retryMs); this.timer.unref?.(); }
    }
  }

  /** Try the translations again now (the page's "Check again" / "Try again"). */
  retryText() { if (this.s.state === 'ready' && this.s.text !== 'ready') this.#text(); return this.status(); }

  /** Forget it was used (back to Gemini): the servers it started keep running, so the next start is quick. */
  reset() { clearTimeout(this.timer); this.#set({ state: 'idle', text: 'off', step: '', done: 0, total: 0, error: '' }); }
}
