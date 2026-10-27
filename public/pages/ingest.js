// ingest.html: page script (kept out of the HTML so the Content-Security-Policy can forbid inline scripts).
import { qs, esc, store, wsUrl, Socket, getEvent, langLabel, takeUrlToken, ingestTicket, wakeLock, fmtClock } from '/common.js';
import { localize, prefsControls, tr, LANG } from '/i18n.js';
import { icon } from '/illustrations.js';
import { openMic, openScreenAudio, keepAlive, wake } from '/capture.js';
const $ = (id) => document.getElementById(id);

// This page's newer words, per language (the older ones are Spanish source text that i18n.js translates).
const L = {
  es: {
    kicker: 'Sonido de la sala', changeRoom: 'Cambiar', changeRoomAria: 'Cambiar de sala', options: 'Opciones', pvTitle: 'Lo que se está subtitulando',
    pvEmpty: 'Los subtítulos aparecen acá en cuanto alguien habla.', backupNote: 'Queda en espera y entra sola si la principal se corta o se queda muda.',
    ready: 'Listo para empezar', starting: 'Empezando…', live: 'Enviando · subtítulos en vivo', quiet: 'Enviando · en pausa mientras no se habla',
    music: 'Enviando · suena música, subtítulos en pausa', brk: 'En pausa · las pantallas muestran la pausa', standby: 'Respaldo en espera · entra solo si la principal se corta',
    onair: 'Respaldo al aire · subtítulos en vivo', reconnecting: 'Reconectando…', stopped: 'Detenido', took: 'Detenido · otra computadora tomó esta sala',
    needkey: 'Falta el enlace de la sala o la contraseña', noroom: 'Esta sala ya no existe', fileEnded: 'La grabación terminó', inputLost: 'La entrada de audio se desconectó',
    lvOff: 'El nivel aparece al empezar', lvSilent: 'No llega sonido: ¿está prendido el micrófono?', lvQuiet: 'Muy bajo: subí el volumen', lvGood: 'Buen nivel', lvLoud: 'Muy alto: bajalo un poco',
    elapsed: 'Tiempo enviando',
    slidesOn: 'Compartir diapositivas', slidesOff: 'Dejar de compartir diapositivas',
    slidesHint: 'Elegí la pantalla o la ventana de la presentación. Los teléfonos ven cada diapositiva nueva, traducida.',
    slidesSent: (n) => `Compartiendo la pantalla · ${n} ${n === 1 ? 'diapositiva enviada' : 'diapositivas enviadas'}`,
  },
  en: {
    kicker: 'Room sound', changeRoom: 'Change', changeRoomAria: 'Change room', options: 'Options', pvTitle: 'What’s being captioned',
    pvEmpty: 'Captions show up here as soon as someone speaks.', backupNote: 'It stands by and takes over if the main one drops or goes silent.',
    ready: 'Ready to start', starting: 'Starting…', live: 'Sending · captions live', quiet: 'Sending · paused while it’s quiet',
    music: 'Sending · music playing, captions paused', brk: 'On a break · the screens show it', standby: 'Backup standing by · takes over if the main one drops',
    onair: 'Backup on air · captions live', reconnecting: 'Reconnecting…', stopped: 'Stopped', took: 'Stopped · another computer took this room',
    needkey: 'This computer needs the room link or the password', noroom: 'This room doesn’t exist anymore', fileEnded: 'The recording finished', inputLost: 'The audio input was disconnected',
    lvOff: 'The level shows once you start', lvSilent: 'No sound: is the microphone on?', lvQuiet: 'Too quiet: turn it up', lvGood: 'Good level', lvLoud: 'Too loud: turn it down a little',
    elapsed: 'Time sending',
    slidesOn: 'Share slides', slidesOff: 'Stop sharing slides',
    slidesHint: 'Pick the screen or window with the presentation. Phones see each new slide, translated.',
    slidesSent: (n) => `Sharing the screen · ${n} ${n === 1 ? 'slide sent' : 'slides sent'}`,
  },
}[LANG === 'es' ? 'es' : 'en'];
for (const el of document.querySelectorAll('[data-l]')) el.textContent = L[el.dataset.l];

