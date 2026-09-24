// A Stage = one room/escenario. Receives audio from exactly one ingest at a time,
// fans it out to one model session per target language, turns transcriptions into
// caption tracks, and keeps operational metrics (level, latency, cost, health).
import { EventEmitter } from 'node:events';
import { config } from './config.js';
import { Chunker, rms } from './audio.js';
import { CaptionTrack } from './captions.js';
import { GeminiEngine } from './engines/gemini.js';
import { MockEngine } from './engines/mock.js';
import { SentenceTranslator } from './translate.js';

const PREROLL_CHUNKS = 6; // 600 ms kept while gated, so the first words aren't clipped
const EMA = (prev, v, a = 0.3) => (prev == null ? v : prev * (1 - a) + v * a);
// Gemini 3.5 Live Translate paid tier: $0.0053/min input + $0.0315/min output audio (Sept 2026 pricing page).
const USD_PER_SESSION_MIN = 0.0368;

export class Stage extends EventEmitter {
  constructor(def, { glossary, store }) {
    super();
    this.setMaxListeners(0);
    this.glossary = glossary;
    this.store = store;
    this.applyDef(def);
    this.engines = new Map();
    this.ingest = null; // { kind, label, since, ws? }
    this.level = 0;
    this.peak = 0;
    this.lastAudioAt = 0;
    this.lastSpeechAt = 0;
    this.gated = true;
    this.preroll = [];
    this.lat = { asr: null, tr: {} };
    this.onset = null;
    this.speechMsNoInput = 0;
    this.speechMsNoOutput = {};
    this.lowLevelSince = 0;
    this.audioMsIn = 0;
    this.costUsd = 0;
    this.viewers = 0;
    this.logs = [];
    this.alerts = new Set();
    this.chunker = new Chunker((c) => this.#onChunk(c));
    this.#newTalk(def.title || '', false);
    this.tick = setInterval(() => this.#housekeeping(), 1000);
  }

  applyDef(def) {
    this.def = def;
    this.id = def.id;
    const src = def.source && def.source !== 'auto' ? def.source : null;
    this.source = src;
    const targets = [...new Set(def.targets)];
    // Caption translation mode:
    //  text   → 1 Live session (transcription + translated voice for the first language); captions for every
    //           language via fast text translation of each clause. Lowest latency & cost, any number of languages.
    //  live   → captions straight from each Live session's speech translation (1 session per language).
    //  hybrid → text captions + 1 Live session per language (translated voice 🎧 in every language).
    this.mode = def.translation || (config.engine === 'mock' && !process.env.TRANSLATION_MODE ? 'live' : config.translationMode);
    this.transTargets = src ? targets.filter((t) => t !== src) : targets;
    const liveTargets = this.transTargets.length ? this.transTargets : [src || 'es'];
    this.sessionTargets = this.mode === 'text' ? liveTargets.slice(0, 1) : liveTargets;
    this.audioLangs = this.sessionTargets.filter((t) => this.transTargets.includes(t));
    // Languages a viewer can pick. 'orig' = whatever is being spoken.
    this.aliases = {};
    if (src) this.aliases[src] = 'orig';
    this.languages = ['orig', ...new Set([...(src ? [src] : []), ...this.transTargets])];
    if (this.tracks) this.#buildTracks();
  }

  /** Change languages / source at runtime (from the dashboard). */
  reconfigure(def) {
    const running = this.engines.size > 0;
    this.#stopEngines('reconfigure');
    this.applyDef(def);
    this.mtQ = {};
    if (running) this.#ensureEngines();
    this.emit('config');
  }

  channelFor(lang) {
    if (!lang || lang === 'orig') return 'orig';
    return this.aliases[lang] || (this.tracks[lang] ? lang : 'orig');
  }

  // ---------- audio in ----------
  attachIngest(info) {
    const prev = this.ingest;
    if (prev?.detach) prev.detach('replaced by a new ingest');
    this.ingest = { ...info, since: Date.now() };
    this.log('info', `ingest connected: ${info.kind} ${info.label || ''}`.trim());
    this.emit('ingest');
  }

  detachIngest(info) {
    if (this.ingest && this.ingest.token === info.token) {
      this.log('warn', `ingest disconnected: ${this.ingest.kind}`);
      this.ingest = null;
      this.level = 0;
      this.#gate('ingest disconnected');
      this.emit('ingest');
    }
  }

  pushAudio(buf) {
    this.chunker.push(buf);
  }

  #onChunk(chunk) {
    const now = Date.now();
    const lvl = rms(chunk);
    this.level = lvl;
    this.peak = Math.max(this.peak * 0.95, lvl);
    this.lastAudioAt = now;
    this.audioMsIn += 100;
    const speech = lvl >= config.speechRms;

    if (speech) {
      if (now - this.lastSpeechAt > 800) this.onset = { at: now, asr: true, tr: new Set(this.transTargets) };
      this.lastSpeechAt = now;
      this.lowLevelSince = 0;
      if (this.gated) this.#ungate();
    } else if (lvl < 0.002) {
      this.lowLevelSince ||= now;
    } else this.lowLevelSince = 0;

    if (this.gated) {
      this.preroll.push(chunk);
      if (this.preroll.length > PREROLL_CHUNKS) this.preroll.shift();
      return;
    }
    for (const e of this.engines.values()) e.sendAudio(chunk);
    if (speech) {
      this.speechMsNoInput += 100;
      for (const t of this.sessionTargets) this.speechMsNoOutput[t] = (this.speechMsNoOutput[t] || 0) + 100;
    }
    if (now - this.lastSpeechAt > config.silenceGateSec * 1000) this.#gate('silence');
  }

  #ungate() {
    this.#ensureEngines();
    this.gated = false;
    const pre = this.preroll.splice(0);
    for (const c of pre) for (const e of this.engines.values()) e.sendAudio(c);
  }

