// me.html: OpenCaptions just for you. Whatever goes into the microphone, or whatever the computer plays (a video call, a
// video, a class), captioned live and translated if you like, in a big window and an always-on-top floating one.
// One room ("me") behind the scenes; nothing is public in personal mode (see src/server.js).
import { esc, store, wsUrl, Socket, CaptionState, getEvent, liveText } from '/common.js';
import { prefsControls, LANG } from '/i18n.js';
import { mountIcons } from '/illustrations.js';
import { ensureSignedIn } from '/signin.js';
import { keyPanel } from '/connect.js';
import { capture } from '/capture.js';
import { floatingCaptions } from '/floating.js';
import { LANGUAGE_CATALOG } from '/languages.js';

const $ = (id) => document.getElementById(id);
const T = {
  en: {
    chip: 'Just for me', mine: 'My transcripts', toEvents: 'Use it for events', toEventsQ: 'Switch OpenCaptions to events (rooms, QR codes, the dashboard)? Your transcripts stay here, and you can come back to Just for me from the setup wizard.', src: 'Listen to', mic: 'Microphone', screen: 'Computer sound', both: 'Both', device: 'Microphone',
    to: 'Translate to', none: 'Don’t translate', start: 'Start captions', stop: 'Stop',
    hintMic: 'Everything the microphone hears is captioned: you, or a conversation in the room.',
    hintScreen: 'Captions what the computer plays: a call, a video, a class. Your browser asks what to share. On Windows, choose the entire screen and turn on “Share system audio”. On a Mac, choose the tab that’s playing (Chrome or Edge) and turn on its audio.',
    hintBoth: 'Your microphone and the computer’s sound together: both sides of a call. Use headphones, or the microphone also hears the speakers and everything is captioned twice. The browser asks what to share, as with Computer sound.',
    noAudio: 'No sound was shared. Try again and turn on “Share system audio” (or the tab’s audio).',
    denied: 'The browser didn’t allow it. Check the microphone or screen-sharing permission and try again.',
    ended: 'The sound source stopped (the microphone was unplugged or sharing ended).',
    empty: 'Press “Start captions” and speak, or play something.', original: 'Original', listening: 'Listening', paused: 'Paused (silence)',
    idle: 'Stopped', connecting: 'Connecting…', aiForced: 'OpenCaptions was started in demo mode, so captions are simulated even though a key is saved. Start it normally to use Gemini.', aiMock: 'Captions are simulated until you connect an AI. Paste a free Gemini key (about two minutes):',
    aiTitle: 'The AI that writes the captions', floating: 'Floating captions', transcript: 'Transcript', download: 'Download (.txt)', room: 'Just for me', ai: { gemini: 'Gemini', local: 'On this computer', mock: 'Simulated' },
  },
  es: {
    chip: 'Solo para mí', mine: 'Mis transcripciones', toEvents: 'Usarlo para eventos', toEventsQ: '¿Pasar OpenCaptions a eventos (salas, códigos QR, el panel)? Tus transcripciones quedan acá, y podés volver a Solo para mí desde el asistente.', src: 'Escuchar', mic: 'Micrófono', screen: 'Sonido de la compu', both: 'Los dos', device: 'Micrófono',
    to: 'Traducir a', none: 'No traducir', start: 'Empezar a subtitular', stop: 'Detener',
    hintMic: 'Se subtitula todo lo que escucha el micrófono: vos, o una conversación en la sala.',
    hintScreen: 'Subtitula lo que suena en la compu: una llamada, un video, una clase. El navegador te pregunta qué compartir. En Windows, elegí la pantalla completa y activá «Compartir audio del sistema». En Mac, elegí la pestaña que está sonando (Chrome o Edge) y activá su audio.',
    hintBoth: 'Tu micrófono y el sonido de la compu juntos: los dos lados de una llamada. Usá auriculares, o el micrófono también escucha los parlantes y todo se subtitula dos veces. El navegador te pregunta qué compartir, como con Sonido de la compu.',
    noAudio: 'No se compartió sonido. Probá de nuevo y activá «Compartir audio del sistema» (o el audio de la pestaña).',
    denied: 'El navegador no lo permitió. Revisá el permiso del micrófono o de compartir pantalla y probá de nuevo.',
    ended: 'Se cortó el sonido (se desconectó el micrófono o se dejó de compartir).',
    empty: 'Tocá «Empezar a subtitular» y hablá, o poné algo a sonar.', original: 'Original', listening: 'Escuchando', paused: 'En pausa (silencio)',
    idle: 'Detenido', connecting: 'Conectando…', aiForced: 'OpenCaptions se inició en modo demo, así que los subtítulos son simulados aunque haya una key guardada. Inicialo normalmente para usar Gemini.', aiMock: 'Los subtítulos son simulados hasta que conectes una IA. Pegá una key gratuita de Gemini (unos dos minutos):',
    aiTitle: 'La IA que escribe los subtítulos', floating: 'Subtítulos flotantes', transcript: 'Transcripción', download: 'Descargar (.txt)', room: 'Solo para mí', ai: { gemini: 'Gemini', local: 'En esta compu', mock: 'Simulados' },
  },
};
const t = T[LANG] || T.en;
document.documentElement.lang = LANG;
document.title = `OpenCaptions · ${t.chip}`;
$('mine-link').before(prefsControls());