const goLabel = (on, again = false) => { $('go').innerHTML = on ? `${icon('stop')} <span>Detener</span>` : `${icon('play')} <span>${again ? 'Empezar de nuevo' : 'Empezar a transcribir'}</span>`; };
document.getElementById('prefs-slot').append(prefsControls());
goLabel(false);
localize(); // before anything waits on the network: the page and its tab title are never shown in the wrong language

// A room link from the dashboard (?link=…, a room's Sound section or the setup wizard): it signs this browser in to send sound,
// once, and leaves the address bar so it isn't in history or a screenshot.
let linkProblem = '';
if (qs.get('link')) {
  const u = new URL(location.href);
  u.searchParams.delete('link');
  history.replaceState(null, '', u.pathname + u.search + u.hash);
  const r = await fetch('/api/ingest/link/use', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ link: qs.get('link') }) }).catch(() => null);
  if (!r?.ok) linkProblem = r?.status === 401 ? 'Este enlace ya se usó o tiene más de 30 minutos. Pedí uno nuevo a quien organiza: en el panel, la sala → Sonido.' : 'No se pudo abrir el enlace de la sala. Revisá la conexión y abrilo de nuevo.';
}
const ev = await getEvent();
$('stage').innerHTML = ev.stages.map((s) => `<option value="${s.id}">${esc(s.name)} (${s.id})</option>`).join('');
$('stage').value = qs.get('stage') || store.get('ingest.stage', ev.stages[0]?.id);
if (!$('stage').value) $('stage').value = ev.stages[0]?.id || ''; // a room that was removed since: the first one
$('mode').value = qs.get('mode') || store.get('ingest.mode', 'mic');
$('channel').value = store.get('ingest.channel', 'mix');
$('gain').value = store.get('ingest.gain', 1);
$('token').value = takeUrlToken('ingest.token');
$('auto').checked = store.get('ingest.auto', false);
$('backup').checked = qs.get('role') === 'backup' || store.get('ingest.backup', false);
$('backup').onchange = () => { store.set('ingest.backup', $('backup').checked); if (running) { stop(); start(); } };
$('change-room').classList.toggle('hidden', ev.stages.length < 2);
$('change-room').setAttribute('aria-label', L.changeRoomAria);
$('change-room').onclick = () => { $('more').open = true; $('stage').focus(); };

let ctx, node, stream, media, sock, running = false;
const live = keepAlive('ingest'); // the page language reloads the page, F5, a tab closed by mistake: the room keeps its sound
const pending = [];

// ---------- what the page says: the room, the state line, the source ----------
function showRoom() {
  const name = ev.stages.find((s) => s.id === $('stage').value)?.name || $('stage').value;
  $('room').textContent = name;
  document.title = `${name} · ${L.kicker} · OpenCaptions`;
}
/** The one line that says how it's going. tone: '' (idle) | ok | live | warn | bad */
let stateKey = '';
function setState(key, tone = '') {
  if (key === stateKey && $('state').dataset.tone === tone) return;
  stateKey = key;
  $('state').dataset.tone = tone;
  // a new element each time, so the line fades in instead of jumping
  $('conn').replaceWith(Object.assign(document.createElement('span'), { id: 'conn', textContent: L[key] || key }));
}
function sourceText() {
  const m = $('mode').value;
  if (m === 'mic') return $('device').selectedOptions[0]?.text || '';
  if (m === 'file') return $('file').files[0]?.name || $('mode').selectedOptions[0]?.text;
  if (m === 'sample') return $('sample').selectedOptions[0]?.text;
  return $('mode').selectedOptions[0]?.text;
}
function showSource() {
  const m = $('mode').value;
  $('src-sum').innerHTML = `${icon({ mic: 'mic', tab: 'monitor', file: 'film', sample: 'play' }[m])}<span>${esc(sourceText())}</span>${icon('chevron')}`;
  $('src-sum').title = $('mode').selectedOptions[0]?.text || '';
  $('more-sum').textContent = `· ${sourceText()}${$('backup').checked ? ` · ${tr('Es el respaldo de la sala')}` : ''}`;
}
$('src-sum').onclick = () => { $('more').open = true; ($('mode').value === 'mic' ? $('device') : $('mode')).focus(); };