  #gate(reason) {
    if (this.gated) return;
    this.gated = true;
    for (const e of this.engines.values()) e.endAudio();
    setTimeout(() => this.#flushTracks(), 2500);
    this.log('info', `audio paused to the model (${reason}) — no cost while silent`);
  }

  // ---------- engines ----------
  #ensureEngines() {
    if (this.engines.size) return;
    if (this.idleClosed && this.talkSegments > 0) this.#newTalk('', true);
    this.idleClosed = false;
    const glossaryVocab = this.glossary.vocabulary(this.def.vocabulary);
    this.sessionTargets.forEach((target, i) => {
      const primary = i === 0;
      const opts = {
        label: this.id,
        target,
        source: this.source || 'auto',
        // Keep echo on: in tests, sessions with echo off + auto-detected language barely transcribed.
        // When the speaker already talks the target language we ignore the parroted output and pass the
        // transcription through instead.
        echo: true,
        vocabulary: glossaryVocab,
        languageHints: this.source ? [this.source] : [],
        mode: config.transcriptionMode,
      };
      const e = config.engine === 'gemini' ? new GeminiEngine(opts) : new MockEngine(opts);
      e.on('input', (t) => primary && this.#onInput(t));
      e.on('interim', (t) => primary && config.useInterim && this.#onInterim(t));
      e.on('output', (t) => this.#onOutput(target, t));
      e.on('audio', (buf) => this.emit('audio', target, buf));
      e.on('turn', () => { if (primary) this.tracks.orig.flush(); this.tracks[target]?.flush(); });
      e.on('state', (s) => { this.log(s === 'live' ? 'info' : 'debug', `${target}: ${s}`); this.emit('engine'); });
      e.on('log', (m) => this.log('warn', `${target}: ${m}`));
      e.on('error', (m) => this.log('error', `${target}: ${m}`));
      this.engines.set(target, e);
      e.start();
    });
    this.log('info', `started ${this.engines.size} ${config.engine} session(s): ${this.sessionTargets.join(', ')}`);
  }

  #stopEngines(reason) {
    if (!this.engines.size) return;
    for (const e of this.engines.values()) { e.stop(); e.removeAllListeners(); }
    this.engines.clear();
    this.#flushTracks();
    this.gated = true;
    this.log('info', `sessions closed (${reason})`);
    this.emit('engine');
  }

  restartEngines() {
    for (const e of this.engines.values()) e.restart('manual');
  }

  #onInput({ text, finished, lang }) {
    const now = Date.now();
    this.speechMsNoInput = 0;
    if (this.onset?.asr && text.trim()) {
      this.lat.asr = EMA(this.lat.asr, now - this.onset.at);
      this.onset.asr = false;
    }
    if (lang) this.detectedLang = lang;
    const spoken = lang || this.source;
    this.tracks.orig.push(text, { finished, lang: spoken });
    for (const t of this.transTargets) {
      // Same language as the speaker → the caption is the transcription itself.
      if (spoken && t === spoken) this.#deliver(t, text, finished);
    }
    if (this.mode !== 'live') this.#mtFeed(text, finished, spoken);
  }

