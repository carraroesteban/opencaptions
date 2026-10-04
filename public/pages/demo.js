/* global YT */ // the YouTube IFrame API, loaded below
// demo.html: page script (kept out of the HTML so the Content-Security-Policy can forbid inline scripts).
import { qs, esc, store, wsUrl, Socket, CaptionState, getEvent, langLabel, liveText, liveHtml } from '/common.js';
import { localize, prefsControls, tr } from '/i18n.js';
import { mountIcons } from '/illustrations.js';
mountIcons();
document.querySelector('header').append(prefsControls());
localize();
const $ = (id) => document.getElementById(id);
const ev = await getEvent();
const token = store.get('admin.token', '');
const headers = { 'content-type': 'application/json', 'x-admin-token': token };

$('stage').innerHTML = ev.stages.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
$('stage').value = qs.get('stage') || store.get('demo.stage', 'main');
$('url').value = qs.get('v') || store.get('demo.url', '');
$('start').value = qs.get('t') || 0;
let lang = qs.get('lang') || store.get('demo.lang', 'es');

const videoId = (u) => (u.match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([\w-]{11})/) || u.match(/^([\w-]{11})$/) || [])[1];

// ---------- YouTube player ----------
let player, ready = false;
let ytOk = false;
// Loads the YouTube IFrame API once; ytOk tells the rest of the page whether it arrived.
new Promise((res) => {
  window.onYouTubeIframeAPIReady = () => res(true);
  const sc = document.createElement('script');
  sc.src = 'https://www.youtube.com/iframe_api';
  sc.onerror = () => res(false);
  document.head.append(sc);
  setTimeout(() => res(false), 10000);
}).then((ok) => {
  ytOk = ok;
  if (!ok) document.getElementById('player').innerHTML = '<p style="color:#fff;padding:20px">No se pudo cargar el reproductor de YouTube (¿sin internet o bloqueado?).</p>';
  else loadVideo();
});
function loadVideo() {
  if (!ytOk) return;
  const id = videoId($('url').value.trim());
  if (!id) return;
  store.set('demo.url', $('url').value.trim());
  const start = Number($('start').value) || 0;
  if (player) { player.cueVideoById({ videoId: id, startSeconds: start }); return; }
  player = new YT.Player('player', {
    videoId: id,
    playerVars: { start, rel: 0, playsinline: 1, modestbranding: 1, cc_load_policy: 0 },
    events: { onReady: () => (ready = true), onStateChange },
  });
}
$('load').onclick = loadVideo;

// ---------- keep the server's audio pull in sync with the player ----------
let running = false, busy = false, anchor = null; // anchor = { t: video time, at: wall clock }
const stageId = () => $('stage').value;
async function startAt(t) {
  if (busy) return;
  busy = true;
  t = Math.max(0, Math.floor(t));
  player.pauseVideo();
  setState('preparando audio…', 'warn');
  try {
    const r = await fetch(`/api/stages/${stageId()}/youtube`, { method: 'POST', headers, body: JSON.stringify({ url: `https://www.youtube.com/watch?v=${videoId($('url').value.trim())}`, start: t }) });
    const raw = await r.text();
    let j = {};
    try { j = JSON.parse(raw); } catch {
      throw new Error(r.status === 404 ? 'el server no tiene la ruta /youtube: reiniciá `npm start` para cargar la versión nueva.' : `respuesta inesperada del server (${r.status})`);
    }
    if (r.status === 401) throw new Error('falta el ADMIN_TOKEN: abrí /admin.html una vez e ingresalo.');
    if (!r.ok) throw new Error(j.error || r.statusText);
    player.seekTo(t, true);
    player.playVideo();
    anchor = { t, at: Date.now() };
    running = true;
    setState('en vivo', 'bad');
  } catch (e) {
    setState('error', 'bad');
    alert(tr('No se pudo iniciar: ') + tr(e.message));
  } finally {
    setTimeout(() => (busy = false), 1500);
  }
}
async function stopPull() {
  running = false;
  anchor = null;
  setState('detenido', '');
  await fetch(`/api/stages/${stageId()}/pull`, { method: 'DELETE', headers }).catch(() => {});
}
function onStateChange(e) {
  if (busy || mode !== 'youtube') return;
  if (e.data === YT.PlayerState.PLAYING && !running) startAt(player.getCurrentTime());
  if ((e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.ENDED) && running) stopPull();
}
// If the user seeks while playing, restart the server pull at the new position.
setInterval(() => {
  if (!running || busy || !player?.getCurrentTime) return;
  const expected = anchor.t + (Date.now() - anchor.at) / 1000;
  if (Math.abs(player.getCurrentTime() - expected) > 3) startAt(player.getCurrentTime());
}, 1000);
// ---------- mode: YouTube play-along or live microphone ----------
let mode = qs.get('mode') || store.get('demo.mode', 'youtube');
function applyMode() {
  document.body.classList.toggle('mic', mode === 'mic');
  $('mode').value = mode;
  $('securewarn').classList.toggle('hidden', !(mode === 'mic' && !window.isSecureContext));
}
$('mode').onchange = () => {
  if (mode === 'mic') micStop(); else { player?.pauseVideo?.(); if (running) stopPull(); }
  mode = $('mode').value;
  store.set('demo.mode', mode);
  applyMode();
};
applyMode();