function showFields() {
  const m = $('mode').value;
  $('f-device').classList.toggle('hidden', m !== 'mic');
  $('f-file').classList.toggle('hidden', m !== 'file');
  $('f-sample').classList.toggle('hidden', m !== 'sample');
  links();
  showSource();
}
$('mode').onchange = () => { store.set('ingest.mode', $('mode').value); showFields(); };
$('stage').onchange = () => { store.set('ingest.stage', $('stage').value); showRoom(); links(); clearPreview(); if (running) { stop(); start(); } };
$('channel').onchange = () => store.set('ingest.channel', $('channel').value);
$('file').onchange = showSource;
$('sample').onchange = showSource;
// Can this browser send sound as it is? (The server computer, a room link or a signed-in dashboard need nothing; a
// different computer needs the room's link or the room-computer password.) Only then is the password box shown.
async function checkAccess() {
  const ok = !!(await ingestTicket($('token').value).catch(() => ''));
  $('f-token').classList.toggle('hidden', ok);
  if (linkProblem) $('token-title').textContent = tr(linkProblem);
  return ok;
}
$('token').onchange = () => { store.set('ingest.token', $('token').value); checkAccess(); };
checkAccess();
$('auto').onchange = () => store.set('ingest.auto', $('auto').checked);
const showGain = () => { $('gain-v').textContent = `${(+$('gain').value).toFixed(1)}×`; };
$('gain').oninput = () => { store.set('ingest.gain', +$('gain').value); node?.port.postMessage({ gain: +$('gain').value }); showGain(); };
showGain();
showRoom();
showFields();
if (!window.isSecureContext) document.getElementById('securewarn').classList.remove('hidden');

async function listDevices() {
  try {
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
    const saved = store.get('ingest.device', '');
    $('device').innerHTML = devs.map((d, i) => `<option value="${d.deviceId}">${esc(d.label || `Entrada ${i + 1}`)}</option>`).join('');
    if (devs.some((d) => d.deviceId === saved)) $('device').value = saved;
    showSource();
  } catch { /* ignore */ }
}
$('device').onchange = () => { store.set('ingest.device', $('device').value); showSource(); };
listDevices();

async function getSource() {
  const m = $('mode').value;
  if (m === 'mic') {
    let src;
    ({ stream, src } = await openMic(ctx, { deviceId: $('device').value, raw: true })); // raw console feed: no voice-call processing
    listDevices();
    return src;
  }
  if (m === 'tab') {
    try {
      let src;
      ({ stream, src } = await openScreenAudio(ctx));
      return src;
    } catch (e) { throw e.code === 'no-audio' ? new Error('No se compartió audio: marcá "Compartir audio de la pestaña".') : e; }
  }
  media = new Audio();
  media.crossOrigin = 'anonymous';
  // The bundled test audio repeats; a file of yours plays once (again and again would caption it again and again).
  media.loop = m === 'sample';
  const el = media;
  // Its last 100 ms chunk is still on its way from the worklet when the file ends: stop a moment later.
  el.onended = () => setTimeout(() => { if (media === el) stop('fileEnded', true); }, 300);
  media.src = m === 'file' ? URL.createObjectURL($('file').files[0] || (() => { throw new Error('Elegí un archivo'); })()) : $('sample').value;
  await media.play();
  const src = ctx.createMediaElementSource(media);
  if ($('monitor').checked) src.connect(ctx.destination);
  return src;
}

