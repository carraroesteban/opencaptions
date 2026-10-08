// A Stage = one room/escenario. Receives audio from exactly one ingest at a time,
// fans it out to one model session per target language, turns transcriptions into
// caption tracks, and keeps operational metrics (level, latency, cost, health).
import { EventEmitter } from 'node:events';
import { config } from './config.js';
import { Chunker, rms } from './audio.js';
import { CaptionTrack } from './captions.js';
import { GeminiEngine } from './engines/gemini.js';
import { MockEngine } from './engines/mock.js';
import { LocalEngine } from './engines/local.js';
import { SentenceTranslator } from './translate.js';
import { VoiceDetector } from './voice.js';

const PREROLL_CHUNKS = 6; // 600 ms kept while gated, so the first words aren't clipped
const PREROLL_MUSIC = 40; // after music: telling a voice from music takes a few seconds, so keep 4 s and send them
const EMA = (prev, v, a = 0.3) => (prev == null ? v : prev * (1 - a) + v * a);
// Gemini 3.5 Live Translate paid tier: $0.0053/min input + $0.0315/min output audio (Sept 2026 pricing page).
const USD_PER_SESSION_MIN = 0.0368;

/** "Ana Pérez, Ben Cho y Eva" → ['Ana Pérez', 'Ben Cho', 'Eva'] (agenda speaker fields list several people). */
export const speakersOf = (s) => String(s || '').split(/\s*(?:[,;&/]|\s+(?:y|and|e)\s+)\s*/).map((n) => n.trim()).filter((n) => n.length > 1 && n.length <= 60);