let mic = null;
async function listMics() {
  try {
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
    const cur = $('mic').value || store.get('demo.mic', '');
    $('mic').innerHTML = '<option value="">(predeterminado)</option>' + devs.map((d, i) => `<option value="${d.deviceId}">${esc(d.label || 'Entrada ' + (i + 1))}</option>`).join('');
    if (devs.some((d) => d.deviceId === cur)) $('mic').value = cur;
  } catch { /* ignore */ }
}
$('mic').onchange = () => { store.set('demo.mic', $('mic').value); if (mic) { micStop(); micStart(); } };
listMics();
async function micStart() {
  if (mic) return;
  if (!window.isSecureContext) return alert(tr('El micrófono requiere localhost o HTTPS.'));
  try {
    const ctx = new AudioContext();
    await ctx.audioWorklet.addModule('/pcm-worklet.js');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: {
      deviceId: $('mic').value ? { exact: $('mic').value } : undefined,
      echoCancellation: false, noiseSuppression: false, autoGainControl: false,
    } });
    listMics();
    const node = new AudioWorkletNode(ctx, 'pcm-capture', { processorOptions: { channel: 'mix', gain: 1 } });
    ctx.createMediaStreamSource(stream).connect(node);
    const mute = ctx.createGain(); mute.gain.value = 0; node.connect(mute).connect(ctx.destination);
    const pending = [];
    const sock = new Socket(() => wsUrl('/ws/ingest', { stage: stageId(), kind: 'browser', label: 'demo · micrófono', token: store.get('ingest.token', '') }), {
      open() { while (pending.length && sock.ready) sock.send(pending.shift()); },
      close(e) {
        if (e.code === 4001) { alert('El server pide INGEST_TOKEN: cargalo en /ingest.html una vez.'); micStop(); }
        if (e.code === 4000) { setState('reemplazado por otra ingesta', 'warn'); micStop(false); }
      },
    });
    node.port.onmessage = (ev2) => {
      const i16 = new Int16Array(ev2.data);
      let sum = 0;
      for (let i = 0; i < i16.length; i++) sum += (i16[i] / 32768) ** 2;
      const db = 20 * Math.log10(Math.sqrt(sum / i16.length) || 1e-6);
      $('miclvl').style.width = Math.max(0, Math.min(100, ((db + 60) / 60) * 100)) + '%';
      if (sock.ready) sock.send(ev2.data); else { pending.push(ev2.data); if (pending.length > 100) pending.shift(); }
    };
    mic = { ctx, stream, sock };
    $('micidle').classList.add('hidden');
    setState('en vivo', 'bad');
  } catch (e) {
    alert(tr('No se pudo abrir el micrófono: ') + e.message);
  }
}
function micStop(reset = true) {
  if (!mic) return;
  mic.sock.close();
  mic.stream.getTracks().forEach((t) => t.stop());
  mic.ctx.close();
  mic = null;
  $('miclvl').style.width = '0';
  if (reset) setState('detenido', '');
}

