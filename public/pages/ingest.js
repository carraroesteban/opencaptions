// ingest.html: page script (kept out of the HTML so the Content-Security-Policy can forbid inline scripts).
import { qs, esc, store, wsUrl, Socket, getEvent, langLabel, takeUrlToken, ingestTicket, wakeLock } from '/common.js';
import { localize, prefsControls, tr } from '/i18n.js';
import { icon } from '/illustrations.js';
import { openMic, openScreenAudio } from '/capture.js';
const goLabel = (on, again = false) => { $('go').innerHTML = on ? `${icon('stop')} <span>Detener</span>` : `${icon('play')} <span>${again ? 'Empezar de nuevo' : 'Empezar a transcribir'}</span>`; };
document.getElementById('conn').before(prefsControls());
const $ = (id) => document.getElementById(id);
goLabel(false);
localize(); // before anything waits on the network: the page and its tab title are never shown in the wrong language

// A room link from the dashboard (?link=…, Screens and QR or the setup wizard): it signs this browser in to send sound,
// once, and leaves the address bar so it isn't in history or a screenshot.
let linkProblem = '';
if (qs.get('link')) {
  const u = new URL(location.href);
  u.searchParams.delete('link');
  history.replaceState(null, '', u.pathname + u.search + u.hash);
  const r = await fetch('/api/ingest/link/use', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ link: qs.get('link') }) }).catch(() => null);
  if (!r?.ok) linkProblem = r?.status === 401 ? 'Este enlace ya se usó o tiene más de 30 minutos. Pedí uno nuevo a quien organiza: en el panel, Pantallas y QR → Computadora junto al escenario.' : 'No se pudo abrir el enlace de la sala. Revisá la conexión y abrilo de nuevo.';
}
const ev = await getEvent();
$('stage').innerHTML = ev.stages.map((s) => `<option value="${s.id}">${esc(s.name)} (${s.id})</option>`).join('');
$('stage').value = qs.get('stage') || store.get('ingest.stage', ev.stages[0]?.id);
$('mode').value = qs.get('mode') || store.get('ingest.mode', 'mic');
$('channel').value = store.get('ingest.channel', 'mix');
$('gain').value = store.get('ingest.gain', 1);
$('token').value = takeUrlToken('ingest.token');
$('auto').checked = store.get('ingest.auto', false);
$('backup').checked = qs.get('role') === 'backup' || store.get('ingest.backup', false);
$('backup').onchange = () => { store.set('ingest.backup', $('backup').checked); if (running) { stop(); start(); } };

let ctx, node, stream, media, sock, running = false;
const pending = [];

function showFields() {
  const m = $('mode').value;
  $('f-device').classList.toggle('hidden', m !== 'mic');
  $('f-file').classList.toggle('hidden', m !== 'file');
  $('f-sample').classList.toggle('hidden', m !== 'sample');
  links();
}
$('mode').onchange = () => { store.set('ingest.mode', $('mode').value); showFields(); };
$('stage').onchange = () => { store.set('ingest.stage', $('stage').value); links(); if (running) { stop(); start(); } };
$('channel').onchange = () => store.set('ingest.channel', $('channel').value);
// Can this browser send sound as it is? (The server computer, a room link or a signed-in dashboard need nothing; a
// different computer needs the room's link or the room-computer password.) Only then is the password box shown.
async function checkAccess() {
  const ok = !!(await ingestTicket($('token').value));
  $('f-token').classList.toggle('hidden', ok);
  if (linkProblem) $('token-title').textContent = tr(linkProblem);
  return ok;
}
$('token').onchange = () => { store.set('ingest.token', $('token').value); checkAccess(); };
checkAccess();
$('auto').onchange = () => store.set('ingest.auto', $('auto').checked);
$('gain').oninput = () => { store.set('ingest.gain', +$('gain').value); node?.port.postMessage({ gain: +$('gain').value }); };
showFields();
if (!window.isSecureContext) document.getElementById('securewarn').classList.remove('hidden');

