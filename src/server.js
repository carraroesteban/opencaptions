// OpenCaptions server: HTTP API + static UIs + WebSockets for ingest, viewers and the production dashboard.
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import express from 'express';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';
import { config, normalizeStage, ROOT, langName, setEngine } from './config.js';
import { Failover } from './failover.js';
import { checkKey, saveKey, keyInfo, looksLikeKey, readSecret, saveSecret } from './aikey.js';
import { Tunnel, tunnelOrigin } from './tunnel.js';
import { resetClient } from './genai.js';
import { Glossary } from './glossary.js';
import { Stage } from './stage.js';
import { Store, toSRT, toVTT, toTXT } from './store.js';
import { PullSource } from './pull.js';
import { systemStats } from './system.js';
import { summarize, ask, audienceAiEnabled, assistStats } from './assist.js';
import { Schedule, parseSchedule } from './schedule.js';
import { History } from './history.js';
import { asrInfo, asrReachable } from './local/asr.js';
import { llmInfo, llmHealth, chat as localChat } from './local/llm.js';
import { authMode, tokens, canAdmin, canIngest, noteAuthFailure, securityHeaders, apiRateLimit, originAllowed, wsAllowed, checkPullUrl, clientIp } from './security.js';

const MAX_STAGES = Number(process.env.MAX_STAGES || 60);
const MAX_VIEWERS = Number(process.env.MAX_VIEWERS || 5000);
const LANG_RE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;

const glossary = new Glossary();
const schedule = new Schedule();
const store = new Store(config.dataDir, { enabled: config.storeTranscripts, retentionDays: config.retentionDays });
const stages = new Map();
const pulls = new Map();
const admins = new Set();
const STAGES_FILE = path.join(config.dataDir, 'stages.json');

// ---------------- stages ----------------
function persistStages() {
  const defs = [...stages.values()].map((s) => s.def);
  fs.writeFileSync(STAGES_FILE, JSON.stringify(defs, null, 2));
}

/** Reject malformed room definitions coming from the API (ids end up in URLs, file names and metrics). */
function validateStage(def) {
  if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(def.id) || def.id === 'undefined') throw new Error('id: 1-40 chars, a-z 0-9 _ -');
  if (String(def.name).length > 80 || String(def.title).length > 200) throw new Error('name/title too long');
  if (def.source !== 'auto' && !LANG_RE.test(def.source)) throw new Error(`invalid source language ${def.source}`);
  if (!def.targets.length || def.targets.length > 8 || !def.targets.every((t) => LANG_RE.test(t))) throw new Error('targets: 1-8 language codes');
  if (def.translation && !['text', 'live', 'hybrid'].includes(def.translation)) throw new Error('translation must be text|live|hybrid');
  if (!Array.isArray(def.vocabulary) || def.vocabulary.length > 500) throw new Error('vocabulary: up to 500 terms');
}

function addStage(def) {
  def = normalizeStage(def);
  validateStage(def);
  if (stages.has(def.id)) throw new Error(`stage ${def.id} exists`);
  if (stages.size >= MAX_STAGES) throw new Error(`MAX_STAGES (${MAX_STAGES}) reached`);
  const st = new Stage(def, { glossary, store, schedule });
  st.on('log', (entry) => broadcastAdmin({ type: 'log', ...entry }));
  stages.set(def.id, st);
  if (def.pull) startPull(st, def.pull, def.loop);
  return st;
}

function removeStage(id) {
  const st = stages.get(id);
  if (!st) return;
  stopPull(id);
  st.destroy();
  stages.delete(id);
}

function startPull(st, url, loop, opts = {}) {
  stopPull(st.id);
  pulls.set(st.id, new PullSource(st, url, { loop, ...opts }));
}

function stopPull(id) {
  pulls.get(id)?.stop();
  pulls.delete(id);
}

let initial = config.event.stages;
// Stages edited from the dashboard are persisted in data/stages.json; they win only if newer than event.json.
const eventFile = path.resolve(ROOT, process.env.EVENT_CONFIG || 'config/event.json');
if (!process.env.STAGES && fs.existsSync(STAGES_FILE) && fs.statSync(STAGES_FILE).mtimeMs > fs.statSync(eventFile).mtimeMs) {
  try { initial = JSON.parse(fs.readFileSync(STAGES_FILE, 'utf8')); } catch { /* use config */ }
}
fs.mkdirSync(config.dataDir, { recursive: true });
for (const def of initial) addStage(def);

// First-run setup (the dashboard's welcome wizard): what the organizer chose is kept in data/setup.json.
const SETUP_FILE = path.join(config.dataDir, 'setup.json');
const setup = (() => { try { return JSON.parse(fs.readFileSync(SETUP_FILE, 'utf8')); } catch { return { done: false }; } })();
if (setup.name) Object.assign(config.event, { name: setup.name, named: true });
function saveSetup(patch) {
  Object.assign(setup, patch, { updatedAt: new Date().toISOString() });
  fs.writeFileSync(SETUP_FILE, JSON.stringify(setup, null, 2));
}

// Every setup change is recorded with what it replaced, so it can be undone (src/history.js).
const history = new History(path.join(config.dataDir, 'history.jsonl'));
const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
const recordChange = (c) => { const e = history.record(c); broadcastAdmin({ type: 'history', change: { ...e, before: undefined, after: undefined } }); return e; };

// ---------------- http ----------------
const app = express();
app.disable('x-powered-by');
// Behind a tunnel / reverse proxy on this machine, trust its X-Forwarded-* headers (for req.secure / req.ip).
app.set('trust proxy', process.env.TRUST_PROXY || 'loopback');
app.use(securityHeaders);
app.use('/api', apiRateLimit);
app.use(express.json({ limit: '256kb' }));