export class Stage extends EventEmitter {
  constructor(def, { glossary, store, schedule = null }) {
    super();
    this.setMaxListeners(0);
    this.glossary = glossary;
    this.store = store;
    this.schedule = schedule;
    this.ticks = 0;
    this.applyDef(def);
    this.engines = new Map();
    // Audio sources: the room's computer and, optionally, a backup on another output of the sound desk (another
    // computer, or the same one with a second interface). Only the active one is captioned; the backup takes over
    // by itself when the main one fails (see #failover). Each: { kind, label, since, role, token, detach, lastAudioAt, loudAt, okSince, level }.
    this.sources = { primary: null, backup: null };
    this.active = 'primary';
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
    // Phones playing the room's own sound (assistive listening, src/server.js): the room's audio as it comes in.
    this.soundListeners = new Set();
    this.logs = [];
    this.alerts = new Set();
    // Breaks: captions paused on purpose (the crew, the agenda or the vision mixer said so). Music: paused because
    // the room is playing music (src/voice.js). Either way no audio goes to the AI: nothing to caption, no cost.
    this.brk = null; // { by: 'crew'|'agenda'|'switcher', since, title, until }
    this.music = false;
    this.musicOverride = false; // the crew said "it's not music" (until the next talk)
    this.voiceInBreakMs = 0;
    this.voice = new VoiceDetector({ onChange: (s) => this.#onVoice(s) });
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
    // Local engine: Whisper only transcribes, so every caption language comes from the text translator.
    this.mode = config.engine === 'local' ? 'text' : def.translation || (config.engine === 'mock' && !process.env.TRANSLATION_MODE ? 'live' : config.translationMode);
    const foreign = src ? targets.filter((t) => t !== src) : targets;
    // Every caption language is its own track, including the talk's own language: it's a passthrough of the
    // transcription while the speaker uses it, and a translation when they switch (bilingual hosts, Q&A).
    this.transTargets = src ? [src, ...foreign] : foreign;
    const liveTargets = foreign.length ? foreign : [src || 'es'];
    this.sessionTargets = this.mode === 'text' ? liveTargets.slice(0, 1) : liveTargets;
    this.audioLangs = config.engine === 'local' ? [] : this.sessionTargets.filter((t) => this.transTargets.includes(t)); // 🎧 needs Live Translate's voice
    // Languages a viewer can pick. 'orig' = whatever is being spoken.
    this.aliases = {};
    this.languages = ['orig', ...this.transTargets];
    this.route = {}; // per caption language: 'pass' (speaker talks it) or 'mt' (translated)
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

  /** How many phones may play the room's sound at once. */
  soundMax() { return this.def.roomSoundMax ?? config.roomSoundMax; }

  channelFor(lang) {
    if (!lang || lang === 'orig') return 'orig';
    return this.aliases[lang] || (this.tracks[lang] ? lang : 'orig');
  }

  // ---------- audio in ----------
  /** The source being captioned now (the main one, or the backup while it covers), or null. */
  get ingest() { return this.sources[this.active] || this.sources[this.active === 'primary' ? 'backup' : 'primary'] || null; }

  attachIngest(info) {
    const role = info.role === 'backup' ? 'backup' : 'primary';
    this.sources[role]?.detach?.('replaced by a new ingest');
    this.sources[role] = { ...info, role, since: Date.now(), lastAudioAt: 0, loudAt: 0, okSince: 0, level: 0 };
    if (!this.sources[this.active]) this.active = role;
    this.hadIngest = true; // for alerts: a room that never had a source isn't "disconnected"
    this.log('info', `${role === 'backup' ? 'backup audio' : 'ingest'} connected: ${info.kind} ${info.label || ''}`.trim());
    this.emit('ingest');
  }

  detachIngest(info) {
    const role = Object.keys(this.sources).find((r) => this.sources[r]?.token === info.token);
    if (!role) return;
    this.log('warn', `${role === 'backup' ? 'backup audio' : 'ingest'} disconnected: ${this.sources[role].kind}`);
    this.sources[role] = null;
    if (role === this.active) {
      const other = role === 'primary' ? 'backup' : 'primary';
      if (this.sources[other]) this.#switchSource(other, `${role === 'primary' ? 'the main audio' : 'the backup'} disconnected`);
      else {
        this.level = 0;
        this.#gate('ingest disconnected');
      }
    }
    this.emit('ingest');
  }

  /** Audio from a source (its token); only the active source's audio is captioned, the other one is just measured. */
  pushAudio(buf, token = null) {
    if (this.destroyed) return;
    const src = token ? Object.values(this.sources).find((x) => x?.token === token) : this.sources[this.active];
    if (src) {
      const now = Date.now();
      src.level = rms(buf);
      src.lastAudioAt = now;
      if (src.level >= config.speechRms) { src.loudAt = now; src.okSince ||= now; } else if (now - src.loudAt > 20000) src.okSince = 0;
      if (token && src.role !== this.active) return;
    }
    this.chunker.push(buf);
  }

  #switchSource(role, why) {
    if (this.active === role) return;
    this.active = role;
    this.log('warn', role === 'backup' ? `switched to the backup audio: ${why}` : `back to the main audio: ${why}`);
    this.emit('ingest');
  }

  /**
   * The backup takes over when the main audio stops (no sound at all for 3 s) or goes silent while the backup
   * hears people (a fader pulled down, a cable out of the desk). The main one takes back over after 10 s healthy.
   */
  #failover(now) {
    const p = this.sources.primary, b = this.sources.backup;
    if (!p || !b) return;
    const dead = (x) => now - x.lastAudioAt > 3000;
    if (dead(p)) p.okSince = 0;
    if (this.active === 'primary' && !dead(b)) {
      if (dead(p)) this.#switchSource('backup', 'no audio from the main source');
      else if (now - p.loudAt > 20000 && now - b.loudAt < 2000) this.#switchSource('backup', 'the main source has been silent for 20 s while the backup hears sound');
    } else if (this.active === 'backup' && !dead(p) && p.okSince && now - p.okSince > 10000 && now - p.loudAt < 2000) {
      this.#switchSource('primary', 'it has been sending sound for 10 s');
    }
  }

  #onChunk(chunk) {
    const now = Date.now();
    const lvl = rms(chunk);
    this.level = lvl;
    this.peak = Math.max(this.peak * 0.95, lvl);
    this.lastAudioAt = now;
    this.audioMsIn += 100;
    // The room's sound, for phones that play it: everything the room hears, breaks and music included.
    if (this.soundListeners.size) this.emit('sound', chunk);
    if (config.musicGuard) this.voice.push(chunk);
    const loud = lvl >= config.speechRms;
    // On a break or during music, sound isn't speech to caption: it doesn't wake the AI up.
    const speech = loud && !this.brk && !this.music;
    if (this.brk && loud && this.voice.state === 'voice') this.voiceInBreakMs += 100;

    if (speech) {
      if (now - this.lastSpeechAt > 800) this.onset = { at: now, asr: true, tr: new Set(this.transTargets) };
      // Transcript timestamps start at the first words of the talk, not when the room/talk was created.
      if (!this.talkSpoken && this.talkSegments === 0) {
        this.talkSpoken = true;
        this.talk.startedAt = now;
        this.store.openTalk(this.id, this.#talkMeta(), this.languages);
      }
      this.lastSpeechAt = now;
      this.lowLevelSince = 0;
      if (this.gated) this.#ungate();
    } else if (lvl < 0.002) {
      this.lowLevelSince ||= now;
    } else this.lowLevelSince = 0;

    if (this.gated) {
      this.preroll.push(chunk);
      if (this.preroll.length > (this.musicWas ? PREROLL_MUSIC : PREROLL_CHUNKS)) this.preroll.shift();
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
    this.musicWas = false;
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

  // ---------- breaks and music ----------
  /**
   * A break: captions pause and screens show "Break · back at 11:30 · next talk". Set by the crew (dashboard or the
   * room's audio page), by the agenda (its breaks), or by the vision mixer (vMix/OBS switching to a break scene).
   */
  setBreak(on, { by = 'crew', title = '', until = null } = {}) {
    // Someone (the crew, the room's computer, the vision mixer) starting or ending a break during the agenda's break
    // wins for that slot, as a manual New talk does: the agenda won't pause the room again at the next quiet moment.
    if (by !== 'agenda') {
      const cur = this.schedule?.slot(this.id).current;
      if (cur?.break) this.scheduleKey = this.#slotKey(cur);
    }
    if (on) {
      if (this.brk?.by === by && this.brk.title === title) return;
      this.brk = { by, since: Date.now(), title: String(title || '').slice(0, 120), until: Number(until) || null };
      this.voiceInBreakMs = 0;
      this.#gate('break');
      this.log('info', `break started (${by})${title ? `: ${title}` : ''}`);
    } else {
      if (!this.brk) return;
      this.log('info', `break ended (${this.brk.by})`);
      this.brk = null;
    }
    this.emit('pause');
  }

  /** The crew says the room isn't playing music (a talk with a soundtrack): caption anyway, until the next talk. */
  captionMusic(on = true) {
    this.musicOverride = !!on;
    if (on && this.music) { this.music = false; this.log('info', 'music: captioning anyway (crew)'); this.emit('pause'); }
  }

  #onVoice(state) {
    const music = state === 'music' && this.def.musicGuard !== false && !this.musicOverride;
    if (music === this.music) return;
    this.music = music;
    if (music) {
      this.musicWas = true;
      this.#gate('music');
      this.log('info', 'music in the room → captions paused (no cost)');
    } else this.log('info', 'voice again → captions resume');
    this.emit('pause');
  }

  /** What viewers need to know about a pause: { brk, music }. */
  pauseInfo() {
    return {
      brk: this.brk ? { ...this.brk, next: this.nextTalk || null } : null,
      music: this.music,
    };
  }

  // ---------- engines ----------
  #ensureEngines() {
    if (this.engines.size || this.destroyed) return;
    if (this.idleClosed && this.talkSegments > 0) this.#newTalk('', true);
    this.idleClosed = false;
    const glossaryVocab = this.#vocabulary();
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
      const e = config.engine === 'gemini' ? new GeminiEngine(opts)
        : config.engine === 'local' ? new LocalEngine({ ...opts, languages: [...new Set([...this.transTargets, this.source, ...Object.keys(config.event.languages)])] })
          : new MockEngine(opts);
      e.on('input', (t) => primary && this.#onInput(t));
      e.on('interim', (t) => primary && config.useInterim && this.#onInterim(t));
      e.on('output', (t) => this.#onOutput(target, t));
      e.on('audio', (buf) => this.emit('audio', target, buf));
      e.on('turn', () => {
        if (primary) this.tracks.orig.flush();
        // Only flush a translation track that Live feeds directly; in text mode it belongs to the text
        // translator, and flushing would commit a half-sentence provisional translation (duplicates).
        const direct = this.mode === 'live' || this.route[target] === 'pass' || this.mtQ?.[target]?.degraded();
        if (direct) this.tracks[target]?.flush();
      });
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
    this.tracks.orig.push(text, { finished, lang: lang || this.curLang || this.source });
    this.#routeLang(text, finished, lang);
  }

  /**
   * The model reports a language per fragment, and a single English word ("smartphone") inside a Spanish
   * sentence must not flip every caption track. Fragments in a new language are held back (from the
   * translated tracks only; the original track already has them) until ~15 characters confirm the switch,
   * then routed as a block, so no words land in the wrong language on either side of the switch.
   */
  #routeLang(text, finished, lang) {
    const cur = this.curLang;
    const flushPending = (as) => {
      const p = this.pendingLang;
      this.pendingLang = null;
      clearTimeout(this.pendingTimer);
      if (p?.text) this.#route(p.text, false, as);
    };
    if (!lang || !cur || lang === cur) {
      if (this.pendingLang) flushPending(cur); // false alarm: it was the same language after all
      if (!cur && lang) this.curLang = lang;
      this.#route(text, finished, this.curLang || this.source);
      return;
    }
    if (this.pendingLang && this.pendingLang.lang !== lang) flushPending(cur);
    this.pendingLang ??= { lang, text: '' };
    this.pendingLang.text += text;
    clearTimeout(this.pendingTimer);
    if (this.pendingLang.text.trim().length >= 15) {
      this.log('info', `speaker switched language: ${cur} → ${lang}`);
      this.curLang = lang;
      const p = this.pendingLang;
      this.pendingLang = null;
      this.#route(p.text, finished, lang);
    } else if (finished) {
      flushPending(cur); // a short word at the end of a turn: keep the current language
    } else {
      this.pendingTimer = setTimeout(() => flushPending(this.curLang), 1500); // speaker paused
    }
  }

  #route(text, finished, spoken) {
    if (spoken) this.detectedLang = spoken;
    for (const t of this.transTargets) {
      const want = spoken && t === spoken ? 'pass' : 'mt';
      if (this.route[t] && this.route[t] !== want) this.#switchRoute(t, want);
      this.route[t] = want;
      // Same language as the speaker → the caption is the transcription itself.
      if (want === 'pass') this.#deliver(t, text, finished);
    }
    if (this.mode !== 'live') this.#mtFeed(text, finished, spoken);
  }

  /** The speaker changed language: a caption track goes from passthrough to translation or back. */
  #switchRoute(t, want) {
    const track = this.tracks[t];
    const q = this.mtQ?.[t];
    if (want === 'mt') {
      track?.flush(); // commit the passthrough text as spoken
      return;
    }
    // mt → pass: the translation of the last sentence is still on its way. Park its caption so the
    // passthrough text starts a new one, and let the translation finish into the parked caption.
    if (q && !q.degraded()) {
      q.flush();
      if (q.pending()) {
        q.detached = track?.detach() || null;
        clearTimeout(q.detachedTimer);
        q.detachedTimer = setTimeout(() => { q.detached = null; }, 10000);
        return;
      }
    }
    track?.flush();
  }

  // ---------- text translation (sentence by sentence, with provisional partials) ----------
  #mtFeed(text, finished, spoken) {
    if (config.engine === 'local' && config.localLlmOff) return; // transcription only (npm run local -- --no-llm)
    this.mtQ ??= {};
    // Bind translators to the tracks of the current talk: a translation that returns after a talk
    // rollover must land in the talk it belongs to, not in the next one.
    const tracks = this.tracks;
    for (const t of this.transTargets) {
      if (spoken && t === spoken) continue;
      if (this.mtQ[t]) { this.mtQ[t].feed(text, { finished, spoken }); continue; }
      const q = (this.mtQ[t] = new SentenceTranslator({
        from: this.source,
        to: t,
        vocabulary: this.#vocabulary(),
        onPartial: (out) => {
          if (q.detached) return; // the speaker switched to this language meanwhile
          this.#markLatency(t, out);
          tracks[t]?.replace(out, { lang: t });
        },
        onFinal: (out) => {
          this.#markLatency(t, out);
          if (q.detached) { tracks[t]?.finishDetached(q.detached, out, t); q.detached = null; clearTimeout(q.detachedTimer); return; }
          tracks[t]?.replace(out, { final: true, lang: t });
        },
        onError: (m) => this.log('warn', `translate → ${t}: ${m}`),
        // The primary Live session already translates into this language: use it while text MT is throttled.
        canFallback: () => config.engine !== 'local' && t === this.sessionTargets[0] && this.engines.get(t)?.state === 'live',
        onDegraded: (on) => {
          tracks[t]?.flush(); // don't mix a half MT sentence with Live output
          this.log(on ? 'warn' : 'info', on ? `${t}: text translation throttled → Live Translate captions` : `${t}: back to text translation`);
        },
      }));
      q.feed(text, { finished, spoken });
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
    if (this.route[target] === 'pass') return; // passthrough handles same-language speech
    this.#deliver(target, text, finished);
  }

  // ---------- captions ----------
  #buildTracks() {
    this.#flushTracks(false);
    this.tracks = {};
    const talk = this.talk;
    // Cue times = when the words were spoken, not when the model returned them: subtract the measured delay.
    const lag = (ch) => Math.min(8000, (ch === 'orig' ? this.lat.asr : this.lat.tr[ch] ?? this.lat.asr) ?? 0);
    for (const ch of ['orig', ...this.transTargets]) {
      const clock = () => Math.max(0, Date.now() - talk.startedAt - lag(ch));
      const tr = new CaptionTrack({ channel: ch, glossary: this.glossary, clock });
      tr.on('caption', (seg) => {
        if (this.speaker) seg.spk = this.speaker; // who's speaking, for labels and exports (set from the dashboard or the agenda)
        if (seg.final) this.store.append(this.id, talk.id, seg);
        if (talk !== this.talk) return; // late translation of the previous talk: stored there, not shown
        if (seg.final) this.talkSegments++;
        this.lastCaptionAt = Date.now();
        this.emit('caption', seg);
      });
      this.tracks[ch] = tr;
    }
  }

