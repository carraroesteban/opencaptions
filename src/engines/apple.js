// Local speech recognition with Apple's SpeechAnalyzer, built into macOS 26+ (local mode on a Mac, docs/local.md).
// Unlike Whisper it streams by itself: the room's audio goes to the helper (src/local/apple.swift) as it arrives,
// and it answers with the words in progress (rewritten as it hears more) and, at its own pace, the settled text.
// Apple may keep a fast speaker's words in progress for 20 s (seen), and captions are translated once committed,
// so a finished sentence that two updates agree on is committed early ('input'); the rest shows as 'interim'.
// Same events and status shape as the local Whisper engine (src/engines/local.js).
// Apple doesn't detect the language: it listens for the room's language, or the Mac's when the room says "auto".
import { EventEmitter } from 'node:events';
import { appleListen, jsonLines, macLanguage } from '../local/apple.js';
import { continuation, normWord } from './local.js';

const CHUNK_MS = 100;
const IDLE_END_MS = 1500; // audio stopped arriving (ingest hiccup): settle what was heard
const words = (s) => String(s || '').split(/\s+/).filter(Boolean);
const endsSentence = (w) => /[.?!…]["'»”)]*$/.test(w);

export class AppleEngine extends EventEmitter {
  /**
   * @param {object} o
   * @param {string} o.label          room id, for logs
   * @param {string} o.target         the session's caption language
   * @param {string} [o.source]       the room's pinned language, or 'auto'
   * @param {string[]} [o.vocabulary] names and terms to expect (glossary + agenda)
   * @param {typeof appleListen} [o.listen]  starts the helper (tests inject a fake process)
   */
  constructor({ label, target, source = 'auto', vocabulary = [], listen = appleListen }) {
    super();
    this.label = label;
    this.target = target;
    this.auto = !source || source === 'auto';
    this.lang = this.auto ? macLanguage() : source;
    this.vocabulary = vocabulary;
    this.listen = listen;
    this.state = 'idle';
    this.stateSince = Date.now();
    this.stopped = true;
    this.proc = null;
    this.backoff = 1000;
    this.committed = []; // words of Apple's unsettled text already committed early
    this.prevTail = [];
    this.stats = {
      reconnects: 0, resumes: 0, errors: 0, lastError: '', connectedAt: 0, audioMs: 0, lastInputAt: 0, lastOutputAt: 0, tokens: 0,
      requests: 0, partials: 0, finals: 0, skipped: 0, dropped: 0, collapses: 0, avgMs: null,
    };
  }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.#connect();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    clearTimeout(this.idleTimer);
    this.#kill();
    this.#setState('idle');
  }

  /** Stall watchdog / manual ↻: a fresh helper. */
  restart(reason = 'restart') {
    if (this.stopped) return;
    this.emit('log', `restarting (${reason})`);
    this.stats.reconnects++;
    this.#kill();
    this.#connect();
  }

  /** The room went quiet (silence gate) or the ingest left: settle the sentence in progress. */
  endAudio() {
    clearTimeout(this.idleTimer);
    if (this.state === 'live') this.proc?.kill('SIGUSR1');
  }

  status() {
    return { target: this.target, echo: false, state: this.state, stateSince: this.stateSince, level: 'full', ...this.stats };
  }

  sendAudio(chunk) {
    if (this.stopped || this.state !== 'live') return;
    this.stats.audioMs += CHUNK_MS;
    this.proc.stdin.write(chunk);
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.endAudio(), IDLE_END_MS);
  }

  #kill() {
    const p = this.proc;
    this.proc = null;
    if (p) { p.removeAllListeners('close'); p.stdin.end(); p.kill(); }
  }

  async #connect() {
    clearTimeout(this.retryTimer);
    this.#setState(this.stats.connectedAt ? 'reconnecting' : 'connecting');
    let p;
    try {
      p = await this.listen({ lang: this.lang, vocabulary: this.vocabulary });
    } catch (e) {
      return this.#failed(e.message);
    }
    if (this.stopped) { p.kill(); return; }
    this.proc = p;
    let lastError = '';
    p.stdin.on('error', () => {}); // it exited: 'close' below restarts it
    p.stderr?.on('data', () => {}); // system frameworks' chatter
    jsonLines(p.stdout, (o) => {
      if (o.ready) {
        this.stats.connectedAt ||= Date.now();
        this.emit('log', `listening for ${o.ready} (${o.engine})${this.auto ? ': Apple doesn\'t detect the language, so it uses this Mac\'s. Set the room\'s language if the talk is in another one.' : ''}`);
        this.#setState('live');
      } else if (typeof o.partial === 'string') {
        this.stats.partials++;
        this.#onPartial(words(o.partial));
      } else if (o.final) {
        this.backoff = 1000;
        this.stats.finals++;
        this.stats.requests++;
        const hyp = words(o.final);
        this.#commit(hyp.slice(continuation(hyp, this.committed)), true);
        this.committed = [];
        this.prevTail = [];
      } else if (o.log) this.emit('log', o.log);
      else if (o.error) lastError = o.error;
    });
    p.on('close', (code) => {
      if (this.proc !== p) return;
      this.proc = null;
      this.#failed(lastError || `Apple speech helper stopped (code ${code})`);
    });
  }

  #onPartial(hyp) {
    const tail = hyp.slice(continuation(hyp, this.committed));
    // The last finished sentence with words after it, if the previous update had it too, word for word.
    let k = -1;
    for (let i = tail.length - 3; i >= 0; i--) if (endsSentence(tail[i])) { k = i; break; }
    const agreed = k >= 0 && this.prevTail.length > k && tail.slice(0, k + 1).every((w, i) => normWord(w) === normWord(this.prevTail[i]));
    this.prevTail = tail;
    if (agreed) {
      this.#commit(tail.slice(0, k + 1), false);
      this.committed.push(...tail.slice(0, k + 1));
      this.prevTail = tail.slice(k + 1);
    }
    const rest = tail.slice(agreed ? k + 1 : 0).join(' ');
    if (rest) this.emit('interim', { text: rest, lang: this.lang });
  }

  #commit(ws, finished) {
    if (!ws.length && !finished) return;
    this.stats.lastInputAt = Date.now();
    this.emit('input', { text: ws.length ? ` ${ws.join(' ')}` : '', finished, lang: this.lang });
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