let starting = false, since = 0, clock = 0;
async function start() {
  if (starting || running) return; // double click / second click while the mic prompt is open
  starting = true;
  $('go').disabled = true; // the browser may be asking for the microphone: say it's on its way
  $('go').innerHTML = `<span class="spin" aria-hidden="true"></span> <span>${esc(L.starting)}</span>`;
  setState('starting', 'warn');
  try {
    ctx = new AudioContext();
    await ctx.audioWorklet.addModule('/pcm-worklet.js');
    const src = await getSource();
    node = new AudioWorkletNode(ctx, 'pcm-capture', { processorOptions: { channel: $('channel').value, gain: +$('gain').value } });
    src.connect(node);
    const mute = ctx.createGain(); mute.gain.value = 0; node.connect(mute).connect(ctx.destination); // keeps the graph pulling
    node.port.onmessage = (e) => onPcm(e.data);
    // USB interface unplugged / "Stop sharing" clicked: say so instead of silently sending nothing.
    stream?.getAudioTracks().forEach((tk) => { tk.onended = () => { alertBox(tr('La entrada de audio se desconectó. Revisá el cable/placa y volvé a empezar.')); setState('inputLost', 'bad'); }; });
    const mySock = (sock = new Socket(async () => wsUrl('/ws/ingest', { stage: $('stage').value, kind: 'browser', role: $('backup').checked ? 'backup' : '', label: `${$('mode').value}${$('mode').value === 'mic' ? ': ' + ($('device').selectedOptions[0]?.text || '') : ''}`, ticket: await ingestTicket($('token').value) }), {
      open() { setState('live', 'live'); while (pending.length && sock.ready) sock.send(pending.shift()); },
      close(e) {
        if (sock !== mySock) return; // an old connection closing must not tear down the current one
        // 4000: another source took the room. 4001: wrong password. 4004: the room doesn't exist (anymore). Anything
        // else, a server restart (1012) included, reconnects by itself and then sends what was buffered meanwhile.
        const end = { 4000: 'took', 4001: 'needkey', 4004: 'noroom' }[e.code];
        if (e.code === 4001) $('f-token').classList.remove('hidden'); // say what this computer needs
        if (end) stop(end, false, 'bad'); else setState('reconnecting', 'warn');
      },
      message: onStatus,
    }));
    // Started without a click (autostart on a kiosk, a reload that resumes): the browser holds the sound until one.
    await wake(ctx);
    if (ctx.state !== 'running') alertBox(tr('El navegador bloqueó el audio: hacé clic en la página (o usá el agente nativo).'));
    running = true;
    live.set(true);
    wakeLock(); // the room's computer must not dim or sleep mid-talk (works on localhost or https)
    onBreak = false;
    brkLabel();
    $('brk').classList.remove('hidden');
    $('slides').classList.toggle('hidden', !navigator.mediaDevices?.getDisplayMedia); // phones can't share a screen
    goLabel(true);
    $('go').classList.add('stop');
    $('deck').classList.add('on');
    since = Date.now();
    tick();
    clock = setInterval(tick, 1000);
    meterLoop();
  } catch (e) {
    alertBox(tr(e.message));
    stop('ready');
  } finally {
    starting = false;
    $('go').disabled = false;
  }
}
function tick() { $('clock').textContent = running ? fmtClock(Date.now() - since) : ''; }
$('clock').title = L.elapsed;

// key: what the state line says afterwards (why it stopped); again: the button offers to start again.
function stop(key = 'stopped', again = false, tone = '') {
  running = false;
  live.set(false);
  $('brk').classList.add('hidden');
  $('slides').classList.add('hidden');
  stopSlides();
  sock?.close(); sock = null;
  stream?.getTracks().forEach((t) => t.stop()); stream = null;
  media?.pause(); media = null;
  ctx?.close(); ctx = null; node = null;
  pending.length = 0;
  clearInterval(clock);
  tick();
  setState(key, tone);
  goLabel(false, again);
  $('go').classList.remove('stop');
  $('deck').classList.remove('on', 'brk');
  $('alerts').innerHTML = '';
  target = -Infinity; // the meter falls back to nothing, smoothly
  recent.length = 0;
  $('db').firstChild.nodeValue = '—';
  showHint();
}
$('go').onclick = () => (running ? stop() : start());