const reqUrl = (req) => new URL(req.originalUrl, 'http://x');
const admin = (req, res, next) => {
  if (canAdmin(req, reqUrl(req))) return next();
  if (!noteAuthFailure(req)) return res.set('Retry-After', '600').status(429).json({ error: 'too many failed attempts' });
  res.status(401).json({ error: 'admin token required' });
};
const getStage = (req, res, next) => {
  req.stage = stages.get(req.params.id);
  return req.stage ? next() : res.status(404).json({ error: 'unknown stage' });
};
// This computer's address on the venue network (not in Docker, where it would be the container's own).
const lanUrl = () => {
  if (process.env.OC_DOCKER || !['0.0.0.0', '::'].includes(config.host)) return '';
  const ip = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
  return ip ? `${tls ? 'https' : 'http'}://${ip}:${config.port}` : '';
};
// The address QR codes and shared links use: PUBLIC_URL / the public tunnel, else the address the page was opened
// with, except "localhost", which no phone can open: then this computer's address on the Wi-Fi.
const publicUrl = (req) => {
  if (config.publicUrl) return config.publicUrl;
  const host = req.get('host') || '';
  if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host)) { const lan = lanUrl(); if (lan) return lan; }
  return `${req.protocol}://${host}`;
};
// Event mode: while the event is live, the setup (rooms, agenda, glossary, event name, undo) is locked on the
// server, whatever the page sends. Live operations (next talk, restart a room, the AI switch) keep working.
const LOCKED = { error: 'Event mode is on: the setup is locked. Turn it off in Settings to change it.', locked: true };
const unlocked = (req, res, next) => (setup.locked ? res.status(423).json(LOCKED) : next());

app.get('/healthz', (req, res) => {
  const sys = systemStats();
  res.json({ ok: true, stages: stages.size, engine: config.engine, cpuPct: sys.cpuPct, rssMB: sys.rssMB, loopLagP99Ms: sys.loopLagMs.p99 });
});

app.get('/api/event', (req, res) => {
  res.json({
    name: config.event.name,
    accent: config.event.accent,
    publicUrl: publicUrl(req),
    languages: config.event.languages,
    audienceAi: audienceAiEnabled,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    publicTranscripts: PUBLIC_TRANSCRIPTS,
    stages: [...stages.values()].map((s) => ({
      id: s.id,
      name: s.def.name,
      title: s.talk.title,
      speaker: s.talk.speaker || '',
      next: s.nextTalk || null,
      talk: s.talk.id,
      source: s.source || 'auto',
      detectedLang: s.detectedLang || null,
      languages: s.languages,
      live: s.engines.size > 0 && !s.gated,
    })),
  });
});

app.get('/api/status', admin, (req, res) => res.json(snapshot()));

