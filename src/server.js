// OpenCaptions server: HTTP API + static UIs + WebSockets for ingest, viewers and the production dashboard.
import http from 'node:http';
import https from 'node:https';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';
import { config, normalizeStage, ROOT, langName } from './config.js';
import { Glossary } from './glossary.js';
import { Stage } from './stage.js';
import { Store, toSRT, toVTT, toTXT } from './store.js';
import { PullSource } from './pull.js';

const glossary = new Glossary();
const store = new Store(config.dataDir);
const stages = new Map();
const pulls = new Map();
const admins = new Set();
const STAGES_FILE = path.join(config.dataDir, 'stages.json');

// ---------------- stages ----------------
function persistStages() {
  const defs = [...stages.values()].map((s) => s.def);
  fs.writeFileSync(STAGES_FILE, JSON.stringify(defs, null, 2));
}

function addStage(def) {
  def = normalizeStage(def);
  if (stages.has(def.id)) throw new Error(`stage ${def.id} exists`);
  const st = new Stage(def, { glossary, store });
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

/** Resolve a YouTube (or any yt-dlp supported) page URL to a direct audio URL. */
const mediaCache = new Map(); // page URL → { media, at } (direct URLs stay valid for hours)
function resolveMedia(url) {
  const hit = mediaCache.get(url);
  if (hit && Date.now() - hit.at < 30 * 60 * 1000) return Promise.resolve(hit.media);
  return new Promise((resolve, reject) => {
    execFile('yt-dlp', ['-f', 'bestaudio/best', '-g', '--no-playlist', url], { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) {
        if (err.code === 'ENOENT') return reject(new Error('yt-dlp is not installed (macOS: brew install yt-dlp · pip install yt-dlp)'));
        return reject(new Error((stderr || err.message).trim().split('\n').pop()));
      }
      const media = stdout.trim().split('\n')[0];
      mediaCache.set(url, { media, at: Date.now() });
      resolve(media);
    });
  });
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

// ---------------- http ----------------
const app = express();
app.use(express.json({ limit: '1mb' }));

const isAdmin = (req) => !config.adminToken || req.get('x-admin-token') === config.adminToken || req.query.token === config.adminToken;
const admin = (req, res, next) => (isAdmin(req) ? next() : res.status(401).json({ error: 'admin token required' }));
const getStage = (req, res, next) => {
  req.stage = stages.get(req.params.id);
  return req.stage ? next() : res.status(404).json({ error: 'unknown stage' });
};
const publicUrl = (req) => config.publicUrl || `${req.protocol}://${req.get('host')}`;

app.get('/healthz', (req, res) => res.json({ ok: true, stages: stages.size, engine: config.engine }));

app.get('/api/event', (req, res) => {
  res.json({
    name: config.event.name,
    accent: config.event.accent,
    publicUrl: publicUrl(req),
    languages: config.event.languages,
    stages: [...stages.values()].map((s) => ({
      id: s.id,
      name: s.def.name,
      title: s.talk.title,
      source: s.source || 'auto',
      detectedLang: s.detectedLang || null,
      languages: s.languages,
      live: s.engines.size > 0 && !s.gated,
    })),
  });
});

app.get('/api/status', admin, (req, res) => res.json(snapshot()));

app.post('/api/stages', admin, (req, res) => {
  try {
    const st = addStage(req.body);
    persistStages();
    res.json(st.status());
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.patch('/api/stages/:id', admin, getStage, (req, res) => {
  const st = req.stage;
  const b = req.body || {};
  const def = normalizeStage({ ...st.def, ...b, id: st.id });
  if ('title' in b) st.setTitle(b.title);
  const langsChanged = def.source !== st.def.source || def.targets.join() !== st.def.targets.join() || def.translation !== st.def.translation;
  if (langsChanged) st.reconfigure(def);
  else st.def = def;
  if ('pull' in b) {
    if (b.pull) startPull(st, b.pull, !!b.loop); else stopPull(st.id);
  }
  persistStages();
  res.json(st.status());
});

app.delete('/api/stages/:id', admin, getStage, (req, res) => {
  removeStage(req.params.id);
  persistStages();
  res.json({ ok: true });
});

app.post('/api/stages/:id/talk', admin, getStage, (req, res) => {
  req.stage.newTalk(req.body?.title || '');
  res.json(req.stage.status());
});

// Demo / testing: the server pulls a YouTube video's audio in real time from `start` seconds, while the
// demo page plays the same video in the browser — so you can compare speech and captions side by side.
app.post('/api/stages/:id/youtube', admin, getStage, async (req, res) => {
  const url = String(req.body?.url || '');
  const start = Math.max(0, Number(req.body?.start || 0));
  if (!/^https?:\/\//.test(url)) return res.status(400).json({ error: 'url required' });
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

app.get('/api/stages/:id/talks', getStage, (req, res) => res.json(store.listTalks(req.params.id)));

app.get('/api/stages/:id/export.:fmt', getStage, (req, res) => {
  const st = req.stage;
  const talkId = req.query.talk || st.talk.id;
  const channel = st.channelFor(req.query.lang);
  const all = store.readTalk(st.id, talkId);
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

app.get('/api/glossary', (req, res) => res.json(glossary.data));
app.put('/api/glossary', admin, (req, res) => {
  try { glossary.set(req.body); res.json(glossary.data); } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/qr.svg', async (req, res) => {
  const text = String(req.query.text || publicUrl(req)).slice(0, 500);
  const svg = await QRCode.toString(text, { type: 'svg', margin: 1, color: { dark: '#000000', light: '#ffffff' } });
  res.type('image/svg+xml').set('Cache-Control', 'public, max-age=3600').send(svg);
});

app.get('/metrics', (req, res) => {
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
  res.type('text/plain').send(lines.join('\n') + '\n');
});

app.get('/s/:id', (req, res) => res.redirect(`/watch.html?stage=${encodeURIComponent(req.params.id)}`));
app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'] }));
app.use('/samples', express.static(path.join(ROOT, 'samples')));

function snapshot() {
  const list = [...stages.values()].map((s) => s.status());
  return {
    engine: config.engine,
    model: config.engine === 'gemini' ? config.model : 'mock',
    event: config.event.name,
    uptimeSec: Math.round(process.uptime()),
    totals: {
      stages: list.length,
      live: list.filter((s) => s.engines.length && !s.gated).length,
      sessions: list.reduce((a, s) => a + s.engines.length, 0),
      viewers: list.reduce((a, s) => a + s.viewers, 0),
      costUsd: +list.reduce((a, s) => a + s.costUsd, 0).toFixed(2),
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
const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://x');
  const kind = { '/ws/ingest': 'ingest', '/ws/view': 'view', '/ws/admin': 'admin' }[url.pathname];
  if (!kind) return socket.destroy();
  wss.handleUpgrade(req, socket, head, (ws) => {
    try {
      if (kind === 'ingest') onIngest(ws, url);
      else if (kind === 'view') onView(ws, url);
      else onAdmin(ws, url);
    } catch (e) {
      ws.close(1011, e.message);
    }
  });
});

const sendJson = (ws, obj) => ws.readyState === 1 && ws.send(JSON.stringify(obj));

function onIngest(ws, url) {
  const st = stages.get(url.searchParams.get('stage'));
  if (!st) return ws.close(4004, 'unknown stage');
  if (config.ingestToken && url.searchParams.get('token') !== config.ingestToken) return ws.close(4001, 'bad ingest token');
  stopPull(st.id); // a live ingest takes precedence over a configured pull
  const token = Symbol('ingest');
  st.attachIngest({
    kind: url.searchParams.get('kind') || 'browser',
    label: url.searchParams.get('label') || '',
    token,
    detach: (why) => { sendJson(ws, { type: 'replaced', why }); ws.close(4000, why); },
  });
  ws.on('message', (data, isBinary) => {
    if (isBinary) st.pushAudio(Buffer.isBuffer(data) ? data : Buffer.from(data));
  });
  const timer = setInterval(() => {
    const s = st.status();
    sendJson(ws, { type: 'status', level: s.level, gated: s.gated, engines: s.engines.map((e) => ({ target: e.target, state: e.state })), preview: s.preview, alerts: s.alerts, latency: s.latency });
  }, 500);
  ws.on('close', () => { clearInterval(timer); st.detachIngest({ token }); });
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
      stage: { id: st.id, name: st.def.name, title: st.talk.title, languages: st.languages, source: st.source || 'auto', audioLangs: st.audioLangs, mode: st.mode },
      languages: Object.fromEntries(st.languages.map((l) => [l, l === 'orig' ? 'Original' : langName(l)])),
      map,
      talk: st.talk.id,
      history: Object.fromEntries(subs.map((ch) => [ch, st.history(ch, 40)])),
      partial: Object.fromEntries(subs.map((ch) => [ch, st.partial(ch)])),
    });
  };
  setup();
  st.viewers++;
  const onCaption = (seg) => subs.includes(seg.channel) && sendJson(ws, { type: 'caption', ...seg });
  const onAudio = (target, buf) => {
    if (audioCh && target === audioCh && ws.readyState === 1 && ws.bufferedAmount < 512 * 1024) ws.send(buf, { binary: true });
  };
  const onTalk = () => sendJson(ws, { type: 'talk', talk: st.talk.id, title: st.talk.title });
  const onConfig = () => setup();
  st.on('caption', onCaption);
  st.on('audio', onAudio);
  st.on('talk', onTalk);
  st.on('config', onConfig);
  ws.on('message', (data, isBinary) => {
    if (isBinary) return;
    try {
      const m = JSON.parse(data.toString());
      if (m.type === 'subscribe') {
        if (m.langs) url.searchParams.set('langs', m.langs.join(','));
        url.searchParams.set('audio', m.audio || '0');
        setup();
      }
    } catch { /* ignore */ }
  });
  const ping = setInterval(() => ws.readyState === 1 && ws.ping(), 25000);
  ws.on('close', () => {
    clearInterval(ping);
    st.viewers--;
    st.off('caption', onCaption);
    st.off('audio', onAudio);
    st.off('talk', onTalk);
    st.off('config', onConfig);
  });
}

function onAdmin(ws, url) {
  if (config.adminToken && url.searchParams.get('token') !== config.adminToken) return ws.close(4001, 'bad admin token');
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

server.listen(config.port, config.host, () => {
  const base = config.publicUrl || `${tls ? 'https' : 'http'}://localhost:${config.port}`;
  console.log(`\n  OpenCaptions · ${config.event.name}`);
  console.log(`  engine: ${config.engine}${config.engine === 'gemini' ? ` (${config.model})` : ' (no GEMINI_API_KEY → simulated captions)'}`);
  console.log(`  stages: ${[...stages.keys()].join(', ')}`);
  console.log(`\n  Audience     ${base}/`);
  console.log(`  Production   ${base}/admin.html`);
  console.log(`  Stage ingest ${base}/ingest.html`);
  console.log(`  Live demo    ${base}/demo.html?mode=mic\n`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    for (const id of [...stages.keys()]) removeStage(id);
    process.exit(0);
  });
}