$('go').onclick = () => {
  if (mode === 'mic') return micStart();
  if (!ready) return;
  if (!running) startAt(player.getCurrentTime() || Number($('start').value) || 0);
};
$('stop').onclick = () => { if (mode === 'mic') return micStop(); player?.pauseVideo(); stopPull(); };
window.addEventListener('pagehide', () => { if (running) fetch(`/api/stages/${stageId()}/pull/stop`, { method: 'POST', headers, keepalive: true }).catch(() => {}); });
function setState(t, cls) { $('state').textContent = t; $('state').className = 'chip ' + cls; }

// ---------- captions ----------
const main = new CaptionState(), orig = new CaptionState();
let hello = null, sock = null;
function connect() {
  sock?.close();
  sock = new Socket(() => wsUrl('/ws/view', { stage: stageId(), langs: `${lang},orig` }), {
    message(m) {
      if (m.type === 'hello') {
        hello = m;
        $('lang').innerHTML = m.stage.languages.map((l) => `<option value="${l}">${esc(langLabel(l, ev.languages))}</option>`).join('');
        if (!m.stage.languages.includes(lang)) lang = m.stage.languages.find((l) => l !== 'orig') || 'orig';
        $('lang').value = lang;
        $('tlang').textContent = langLabel(lang, ev.languages);
        main.load(m.history[m.map[lang]] || [], m.partial[m.map[lang]]);
        orig.load(m.history.orig || [], m.partial.orig);
        links();
        draw();
      } else if (m.type === 'caption') {
        if (m.channel === hello?.map[lang]) main.apply(m);
        if (m.channel === 'orig') orig.apply(m);
        draw();
      } else if (m.type === 'talk') { main.clear(); orig.clear(); draw(); }
    },
  });
}
function draw() {
  liveText($('ovtxt'), main.tail(150), !main.partial?.text);
  $('ovbox').classList.toggle('idle', !main.tail(5));
  $('origtxt').textContent = orig.tail(200) || '…';
  const list = [...main.finals.slice(-40), ...(main.partial ? [main.partial] : [])];
  $('transcript').innerHTML = list.map((s) => `<p class="${s.final ? '' : 'partial'}">${s.final ? esc(s.text) : liveHtml(s.text)}</p>`).join('');
  $('transcript').scrollTop = $('transcript').scrollHeight;
}
setInterval(() => $('ovbox').classList.toggle('idle', Date.now() - main.updatedAt > 7000), 500);
function links() {
  $('dl-srt').href = `/api/stages/${stageId()}/export.srt?lang=${lang}`;
  $('dl-txt').href = `/api/stages/${stageId()}/export.txt?lang=${lang}`;
}
$('lang').onchange = () => { lang = $('lang').value; store.set('demo.lang', lang); connect(); };
$('stage').onchange = () => { store.set('demo.stage', stageId()); if (running) stopPull(); connect(); };
connect();

// ---------- live metrics ----------
setInterval(async () => {
  try {
    const r = await fetch('/api/status', { headers });
    if (!r.ok) return;
    const s = (await r.json()).stages.find((x) => x.id === stageId());
    if (!s) return;
    const sec = (v) => (v == null ? '—' : (v / 1000).toFixed(1) + ' s');
    $('s-asr').textContent = sec(s.latency.asr);
    $('s-tr').textContent = sec(s.latency.tr[lang] ?? null);
    $('s-lang').textContent = s.detectedLang || (s.source !== 'auto' ? s.source : '—');
    $('s-cost').textContent = 'US$ ' + s.costUsd.toFixed(3);
    $('alerts').innerHTML = s.alerts.filter((a) => !['no-ingest', 'no-audio'].includes(a)).map((a) => `<span class="chip warn">${esc(a)}</span>`).join('');
  } catch { /* ignore */ }
}, 2000);