async function listDevices() {
  try {
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
    const saved = store.get('ingest.device', '');
    $('device').innerHTML = devs.map((d, i) => `<option value="${d.deviceId}">${esc(d.label || `Entrada ${i + 1}`)}</option>`).join('');
    if (devs.some((d) => d.deviceId === saved)) $('device').value = saved;
  } catch { /* ignore */ }
}
$('device').onchange = () => store.set('ingest.device', $('device').value);
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
  el.onended = () => setTimeout(() => { if (media === el) stop('archivo terminado', '', true); }, 300);
  media.src = m === 'file' ? URL.createObjectURL($('file').files[0] || (() => { throw new Error('Elegí un archivo'); })()) : $('sample').value;
  await media.play();
  const src = ctx.createMediaElementSource(media);
  if ($('monitor').checked) src.connect(ctx.destination);
  return src;
}

let starting = false;
async function start() {
  if (starting || running) return; // double click / second click while the mic prompt is open
  starting = true;
  try {
    ctx = new AudioContext();
    await ctx.audioWorklet.addModule('/pcm-worklet.js');
    const src = await getSource();
    node = new AudioWorkletNode(ctx, 'pcm-capture', { processorOptions: { channel: $('channel').value, gain: +$('gain').value } });
    src.connect(node);
    const mute = ctx.createGain(); mute.gain.value = 0; node.connect(mute).connect(ctx.destination); // keeps the graph pulling
    node.port.onmessage = (e) => onPcm(e.data);
    // USB interface unplugged / "Stop sharing" clicked: say so instead of silently sending nothing.
    stream?.getAudioTracks().forEach((tk) => { tk.onended = () => { alertBox(tr('La entrada de audio se desconectó. Revisá el cable/placa y volvé a empezar.')); setConn('entrada desconectada', 'bad'); }; });
    const mySock = (sock = new Socket(async () => wsUrl('/ws/ingest', { stage: $('stage').value, kind: 'browser', role: $('backup').checked ? 'backup' : '', label: `${$('mode').value}${$('mode').value === 'mic' ? ': ' + ($('device').selectedOptions[0]?.text || '') : ''}`, ticket: await ingestTicket($('token').value) }), {
      open() { setConn('conectado', 'ok'); while (pending.length && sock.ready) sock.send(pending.shift()); },
      close(e) {
        if (sock !== mySock) return; // an old connection closing must not tear down the current one
        // 4000: another source took the room. 4001: wrong password. 4004: the room doesn't exist (anymore). Anything
        // else, a server restart (1012) included, reconnects by itself and then sends what was buffered meanwhile.
        const end = { 4000: 'otra computadora tomó esta sala', 4001: 'falta el enlace o la contraseña', 4004: 'sala inexistente' }[e.code];
        if (e.code === 4001) $('f-token').classList.remove('hidden'); // say what this computer needs
        if (end) stop(end, 'bad'); else setConn('reconectando…', 'bad');
      },
      message: onStatus,
    }));
    // Autostart on a kiosk without a user gesture leaves the context suspended: try to resume and warn.
    if (ctx.state !== 'running') { try { await ctx.resume(); } catch { /* needs a click */ } }
    if (ctx.state !== 'running') { alertBox(tr('El navegador bloqueó el audio: hacé clic en la página (o usá el agente nativo).')); document.addEventListener('click', () => ctx?.resume(), { once: true }); }
    running = true;
    wakeLock(); // the room's computer must not dim or sleep mid-talk (works on localhost or https)
    $('brk').classList.remove('hidden');
    goLabel(true);
    $('go').classList.remove('primary');
    $('go').classList.add('danger');
  } catch (e) {
    alertBox(tr(e.message));
    stop();
  } finally {
    starting = false;
  }
}

// why: what the connection chip says afterwards (and why it stopped); again: the button offers to start again.
function stop(why = 'desconectado', cls = '', again = false) {
  running = false;
  $('brk').classList.add('hidden');
  sock?.close(); sock = null;
  stream?.getTracks().forEach((t) => t.stop()); stream = null;
  media?.pause(); media = null;
  ctx?.close(); ctx = null; node = null;
  pending.length = 0;
  setConn(why, cls);
  goLabel(false, again);
  $('go').classList.add('primary');
  $('go').classList.remove('danger');
  $('lvl').style.width = '0';
}
$('go').onclick = () => (running ? stop() : start());