// ---------- the level meter: smoothed on every frame, a peak that holds, and what the level means ----------
// Each 100 ms chunk sets a target; the bar rises fast and falls slowly toward it (like a hardware meter).
const FLOOR = -60;
const pctOf = (db) => Math.max(0, Math.min(100, ((db - FLOOR) / -FLOOR) * 100));
let target = -Infinity, shown = 0, peak = 0, peakAt = 0, raf = 0;
const recent = []; // the last 1.5 s of chunk levels, for the hint
function meterLoop() {
  if (raf) return;
  const frame = () => {
    const want = pctOf(target);
    shown += (want - shown) * (want > shown ? 0.55 : 0.12);
    const now = performance.now();
    if (shown >= peak) { peak = shown; peakAt = now; } else if (now - peakAt > 1200) peak = Math.max(shown, peak - 0.6);
    $('lvl').style.clipPath = `inset(0 ${(100 - shown).toFixed(2)}% 0 0)`;
    $('pk').style.transform = `translateX(${(peak / 100) * $('pk').parentElement.clientWidth - 3}px)`;
    if (!running && shown < 0.2 && peak < 0.2) { raf = 0; $('lvl').style.clipPath = 'inset(0 100% 0 0)'; return; }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
}
let hintKey = '';
function showHint() {
  let key = 'lvOff', tone = '';
  if (running && recent.length >= 5) {
    const max = Math.max(...recent);
    [key, tone] = max < -58 ? ['lvSilent', 'warn'] : max < -42 ? ['lvQuiet', 'warn'] : max > -6 ? ['lvLoud', 'bad'] : ['lvGood', 'ok'];
  }
  if (key === hintKey) return;
  hintKey = key;
  $('hint').textContent = L[key];
  $('hint').dataset.tone = tone;
}
showHint();
function onPcm(buf) {
  const i16 = new Int16Array(buf);
  let sum = 0;
  for (let i = 0; i < i16.length; i++) sum += (i16[i] / 32768) ** 2;
  const rms = Math.sqrt(sum / i16.length);
  const db = 20 * Math.log10(rms || 1e-6);
  target = db;
  recent.push(db);
  if (recent.length > 15) recent.shift();
  $('db').firstChild.nodeValue = db < FLOOR ? '—' : db.toFixed(0);
  showHint();
  if (sock?.ready) sock.send(buf);
  else { pending.push(buf); if (pending.length > 150) pending.shift(); }
}

// Break from the room (the stage manager, intermission, ads): the server pauses captions and the screens show it.
let onBreak = false;
const toggleBreak = () => sock?.send({ type: 'break', on: !onBreak });
$('brk').onclick = toggleBreak;
document.addEventListener('keydown', (e) => {
  if ((e.key === 'b' || e.key === 'B') && running && !e.target.closest('input, select, textarea') && !e.metaKey && !e.ctrlKey) toggleBreak();
});

// ---------- the server's word on the room: state, alerts and what's being captioned ----------
// The AI's state and the room's alerts, in words (Spanish source, translated by tr like the rest of the page).
const STATE = { live: 'en vivo', idle: 'en espera', connecting: 'conectando…', reconnecting: 'reconectando…', resuming: 'retomando…', error: 'error' };
const ALERT = { 'no-audio': 'no llega audio', 'muted?': '¿mic muteado? (60s sin señal)', reconnecting: 'reconectando IA', 'high-latency': 'latencia alta', 'mt-throttled': 'traducción limitada por cuota → usando Live', 'voice-in-break': 'hay alguien hablando durante la pausa', 'on-backup': 'usando el audio de respaldo', 'not-saving': 'no se guardan las transcripciones (¿disco lleno?)', 'ai-errors': 'la IA está dando errores (ver el registro)' };
let lastBrk = null, lastChips = '', lastAlerts = '';
function brkLabel() {
  lastBrk = onBreak;
  $('brk').innerHTML = `${icon(onBreak ? 'play' : 'pause')}<span>${esc(tr(onBreak ? 'Reanudar subtítulos' : 'Pausa'))}</span><kbd>B</kbd>`;
  $('brk').classList.toggle('primary', onBreak);
  $('deck').classList.toggle('brk', onBreak);
}
function onStatus(m) {
  if (m.type !== 'status' || !running) return;
  onBreak = !!m.brk;
  if (lastBrk !== onBreak) brkLabel();
  if (m.role === 'backup' && !m.active) setState('standby', 'ok');
  else if (m.brk) setState('brk', 'warn');
  else if (m.music) setState('music', 'ok');
  else if (m.gated) setState('quiet', 'ok');
  else setState(m.role === 'backup' ? 'onair' : 'live', 'live');
  const chips = [
    ...m.engines.map((e) => `<span class="chip ${e.state === 'live' ? 'ok' : e.state === 'idle' ? '' : 'warn'}">${esc(e.target)} · ${esc(tr(STATE[e.state] || e.state))}</span>`),
    m.latency?.asr != null ? `<span class="chip">${esc(tr(`latencia ${(m.latency.asr / 1000).toFixed(1)}s`))}</span>` : '',
  ].join('');
  if (chips !== lastChips) $('engines').innerHTML = lastChips = chips;
  const alerts = [
    m.brk?.title ? `<span class="chip warn">${esc(tr('pausa'))} · ${esc(m.brk.title)}</span>` : '',
    // 'no-ingest' only means this very page is still connecting: not worth a red chip here
    ...m.alerts.filter((a) => a !== 'no-ingest').map((a) => `<span class="chip bad">${icon('alert')}${esc(tr(ALERT[a] || a))}</span>`),
  ].join('');
  if (alerts !== lastAlerts) $('alerts').innerHTML = lastAlerts = alerts;
  showPreview(m.preview || {});
}
// One line per language, created once; a line that starts over (a new sentence) fades in, one that grows just grows.
const lines = new Map();
function showPreview(preview) {
  const said = Object.entries(preview).filter(([, txt]) => txt);
  if (!said.length) { if (!lines.size) emptyPreview(); return; }
  if (!lines.size) $('pv').textContent = '';
  for (const [ch, txt] of Object.entries(preview)) {
    let line = lines.get(ch);
    if (!line) {
      const el = document.createElement('div');
      el.className = 'pv-line';
      el.innerHTML = `<b>${esc(langLabel(ch, ev.languages))}</b><p>…</p>`;
      $('pv').append(el);
      line = { p: el.querySelector('p'), text: '' };
      lines.set(ch, line);
    }
    if (txt === line.text) continue;
    const restart = !txt.startsWith(line.text.slice(0, 12));
    line.text = txt;
    line.p.textContent = txt || '…';
    if (restart) { line.p.classList.remove('fresh'); void line.p.offsetWidth; line.p.classList.add('fresh'); }
  }
}
function emptyPreview() { $('pv').innerHTML = `<p class="pv-empty">${esc(L.pvEmpty)}<span class="skeleton u-w85"></span><span class="skeleton u-w70"></span></p>`; }
function clearPreview() { lines.clear(); emptyPreview(); $('engines').innerHTML = lastChips = ''; }
clearPreview();

function alertBox(msg) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = msg; document.body.append(d); setTimeout(() => d.remove(), 5000); }

