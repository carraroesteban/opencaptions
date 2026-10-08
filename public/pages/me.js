// me.html: OpenCaptions just for you. Whatever goes into the microphone, or whatever the computer plays (a video call, a
// video, a class), captioned live and translated if you like, in a big window and an always-on-top floating one.
// One room ("me") behind the scenes; nothing is public in personal mode (see src/server.js).
import { esc, store, wsUrl, Socket, CaptionState, CaptionFlow, getEvent } from '/common.js';
import { prefsControls, LANG } from '/i18n.js';
import { mountIcons } from '/illustrations.js';
import { ensureSignedIn } from '/signin.js';
import { keyPanel } from '/connect.js';
import { capture } from '/capture.js';
import { floatingCaptions } from '/floating.js';
import { Pacer } from '/smooth.js';
import { LANGUAGE_CATALOG } from '/languages.js';

const $ = (id) => document.getElementById(id);
const T = {
  en: {
    chip: 'Just for me', mine: 'My transcripts', toEvents: 'Use it for events', src: 'Listen to', mic: 'Microphone', screen: 'Computer sound', both: 'Both', device: 'Microphone',
    callWin: (app) => `${app} is open. To caption the call, choose Both (you and the others; use headphones), then share the entire screen with “Share system audio” on.`,
    callMac: (app) => `${app} is open. On a Mac, browsers can’t capture another app’s sound: join the call in Chrome or Edge instead (Zoom, Teams and Webex work on the web) and choose Computer sound, then that tab. Or use the Microphone with the speakers on.`,
    callUse: 'Use Both',
    to: 'Translate to', none: 'Don’t translate', start: 'Start captions', stop: 'Stop',
    hintMic: 'Everything the microphone hears is captioned: you, or a conversation in the room.',
    hintScreen: 'Captions what the computer plays: a call, a video, a class. Your browser asks what to share. On Windows, choose the entire screen and turn on “Share system audio”. On a Mac, choose the tab that’s playing (Chrome or Edge) and turn on its audio.',
    hintBoth: 'Your microphone and the computer’s sound together: both sides of a call. Use headphones, or the microphone also hears the speakers and everything is captioned twice. The browser asks what to share, as with Computer sound.',
    noAudio: 'No sound was shared. Try again and turn on “Share system audio” (or the tab’s audio).',
    denied: 'The browser didn’t allow it. Check the microphone or screen-sharing permission and try again.',
    ended: 'The sound source stopped (the microphone was unplugged or sharing ended).',
    empty: 'Press “Start captions” and speak, or play something.', original: 'Original', listening: 'Listening', paused: 'Paused (silence)',
    idle: 'Stopped', connecting: 'Connecting…', aiForced: 'OpenCaptions was started in demo mode, so captions are simulated even though a key is saved. Start it normally to use Gemini.', aiMock: 'Captions are simulated until you connect an AI. Paste a free Gemini key (about two minutes):',
    aiTitle: 'The AI that writes the captions', floating: 'Floating captions', transcript: 'Transcript', download: 'Download (.txt)', room: 'Just for me', ai: { gemini: 'In the cloud', local: 'On this computer', mock: 'Simulated' },
    ev: {
      title: 'Use OpenCaptions for events?', intro: 'It becomes an event dashboard: rooms, a QR code for the audience, the stage screen and the livestream overlay.',
      keepH: 'Stays as it is', keep: ['Your transcripts, in My transcripts. They stay private.', 'Your AI and its key.', 'This page: Just for me keeps working at /me.html.'],
      changeH: 'Good to know',
      opens: 'OpenCaptions opens on the dashboard instead of this page.',
      public: 'The audience pages open up: anyone who can reach this computer (on the same Wi-Fi, or anywhere with a public address) can read the captions of the event’s rooms. Not yours from here.',
      gemini: 'Each room uses the AI while it’s live: with a paid Gemini key, about US$ 2.20 per room per hour.',
      local: 'On this computer, captions keep up with about one room at a time. For more rooms, use Gemini or more computers.',
      mock: 'Captions stay simulated until you connect an AI.',
      wizard: 'Next, a short wizard asks for the event’s name, rooms and languages. It shows what will change before applying it.',
      back: 'To come back: Dashboard → Settings → Just for me. Nothing is deleted either way.', ok: 'Switch to events', cancel: 'Stay here',
    },
  },
  es: {
    chip: 'Solo para mí', mine: 'Mis transcripciones', toEvents: 'Usarlo para eventos', src: 'Escuchar', mic: 'Micrófono', screen: 'Sonido de la compu', both: 'Los dos', device: 'Micrófono',
    callWin: (app) => `${app} está abierto. Para subtitular la llamada, elegí Los dos (vos y los demás; usá auriculares) y compartí la pantalla completa con «Compartir audio del sistema» activado.`,
    callMac: (app) => `${app} está abierto. En Mac, los navegadores no pueden tomar el sonido de otra app: entrá a la llamada desde Chrome o Edge (Zoom, Teams y Webex funcionan en la web) y elegí Sonido de la compu, y esa pestaña. O usá el Micrófono con los parlantes encendidos.`,
    callUse: 'Usar Los dos',
    to: 'Traducir a', none: 'No traducir', start: 'Empezar a subtitular', stop: 'Detener',
    hintMic: 'Se subtitula todo lo que escucha el micrófono: vos, o una conversación en la sala.',
    hintScreen: 'Subtitula lo que suena en la compu: una llamada, un video, una clase. El navegador te pregunta qué compartir. En Windows, elegí la pantalla completa y activá «Compartir audio del sistema». En Mac, elegí la pestaña que está sonando (Chrome o Edge) y activá su audio.',
    hintBoth: 'Tu micrófono y el sonido de la compu juntos: los dos lados de una llamada. Usá auriculares, o el micrófono también escucha los parlantes y todo se subtitula dos veces. El navegador te pregunta qué compartir, como con Sonido de la compu.',
    noAudio: 'No se compartió sonido. Probá de nuevo y activá «Compartir audio del sistema» (o el audio de la pestaña).',
    denied: 'El navegador no lo permitió. Revisá el permiso del micrófono o de compartir pantalla y probá de nuevo.',
    ended: 'Se cortó el sonido (se desconectó el micrófono o se dejó de compartir).',
    empty: 'Tocá «Empezar a subtitular» y hablá, o poné algo a sonar.', original: 'Original', listening: 'Escuchando', paused: 'En pausa (silencio)',
    idle: 'Detenido', connecting: 'Conectando…', aiForced: 'OpenCaptions se inició en modo demo, así que los subtítulos son simulados aunque haya una key guardada. Inicialo normalmente para usar Gemini.', aiMock: 'Los subtítulos son simulados hasta que conectes una IA. Pegá una key gratuita de Gemini (unos dos minutos):',
    aiTitle: 'La IA que escribe los subtítulos', floating: 'Subtítulos flotantes', transcript: 'Transcripción', download: 'Descargar (.txt)', room: 'Solo para mí', ai: { gemini: 'En la nube', local: 'En esta compu', mock: 'Simulados' },
    ev: {
      title: '¿Usar OpenCaptions para eventos?', intro: 'Pasa a ser un panel de evento: salas, un código QR para el público, la pantalla del escenario y el overlay de la transmisión.',
      keepH: 'Queda igual', keep: ['Tus transcripciones, en Mis transcripciones. Siguen siendo privadas.', 'Tu IA y su key.', 'Esta página: Solo para mí sigue funcionando en /me.html.'],
      changeH: 'Tené en cuenta',
      opens: 'OpenCaptions abre en el panel en vez de esta página.',
      public: 'Las páginas del público se abren: cualquiera que llegue a esta compu (en el mismo Wi-Fi, o desde cualquier lado con una dirección pública) puede leer los subtítulos de las salas del evento. Los tuyos de acá, no.',
      gemini: 'Cada sala usa la IA mientras está en vivo: con una key paga de Gemini, unos US$ 2,20 por sala por hora.',
      local: 'En esta compu, los subtítulos dan abasto para una sala a la vez, más o menos. Para más salas, usá Gemini o más computadoras.',
      mock: 'Los subtítulos siguen simulados hasta que conectes una IA.',
      wizard: 'Después, un asistente corto te pide el nombre del evento, las salas y los idiomas. Antes de aplicar, muestra qué va a cambiar.',
      back: 'Para volver: Panel → Ajustes → Solo para mí. En ningún caso se borra nada.', ok: 'Pasar a eventos', cancel: 'Quedarme acá',
    },
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
// Translate into the computer's language by default (captions of a call or video in another language, in yours):
// the browser's first language, which follows the system's unless changed. "Don't translate" is remembered as ''.
const osLang = ((navigator.languages || [])[0] || navigator.language || '').slice(0, 2).toLowerCase().replace(/^nb|^nn/, 'no');
let to = store.get('me.to', null) ?? (LANGUAGE_CATALOG[osLang] ? osLang : LANGUAGE_CATALOG[LANG] ? LANG : '');
if (!room) {
  await api('POST', '/api/stages', { id: ROOM, name: t.room, source: 'auto', targets: [to || LANG] });
  room = await findRoom();
}
if (to && !(room.languages || []).includes(to)) { // a language chosen here before, or the computer's on the first visit
  await api('PATCH', `/api/stages/${ROOM}`, { targets: [to] }).catch(() => {});
  room = await findRoom();
}

// ---------- labels ----------
$('mode-chip').textContent = t.chip;
$('mine-link').append(` ${t.mine}`);
$('to-events').textContent = t.toEvents;
// Switching to events is deliberate: first what stays and what changes (in the page, not a browser pop-up), then
// the dashboard (its setup wizard if the event isn't set up yet).
const li = (cls) => (text) => `<li><span data-icon="${cls}"></span><span>${esc(text)}</span></li>`;
$('ev-title').textContent = t.ev.title;
$('ev-intro').textContent = t.ev.intro;
$('ev-keep-h').textContent = t.ev.keepH;
$('ev-keep').innerHTML = t.ev.keep.map(li('check')).join('');
$('ev-change-h').textContent = t.ev.changeH;
$('ev-back').textContent = t.ev.back;
$('ev-ok').textContent = t.ev.ok;
$('ev-cancel').textContent = t.ev.cancel;
$('to-events').onclick = () => {
  const ai = S.engine === 'mock' ? 'mock' : S.engine === 'local' ? 'local' : 'gemini';
  $('ev-change').innerHTML = [t.ev.opens, t.ev.public, t.ev[ai], ...(S.eventDone ? [] : [t.ev.wizard])].map(li('alert')).join('');
  mountIcons($('dlg-events'));
  $('dlg-events').returnValue = '';
  $('dlg-events').showModal();
};
$('dlg-events').addEventListener('close', async () => {
  if ($('dlg-events').returnValue !== 'ok') return;
  await api('PUT', '/api/setup', { mode: 'event' });
  location.href = S.eventDone ? '/admin.html' : '/welcome.html#name'; // never set up as an event: its wizard first
});
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

// A call app open on this computer (Zoom, Teams…): suggest how to caption the call. The server only reports
// which known call apps are running; a call in a browser tab can't be seen.
async function checkCalls() {
  if (running) return;
  const r = await fetch('/api/me/calls').then((x) => (x.ok ? x.json() : null)).catch(() => null);
  const app = r?.apps?.[0];
  const mac = r?.platform === 'darwin';
  $('call').classList.toggle('hidden', !app || running);
  if (!app) return;
  $('call').querySelector('span').textContent = (mac ? t.callMac : t.callWin)(r.apps.join(', '));
  $('call-use').textContent = t.callUse;
  $('call-use').classList.toggle('hidden', mac || source === 'both');
}
$('call-use').onclick = () => { source = 'both'; store.set('me.source', source); renderSource(); $('call-use').classList.add('hidden'); };

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
const states = {}; // channel → what's on screen, fed word by word by its pacer (smooth.js)
const pacers = {};
const pacer = (ch) => (pacers[ch] ??= new Pacer((seg) => { (states[ch] ??= new CaptionState()).apply(seg); shown(ch, seg); }));
const main = () => (to ? (room.languages.includes(to) ? to : 'orig') : 'orig');
const view = new Socket(() => wsUrl('/ws/view', { stage: ROOM, langs: [...new Set([main(), 'orig'])].join(',') }), {
  message(m) {
    if (m.type === 'hello') {
      for (const [ch, h] of Object.entries(m.history)) { (states[ch] = new CaptionState()).load(h, m.partial[ch]); pacer(ch).load([...h, m.partial[ch]].filter(Boolean)); }
      render();
    } else if (m.type === 'caption') pacer(m.channel).push(m);
  },
});
// Paragraphs that only change where a word was added: the rest of the page stays still.
const flow = new CaptionFlow($('text'));
/** A caption as the pacer shows it now: only its own channel's text changes. */
function shown(ch, seg) {
  if (ch === main()) { flow.update(seg); $('scroll').scrollTop = $('scroll').scrollHeight; }
  if (ch === 'orig') renderOrig();
  pip.render();
}
function render() {
  const st = states[main()];
  flow.render(st ? [...st.finals.slice(-60), st.partial] : []);
  if (!$('text').children.length) $('text').innerHTML = `<p class="empty">${esc(t.empty)}</p>`;
  $('scroll').scrollTop = $('scroll').scrollHeight;
  renderOrig();
  pip.render();
}
function renderOrig() {
  $('orig').classList.toggle('hidden', main() === 'orig');
  if (main() !== 'orig') $('orig').querySelector('span').textContent = states.orig?.tail(160) || '…';
}
const pip = floatingCaptions({ button: $('pip'), text: () => states[main()]?.tail(220) || t.empty, live: () => !!states[main()]?.partial?.text, caps: () => pacers[main()]?.shown() || [] });

// ---------- sound out: microphone or computer → the room ----------
let cap = null, ingest = null, running = false;
const pending = [];
const setStatus = (text, cls = '') => { $('status').textContent = text; $('status').className = `chip ${cls}`; };
const goLabel = () => { $('go').textContent = running ? t.stop : t.start; $('go').classList.toggle('primary', !running); $('go').classList.toggle('danger', running); };
async function start() {
  if (running) return;
  running = true; goLabel(); setStatus(t.connecting);
  $('call').classList.add('hidden');
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

checkCalls(); // here, after everything it reads is set up
setInterval(checkCalls, 15_000);