let peak = 0;
function onPcm(buf) {
  const i16 = new Int16Array(buf);
  let sum = 0;
  for (let i = 0; i < i16.length; i++) sum += (i16[i] / 32768) ** 2;
  const rms = Math.sqrt(sum / i16.length);
  const db = 20 * Math.log10(rms || 1e-6);
  const pct = Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
  peak = Math.max(peak * 0.97, pct);
  $('lvl').style.width = pct + '%';
  $('pk').style.left = peak + '%';
  $('db').textContent = `${db.toFixed(0)} dB`;
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

// The AI's state and the room's alerts, in words (Spanish source, translated by tr like the rest of the page).
const STATE = { live: 'en vivo', idle: 'en espera', connecting: 'conectando…', reconnecting: 'reconectando…', resuming: 'retomando…', error: 'error' };
const ALERT = { 'no-audio': 'no llega audio', 'muted?': '¿mic muteado? (60s sin señal)', reconnecting: 'reconectando IA', 'high-latency': 'latencia alta', 'mt-throttled': 'traducción limitada por cuota → usando Live', 'voice-in-break': 'hay alguien hablando durante la pausa', 'on-backup': 'usando el audio de respaldo' };
function onStatus(m) {
  if (m.type !== 'status') return;
  onBreak = !!m.brk;
  $('brk').textContent = tr(onBreak ? 'Reanudar subtítulos (B)' : 'Pausa (B)');
  $('brk').classList.toggle('primary', onBreak);
  $('engines').innerHTML = [
    m.role === 'backup' ? `<span class="chip ${m.active ? 'warn' : ''}">${esc(tr(m.active ? 'respaldo · al aire' : 'respaldo · en espera'))}</span>` : '',
    m.brk ? `<span class="chip warn">${esc(tr('pausa'))}${m.brk.title ? ` · ${esc(m.brk.title)}` : ''}</span>`
      : m.music ? `<span class="chip warn">♪ ${esc(tr('música: subtítulos en pausa'))}</span>`
        : m.gated ? '<span class="chip warn">en pausa (silencio)</span>' : '<span class="chip ok">subtitulando</span>',
    m.sound && m.sound !== 'unknown' ? `<span class="chip">${esc(tr({ voice: 'se oye: voz', music: 'se oye: música', quiet: 'se oye: silencio' }[m.sound] || m.sound))}</span>` : '',
    ...m.engines.map((e) => `<span class="chip ${e.state === 'live' ? 'ok' : e.state === 'idle' ? '' : 'warn'}">${esc(e.target)} · ${esc(tr(STATE[e.state] || e.state))}</span>`),
    m.latency?.asr != null ? `<span class="chip">latencia ${(m.latency.asr / 1000).toFixed(1)}s</span>` : '',
    ...m.alerts.map((a) => `<span class="chip bad">${esc(tr(ALERT[a] || a))}</span>`),
  ].join('');
  $('preview').innerHTML = Object.entries(m.preview).map(([ch, txt]) => `<div><b>${esc(langLabel(ch, ev.languages))}</b>${esc(txt) || '<span class="muted">…</span>'}</div>`).join('');
}

function setConn(txt, cls) { $('conn').textContent = txt; $('conn').className = 'chip ' + cls; }
function alertBox(msg) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = msg; document.body.append(d); setTimeout(() => d.remove(), 5000); }

function links() {
  const s = $('stage').value;
  $('links').innerHTML = `
    <a href="/screen.html?stage=${s}" target="_blank">${icon('monitor')} <span>Abrir pantalla para proyector</span></a>
    <a href="/overlay.html?stage=${s}&lang=es" target="_blank">${icon('film')} <span>Overlay para vMix/OBS</span></a>
    <a href="/s/${s}" target="_blank">${icon('phone')} <span>Vista del público</span></a>
    <a href="/admin.html" target="_blank">${icon('dashboard')} <span>Panel de producción</span></a>`;
}
if ($('auto').checked || qs.get('autostart') === '1') start();