function links() {
  const s = $('stage').value;
  $('links').innerHTML = `
    <a href="/screen.html?stage=${s}" target="_blank">${icon('monitor')} <span>Abrir pantalla para proyector</span></a>
    <a href="/overlay.html?stage=${s}&lang=es" target="_blank">${icon('film')} <span>Overlay para vMix/OBS</span></a>
    <a href="/s/${s}" target="_blank">${icon('phone')} <span>Vista del público</span></a>
    <a href="/admin.html" target="_blank">${icon('dashboard')} <span>Panel de producción</span></a>`;
}
setState('ready'); // nothing is wrong yet: it just hasn't started
// Sending when the page went away (the page language reloads it, F5, a tab reopened): carry on. A microphone needs no
// click (its permission is given); the test audio and sharing a tab do, and a chosen file is gone.
const resumable = $('mode').value === 'mic';
if ($('auto').checked || qs.get('autostart') === '1' || (live.resumed && resumable)) start();
else if (live.resumed) {
  alertBox(tr('La página se recargó y el navegador dejó de compartir el sonido: tocá Empezar para seguir.'));
  live.set(false); // said once: the next reload doesn't say it again
}

// ---------- slides: the presentation's screen next to the sound (src/slides.js) ----------
// Every second a 32×18 thumbnail is compared with the last one. A slide is sent once the picture has changed and then
// held still for a second: a video or an animation on screen is not a new slide every second (each one costs a read).
let share = null, shareTimer = 0, held = null, sent = null, sentCount = 0;
const THUMB_W = 32, THUMB_H = 18, MAX_B64 = 240_000; // the server keeps slides up to 180 KB (base64 is 4/3 of that)
function slideLabel() {
  $('slides').innerHTML = `${icon(share ? 'stop' : 'monitor')}<span>${esc(share ? L.slidesOff : L.slidesOn)}</span>`;
  $('slides').setAttribute('aria-pressed', String(!!share));
  $('slides-note').textContent = share ? L.slidesSent(sentCount) : L.slidesHint;
  $('slides-note').classList.toggle('hidden', !running);
}
const differs = (a, b) => { if (!b) return true; let d = 0; for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]); return d / a.length > 6; };
function snapSlide() {
  const v = share?.video;
  if (!v?.videoWidth || !sock?.ready) return;
  const t = document.createElement('canvas');
  t.width = THUMB_W; t.height = THUMB_H;
  const tc = t.getContext('2d', { willReadFrequently: true });
  tc.drawImage(v, 0, 0, THUMB_W, THUMB_H);
  const px = tc.getImageData(0, 0, THUMB_W, THUMB_H).data;
  const g = new Uint8Array(THUMB_W * THUMB_H);
  for (let i = 0; i < g.length; i++) g[i] = (px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2]) / 3;
  const moving = differs(g, held);
  held = g;
  if (moving || !differs(g, sent)) return; // still changing, or the slide already sent
  const w = Math.min(1280, v.videoWidth), h = Math.round((v.videoHeight * w) / v.videoWidth);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(v, 0, 0, w, h);
  let q = 0.8, url;
  do { url = c.toDataURL('image/jpeg', q); q -= 0.15; } while (url.length > MAX_B64 && q > 0.3);
  if (url.length > MAX_B64) return;
  sock.send({ type: 'slide', jpeg: url.slice(url.indexOf(',') + 1) });
  sent = g;
  sentCount++;
  slideLabel();
}
async function shareSlides() {
  if (share) return stopSlides();
  let stream;
  try { stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 2 }, audio: false }); } catch { return; } // cancelled
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play().catch(() => {});
  share = { stream, video };
  stream.getVideoTracks()[0].onended = stopSlides; // the browser's own "Stop sharing"
  held = sent = null;
  sentCount = 0;
  shareTimer = setInterval(snapSlide, 1000);
  slideLabel();
}
function stopSlides() {
  clearInterval(shareTimer);
  share?.stream.getTracks().forEach((t) => t.stop());
  share = null;
  slideLabel();
}
$('slides').onclick = shareSlides;
slideLabel();