  // ---------- text translation (sentence by sentence, with provisional partials) ----------
  #mtFeed(text, finished, spoken) {
    this.mtQ ??= {};
    for (const t of this.transTargets) {
      if (spoken && t === spoken) continue;
      this.mtQ[t] ??= new SentenceTranslator({
        from: this.source,
        to: t,
        vocabulary: this.glossary.vocabulary(this.def.vocabulary),
        onPartial: (out) => { this.#markLatency(t, out); this.tracks[t]?.replace(out, { lang: t }); },
        onFinal: (out) => { this.#markLatency(t, out); this.tracks[t]?.replace(out, { final: true, lang: t }); },
        onError: (m) => this.log('warn', `translate → ${t}: ${m}`),
        // The primary Live session already translates into this language: use it while text MT is throttled.
        canFallback: () => t === this.sessionTargets[0] && this.engines.get(t)?.state === 'live',
        onDegraded: (on) => {
          this.tracks[t]?.flush(); // don't mix a half MT sentence with Live output
          this.log(on ? 'warn' : 'info', on ? `${t}: text translation throttled → Live Translate captions` : `${t}: back to text translation`);
        },
      });
      this.mtQ[t].feed(text, { finished, spoken });
    }
  }

  #markLatency(target, text) {
    if (this.onset?.tr.has(target) && text.trim()) {
      this.lat.tr[target] = EMA(this.lat.tr[target], Date.now() - this.onset.at);
      this.onset.tr.delete(target);
    }
  }