  #flushTracks(translators = true) {
    const mt = this.mtQ || {};
    if (translators) for (const q of Object.values(mt)) q.flush();
    for (const [ch, t] of Object.entries(this.tracks || {})) {
      // Its final translation is on the way and will replace the provisional one (same caption id);
      // flushing now would store the provisional text as a second, duplicate final.
      if (mt[ch]?.pending() && !mt[ch].degraded()) continue;
      t.flush();
    }
  }

  /** Operator action from the dashboard: also tells the agenda not to rename this slot's talk. */
  newTalk(title = '', speaker = '') {
    if (this.brk) this.setBreak(false);
    this.musicOverride = false;
    this.#newTalk(title, true, speaker);
    this.talkSpoken = true; // an operator started it now: timestamps count from this moment (e.g. video subtitling)
    this.#markScheduleHandled();
  }

  /** Spend so far: the Live sessions plus every translator's text requests. */
  totalCost() { return this.costUsd + Object.values(this.mtQ || {}).reduce((a, q) => a + (q.stats.usd || 0), 0); }

  /**
   * Per-talk numbers for the event report (GET /api/report): peak audience, viewer-minutes and cost. Kept on the
   * talk itself, so store.openTalk saves them in its meta.json (every minute, and when the talk ends).
   */
  #countTalk(now) {
    const t = this.talk;
    if (!t) return;
    const dt = Math.min(5000, now - (t._at || now));
    t._at = now;
    t.peakViewers = Math.max(t.peakViewers || 0, this.viewers);
    t.viewerMs = (t.viewerMs || 0) + this.viewers * dt;
    t.costUsd = +Math.max(0, this.totalCost() - (t._costAt0 ?? this.totalCost())).toFixed(4);
    if (now - (t._savedAt || 0) > 60_000 && this.talkSegments > 0) { t._savedAt = now; this.store.openTalk(this.id, this.#talkMeta(), this.languages); }
  }
  /** The talk as saved: without the counters' internal bookkeeping. */
  #talkMeta() {
    const { _at, _costAt0, _savedAt, ...meta } = this.talk;
    return meta;
  }

  #newTalk(title, announce, speaker = '') {
    if (this.talk && this.talkSegments > 0) { this.#countTalk(Date.now()); this.store.openTalk(this.id, this.#talkMeta(), this.languages); } // final numbers of the talk that ends
    this.#flushTracks();
    this.talk = { id: new Date().toISOString().replace(/[:.]/g, '-'), title, speaker, startedAt: Date.now() };
    this.speaker = speakersOf(speaker)[0] || ''; // the agenda's first speaker, until the crew picks another
    this.talkSegments = 0;
    this.talkSpoken = false;
    this.#buildTracks();
    this.mtQ = {}; // new translators bind to the new tracks; old ones finish into the old talk
    this.talk._costAt0 = this.totalCost(); // after the translators reset: this talk's cost starts here
    this.route = {};
    this.curLang = null; // the next talk may be in another language
    this.pendingLang = null;
    clearTimeout(this.pendingTimer);
    this.store.openTalk(this.id, this.#talkMeta(), this.languages);
    if (announce) {
      this.log('info', `new talk started ${title ? `"${title}"` : ''}`.trim());
      this.emit('talk');
      this.#refreshVocabulary();
    }
  }

  /**
   * Who is speaking now (the crew picks it on the dashboard: a speaker from the agenda, the host, the audience in
   * Q&A…). New captions carry it, so phones, transcripts and exports can say who said what. '' = no label.
   * Gemini Live doesn't tell voices apart, so this is set by people, not detected.
   */
  setSpeaker(name) {
    this.speaker = String(name || '').replace(/[\p{Cc}<>]/gu, '').trim().slice(0, 60);
    this.log('info', this.speaker ? `speaker: ${this.speaker}` : 'speaker label cleared');
    this.emit('speaker');
  }

  setTitle(title, speaker, { manual = true } = {}) {
    this.talk.title = title;
    if (speaker !== undefined && speaker !== this.talk.speaker) {
      this.talk.speaker = speaker;
      this.speaker = speakersOf(speaker)[0] || '';
    }
    this.store.openTalk(this.id, this.#talkMeta(), this.languages);
    this.emit('title'); // same talk, new name: viewers keep their captions
    this.#refreshVocabulary();
    if (manual) this.#markScheduleHandled();
  }

  /**
   * Glossary + room vocabulary + names from the agenda: the current and next talk's title and speakers.
   * The host introduces the next speaker before their slot, so their name is included too. Helps the
   * recognizer spell names and keeps the translator from translating them.
   */
  #vocabulary() {
    const terms = [];
    for (const t of [this.talk, this.nextTalk]) {
      if (!t) continue;
      if (t.title) terms.push(t.title.slice(0, 100));
      for (const n of String(t.speaker || '').split(/\s*(?:[,;&/]|\s+(?:y|and|e)\s+)\s*/)) if (n.length > 1 && n.length <= 60) terms.push(n);
    }
    return this.glossary.vocabulary([...(this.def.vocabulary || []), ...terms]);
  }
  #refreshVocabulary() {
    const v = this.#vocabulary();
    for (const q of Object.values(this.mtQ || {})) q.vocabulary = v; // live sessions pick it up at their next (re)connect
  }

  // ---------- agenda (src/schedule.js) ----------
  #slotKey(e) { return e ? `${e.start}|${e.title}` : null; }
  #markScheduleHandled() { this.scheduleKey = this.#slotKey(this.schedule?.slot(this.id).current); this.dueTalk = null; }

  /**
   * Name talks from the agenda. The first words of a slot get its title; when a new slot starts while the
   * previous talk is still running, we wait for a pause (silence gate) so an overrunning talk isn't split.
   */
  #applySchedule(now) {
    if (!this.schedule) return;
    const { current, next, nextTalk } = this.schedule.slot(this.id, now);
    this.nextTalk = nextTalk ? { title: nextTalk.title, speaker: nextTalk.speaker, start: nextTalk.start } : null;
    const key = this.#slotKey(current);
    // A break in the agenda (coffee, lunch…): pause captions and show it, once the room is quiet (a talk running
    // over is never cut). It ends when the next talk's slot starts, or when someone speaks for a while.
    if (current?.break) {
      this.dueTalk = null;
      if (key !== this.scheduleKey && !this.brk && (this.gated || !this.engines.size || this.talkSegments === 0)) {
        this.scheduleKey = key;
        this.setBreak(true, { by: 'agenda', title: current.title, until: next?.start || null });
      }
      return;
    }
    if (this.brk?.by === 'agenda') this.setBreak(false, { by: 'agenda' });
    // The agenda says a new talk has started but the room hasn't switched yet (the speaker is running over):
    // the dashboard shows it and offers to start it with one click.
    this.dueTalk = current && key !== this.scheduleKey && this.talkSegments > 0 && this.talk.title ? { title: current.title, speaker: current.speaker, start: current.start } : null;
    if (!current || key === this.scheduleKey) return;
    if (this.talkSegments === 0 || !this.talk.title) {
      // Nothing said yet, or an unnamed talk in progress: just name it.
      this.setTitle(current.title, current.speaker, { manual: false });
      this.scheduleKey = key;
      this.log('info', `agenda: talk is "${current.title}"`);
    } else if ((this.gated || !this.engines.size) && now - current.start < 45 * 60_000) {
      this.#newTalk(current.title, true, current.speaker);
      this.scheduleKey = key;
      this.log('info', `agenda: new talk "${current.title}"`);
    }
  }

  /**
   * A person fixes a caption of the talk in progress (a misheard name, a wrong number): every screen and phone
   * replaces it in place (same id), and the transcript keeps the corrected text.
   */
  correct(channel, id, text) {
    const tr = this.tracks[channel];
    const i = tr ? tr.finals.findIndex((x) => x.id === id) : -1;
    if (i < 0) return null;
    const seg = { ...tr.finals[i], text, edited: true };
    tr.finals[i] = seg;
    this.store.append(this.id, this.talk.id, seg);
    this.log('info', `caption corrected (${channel}): "${text.slice(0, 60)}"`);
    this.emit('caption', seg);
    return seg;
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
    this.#failover(now);
    if (this.ticks++ % 15 === 0) this.#applySchedule(now);
    this.#countTalk(now);
    // Cost: every open session is billed for streamed audio (input + generated output).
    if (this.engines.size && !this.gated && config.engine !== 'local') this.costUsd += (USD_PER_SESSION_MIN / 60) * this.engines.size;

    // Stall watchdog: people are talking but a session produced nothing for a while → reconnect it.
    const primary = this.engines.get(this.sessionTargets[0]);
    if (primary?.state === 'live' && this.speechMsNoInput > 20000) {
      this.log('warn', 'no transcription for 20s of speech → restarting session');
      this.speechMsNoInput = 0;
      primary.restart('stall');
    }
    for (const [t, e] of this.engines) {
      if (this.mode !== 'live' || !this.transTargets.includes(t) || this.route[t] === 'pass') continue;
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

    // The room's "pause for music" was just turned off: let the music be captioned now.
    if (this.music && this.def.musicGuard === false) { this.music = false; this.emit('pause'); }

    // Someone has been speaking during an agenda break (the host, a talk starting early): captions come back.
    // A break the crew or the vision mixer set stays, but the dashboard asks.
    if (this.brk?.by === 'agenda' && this.voiceInBreakMs > 8000) {
      this.log('info', 'people speaking during the break → captions resume');
      this.setBreak(false, { by: 'agenda' });
    }

    // Alerts for the production team.
    const alerts = new Set();
    if (this.brk && this.voiceInBreakMs > 20000) alerts.add('voice-in-break');
    if (this.active === 'backup' && this.sources.backup) alerts.add('on-backup');
    if (!this.ingest) alerts.add('no-ingest');
    else if (now - this.lastAudioAt > 3000) alerts.add('no-audio');
    else if (this.lowLevelSince && now - this.lowLevelSince > 60000) alerts.add('muted?');
    for (const e of this.engines.values()) {
      if (e.state === 'reconnecting' || ((e.state === 'connecting' || e.state === 'resuming') && now - (e.stateSince || now) > 10000)) alerts.add('reconnecting');
    }
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
      loop: !!this.def.loop,
      musicGuard: this.def.musicGuard !== false,
      roomSound: !!this.def.roomSound,
      roomSoundMax: this.soundMax(),
      roomSoundListeners: this.soundListeners.size,
      talk: this.talk,
      nextTalk: this.nextTalk || null,
      dueTalk: this.dueTalk || null,
      speaker: this.speaker || '',
      speakers: speakersOf(this.talk?.speaker),
      ingest: this.ingest ? { kind: this.ingest.kind, label: this.ingest.label, since: this.ingest.since, role: this.ingest.role } : null,
      backup: this.sources.backup ? { kind: this.sources.backup.kind, label: this.sources.backup.label, since: this.sources.backup.since, active: this.active === 'backup', level: this.sources.backup.level } : null,
      level: this.level,
      peak: this.peak,
      gated: this.gated,
      brk: this.brk,
      music: this.music,
      musicOverride: this.musicOverride,
      sound: this.voice.state, // what the room sounds like: voice, music, quiet
      lastSpeechAt: this.lastSpeechAt,
      lastCaptionAt: this.lastCaptionAt || 0,
      latency: { asr: round(this.lat.asr), tr: Object.fromEntries(Object.entries(this.lat.tr).map(([k, v]) => [k, round(v)])) },
      engines: [...this.engines.values()].map((e) => e.status()),
      viewers: this.viewers,
      audioMinIn: +(this.audioMsIn / 60000).toFixed(1),
      costUsd: +(this.costUsd + Object.values(this.mtQ || {}).reduce((a, q) => a + (q.stats.usd || 0), 0)).toFixed(3),
      costLiveUsd: +this.costUsd.toFixed(3),
      alerts: [...this.alerts],
      preview: Object.fromEntries(Object.keys(this.tracks).map((ch) => [ch, (this.partial(ch) || this.history(ch, 1)[0] || {}).text || ''])),
    };
  }

  destroy() {
    this.destroyed = true;
    clearTimeout(this.pendingTimer);
    this.emit('removed');
    clearInterval(this.tick);
    this.#stopEngines('removed');
    for (const src of Object.values(this.sources)) src?.detach?.('stage removed');
  }
}

const round = (v) => (v == null ? null : Math.round(v));