await ensureSignedIn();
const api = async (method, url, body) => {
  const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
};

// ---------- the personal room ----------
const ROOM = 'me';
const ev = await getEvent(); // the event's language names
let S = await api('GET', '/api/setup');
// The room comes from the setup (every room): the public list leaves the personal room out in event mode.
const findRoom = async () => {
  const st = (await api('GET', '/api/setup')).stages.find((x) => x.id === ROOM);
  return st && { ...st, languages: ['orig', ...st.targets.filter((x) => x !== st.source)] };
};
let room = await findRoom();
const names = (c) => LANGUAGE_CATALOG[c] || ev.languages[c] || c;
let to = store.get('me.to', '');
if (!room) {
  await api('POST', '/api/stages', { id: ROOM, name: t.room, source: 'auto', targets: [to || LANG] });
  room = await findRoom();
}

// ---------- labels ----------
$('mode-chip').textContent = t.chip;
$('mine-link').append(` ${t.mine}`);
$('to-events').textContent = t.toEvents;
// Switching to events is deliberate: ask, then the dashboard (its setup wizard if the event isn't set up yet).
$('to-events').onclick = async () => {
  if (!confirm(t.toEventsQ)) return;
  await api('PUT', '/api/setup', { mode: 'event' });
  location.href = '/admin.html';
};
$('src-label').textContent = t.src;
$('device-label').textContent = t.device;
$('to-label').textContent = t.to;
$('orig-label').textContent = t.original;
$('ai-box').setAttribute('aria-label', t.aiTitle);
for (const b of $('src').children) b.append(` ${t[b.dataset.src]}`);
$('pip').append(` ${t.floating}`);
$('doc').append(` ${t.transcript}`);
$('download').append(` ${t.download}`);
$('doc').href = `/talk.html?stage=${ROOM}`;
$('download').href = `/api/stages/${ROOM}/export.txt`;
mountIcons();

// ---------- choices: source, microphone, translation ----------
let source = store.get('me.source', 'mic');
function renderSource() {
  for (const b of $('src').children) b.setAttribute('aria-checked', String(b.dataset.src === source));
  $('f-device').classList.toggle('hidden', source === 'screen');
  $('hint').textContent = { mic: t.hintMic, screen: t.hintScreen, both: t.hintBoth }[source];
}
$('src').onclick = (e) => {
  const s = e.target.closest('[data-src]')?.dataset.src;
  if (!s || s === source) return;
  source = s; store.set('me.source', s); renderSource();
  if (running) { stop(); start(); }
};
renderSource();
async function listMics() {
  try {
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
    $('device').innerHTML = devs.map((d, i) => `<option value="${esc(d.deviceId)}">${esc(d.label || `${t.mic} ${i + 1}`)}</option>`).join('');
    const saved = store.get('me.device', '');
    if (devs.some((d) => d.deviceId === saved)) $('device').value = saved;
  } catch { /* no permission yet: labels come after the first start */ }
}
$('device').onchange = () => { store.set('me.device', $('device').value); if (running && source !== 'screen') { stop(); start(); } };
listMics();

const langs = Object.keys(LANGUAGE_CATALOG).sort((a, b) => names(a).localeCompare(names(b)));
$('to').innerHTML = `<option value="">${esc(t.none)}</option>` + langs.map((c) => `<option value="${c}">${esc(names(c))}</option>`).join('');
$('to').value = to;
$('to').onchange = async () => {
  to = $('to').value;
  store.set('me.to', to);
  // The room translates into the chosen language (or keeps its last one when translation is off: cheaper to leave).
  if (to && !(room.languages || []).includes(to)) {
    await api('PATCH', `/api/stages/${ROOM}`, { targets: [to] }).catch(() => {});
    room = await findRoom();
  }
  view.reconnect();
  render();
};

// ---------- the AI: Gemini key or local models, else simulated ----------
const engineName = (e) => t.ai[e] || e;
const keyP = keyPanel($('ai-key'), { api, onChange: async (s) => { S = { ...S, ...s }; renderAi(); } });
function renderAi() {
  const mock = (S.engine || S.primaryEngine) === 'mock';
  $('ai-box').classList.toggle('hidden', !mock);
  $('ai-note').textContent = S.ai?.set ? t.aiForced : t.aiMock;
  $('ai-key').classList.toggle('hidden', !!S.ai?.set);
  keyP.update(S);
}
renderAi();

