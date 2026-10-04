// Offline backup: when the venue loses internet, move every room from Gemini to the local engine (Whisper +
// a text model on this machine, see docs/local.md), and back to Gemini once the connection has been stable
// for a minute. The audience keeps the same pages and QR codes; only the AI behind the captions changes.
//
// Modes (set from the dashboard):
//   auto  → switch by itself (default when FALLBACK=local)
//   cloud → always Gemini
//   local → always the local engine
import { EventEmitter } from 'node:events';
import { config } from './config.js';

/** Can this machine reach Google's API? Any HTTP answer counts: only a network error means "offline". */
export async function probeGemini(timeoutMs = 4000) {
  const url = process.env.FALLBACK_PROBE_URL
    || (config.vertex ? `https://${config.gcpLocation}-aiplatform.googleapis.com/` : 'https://generativelanguage.googleapis.com/');
  try {
    await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(timeoutMs) });
    return true;
  } catch {
    return false;
  }
}

export class Failover extends EventEmitter {
  /**
   * @param {object} o
   * @param {() => Promise<boolean>} [o.probe]     is the cloud reachable? (default: probeGemini)
   * @param {() => Promise<boolean>} o.localReady  are the local speech server and text model up?
   * @param {(engine: string, reason: string) => void} o.apply  switch every room to this engine
   * @param {'auto' | 'cloud' | 'local'} [o.mode]
   * @param {number} [o.intervalMs]  how often to check
   * @param {number} [o.downAfter]   failed checks in a row before switching to local
   * @param {number} [o.upAfter]     good checks in a row before switching back
   */
  constructor({ probe = probeGemini, localReady, apply, mode = 'auto', intervalMs = 5000, downAfter = 3, upAfter = 12 }) {
    super();
    this.probe = probe;
    this.localReady = localReady;
    this.apply = apply;
    this.intervalMs = intervalMs;
    this.downAfter = downAfter;
    this.upAfter = upAfter;
    this.mode = mode;
    this.active = 'gemini';
    this.online = null;
    this.local = null;
    this.fails = 0;
    this.oks = 0;
    this.since = Date.now();
    this.reason = '';
  }

  start() {
    this.timer = setInterval(() => this.check().catch(() => {}), this.intervalMs);
    this.timer.unref?.();
    return this.check();
  }

  stop() { clearInterval(this.timer); }

  async check() {
    const [online, local] = await Promise.all([this.probe(), this.localReady().catch(() => false)]);
    const changed = online !== this.online || local !== this.local;
    this.online = online;
    this.local = local;
    if (online) { this.oks++; this.fails = 0; } else { this.fails++; this.oks = 0; }
    if (this.mode === 'auto') {
      if (this.active === 'gemini' && this.fails >= this.downAfter && local) this.#switch('local', 'internet connection lost');
      else if (this.active === 'local' && this.oks >= this.upAfter) this.#switch('gemini', 'internet connection is back');
    }
    if (changed) this.emit('change', this.status());
  }

  setMode(mode) {
    if (!['auto', 'cloud', 'local'].includes(mode)) throw new Error('mode must be auto|cloud|local');
    if (mode === 'local' && !this.local) throw new Error('the local engine is not running on this computer (start it with: npm run local -- --fallback)');
    this.mode = mode;
    if (mode === 'cloud') this.#switch('gemini', 'switched from the dashboard');
    else if (mode === 'local') this.#switch('local', 'switched from the dashboard');
    else if (this.active === 'gemini' && this.online === false && this.local) this.#switch('local', 'internet connection lost');
    else if (this.active === 'local' && this.online) this.#switch('gemini', 'internet connection is back');
    this.emit('change', this.status());
  }

  #switch(engine, reason) {
    if (engine === this.active) return;
    this.active = engine;
    this.since = Date.now();
    this.reason = reason;
    this.apply(engine, reason);
    this.emit('change', this.status());
  }

  status() {
    return { mode: this.mode, active: this.active, online: this.online, localReady: this.local, since: this.since, reason: this.reason };
  }
}