  #deliver(target, text, finished) {
    this.#markLatency(target, text);
    this.tracks[target]?.push(text, { finished, lang: target });
  }

  #onInterim({ text, lang }) {
    this.speechMsNoInput = 0;
    if (this.onset?.asr && text.trim()) {
      this.lat.asr = EMA(this.lat.asr, Date.now() - this.onset.at);
      this.onset.asr = false;
    }
    this.tracks.orig.interim(text, { lang: lang || this.source });
  }

  #onOutput(target, { text, finished }) {
    this.speechMsNoOutput[target] = 0;
    if (!this.transTargets.includes(target)) return;
    // text/hybrid: Live output only feeds 🎧 audio — unless text translation is throttled (automatic fallback).
    if (this.mode !== 'live' && !this.mtQ?.[target]?.degraded()) return;
    if ((this.detectedLang || this.source) === target) return; // passthrough handles same-language speech
    this.#deliver(target, text, finished);
  }

  // ---------- captions ----------
  #buildTracks() {
    for (const t of Object.values(this.tracks || {})) t.flush();
    this.tracks = {};
    const clock = () => Date.now() - this.talk.startedAt;
    for (const ch of ['orig', ...this.transTargets]) {
      const tr = new CaptionTrack({ channel: ch, glossary: this.glossary, clock });
      tr.on('caption', (seg) => {
        if (seg.final) { this.talkSegments++; this.store.append(this.id, this.talk.id, seg); }
        this.lastCaptionAt = Date.now();
        this.emit('caption', seg);
      });
      this.tracks[ch] = tr;
    }
  }

  #flushTracks() {
    for (const q of Object.values(this.mtQ || {})) q.flush();
    for (const t of Object.values(this.tracks || {})) t.flush();
  }

  newTalk(title = '') { this.#newTalk(title, true); }

  #newTalk(title, announce) {
    this.#flushTracks();
    this.talk = { id: new Date().toISOString().replace(/[:.]/g, '-'), title, startedAt: Date.now() };
    this.talkSegments = 0;
    this.#buildTracks();
    this.store.openTalk(this.id, this.talk, this.languages);
    if (announce) {
      this.log('info', `new talk started ${title ? `"${title}"` : ''}`.trim());
      this.emit('talk');
    }
  }

  setTitle(title) {
    this.talk.title = title;
    this.store.openTalk(this.id, this.talk, this.languages);
    this.emit('talk');
  }

  history(channel, n = 30) {
    return this.tracks[channel]?.history(n) || [];
  }

  partial(channel) {
    const c = this.tracks[channel]?.cur;
    return c ? { id: c.id, channel, text: this.glossary.apply(c.raw.trim(), channel, c.lang || channel), final: false } : null;
  }

  // ---------- health ----------
  #housekeeping() {
    const now = Date.now();
    // Cost: every open session is billed for streamed audio (input + generated output).
    if (this.engines.size && !this.gated) this.costUsd += (USD_PER_SESSION_MIN / 60) * this.engines.size;

    // Stall watchdog: people are talking but a session produced nothing for a while → reconnect it.
    const primary = this.engines.get(this.sessionTargets[0]);
    if (primary?.state === 'live' && this.speechMsNoInput > 20000) {
      this.log('warn', 'no transcription for 20s of speech → restarting session');
      this.speechMsNoInput = 0;
      primary.restart('stall');
    }
    for (const [t, e] of this.engines) {
      if (this.mode !== 'live' || !this.transTargets.includes(t) || t === (this.detectedLang || this.source)) continue;
      if (e.state === 'live' && (this.speechMsNoOutput[t] || 0) > 30000) {
        this.log('warn', `no ${t} translation for 30s of speech → restarting session`);
        this.speechMsNoOutput[t] = 0;
        e.restart('stall');
      }
    }

    // Close sessions entirely after a long idle (break between talks / end of day): zero cost, zero operator.
    if (this.engines.size && now - Math.max(this.lastSpeechAt, this.ingest?.since || 0) > config.idleCloseSec * 1000) {
      this.#stopEngines(`idle ${config.idleCloseSec}s`);
      this.idleClosed = true;
    }

    // Alerts for the production team.
    const alerts = new Set();
    if (!this.ingest) alerts.add('no-ingest');
    else if (now - this.lastAudioAt > 3000) alerts.add('no-audio');
    else if (this.lowLevelSince && now - this.lowLevelSince > 60000) alerts.add('muted?');
    for (const e of this.engines.values()) if (e.state === 'reconnecting' || e.state === 'error') alerts.add('reconnecting');
    if (this.lat.asr > 6000) alerts.add('high-latency');
    if (Object.values(this.mtQ || {}).some((q) => q.degraded() || q.stats.quotaErrors > (q._qe ?? 0))) alerts.add('mt-throttled');
    for (const q of Object.values(this.mtQ || {})) q._qe = q.stats.quotaErrors;
    this.alerts = alerts;
  }

  log(level, msg) {
    const entry = { t: Date.now(), stage: this.id, level, msg };
    if (level === 'warn' || level === 'error') console.log(`[${this.id}] ${level}: ${msg}`);
    if (level !== 'debug') {
      this.logs.push(entry);
      if (this.logs.length > 100) this.logs.shift();
    }
    this.emit('log', entry);
  }

  status() {
    return {
      id: this.id,
      name: this.def.name,
      source: this.source || 'auto',
      detectedLang: this.detectedLang || null,
      targets: this.def.targets,
      languages: this.languages,
      mode: this.mode,
      translationDef: this.def.translation || '',
      audioLangs: this.audioLangs,
      mt: Object.fromEntries(Object.entries(this.mtQ || {}).map(([k, q]) => [k, q.stats])),
      pull: this.def.pull || '',
      talk: this.talk,
      ingest: this.ingest ? { kind: this.ingest.kind, label: this.ingest.label, since: this.ingest.since } : null,
      level: this.level,
      peak: this.peak,
      gated: this.gated,
      lastSpeechAt: this.lastSpeechAt,
      lastCaptionAt: this.lastCaptionAt || 0,
      latency: { asr: round(this.lat.asr), tr: Object.fromEntries(Object.entries(this.lat.tr).map(([k, v]) => [k, round(v)])) },
      engines: [...this.engines.values()].map((e) => e.status()),
      viewers: this.viewers,
      audioMinIn: +(this.audioMsIn / 60000).toFixed(1),
      costUsd: +this.costUsd.toFixed(3),
      alerts: [...this.alerts],
      preview: Object.fromEntries(Object.keys(this.tracks).map((ch) => [ch, (this.partial(ch) || this.history(ch, 1)[0] || {}).text || ''])),
    };
  }

  destroy() {
    clearInterval(this.tick);
    this.#stopEngines('removed');
    this.ingest?.detach?.('stage removed');
  }
}

const round = (v) => (v == null ? null : Math.round(v));