// ---------- captions in ----------
const states = {};
const main = () => (to ? (room.languages.includes(to) ? to : 'orig') : 'orig');
const view = new Socket(() => wsUrl('/ws/view', { stage: ROOM, langs: [...new Set([main(), 'orig'])].join(',') }), {
  message(m) {
    if (m.type === 'hello') { for (const [ch, h] of Object.entries(m.history)) (states[ch] = new CaptionState()).load(h, m.partial[ch]); render(); }
    else if (m.type === 'caption') { (states[m.channel] ??= new CaptionState()).apply(m); render(); }
  },
});
function render() {
  const st = states[main()];
  const items = st ? [...st.finals.slice(-40), ...(st.partial?.text ? [{ ...st.partial, partial: true }] : [])] : [];
  $('text').innerHTML = items.length
    ? items.map((s, i) => `<p class="${i < items.length - 3 ? 'old' : ''}"></p>`).join('')
    : `<p class="empty">${esc(t.empty)}</p>`;
  if (items.length) [...$('text').children].forEach((p, i) => liveText(p, items[i].text, !items[i].partial));
  $('scroll').scrollTop = $('scroll').scrollHeight;
  const o = states.orig;
  $('orig').classList.toggle('hidden', main() === 'orig');
  if (main() !== 'orig') $('orig').querySelector('span').textContent = o?.tail(160) || '…';
  pip.render();
}
const pip = floatingCaptions({ button: $('pip'), text: () => states[main()]?.tail(220) || t.empty, live: () => !!states[main()]?.partial?.text });

// ---------- sound out: microphone or computer → the room ----------
let cap = null, ingest = null, running = false;
const pending = [];
const setStatus = (text, cls = '') => { $('status').textContent = text; $('status').className = `chip ${cls}`; };
const goLabel = () => { $('go').textContent = running ? t.stop : t.start; $('go').classList.toggle('primary', !running); $('go').classList.toggle('danger', running); };
async function start() {
  if (running) return;
  running = true; goLabel(); setStatus(t.connecting);
  try {
    cap = await capture({
      source, deviceId: $('device').value,
      onPcm: (buf) => {
        if (ingest?.ready) ingest.send(buf); else { pending.push(buf); if (pending.length > 150) pending.shift(); }
      },
      onEnded: () => { stop(); setStatus(t.ended, 'bad'); },
    });
    if (source !== 'screen') listMics();
    showMeters();
    ingest = new Socket(() => wsUrl('/ws/ingest', { stage: ROOM, kind: 'personal', label: source }), {
      open() { while (pending.length && ingest?.ready) ingest.send(pending.shift()); },
      message(m) {
        if (m.type !== 'status') return;
        const live = m.engines.some((e) => e.state === 'live');
        setStatus(m.gated ? t.paused : `${t.listening} · ${engineName(S.engine)}${m.latency?.asr != null ? ` · ${(m.latency.asr / 1000).toFixed(1)} s` : ''}`, m.gated ? 'warn' : live ? 'ok' : '');
      },
    });
  } catch (e) {
    stop();
    setStatus(e.code === 'no-audio' ? t.noAudio : /denied|NotAllowed|Permission/i.test(`${e.name} ${e.message}`) ? t.denied : e.message, 'bad');
  }
}
// A meter per source (Both: the computer's sound and the microphone), to see that each one is heard.
let meterLoop = 0;
function showMeters() {
  const rows = cap.levels().map(({ kind }) => {
    const row = document.createElement('div');
    row.innerHTML = `<span>${esc(t[kind])}</span><span class="m"><i></i></span>`;
    return row;
  });
  $('meters').replaceChildren(...rows);
  const tick = () => {
    if (!cap) return;
    cap.levels().forEach(({ db }, i) => { rows[i].querySelector('i').style.width = `${Math.max(0, Math.min(100, ((db + 60) / 60) * 100))}%`; });
    meterLoop = requestAnimationFrame(tick);
  };
  tick();
}
function stop() {
  running = false; goLabel();
  cap?.stop(); cap = null;
  ingest?.close(); ingest = null;
  pending.length = 0;
  cancelAnimationFrame(meterLoop); $('meters').replaceChildren();
  setStatus(t.idle);
}
$('go').onclick = () => (running ? stop() : start());
goLabel();
setStatus(t.idle);

// ---------- text size ----------
let size = store.get('me.size', 28);
const applySize = () => document.documentElement.style.setProperty('--size', `${size}px`);
$('smaller').onclick = () => { size = Math.max(16, size - 4); store.set('me.size', size); applySize(); };
$('bigger').onclick = () => { size = Math.min(72, size + 4); store.set('me.size', size); applySize(); };
applySize();
render();