app.post('/api/stages', admin, unlocked, async (req, res) => {
  try {
    if (req.body?.pull) await checkPullUrl(req.body.pull);
    const st = addStage(req.body || {});
    persistStages();
    const change = recordChange({ kind: 'room.create', target: st.id, summary: `Room "${st.def.name}" created`, after: clone(st.def) });
    res.json({ ...st.status(), change: change.id });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.patch('/api/stages/:id', admin, getStage, async (req, res) => {
  const st = req.stage;
  const b = req.body || {};
  const def = normalizeStage({ ...st.def, ...b, id: st.id });
  try {
    validateStage(def);
    if (b.pull) await checkPullUrl(b.pull);
  } catch (e) { return res.status(400).json({ error: e.message }); }
  const old = st.def;
  const setupKeys = Object.keys(b).filter((k) => k !== 'title');
  if (setup.locked && setupKeys.length) return res.status(423).json(LOCKED);
  // Only a real change touches the room: saving the dialog must not restart audio or clear viewers' screens.
  if ('title' in b && (b.title || '') !== (st.talk.title || '')) st.setTitle(b.title || '');
  const langsChanged = def.source !== old.source || def.targets.join() !== old.targets.join() || def.translation !== old.translation;
  if (langsChanged) st.reconfigure(def);
  else st.def = def;
  const pullChanged = ('pull' in b && (b.pull || '') !== (old.pull || '')) || ('loop' in b && !!b.loop !== !!old.loop);
  if (pullChanged) {
    if (def.pull) startPull(st, def.pull, def.loop); else stopPull(st.id);
  }
  persistStages();
  const change = setupKeys.length && JSON.stringify(old) !== JSON.stringify(st.def) ? recordChange({ kind: 'room.update', target: st.id, summary: `Room "${st.def.name}" changed`, before: clone(old), after: clone(st.def) }) : null;
  res.json({ ...st.status(), change: change?.id ?? null });
});

/** Delete a room: its setup goes to the trash (history), its transcripts stay on disk. */
function deleteRoom(st, extra = {}) {
  const def = clone(st.def);
  removeStage(st.id);
  persistStages();
  return recordChange({ kind: 'room.delete', target: def.id, summary: `Room "${def.name}" deleted`, before: def, ...extra });
}
app.delete('/api/stages/:id', admin, unlocked, getStage, (req, res) => {
  res.json({ ok: true, change: deleteRoom(req.stage).id });
});

app.post('/api/stages/:id/talk', admin, getStage, (req, res) => {
  req.stage.newTalk(String(req.body?.title || '').slice(0, 200), String(req.body?.speaker || '').slice(0, 120));
  res.json(req.stage.status());
});

// Demo / testing: the server pulls a YouTube video's audio in real time from `start` seconds, while the
// demo page plays the same video in the browser — so you can compare speech and captions side by side.
app.post('/api/stages/:id/youtube', admin, getStage, async (req, res) => {
  const url = String(req.body?.url || '');
  const start = Math.max(0, Number(req.body?.start || 0));
  try { await checkPullUrl(url, { httpOnly: true }); } catch (e) { return res.status(400).json({ error: e.message }); }
  try {
    startPull(req.stage, url, false, { via: 'ytdlp', start, realtime: true, once: true, label: `YouTube ${url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40)} @${start}s` });
    // Answer only once audio is actually flowing, so the demo page starts the video in sync.
    const pull = pulls.get(req.stage.id);
    await Promise.race([pull.firstData, new Promise((_, rej) => setTimeout(() => rej(new Error('no audio after 25 s (yt-dlp too slow or blocked?)')), 25000))]);
    res.json({ ok: true, start });
  } catch (e) {
    stopPull(req.stage.id);
    req.stage.log('error', `youtube: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/stages/:id/pull', admin, getStage, (req, res) => {
  stopPull(req.stage.id);
  res.json({ ok: true });
});
app.post('/api/stages/:id/pull/stop', admin, getStage, (req, res) => { // sendBeacon-friendly
  stopPull(req.stage.id);
  res.json({ ok: true });
});

app.post('/api/stages/:id/restart', admin, getStage, (req, res) => {
  req.stage.restartEngines();
  res.json({ ok: true });
});

// Transcripts: PUBLIC_TRANSCRIPTS=current (default) lets the audience read/download the talk in progress;
// listing and past talks need the admin token. 'all' makes every talk public (typical for public
// conferences that publish their videos anyway), 'none' makes all admin-only.
const PUBLIC_TRANSCRIPTS = (process.env.PUBLIC_TRANSCRIPTS || config.event.publicTranscripts || 'current').toLowerCase();
const isCurrent = (st, talkId) => !talkId || talkId === st.talk.id;
const canReadTalk = (req, st, talkId) => PUBLIC_TRANSCRIPTS === 'all' || (PUBLIC_TRANSCRIPTS === 'current' && isCurrent(st, talkId)) || canAdmin(req, reqUrl(req));
const talkAccess = (req, res, next) => (canReadTalk(req, req.stage, req.query.talk || req.params.talk) ? next() : admin(req, res, next));
const listAccess = (req, res, next) => (PUBLIC_TRANSCRIPTS === 'all' ? next() : admin(req, res, next));

/** All final segments of a talk: from disk, or from memory when STORE_TRANSCRIPTS=false (current talk only). */
function talkSegs(st, talkId) {
  const id = talkId || st.talk.id;
  if (store.enabled) return store.readTalk(st.id, id);
  if (id !== st.talk.id) return [];
  return Object.keys(st.tracks).flatMap((ch) => st.history(ch, 5000)).sort((a, b) => a.start - b.start);
}
function talkInfo(st, talkId) {
  const id = talkId || st.talk.id;
  const live = id === st.talk.id;
  const meta = live ? { stage: st.id, ...st.talk, languages: st.languages } : store.listTalks(st.id).find((t) => t.id === id);
  if (!meta) return null;
  const segs = talkSegs(st, id);
  const durationMs = segs.reduce((m, x) => Math.max(m, x.end || 0), 0);
  const channels = [...new Set(segs.map((x) => x.channel))];
  return { stage: st.id, stageName: st.def.name, id, title: meta.title || '', speaker: meta.speaker || '', startedAt: meta.startedAt, languages: meta.languages || st.languages, channels, segments: segs.filter((x) => x.channel === 'orig').length, durationMs, live: live && st.engines.size > 0 && !st.gated, current: live };
}

app.get('/api/stages/:id/talks', getStage, listAccess, (req, res) => res.json(store.listTalks(req.params.id)));

// Public library of talks (what the audience may read): used by /talks.html.
app.get('/api/talks', (req, res) => {
  const all = PUBLIC_TRANSCRIPTS === 'all' || canAdmin(req, reqUrl(req));
  if (PUBLIC_TRANSCRIPTS === 'none' && !all) return res.status(401).json({ error: 'admin token required' });
  const out = [];
  for (const st of stages.values()) {
    const ids = all ? store.listTalks(st.id).map((t) => t.id) : [];
    if (!ids.includes(st.talk.id)) ids.unshift(st.talk.id);
    for (const id of ids) {
      const info = talkInfo(st, id);
      if (info && info.segments > 0) out.push(info);
    }
  }
  out.sort((a, b) => b.startedAt - a.startedAt);
  res.json({ publicTranscripts: PUBLIC_TRANSCRIPTS, talks: out });
});

app.get('/api/stages/:id/talks/:talk', getStage, talkAccess, (req, res) => {
  const info = talkInfo(req.stage, req.params.talk === 'current' ? null : req.params.talk);
  return info ? res.json(info) : res.status(404).json({ error: 'unknown talk' });
});

app.get('/api/stages/:id/export.:fmt', getStage, talkAccess, (req, res) => {
  const st = req.stage;
  const talkId = req.query.talk || st.talk.id;
  if (!isCurrent(st, talkId) && !talkInfo(st, talkId)) return res.status(404).json({ error: 'unknown talk' });
  const channel = st.channelFor(req.query.lang);
  const all = talkSegs(st, talkId);
  const segs = all.filter((s) => s.channel === channel);
  const fmt = req.params.fmt;
  const name = `${st.id}-${talkId}-${req.query.lang || 'orig'}.${fmt}`;
  res.set('Content-Disposition', `${req.query.inline ? 'inline' : 'attachment'}; filename="${name}"`);
  if (fmt === 'srt') return res.type('application/x-subrip').send(toSRT(segs));
  if (fmt === 'vtt') return res.type('text/vtt').send(toVTT(segs));
  if (fmt === 'txt') return res.type('text/plain').send(toTXT(segs));
  if (fmt === 'json') return res.json(all);
  res.status(400).json({ error: 'fmt must be srt|vtt|txt|json' });
});

// ---- audience AI: "what did I miss?" summaries and questions about the talk (see src/assist.js) ----
const LANG_OK = (l) => /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(l || '');
app.get('/api/stages/:id/summary', getStage, talkAccess, async (req, res) => {
  const st = req.stage;
  const talkId = req.query.talk || st.talk.id;
  const lang = LANG_OK(req.query.lang) ? req.query.lang : (st.source || 'en');
  const scope = req.query.scope === 'recent' ? 'recent' : 'full';
  const info = talkInfo(st, talkId);
  if (!info) return res.status(404).json({ error: 'unknown talk' });
  const out = await summarize({ segs: talkSegs(st, talkId), key: `${st.id}/${talkId}`, lang, scope, live: info.current, title: info.title });
  res.set('Cache-Control', 'no-store').json(out);
});

app.post('/api/stages/:id/ask', getStage, async (req, res) => {
  const st = req.stage;
  const talkId = req.body?.talk || st.talk.id;
  if (!canReadTalk(req, st, talkId)) return res.status(401).json({ error: 'admin token required' });
  const lang = LANG_OK(req.body?.lang) ? req.body.lang : 'en';
  const info = talkInfo(st, talkId);
  if (!info) return res.status(404).json({ error: 'unknown talk' });
  try {
    res.json(await ask({ segs: talkSegs(st, talkId), lang, question: req.body?.question, clientKey: clientIp(req), title: info.title }));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.status ? e.message : 'internal error' });
  }
});

// Agenda: names talks automatically (see src/schedule.js). Public read = the event's program.
app.get('/api/setup', admin, (req, res) => {
  res.json({
    done: !!setup.done,
    locked: !!setup.locked,
    name: config.event.name,
    named: config.event.named,
    languages: config.event.languages,
    defaultTargets: config.event.defaultTargets,
    stages: [...stages.values()].map((s) => ({ id: s.id, name: s.def.name, source: s.def.source, targets: s.def.targets })),
    engine: config.engine,
    primaryEngine: config.primaryEngine,
    failover: failover?.status() || null,
    ai: keyInfo(),
    tunnel: tunnel.status(),
    tunnelTokenSaved: !!readSecret('tunnelToken'),
    publicUrlSource: configuredPublicUrl ? 'config' : tunnel.status().state === 'on' ? 'tunnel' : 'auto',
    lanUrl: lanUrl(),
    port: config.port,
    publicUrl: publicUrl(req),
  });
});
app.put('/api/setup', admin, (req, res) => {
  const b = req.body || {};
  const patch = {};
  if ('name' in b) {
    if (setup.locked) return res.status(423).json(LOCKED);
    const name = String(b.name || '').trim().slice(0, 80);
    if (!name) return res.status(400).json({ error: 'name required' });
    if (name !== config.event.name) patch.change = recordChange({ kind: 'event.rename', summary: `Event renamed to "${name}"`, before: config.event.name, after: name }).id;
    patch.name = config.event.name = name;
    config.event.named = true;
  }
  if ('done' in b) patch.done = !!b.done;
  const change = patch.change ?? null;
  delete patch.change;
  saveSetup(patch);
  res.json({ ok: true, done: !!setup.done, name: config.event.name, change });
});

// Event mode on/off. Turning it off is deliberate (the dashboard asks first) and both are recorded.
app.post('/api/lock', admin, (req, res) => {
  const locked = !!req.body?.locked;
  if (locked !== !!setup.locked) {
    saveSetup({ locked });
    recordChange({ kind: 'event.lock', summary: locked ? 'Event mode on: setup locked' : 'Event mode off: setup unlocked', before: !locked, after: locked });
  }
  res.json({ locked: !!setup.locked });
});

app.get('/api/history', admin, (req, res) => {
  res.json({ locked: !!setup.locked, changes: history.recent({ limit: Math.min(500, Number(req.query.limit) || 200) }), trash: history.trash((id) => stages.has(id)) });
});

// Undo one change: put back what it replaced. The undo is recorded too (and can itself be undone).
app.post('/api/history/:id/undo', admin, unlocked, async (req, res) => {
  const c = history.get(Number(req.params.id));
  if (!c) return res.status(404).json({ error: 'unknown change' });
  if (history.undone.has(c.id)) return res.status(409).json({ error: 'already undone' });
  const undo = { undoes: c.id };
  try {
    if (c.kind === 'room.create') {
      const st = stages.get(c.target);
      if (!st) throw new Error('that room no longer exists');
      deleteRoom(st, { ...undo, summary: `Undo: room "${st.def.name}" removed again` });
    } else if (c.kind === 'room.delete') {
      if (stages.has(c.target)) throw new Error(`a room with the id "${c.target}" already exists`);
      const st = addStage(c.before);
      persistStages();
      recordChange({ kind: 'room.create', target: st.id, summary: `Room "${st.def.name}" restored`, after: clone(st.def), ...undo });
    } else if (c.kind === 'room.update') {
      const st = stages.get(c.target);
      if (!st) throw new Error('that room no longer exists');
      const old = clone(st.def);
      const def = normalizeStage({ ...c.before, id: st.id });
      validateStage(def);
      if (def.source !== old.source || def.targets.join() !== old.targets.join() || def.translation !== old.translation) st.reconfigure(def); else st.def = def;
      if ((def.pull || '') !== (old.pull || '') || !!def.loop !== !!old.loop) { if (def.pull) startPull(st, def.pull, def.loop); else stopPull(st.id); }
      persistStages();
      recordChange({ kind: 'room.update', target: st.id, summary: `Room "${def.name}" put back as before`, before: old, after: clone(def), ...undo });
    } else if (c.kind === 'agenda.set') {
      const before = schedule.entries.map((e) => ({ ...e }));
      schedule.set(c.before || []);
      recordChange({ kind: 'agenda.set', summary: `Agenda put back (${(c.before || []).length} talks)`, before, after: clone(c.before), ...undo });
    } else if (c.kind === 'glossary.set') {
      const before = clone(glossary.data);
      glossary.set(c.before);
      recordChange({ kind: 'glossary.set', summary: 'Glossary put back', before, after: clone(glossary.data), ...undo });
    } else if (c.kind === 'event.rename') {
      const before = config.event.name;
      saveSetup({ name: (config.event.name = c.before) });
      recordChange({ kind: 'event.rename', summary: `Event renamed back to "${c.before}"`, before, after: c.before, ...undo });
    } else if (c.kind === 'engine.mode') {
      if (!failover) throw new Error('the offline backup is not available');
      failover.setMode(c.before);
      recordChange({ kind: 'engine.mode', summary: `AI mode back to ${c.before}`, before: c.after, after: c.before, ...undo });
    } else {
      throw new Error('this change cannot be undone');
    }
  } catch (e) { return res.status(400).json({ error: e.message }); }
  res.json({ ok: true });
});

// Offline backup: which engine the rooms use (auto | cloud | local). Only with Gemini as the main engine.
app.post('/api/engine', admin, (req, res) => {
  if (!failover) return res.status(400).json({ error: 'the offline backup needs Gemini as the main engine (see docs/local.md)' });
  const before = failover.mode;
  try { failover.setMode(String(req.body?.mode || '')); } catch (e) { return res.status(400).json({ error: e.message }); }
  const change = failover.mode !== before ? recordChange({ kind: 'engine.mode', summary: `AI mode: ${failover.mode}`, before, after: failover.mode }) : null;
  res.json({ ...failover.status(), change: change?.id ?? null });
});

// Gemini API key from the dashboard (src/aikey.js): check it with Google, save it, remove it. The key itself is
// never sent back. Saving works in Event mode too (a key out of quota mid-event must be replaceable).
app.post('/api/ai/key/check', admin, async (req, res) => {
  const key = String(req.body?.key || '').trim();
  if (!looksLikeKey(key)) return res.status(400).json({ ok: false, code: 'format' });
  res.json(await checkKey(key));
});
app.put('/api/ai/key', admin, async (req, res) => {
  const key = String(req.body?.key || '').trim();
  if (!looksLikeKey(key)) return res.status(400).json({ ok: false, code: 'format', error: 'That doesn\'t look like a Gemini API key (they start with "AIza")' });
  const check = req.body?.force ? { ok: true, code: 'unchecked' } : await checkKey(key);
  if (!check.ok) return res.status(400).json({ ...check, error: `Google didn't accept the key (${check.code})` });
  saveKey(key);
  Object.assign(config, { geminiApiKey: key, keySource: 'dashboard' });
  useKeyChange(`Gemini API key saved (…${key.slice(-4)})`);
  res.json({ ok: true, check: check.code, engine: config.engine, key: keyInfo() });
});
app.delete('/api/ai/key', admin, unlocked, (req, res) => {
  saveKey(null);
  const envKey = process.env.GEMINI_API_KEY || '';
  Object.assign(config, { geminiApiKey: envKey, keySource: envKey ? 'env' : '' });
  useKeyChange(envKey ? 'Saved Gemini API key removed: using the one in .env' : 'Gemini API key removed: simulated captions');
  res.json({ ok: true, engine: config.engine, key: keyInfo() });
});
/** Apply a new (or no) key: fresh client, and rooms move between simulated captions and Gemini. */
function useKeyChange(summary) {
  resetClient();
  const want = config.geminiApiKey || config.vertex ? 'gemini' : 'mock';
  // A local engine (npm run local, or the offline backup right now) keeps running; the key is used when Gemini is.
  const switching = config.engine !== 'local' && config.engine !== want;
  if (switching) { setEngine(want); config.primaryEngine = want; }
  for (const st of stages.values()) {
    if (config.engine !== 'gemini' && !switching) continue;
    st.log('info', switching ? (want === 'gemini' ? 'API key saved: captions now come from Gemini' : 'No API key: captions are simulated') : 'New API key in use');
    st.reconfigure(st.def);
  }
  recordChange({ kind: 'ai.key', summary });

}

// Public HTTPS address through Cloudflare Tunnel (src/tunnel.js). While it's on, its address is the public URL
// (QR codes, links, allowed origins); turning it off goes back to PUBLIC_URL. Locked in Event mode: stopping it
// would cut every phone off.
app.post('/api/tunnel', admin, unlocked, (req, res) => {
  const mode = String(req.body?.mode || '');
  if (!['quick', 'token', 'off'].includes(mode)) return res.status(400).json({ error: 'mode must be quick|token|off' });
  let host = '';
  if (mode === 'token') {
    const token = String(req.body?.token || '').trim();
    if (token) saveSecret('tunnelToken', token);
    host = String(req.body?.host || setup.tunnel?.host || '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!readSecret('tunnelToken')) return res.status(400).json({ error: 'paste the tunnel token from the Cloudflare dashboard' });
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) return res.status(400).json({ error: 'type the tunnel\'s public hostname, e.g. captions.example.com' });
  }
  saveSetup({ tunnel: mode === 'off' ? null : { mode, host } });
  startTunnel(mode, host);
  recordChange({ kind: 'tunnel', summary: mode === 'off' ? 'Public address turned off' : mode === 'quick' ? 'Quick public address turned on' : `Public address ${host} turned on` });
  res.json(tunnel.status());
});

app.get('/api/schedule', (req, res) => res.json(schedule.entries.map((e) => ({ ...e, startIso: new Date(e.start).toISOString() }))));
app.put('/api/schedule', admin, unlocked, (req, res) => {
  try {
    const csv = typeof req.body?.csv === 'string' ? req.body.csv : null;
    // Pasted text is matched to the rooms that exist (by id or name); rows for other rooms are skipped.
    const rooms = csv != null ? [...stages.values()].map((s) => ({ id: s.id, name: s.def.name })) : undefined;
    const input = csv ?? req.body?.entries ?? req.body;
    const before = schedule.entries.map((e) => ({ ...e }));
    // ?dryRun=1: parse and report, without saving (the dashboard's preview before replacing the agenda).
    const entries = /** @type {any} */ (req.query.dryRun ? parseSchedule(input, new Date(), { rooms }) : schedule.set(input, { rooms }));
    const unknown = [...new Set(entries.map((e) => e.stage))].filter((id) => !stages.has(id));
    const skipped = entries.skipped || [];
    const change = req.query.dryRun ? null : recordChange({ kind: 'agenda.set', summary: `Agenda saved (${before.length} → ${entries.length} talks)`, before, after: entries.map((e) => ({ ...e })) });
    res.json({ ok: true, change: change?.id ?? null, count: entries.length, unknownRooms: unknown, skipped: { count: skipped.length, rooms: [...new Set(skipped.map((x) => x.room))].slice(0, 20) },
      ...(req.query.dryRun ? { entries: entries.map((e) => ({ ...e, startIso: new Date(e.start).toISOString() })) } : {}) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/glossary', (req, res) => res.json(glossary.data));
app.put('/api/glossary', admin, unlocked, (req, res) => {
  try {
    const before = clone(glossary.data);
    glossary.set(req.body);
    const change = recordChange({ kind: 'glossary.set', summary: `Glossary saved (${glossary.data.vocabulary.length} terms, ${glossary.data.replacements.length} corrections)`, before, after: clone(glossary.data) });
    res.json({ ...glossary.data, change: change.id });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/qr.svg', async (req, res) => {
  const text = String(req.query.text || publicUrl(req)).slice(0, 500);
  const svg = await QRCode.toString(text, { type: 'svg', margin: 1, color: { dark: '#000000', light: '#ffffff' } });
  res.type('image/svg+xml').set('Cache-Control', 'public, max-age=3600').send(svg);
});

app.get('/metrics', admin, (req, res) => { // Prometheus: send `Authorization: Bearer <ADMIN_TOKEN>`
  const lines = [];
  for (const s of stages.values()) {
    const st = s.status();
    const l = `stage="${st.id}"`;
    lines.push(`opencaptions_viewers{${l}} ${st.viewers}`);
    lines.push(`opencaptions_audio_level{${l}} ${st.level.toFixed(4)}`);
    lines.push(`opencaptions_ingest_connected{${l}} ${st.ingest ? 1 : 0}`);
    lines.push(`opencaptions_cost_usd_total{${l}} ${st.costUsd}`);
    if (st.latency.asr != null) lines.push(`opencaptions_latency_ms{${l},lang="orig"} ${st.latency.asr}`);
    for (const [k, v] of Object.entries(st.latency.tr)) lines.push(`opencaptions_latency_ms{${l},lang="${k}"} ${v}`);
    for (const e of st.engines) {
      lines.push(`opencaptions_session_live{${l},lang="${e.target}"} ${e.state === 'live' ? 1 : 0}`);
      lines.push(`opencaptions_session_reconnects_total{${l},lang="${e.target}"} ${e.reconnects}`);
    }
  }
  const sys = systemStats();
  lines.push(`opencaptions_process_cpu_percent ${sys.cpuPct}`, `opencaptions_process_rss_bytes ${sys.rssMB * 1048576}`, `opencaptions_event_loop_lag_p99_ms ${sys.loopLagMs.p99}`, `opencaptions_host_memory_used_percent ${sys.sysMemPct}`, `opencaptions_host_load1 ${sys.load1}`);
  res.type('text/plain').send(lines.join('\n') + '\n');
});

app.get('/s/:id', (req, res) => res.redirect(`/watch.html?stage=${encodeURIComponent(req.params.id)}`));

// Installable web app: "Add to home screen" on phones, its own window on desktops.
app.get('/manifest.webmanifest', (req, res) => {
  const name = config.event.name || 'OpenCaptions';
  res.type('application/manifest+json').send(JSON.stringify({
    name: `${name} · Live captions`,
    short_name: name.length <= 12 ? name : 'Captions',
    description: 'Live captions and translation for every room.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#FAF8F3',
    theme_color: '#111014',
    icons: [
      { src: '/brand/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/brand/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }));
});

// Audience pages: link previews (WhatsApp, Slack, LinkedIn) need the event name and an absolute image URL.
const htmlEsc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const pageCache = new Map();
app.get(['/', '/index', '/index.html', '/watch', '/watch.html', '/talk', '/talk.html', '/talks', '/talks.html'], (req, res, next) => {
  const origin = publicUrl(req);
  if (!/^https?:\/\/[a-z0-9.\-:[\]]+$/i.test(origin)) return next(); // odd Host header: serve the file untouched
  const name = req.path === '/' ? 'index.html' : req.path.slice(1).replace(/(\.html)?$/, '.html');
  const file = path.join(ROOT, 'public', name);
  try {
    const { mtimeMs } = fs.statSync(file);
    let hit = pageCache.get(file);
    if (!hit || hit.mtimeMs !== mtimeMs) pageCache.set(file, (hit = { mtimeMs, html: fs.readFileSync(file, 'utf8') }));
    res.type('html').send(hit.html
      .replaceAll('content="/brand/', `content="${origin}/brand/`)
      .replaceAll('%EVENT%', htmlEsc(config.event.name || 'OpenCaptions')));
  } catch { next(); }
});
app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'] }));
app.use('/samples', express.static(path.join(ROOT, 'samples')));
app.use('/api', (req, res) => res.status(404).json({ error: 'not found' }));
// Never leak stack traces or internals to clients.
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error('✗', req.method, req.path, err.message);
  res.status(status).json({ error: status >= 500 ? 'internal error' : err.message });
});

// Local engine: keep an eye on the speech server and the text model (shown on the dashboard).
const localHealth = { asr: null, llm: null, modelInstalled: null, missing: [], checkedAt: 0 };
const localModels = () => [...new Set([llmInfo().model, config.localMtModel].filter(Boolean))].join(' + ');
const engineLabel = () => (config.engine === 'gemini' ? config.model : config.engine === 'local' ? (config.localLlmOff ? asrInfo().label : `${asrInfo().label} + ${localModels()}`) : 'mock');
async function checkLocal() {
  const [asr, llm] = /** @type {[boolean, any]} */ (await Promise.all([asrReachable(), config.localLlmOff ? { ok: false, hasModel: false, models: [], off: true } : llmHealth()]));
  Object.assign(localHealth, { asr, llm: llm.ok, modelInstalled: llm.hasModel, missing: llm.missing || [], checkedAt: Date.now() });
  return { asr, llm };
}
if (config.engine === 'local') setInterval(() => checkLocal().catch(() => {}), 15_000).unref();

// Offline backup (FALLBACK=local, or a manual switch from the dashboard): Gemini normally, the local engine
// when the internet goes down. Switching restarts each room's AI session; captions resume in a few seconds.
const failover = config.primaryEngine === 'gemini' ? new Failover({
  mode: config.fallback === 'local' ? 'auto' : 'cloud',
  localReady: async () => {
    const { asr, llm } = await checkLocal();
    return !!asr && (llm.ok || !!llm.off);
  },
  apply: (engine, reason) => {
    setEngine(engine);
    for (const st of stages.values()) {
      st.log('warn', engine === 'local' ? `${reason}: captions now run on this computer` : `${reason}: back to Gemini`);
      st.reconfigure(st.def);
    }
    console.log(`  ${engine === 'local' ? '⚠' : '✓'} ${reason} → engine: ${engine}`);
  },
}) : null;
if (failover) {
  failover.on('change', (st) => broadcastAdmin({ type: 'failover', ...st }));
  failover.start().catch(() => {});
}

function snapshot() {
  const list = [...stages.values()].map((s) => s.status());
  return {
    engine: config.engine,
    model: engineLabel(),
    failover: failover?.status() || null,
    tunnel: tunnel.status(),
    ai: keyInfo(),
    publicUrl: config.publicUrl, // '' = none: QR codes use the address the page was opened with
    setupDone: !!setup.done,
    locked: !!setup.locked,
    local: config.engine === 'local' ? { asrUrl: asrInfo().url, llmUrl: llmInfo().url, llmModel: llmInfo().model, mtModel: llmInfo().mtModel, llmOff: config.localLlmOff, ...localHealth } : undefined,
    event: config.event.name,
    uptimeSec: Math.round(process.uptime()),
    system: systemStats(),
    totals: {
      stages: list.length,
      live: list.filter((s) => s.engines.length && !s.gated).length,
      sessions: list.reduce((a, s) => a + s.engines.length, 0),
      viewers: list.reduce((a, s) => a + s.viewers, 0),
      costUsd: +(list.reduce((a, s) => a + s.costUsd, 0) + assistStats.usd).toFixed(2),
      assist: { requests: assistStats.requests, cacheHits: assistStats.cacheHits, errors: assistStats.errors, usd: +assistStats.usd.toFixed(3) },
    },
    stages: list,
  };
}

// ---------------- websockets ----------------
// HTTPS is required for microphone capture from other machines (browsers only allow getUserMedia on
// localhost or https). Set HTTPS_CERT / HTTPS_KEY (e.g. from `mkcert`) or put a TLS proxy in front.
const tls = process.env.HTTPS_CERT && process.env.HTTPS_KEY
  ? { cert: fs.readFileSync(process.env.HTTPS_CERT), key: fs.readFileSync(process.env.HTTPS_KEY) }
  : null;
const server = tls ? https.createServer(tls, app) : http.createServer(app);

// Public address (see /api/tunnel). PUBLIC_URL / publicUrl in event.json is what we go back to when it's off.
const configuredPublicUrl = config.publicUrl;
const tunnel = new Tunnel({ origin: tunnelOrigin(config.port, !!tls) });
let lastTunnelLine = '';
tunnel.on('change', (st) => {
  config.publicUrl = st.state === 'on' && st.url ? st.url : configuredPublicUrl;
  broadcastAdmin({ type: 'tunnel', ...st });
  const line = st.state === 'on' && st.url ? `  ✓ Public address: ${st.url}` : st.state === 'error' ? `  ⚠ Public address: ${st.error}` : '';
  if (line && line !== lastTunnelLine) console.log(line);
  lastTunnelLine = line;
});
function startTunnel(mode, host) {
  if (mode === 'off') return tunnel.stop();
  tunnel.start({ mode, host, token: mode === 'token' ? readSecret('tunnelToken') : '' }).catch((e) => console.error('✗ tunnel:', e.message));
}
// 256 KB is ~8 s of audio per message; clients send 100 ms (3.2 KB) chunks and tiny JSON.
const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: 256 * 1024 });
const reject = (socket, code, msg) => { socket.write(`HTTP/1.1 ${code} ${msg}\r\nConnection: close\r\n\r\n`); socket.destroy(); };
let viewerCount = 0;

server.on('upgrade', (req, socket, head) => {
  let url;
  try { url = new URL(req.url, 'http://x'); } catch { return socket.destroy(); }
  socket.on('error', () => {}); // aborted handshakes must never become uncaught exceptions
  const kind = { '/ws/ingest': 'ingest', '/ws/view': 'view', '/ws/admin': 'admin' }[url.pathname];
  if (!kind) return socket.destroy();
  if (!wsAllowed(req)) return reject(socket, 429, 'Too Many Requests');
  if (kind !== 'view' && !originAllowed(req)) return reject(socket, 403, 'Forbidden');
  if (kind === 'view' && viewerCount >= MAX_VIEWERS) return reject(socket, 503, 'Service Unavailable');
  const ok = kind === 'ingest' ? canIngest(req, url) : kind === 'admin' ? canAdmin(req, url) : true;
  if (!ok && !noteAuthFailure(req)) return reject(socket, 429, 'Too Many Requests');
  wss.handleUpgrade(req, socket, head, (ws) => {
    // Protocol violations (oversized frame, invalid UTF-8…) emit 'error' on the socket: log, never crash.
    ws.on('error', (e) => console.warn(`[ws:${kind}] ${e.code || ''} ${e.message}`.trim()));
    try {
      if (!ok) return ws.close(4001, `bad ${kind} token`);
      if (kind === 'ingest') onIngest(ws, url);
      else if (kind === 'view') onView(ws, url);
      else onAdmin(ws);
    } catch (e) {
      ws.close(1011, e.message);
    }
  });
});

const sendJson = (ws, obj) => ws.readyState === 1 && ws.send(JSON.stringify(obj));

function onIngest(ws, url) {
  const st = stages.get(url.searchParams.get('stage'));
  if (!st) return ws.close(4004, 'unknown stage');
  stopPull(st.id); // a live ingest takes precedence over a configured pull
  const token = Symbol('ingest');
  st.attachIngest({
    kind: String(url.searchParams.get('kind') || 'browser').slice(0, 20),
    label: String(url.searchParams.get('label') || '').slice(0, 120),
    token,
    detach: (why) => { sendJson(ws, { type: 'replaced', why }); ws.close(4000, why); },
  });
  ws.on('message', (data, isBinary) => {
    if (isBinary && data.length <= 64 * 1024) st.pushAudio(Buffer.isBuffer(data) ? data : Buffer.from(data));
  });
  const timer = setInterval(() => {
    const s = st.status();
    sendJson(ws, { type: 'status', level: s.level, gated: s.gated, engines: s.engines.map((e) => ({ target: e.target, state: e.state })), preview: s.preview, alerts: s.alerts, latency: s.latency });
  }, 500);
  ws.on('close', () => {
    clearInterval(timer);
    st.detachIngest({ token });
    // A browser/agent ingest was covering for the room's configured stream: hand back to the stream.
    if (!st.destroyed && !st.ingest && st.def.pull && !pulls.has(st.id)) {
      st.log('info', 'ingest left → resuming the configured audio pull');
      startPull(st, st.def.pull, st.def.loop);
    }
  });
}

function onView(ws, url) {
  const st = stages.get(url.searchParams.get('stage'));
  if (!st) return ws.close(4004, 'unknown stage');
  let subs = [];
  let audioCh = null;
  const setup = () => {
    const langs = (url.searchParams.get('langs') || url.searchParams.get('lang') || 'orig').split(',').filter(Boolean);
    const map = Object.fromEntries(langs.map((l) => [l, st.channelFor(l)]));
    subs = [...new Set(Object.values(map))];
    const a = url.searchParams.get('audio');
    audioCh = a && a !== '0' ? st.channelFor(a) : null;
    if (!st.audioLangs.includes(audioCh)) audioCh = null; // only languages with a Live voice session
    sendJson(ws, {
      type: 'hello',
      stage: { id: st.id, name: st.def.name, title: st.talk.title, speaker: st.talk.speaker || '', next: st.nextTalk || null, languages: st.languages, source: st.source || 'auto', audioLangs: st.audioLangs, mode: st.mode },
      languages: Object.fromEntries(st.languages.map((l) => [l, l === 'orig' ? 'Original' : langName(l)])),
      map,
      talk: st.talk.id,
      history: Object.fromEntries(subs.map((ch) => [ch, st.history(ch, 40)])),
      partial: Object.fromEntries(subs.map((ch) => [ch, st.partial(ch)])),
    });
  };
  setup();
  st.viewers++;
  viewerCount++;
  // Slow or dead clients must not pile up memory: drop them (they reconnect and get history).
  const onCaption = (seg) => {
    if (!subs.includes(seg.channel)) return;
    if (ws.bufferedAmount > 1 << 20) return ws.terminate();
    sendJson(ws, { type: 'caption', ...seg });
  };
  const onAudio = (target, buf) => {
    if (audioCh && target === audioCh && ws.readyState === 1 && ws.bufferedAmount < 512 * 1024) ws.send(buf, { binary: true });
  };
  const onTalk = () => sendJson(ws, { type: 'talk', talk: st.talk.id, title: st.talk.title, speaker: st.talk.speaker || '' });
  const onTitle = () => sendJson(ws, { type: 'title', talk: st.talk.id, title: st.talk.title, speaker: st.talk.speaker || '' });
  const onRemoved = () => ws.close(1012, 'room removed'); // clients reconnect; a re-created room works again
  const onConfig = () => setup();
  st.on('caption', onCaption);
  st.on('audio', onAudio);
  st.on('talk', onTalk);
  st.on('title', onTitle);
  st.on('config', onConfig);
  st.once('removed', onRemoved);
  ws.on('message', (data, isBinary) => {
    if (isBinary || data.length > 4096) return;
    try {
      const m = JSON.parse(data.toString());
      if (m.type === 'subscribe') {
        if (m.langs) url.searchParams.set('langs', m.langs.join(','));
        url.searchParams.set('audio', m.audio || '0');
        setup();
      }
    } catch { /* ignore */ }
  });
  // Heartbeat: a phone that vanished (Wi-Fi roam, sleep) without closing is dropped after ~50 s.
  let alive = true;
  ws.on('pong', () => { alive = true; });
  const ping = setInterval(() => {
    if (!alive) return ws.terminate();
    alive = false;
    if (ws.readyState === 1) ws.ping();
  }, 25000);
  ws.on('close', () => {
    clearInterval(ping);
    st.viewers--;
    viewerCount--;
    st.off('caption', onCaption);
    st.off('audio', onAudio);
    st.off('talk', onTalk);
    st.off('title', onTitle);
    st.off('config', onConfig);
    st.off('removed', onRemoved);
  });
}

function onAdmin(ws) {
  admins.add(ws);
  sendJson(ws, { type: 'logs', logs: [...stages.values()].flatMap((s) => s.logs).sort((a, b) => a.t - b.t).slice(-150) });
  ws.on('close', () => admins.delete(ws));
}

function broadcastAdmin(obj) {
  if (!admins.size) return;
  const msg = JSON.stringify(obj);
  for (const ws of admins) if (ws.readyState === 1) ws.send(msg);
}

setInterval(() => broadcastAdmin({ type: 'status', ...snapshot() }), 1000);

server.on('error', (/** @type {NodeJS.ErrnoException} */ e) => {
  if (e.code === 'EADDRINUSE') console.error(`✗ Port ${config.port} is already in use — stop the other process or set PORT=…`);
  else if (e.code === 'EACCES') console.error(`✗ No permission to listen on port ${config.port} — use a port above 1024 or a reverse proxy`);
  else console.error('✗', e.message);
  process.exit(1);
});

server.listen(config.port, config.host, () => {
  // Public address turned on from the dashboard (or TUNNEL=quick): bring it back after a restart.
  const savedTunnel = process.env.TUNNEL ? { mode: process.env.TUNNEL, host: process.env.TUNNEL_HOST || '' } : setup.tunnel;
  if (savedTunnel && ['quick', 'token'].includes(savedTunnel.mode)) startTunnel(savedTunnel.mode, savedTunnel.host || '');
  const base = config.publicUrl || `${tls ? 'https' : 'http'}://localhost:${config.port}`;
  console.log(`\n  OpenCaptions · ${config.event.name}`);
  console.log(`  engine: ${config.engine}${config.engine === 'gemini' ? ` (${config.model})` : config.engine === 'local' ? ` (${engineLabel()}, nothing leaves this machine)` : ' (no GEMINI_API_KEY → simulated captions)'}`);
  if (config.engine === 'local') {
    console.log(`  speech:  ${asrInfo().url}\n  text:    ${config.localLlmOff ? 'off' : `${llmInfo().url} · ${localModels()}`}`);
    checkLocal().then(async ({ asr, llm }) => {
      if (!asr) console.log(`  ⚠ speech server not reachable at ${asrInfo().url} — start everything with: npm run local`);
      if (llm.off) console.log('  transcription only (LOCAL_LLM=off): no translations or AI summaries');
      else if (!llm.ok) console.log(`  ⚠ text model not reachable at ${llmInfo().url} — translations and summaries won't work (npm run local starts Ollama)`);
      else if (!llm.hasModel) {
        for (const m of llm.missing) console.log(llmInfo().api === 'ollama' ? `  ⚠ model "${m}" is not installed — run: ollama pull ${m}` : `  ⚠ the text model server doesn't list "${m}" (it has: ${llm.models.slice(0, 5).join(', ')}) — check LOCAL_LLM_MODEL / LOCAL_MT_MODEL`);
      } else {
        // Load the models now, not at the first caption.
        for (const model of new Set([llmInfo().model, llmInfo().mtModel])) localChat({ model, user: 'Reply with OK.', maxTokens: 4, priority: 0 }).catch(() => {});
      }
    }).catch(() => {});
  }
  console.log(`  stages: ${[...stages.keys()].join(', ')}`);
  console.log(`\n  Audience     ${base}/`);
  console.log(`  Production   ${base}/admin.html`);
  console.log(`  Stage ingest ${base}/ingest.html`);
  console.log(`  Live demo    ${base}/demo.html?mode=mic\n`);
  if (authMode === 'off') {
    console.log('  ⚠ AUTH=off — anyone who can reach this server can administer it and inject audio. Lab use only.\n');
  } else {
    console.log(`  Auth: ${authMode === 'auto' ? 'this machine (localhost) is trusted; other devices need a token' : 'token required everywhere'}`);
    const remote = config.publicUrl || '<this-server>';
    console.log(`  Admin token  ${tokens.admin}${tokens.adminGenerated ? '  (generated, stored in data/secrets.json — set ADMIN_TOKEN to choose your own)' : ''}`);
    console.log(`  Ingest token ${tokens.ingest}${tokens.ingestGenerated ? '  (generated)' : ''}`);
    console.log(`  From another device: ${remote}/admin.html?token=… · ${remote}/ingest.html?token=…\n`);
    // Docker: the browser on the host counts as another device, so hand over a link that signs in directly.
    if (process.env.OC_DOCKER) console.log(`  ➜ Open the dashboard: ${config.publicUrl || 'http://localhost:8080'}/admin.html?token=${tokens.admin}\n`);
  }
  // --open (the double-click starter): show the dashboard. On this computer it needs no password.
  if (process.argv.includes('--open') && !process.env.OC_DOCKER) {
    const url = `${tls ? 'https' : 'http'}://localhost:${config.port}/admin.html`;
    const [cmd, args] = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]] : ['xdg-open', [url]];
    try { spawn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true }).unref(); } catch { /* the address is printed above */ }
  }
  if (!tls && !config.publicUrl && config.host !== '127.0.0.1' && config.host !== 'localhost') {
    console.log('  Note: plain HTTP. Put HTTPS in front (Cloudflare Tunnel / Caddy) before exposing this beyond a trusted LAN — see docs/deployment.md\n');
  }
});

// Event-day safety net: one bad input must never take every room down. Log loudly and keep serving.
process.on('unhandledRejection', (/** @type {any} */ e) => console.error('✗ unhandled rejection:', e?.stack || e));
process.on('uncaughtException', (e) => console.error('✗ uncaught exception (server kept running):', e?.stack || e));

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    tunnel.stop();
    for (const id of [...stages.keys()]) removeStage(id);
    process.exit(0);
  });
}
