// ingest.html: page script (kept out of the HTML so the Content-Security-Policy can forbid inline scripts).
import { qs, esc, store, wsUrl, Socket, getEvent, langLabel, takeUrlToken, ingestTicket } from '/common.js';
import { localize, prefsControls, tr } from '/i18n.js';
import { icon } from '/illustrations.js';
const goLabel = (on) => { $('go').innerHTML = on ? `${icon('stop')} <span>Detener</span>` : `${icon('play')} <span>Empezar a transcribir</span>`; };
document.getElementById('conn').before(prefsControls());
const $ = (id) => document.getElementById(id);
goLabel(false);
const ev = await getEvent();
$('stage').innerHTML = ev.stages.map((s) => `<option value="${s.id}">${esc(s.name)} (${s.id})</option>`).join('');
$('stage').value = qs.get('stage') || store.get('ingest.stage', ev.stages[0]?.id);
$('mode').value = qs.get('mode') || store.get('ingest.mode', 'mic');
$('channel').value = store.get('ingest.channel', 'mix');
$('gain').value = store.get('ingest.gain', 1);
$('token').value = takeUrlToken('ingest.token');
$('auto').checked = store.get('ingest.auto', false);

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
$('token').onchange = () => store.set('ingest.token', $('token').value);
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
    stream = await navigator.mediaDevices.getUserMedia({ audio: {
      deviceId: $('device').value ? { exact: $('device').value } : undefined,
      // Raw console feed: disable voice-call processing.
      echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2,
    } });
    listDevices();
    return ctx.createMediaStreamSource(stream);
  }
  if (m === 'tab') {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, systemAudio: 'include' });
    if (!stream.getAudioTracks().length) throw new Error('No se compartió audio: marcá "Compartir audio de la pestaña".');
    stream.getVideoTracks().forEach((t) => (t.enabled = false));
    return ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
  }
  media = new Audio();
  media.crossOrigin = 'anonymous';
  media.loop = true;
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
    const mySock = (sock = new Socket(async () => wsUrl('/ws/ingest', { stage: $('stage').value, kind: 'browser', label: `${$('mode').value}${$('mode').value === 'mic' ? ': ' + ($('device').selectedOptions[0]?.text || '') : ''}`, ticket: await ingestTicket($('token').value) }), {
      open() { setConn('conectado', 'ok'); while (pending.length && sock.ready) sock.send(pending.shift()); },
      close(e) {
        if (sock !== mySock) return; // an old connection closing must not tear down the current one
        setConn(e.code === 4001 ? 'token inválido' : e.code === 4000 ? 'reemplazado por otra ingesta' : 'reconectando…', 'bad');
        if (e.code === 4000 || e.code === 4001) stop();
      },
      message: onStatus,
    }));
    // Autostart on a kiosk without a user gesture leaves the context suspended: try to resume and warn.
    if (ctx.state !== 'running') { try { await ctx.resume(); } catch { /* needs a click */ } }
    if (ctx.state !== 'running') { alertBox(tr('El navegador bloqueó el audio: hacé clic en la página (o usá el agente nativo).')); document.addEventListener('click', () => ctx?.resume(), { once: true }); }
    running = true;
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

function stop() {
  running = false;
  sock?.close(); sock = null;
  stream?.getTracks().forEach((t) => t.stop()); stream = null;
  media?.pause(); media = null;
  ctx?.close(); ctx = null; node = null;
  pending.length = 0;
  setConn('desconectado', '');
  goLabel(false);
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

function onStatus(m) {
  if (m.type !== 'status') return;
  $('engines').innerHTML = [
    m.gated ? '<span class="chip warn">en pausa (silencio)</span>' : '<span class="chip ok">enviando al modelo</span>',
    ...m.engines.map((e) => `<span class="chip ${e.state === 'live' ? 'ok' : e.state === 'idle' ? '' : 'warn'}">${esc(e.target)} · ${esc(e.state)}</span>`),
    m.latency?.asr != null ? `<span class="chip">latencia ${(m.latency.asr / 1000).toFixed(1)}s</span>` : '',
    ...m.alerts.map((a) => `<span class="chip bad">${esc(a)}</span>`),
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
localize();
