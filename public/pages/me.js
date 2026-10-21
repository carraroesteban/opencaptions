// me.html: OpenCaptions just for you. Whatever goes into the microphone, or whatever the computer plays (a video call, a
// video, a class), captioned live and translated if you like, in a big window and an always-on-top floating one.
// One room ("me") behind the scenes; nothing is public in personal mode (see src/server.js).
// Three screens (body[data-state]): idle (one big Start, the choices as a sentence), live (the captions fill the page,
// a dock that fades away), setup (one step per screen). Basic or Advanced (prefs.js) decides how many controls show.
import { esc, store, wsUrl, Socket, CaptionState, CaptionFlow, getEvent, fmtClock, wakeLock } from '/common.js';
import { prefsControls, LANG, advanced } from '/prefs.js';
import { mountIcons } from '/illustrations.js';
import { ensureSignedIn } from '/signin.js';
import { keyPanel } from '/connect.js';
import { localPanel } from '/local-mode.js';
import { aiBadge } from '/ai-badge.js';
import { capture, keepAlive } from '/capture.js';
import { floatingCaptions } from '/floating.js';
import { Pacer } from '/smooth.js';
import { LANGUAGE_CATALOG } from '/languages.js';

const $ = (id) => document.getElementById(id);
const T = {
  en: {
    chip: 'Just for me', mine: 'My transcripts', toEvents: 'Use it for events', src: 'Listen to', mic: 'Microphone', screen: 'This computer', both: 'Both', device: 'Microphone',
    callWin: (app) => `${app} is open. To caption the call, choose Both (you and the others; use headphones), then share the entire screen with “Share system audio” on.`,
    callMac: (app) => `${app} is open. On a Mac, browsers can’t capture another app’s sound: join the call in Chrome or Edge instead (Zoom, Teams and Webex work on the web) and choose This computer, then that tab. Or use the Microphone with the speakers on.`,
    callUse: 'Use Both', callOpen: (app) => `${app} is open: you can caption the call.`, callHow: 'How?',
    to: 'Translate to', none: 'Don’t translate', start: 'Start captions', stop: 'Stop', from: 'Spoken', fromAuto: 'Auto-detect',
    tagline: 'Live captions of whatever you hear or play: a call, a video, a class.', space: 'or press', spaceKey: 'Space',
    hintMic: 'Everything the microphone hears is captioned: you, or a conversation in the room.',
    hintScreen: 'Captions what the computer plays: a call, a video, a class. Your browser asks what to share. On Windows, choose the entire screen and turn on “Share system audio”. On a Mac, choose the tab that’s playing (Chrome or Edge) and turn on its audio.',
    hintBoth: 'Your microphone and the computer’s sound together: both sides of a call. Use headphones, or the microphone also hears the speakers and everything is captioned twice. The browser asks what to share, as with This computer.',
    noAudio: 'No sound was shared. Try again and turn on “Share system audio” (or the tab’s audio).',
    denied: 'The browser didn’t allow it. Check the microphone or screen-sharing permission and try again.',
    ended: 'The sound source stopped (the microphone was unplugged or sharing ended).',
    empty: 'Press “Start captions” and speak, or play something.', original: 'Original', listening: 'Listening', paused: 'Paused (silence)',
    waiting: (l) => `Listening… ${l ? `captions in ${l}` : 'captions'} appear here as soon as someone speaks.`,
    held: 'Click anywhere on the page to bring the sound back.', resume: 'Continue captions',
    reshare: 'The page reloaded, so the browser stopped sharing the sound. Press “Continue captions” to share it again.',
    connecting: 'Connecting…', aiForced: 'OpenCaptions was started in demo mode, so captions are simulated even though a key is saved. Start it normally to use Gemini.',
    floating: 'Floating captions', transcript: 'Transcript', download: 'Download transcript (.txt)', room: 'Just for me', ai: { gemini: 'In the cloud', local: 'On this computer', mock: 'Simulated' },
    step: (i, n) => `Step ${i} of ${n}`, settings: 'Settings', back: 'Back', next: 'Next', done: 'Done', close: 'Close', captions: 'Captions',
    more: 'More', smaller: 'Smaller text', bigger: 'Larger text', size: 'Text size', controls: 'Caption controls', latest: 'Back to the latest',
    adv: 'Advanced mode', advD: 'More controls: both sounds at once, which microphone, the spoken language, the original text, sound meters and download.',
    aiH: 'First, the AI that writes your captions', aiLede: 'Paste a Gemini key from Google: it’s free and takes about two minutes.', aiHow: 'How to get one (free)',
    aiNone: 'Captions are simulated until you connect an AI.', aiFix: 'Connect an AI', aiLocal: 'Captions are made on this computer: nothing leaves it.',
    langH: 'Languages', langLede: 'Captions come in the language being spoken, and in yours if you choose it. Saying which language is spoken makes them more accurate from the first word.',
    soundH: 'What should it listen to?', soundLede: 'Choose the sound to caption, and test it: the bar moves when there’s sound.', test: 'Test the sound',
    setAi: 'Your AI', setLang: 'Language', setSound: 'Sound',
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
      back: 'To come back: Dashboard → Settings → General → Just for me. Nothing is deleted either way.', ok: 'Switch to events', cancel: 'Stay here',
    },
  },
  es: {
    chip: 'Solo para mí', mine: 'Mis transcripciones', toEvents: 'Usarlo para eventos', src: 'Escuchar', mic: 'Micrófono', screen: 'Esta compu', both: 'Los dos', device: 'Micrófono',
    callWin: (app) => `${app} está abierto. Para subtitular la llamada, elegí Los dos (vos y los demás; usá auriculares) y compartí la pantalla completa con «Compartir audio del sistema» activado.`,
    callMac: (app) => `${app} está abierto. En Mac, los navegadores no pueden tomar el sonido de otra app: entrá a la llamada desde Chrome o Edge (Zoom, Teams y Webex funcionan en la web) y elegí Esta compu, y esa pestaña. O usá el Micrófono con los parlantes encendidos.`,
    callUse: 'Usar Los dos', callOpen: (app) => `${app} está abierto: podés subtitular la llamada.`, callHow: '¿Cómo?',
    to: 'Traducir a', none: 'No traducir', start: 'Empezar a subtitular', stop: 'Detener', from: 'Se habla', fromAuto: 'Automático',
    tagline: 'Subtítulos en vivo de lo que escuchás o suena en la compu: una llamada, un video, una clase.', space: 'o presioná', spaceKey: 'Espacio',
    hintMic: 'Se subtitula todo lo que escucha el micrófono: vos, o una conversación en la sala.',
    hintScreen: 'Subtitula lo que suena en la compu: una llamada, un video, una clase. El navegador te pregunta qué compartir. En Windows, elegí la pantalla completa y activá «Compartir audio del sistema». En Mac, elegí la pestaña que está sonando (Chrome o Edge) y activá su audio.',
    hintBoth: 'Tu micrófono y el sonido de la compu juntos: los dos lados de una llamada. Usá auriculares, o el micrófono también escucha los parlantes y todo se subtitula dos veces. El navegador te pregunta qué compartir, como con Esta compu.',
    noAudio: 'No se compartió sonido. Probá de nuevo y activá «Compartir audio del sistema» (o el audio de la pestaña).',
    denied: 'El navegador no lo permitió. Revisá el permiso del micrófono o de compartir pantalla y probá de nuevo.',
    ended: 'Se cortó el sonido (se desconectó el micrófono o se dejó de compartir).',
    empty: 'Tocá «Empezar a subtitular» y hablá, o poné algo a sonar.', original: 'Original', listening: 'Escuchando', paused: 'En pausa (silencio)',
    waiting: (l) => `Escuchando… ${l ? `los subtítulos en ${l}` : 'los subtítulos'} aparecen acá en cuanto alguien hable.`,
    held: 'Hacé clic en cualquier parte de la página para que vuelva el sonido.', resume: 'Seguir subtitulando',
    reshare: 'La página se recargó, así que el navegador dejó de compartir el sonido. Tocá «Seguir subtitulando» para compartirlo de nuevo.',
    connecting: 'Conectando…', aiForced: 'OpenCaptions se inició en modo demo, así que los subtítulos son simulados aunque haya una key guardada. Inicialo normalmente para usar Gemini.',
    floating: 'Subtítulos flotantes', transcript: 'Transcripción', download: 'Descargar la transcripción (.txt)', room: 'Solo para mí', ai: { gemini: 'En la nube', local: 'En esta compu', mock: 'Simulados' },
    step: (i, n) => `Paso ${i} de ${n}`, settings: 'Ajustes', back: 'Atrás', next: 'Siguiente', done: 'Listo', close: 'Cerrar', captions: 'Subtítulos',
    more: 'Más', smaller: 'Texto más chico', bigger: 'Texto más grande', size: 'Tamaño del texto', controls: 'Controles de los subtítulos', latest: 'Volver a lo último',
    adv: 'Modo avanzado', advD: 'Más controles: los dos sonidos a la vez, qué micrófono, el idioma que se habla, el texto original, los medidores de sonido y la descarga.',
    aiH: 'Primero, la IA que escribe tus subtítulos', aiLede: 'Pegá una key de Gemini, de Google: es gratis y lleva unos dos minutos.', aiHow: 'Cómo conseguir una (gratis)',
    aiNone: 'Los subtítulos son simulados hasta que conectes una IA.', aiFix: 'Conectar una IA', aiLocal: 'Los subtítulos se hacen en esta compu: no sale nada de ella.',
    langH: 'Idiomas', langLede: 'Los subtítulos salen en el idioma en que se habla, y en el tuyo si lo elegís. Decir qué idioma se habla los hace más precisos desde la primera palabra.',
    soundH: '¿Qué tiene que escuchar?', soundLede: 'Elegí el sonido a subtitular y probalo: la barra se mueve cuando hay sonido.', test: 'Probar el sonido',
    setAi: 'Tu IA', setLang: 'Idioma', setSound: 'Sonido',
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
      back: 'Para volver: Panel → Ajustes → General → Solo para mí. En ningún caso se borra nada.', ok: 'Pasar a eventos', cancel: 'Quedarme acá',
    },
  },
};
const t = T[LANG] || T.en;
document.documentElement.lang = LANG;
document.title = `OpenCaptions · ${t.chip}`;
$('mine-link').before(prefsControls());
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
if (!document.startViewTransition) document.documentElement.classList.add('no-vt'); // then the screens fade in with CSS

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
$('mine-link').insertAdjacentHTML('beforeend', ` <span class="lbl">${esc(t.mine)}</span>`);
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
  $('dlg-settings').close();
  const ai = S.engine === 'mock' ? 'mock' : S.engine === 'local' ? 'local' : 'gemini';
  $('ev-change').innerHTML = [t.ev.opens, t.ev.public, t.ev[ai], ...(S.eventDone ? [] : [t.ev.wizard])].map(li('alert')).join('');
  mountIcons($('dlg-events'));
  $('dlg-events').returnValue = '';
  $('dlg-events').showModal();
};
$('dlg-events').addEventListener('close', async () => {
  if ($('dlg-events').returnValue !== 'ok') return;
  await api('PUT', '/api/setup', { mode: 'event' });
  stop(); // leaving on purpose: no "leave this page?"
  location.href = S.eventDone ? '/admin.html' : '/welcome.html#name'; // never set up as an event: its wizard first
});
$('src-label').textContent = t.src;
$('device-label').textContent = t.device;
$('to-label').textContent = t.to;
$('from-label').textContent = t.from;
$('to2-label').textContent = t.to;
$('orig-label').textContent = t.original;
$('view').setAttribute('aria-label', t.captions);
$('scroll').setAttribute('aria-label', t.captions);
for (const id of ['ai-h', 'lang-h', 'sound-h']) $(id).textContent = t[id.replace('-h', 'H')];
$('ai-lede').innerHTML = `${esc(t.aiLede)} <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">${esc(t.aiHow)} ↗</a>`;
$('lang-lede').textContent = t.langLede;
$('sound-lede').textContent = t.soundLede;
$('back').textContent = t.back;
$('test').append(` ${t.test}`);
$('ai-fix').textContent = t.aiFix;
$('set-title').textContent = t.settings;
$('set-close').setAttribute('aria-label', t.close);
for (const b of $('src').querySelectorAll('[data-src]')) b.append(` ${t[b.dataset.src]}`);
$('tagline').textContent = t.tagline;
$('kbd-hint').innerHTML = `${esc(t.space)} <kbd>${esc(t.spaceKey)}</kbd>`;
$('stop-label').textContent = t.stop;
$('dock').setAttribute('aria-label', t.controls);
// Icon buttons: a name for screen readers, and a tooltip.
const tip = (id, text) => { $(id).setAttribute('aria-label', text); $(id).title = text; };
tip('pip', t.floating); tip('more', t.more); tip('settings', t.settings); tip('smaller', t.smaller); tip('bigger', t.bigger); tip('smaller2', t.smaller); tip('bigger2', t.bigger);
$('size-label').textContent = t.size;
$('download').append(` ${t.download}`);
$('menu-settings').append(` ${t.settings}`);
$('adv-label').textContent = $('adv2-t').textContent = t.adv;
$('adv2-d').textContent = t.advD;
$('to-live').append(` ${t.latest}`);
$('doc').append(` ${t.transcript}`);
$('resume').append(` ${t.resume}`);
for (const b of $('dlg-settings').querySelectorAll('[data-open]')) b.insertAdjacentHTML('beforeend', `<span>${esc({ ai: t.setAi, lang: t.setLang, sound: t.setSound }[b.dataset.open])}</span><small></small>`);
$('doc').href = `/talk.html?stage=${ROOM}`;
$('download').href = `/api/stages/${ROOM}/export.txt`;
mountIcons();

// ---------- Basic or Advanced (this browser's choice; Basic until changed) ----------
const advBoxes = [$('adv'), $('adv2')];
for (const b of advBoxes) {
  b.checked = advanced.get();
  b.onchange = () => { advanced.set(b.checked); for (const o of advBoxes) o.checked = b.checked; };
}

// ---------- choices: source, microphone, translation ----------
let source = store.get('me.source', 'mic');
function renderSource() {
  for (const b of $('src').querySelectorAll('[data-src]')) b.setAttribute('aria-checked', String(b.dataset.src === source));
  $('src').querySelector('[data-src="both"]').classList.toggle('adv', source !== 'both'); // Basic shows Both only while it's on
  $('f-device').classList.toggle('hidden', source === 'screen');
  $('hint').textContent = { mic: t.hintMic, screen: t.hintScreen, both: t.hintBoth }[source];
  slideThumb();
}
// The segmented control's knob slides to the choice (also when Basic/Advanced or the window changes its size).
function slideThumb() {
  const b = $('src').querySelector('[aria-checked="true"]'), th = $('src-thumb');
  if (!b?.offsetWidth) return;
  const first = !th.style.width; // placed, not slid, the first time
  if (first) th.style.transition = 'none';
  th.style.width = `${b.offsetWidth}px`;
  th.style.translate = `${b.offsetLeft}px 0`;
  if (first) { void th.offsetWidth; th.style.transition = ''; }
}
new ResizeObserver(slideThumb).observe($('src'));
// A new source or microphone: captioning restarts with it; a sound test stops, to be tried again.
const restart = () => { if (running) { halt(); start(); } else if (cap) stop(); };
$('src').onclick = (e) => {
  const s = e.target.closest('[data-src]')?.dataset.src;
  if (!s || s === source) return;
  source = s; store.set('me.source', s); renderSource();
  restart();
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
  // One line; how to do it (it differs on a Mac) only when asked.
  $('call').querySelector('span').textContent = t.callOpen(r.apps.join(', '));
  $('call-more').textContent = (mac ? t.callMac : t.callWin)(r.apps.join(', '));
  $('call-how').textContent = t.callHow;
  $('call-use').textContent = t.callUse;
  $('call-use').classList.toggle('hidden', mac || source === 'both');
}
$('call-how').onclick = () => {
  const open = $('call-more').classList.toggle('hidden') === false;
  $('call-how').setAttribute('aria-expanded', String(open));
};
$('call-use').onclick = () => { source = 'both'; store.set('me.source', source); renderSource(); $('call-use').classList.add('hidden'); restart(); };

async function listMics() {
  try {
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
    $('device').innerHTML = devs.map((d, i) => `<option value="${esc(d.deviceId)}">${esc(d.label || `${t.mic} ${i + 1}`)}</option>`).join('');
    const saved = store.get('me.device', '');
    if (devs.some((d) => d.deviceId === saved)) $('device').value = saved;
  } catch { /* no permission yet: labels come after the first start */ }
}
$('device').onchange = () => { store.set('me.device', $('device').value); if (source !== 'screen') restart(); };
listMics();

// The language: in the start screen's sentence (and its step), and in the dock while captioning (the same choice).
const langs = Object.keys(LANGUAGE_CATALOG).sort((a, b) => names(a).localeCompare(names(b)));
$('to').innerHTML = $('to2').innerHTML = `<option value="">${esc(t.none)}</option>` + langs.map((c) => `<option value="${c}">${esc(names(c))}</option>`).join('');
$('to').value = $('to2').value = to;
// What's spoken: detected (the default) or said here. On this computer it's what the recognizer listens for.
$('from').innerHTML = `<option value="auto">${esc(t.fromAuto)}</option>` + langs.map((c) => `<option value="${c}">${esc(names(c))}</option>`).join('');
$('from').value = room.source || 'auto';
// Basic hides the spoken language, unless one was pinned (in Advanced): then it stays in sight.
const renderFrom = () => { for (const el of [$('f-from'), $('arrow')]) el.classList.toggle('adv', (room.source || 'auto') === 'auto'); };
renderFrom();
$('from').onchange = async () => {
  const was = room.source || 'auto';
  try {
    await api('PATCH', `/api/stages/${ROOM}`, { source: $('from').value });
    room = await findRoom();
  } catch (err) { $('from').value = was; setStatus(err.message, 'bad'); return; }
  renderFrom();
  view.subscribe([...new Set([main(), 'orig'])]);
  render();
};
let picking = 0; // the latest choice wins (arrow keys in the list fire one change per language they pass)
$('to').onchange = $('to2').onchange = async (e) => {
  const was = to, n = ++picking;
  to = $('to').value = $('to2').value = e.target.value;
  // The room translates into the chosen language (or keeps its last one when translation is off: cheaper to leave).
  if (to && !(room.languages || []).includes(to)) {
    try {
      await api('PATCH', `/api/stages/${ROOM}`, { targets: [to] });
      const r = await findRoom();
      if (n !== picking) return;
      room = r;
    } catch (err) {
      if (n !== picking) return;
      to = $('to').value = $('to2').value = was; // say why, and show the language that's really on
      setStatus(err.message, 'bad');
      return;
    }
  }
  store.set('me.to', to);
  view.subscribe([...new Set([main(), 'orig'])]); // same connection: the room answers with what it has in that language
  render();
};

// ---------- the AI: Gemini key or local models, else simulated ----------
const engineName = (e) => t.ai[e] || e;
const isMock = () => (S.engine || S.primaryEngine) === 'mock';
const keyP = keyPanel($('ai-key'), { api, onChange: async (s) => { S = { ...S, ...s }; renderAi(); } });
function renderAi() {
  $('ai-note').textContent = !isMock() && S.engine === 'local' ? t.aiLocal : ''; // demo mode with a key: the key panel says so
  $('ai-box').classList.toggle('hidden', !isMock() || !!S.ai?.set); // test mode with a key: the AI badge says so
  $('ai-box-note').textContent = S.ai?.set ? t.aiForced : t.aiNone;
  $('ai-fix').classList.toggle('hidden', !!S.ai?.set);
  keyP.update(S);
}
localPanel($('local-offer'), { api, onChange: (s) => { if (s.engine === 'local') S = { ...S, engine: 'local' }; renderAi(); } });
renderAi();
// Which AI makes the captions, the same badge as the dashboard's, and the switch (Gemini, this computer, or both).
const reloadAi = async () => { try { S = await api('GET', '/api/setup'); renderAi(); aiNow.update(S.aiNow); } catch { /* offline: next time */ } };
const aiNow = aiBadge($('ai-now'), { api, onChange: reloadAi });
aiNow.update(S.aiNow);
setInterval(() => { if (!document.hidden) reloadAi(); }, 5000); // this computer getting ready, a key saved elsewhere

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
// Paragraphs that only change where a word was added: the rest of the page stays still. Only the newest is bright.
const flow = new CaptionFlow($('text'), { bright: 1 });
// Following the newest line, unless you scrolled up to read (then "Back to the latest" brings you down).
let stick = true, textH = 0;
function follow() {
  const box = $('text'), sc = $('scroll'), h = box.offsetHeight;
  if (stick) sc.scrollTop = sc.scrollHeight;
  // A new line: everything starts where it was and slides up, so the eye keeps its place (TV roll-up).
  if (stick && textH && h > textH && h - textH < sc.clientHeight / 2 && !reduced()) {
    box.animate([{ transform: `translateY(${h - textH}px)` }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.16, 1, .3, 1)' });
  }
  textH = h;
}
$('scroll').addEventListener('scroll', () => {
  const sc = $('scroll');
  stick = sc.scrollHeight - sc.scrollTop - sc.clientHeight < 48;
  $('to-live').classList.toggle('hidden', stick);
}, { passive: true });
$('to-live').onclick = () => $('scroll').scrollTo({ top: $('scroll').scrollHeight, behavior: reduced() ? 'auto' : 'smooth' });
/** A caption as the pacer shows it now: only its own channel's text changes. */
function shown(ch, seg) {
  if (ch === main()) { flow.update(seg); follow(); }
  if (ch === 'orig') renderOrig();
  pip.render();
}
function render() {
  $('download').href = `/api/stages/${ROOM}/export.txt?lang=${encodeURIComponent(main())}`; // the language being read
  const st = states[main()];
  flow.render(st ? [...st.finals.slice(-60), st.partial] : []);
  if (!$('text').children.length) {
    $('text').innerHTML = `<div class="empty"><span class="bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span><p>${esc(t.waiting(main() === 'orig' ? '' : names(main())))}</p></div>`;
  }
  stick = true;
  $('scroll').scrollTop = $('scroll').scrollHeight;
  $('to-live').classList.add('hidden');
  textH = $('text').querySelector('.empty') ? 0 : $('text').offsetHeight;
  renderOrig();
  pip.render();
}
// The original under the translation, only when it adds something: words in another language than the one being read.
function renderOrig() {
  const o = states.orig, lastLang = (o?.partial || o?.finals.at(-1))?.lang;
  const show = main() !== 'orig' && !!o?.tail(1) && lastLang !== main();
  $('orig').classList.toggle('hidden', !show);
  if (show) $('orig').querySelector('span').textContent = o.tail(innerWidth < 640 ? 80 : 150);
}
const pip = floatingCaptions({ button: $('pip'), text: () => states[main()]?.tail(220) || t.empty, live: () => !!states[main()]?.partial?.text, caps: () => pacers[main()]?.shown() || [] });

// ---------- the screens: idle, live, setup ----------
let setupOpen = false;
const inSetup = () => setupOpen;
/** Shows the screen that matches the state. Idle ⇄ live morphs (the big button becomes the dock); the rest crossfades. */
function paint() {
  const state = setupOpen ? 'setup' : running ? 'live' : 'idle', b = document.body;
  const apply = () => { b.dataset.state = state; b.classList.toggle('running', running); place(); };
  if (!b.dataset.state || (b.dataset.state === state && b.classList.contains('running') === running) || !document.startViewTransition || reduced()) return apply();
  document.startViewTransition(apply);
}
// The status goes where it's seen: under the big button, over the captions, or above the step's buttons.
function place() {
  const s = document.body.dataset.state;
  if (s === 'live') $('view').prepend($('status'));
  else if (s === 'setup') document.querySelector('.actions').before($('status'));
  else $('kbd-hint').after($('status'));
}

// ---------- sound out: microphone or computer → the room ----------
let cap = null, ingest = null, running = false, resumeWanted = false;
let startedAt = 0, clockTimer = 0, levelLoop = 0, level = 0, locked = null;
const live = keepAlive('me'); // a reload (the page language) or a closed tab doesn't lose the captions
const pending = [];
const setStatus = (text, cls = '') => { $('status').textContent = text; $('status').className = text ? `chip ${cls}` : ''; };
const goLabel = () => { $('go-label').textContent = resumeWanted ? t.resume : t.start; };
const why = (e) => (e.code === 'no-audio' ? t.noAudio : /denied|NotAllowed|Permission/i.test(`${e.name} ${e.message}`) ? t.denied : e.message);
const tickClock = () => { $('clock').textContent = fmtClock(Date.now() - startedAt); };
// The sound, opened by the sound test or by Start: a test that's still on becomes the captions' sound, so the
// browser doesn't ask what to share twice (Start while the test is still opening waits for it). Until captioning
// starts, nothing is sent.
let opening = null;
const openSound = () => (opening ??= openCapture().finally(() => { opening = null; }));
async function openCapture() {
  cap = await capture({
    source, deviceId: $('device').value,
    onPcm: (buf) => {
      if (!running) return;
      if (ingest?.ready) ingest.send(buf); else { pending.push(buf); if (pending.length > 150) pending.shift(); }
    },
    onEnded: () => { stop(); setStatus(t.ended, 'bad'); },
  });
  if (source !== 'screen') listMics();
  listen();
}
async function start() {
  if (running) return;
  running = true; resumeWanted = false; goLabel();
  $('call').classList.add('hidden');
  setStatus(t.connecting);
  render();
  paint();
  startedAt = Date.now(); tickClock(); clockTimer = setInterval(tickClock, 1000);
  locked ??= wakeLock(); // reading captions, nobody touches the computer: the screen must not dim
  wake();
  try {
    if (!cap) await openSound();
    if (!running) { cap?.stop(); cap = null; return; } // Stop was clicked while the browser asked what to share
    ingest = new Socket(() => wsUrl('/ws/ingest', { stage: ROOM, kind: 'personal', label: source }), {
      open() { while (pending.length && ingest?.ready) ingest.send(pending.shift()); },
      message(m) {
        if (m.type !== 'status') return;
        $('resume').classList.toggle('hidden', !cap?.held());
        if (cap?.held()) return setStatus(t.held, 'warn');
        const on = m.engines.some((e) => e.state === 'live');
        // Basic: listening (and "simulated", so nobody mistakes it); Advanced: which AI, and how far behind.
        const more = advanced.get() ? ` · ${engineName(isMock() ? 'mock' : S.engine)}${m.latency?.asr != null ? ` · ${(m.latency.asr / 1000).toFixed(1)} s` : ''}` : isMock() ? ` · ${t.ai.mock}` : '';
        setStatus(m.gated ? t.paused : `${t.listening}${more}`, m.gated ? '' : on ? 'ok' : '');
      },
    });
    live.set(true);
  } catch (e) {
    stop();
    setStatus(why(e), 'bad');
  }
}
$('test').onclick = async () => {
  setStatus('');
  $('test').disabled = true; // the browser may take a while to ask
  try { await openSound(); } catch (e) { stop(); setStatus(why(e), 'bad'); }
  $('test').disabled = false;
};
// The sound's level, every frame: a meter per source (Both: the computer's sound and the microphone) in Advanced and
// the sound step, and --lvl for the listening bars and the dock's red dot.
function listen() {
  $('test').classList.add('hidden');
  const rows = cap.levels().map(({ kind }) => {
    const row = document.createElement('div');
    row.innerHTML = `<span>${esc(t[kind])}</span><span class="m"><i></i></span>`;
    return row;
  });
  $('meters').replaceChildren(...rows);
  const tick = () => {
    if (!cap) return;
    const lv = cap.levels().map(({ db }) => Math.max(0, Math.min(1, (db + 60) / 50)));
    lv.forEach((v, i) => { rows[i].querySelector('i').style.width = `${v * 100}%`; });
    level += (Math.max(0, ...lv) - level) * 0.3; // eased: the bars move with the voice instead of flickering
    for (const el of [$('dock'), $('view')]) el.style.setProperty('--lvl', level.toFixed(3));
    levelLoop = requestAnimationFrame(tick);
  };
  tick();
}
/** Everything off, the screen as it is (a new source or microphone restarts without leaving the captions). */
function halt() {
  running = false;
  cap?.stop(); cap = null;
  ingest?.close(); ingest = null;
  pending.length = 0;
  cancelAnimationFrame(levelLoop); $('meters').replaceChildren();
  $('test').classList.remove('hidden');
  clearInterval(clockTimer);
  live.set(false);
  $('resume').classList.add('hidden');
}
function stop() {
  halt();
  setStatus('');
  wake();
  paint();
  render();
}
// The click itself lets the sound through (capture.js wake).
$('resume').onclick = () => { $('resume').classList.add('hidden'); if (!running) start(); };
$('go').onclick = () => start();
$('stop').onclick = () => stop();
// Space (or Enter) starts and stops, as in a player, when no control has the focus.
addEventListener('keydown', (e) => {
  if ((e.key !== ' ' && e.key !== 'Enter') || e.repeat || e.target !== document.body || setupOpen || document.querySelector('dialog[open]')) return;
  e.preventDefault();
  if (running) stop(); else start();
});
goLabel();

// ---------- the dock: fades away after 3 s without the pointer or a key, back on any move, tap or focus ----------
let awayTimer = 0, menuOpen = false;
function wake() {
  clearTimeout(awayTimer);
  document.body.classList.remove('away'); $('dock').classList.remove('away');
  if (running) awayTimer = setTimeout(rest, 3000);
}
function rest() {
  const dock = $('dock');
  if (menuOpen || dock.matches(':hover') || dock.querySelector(':focus-visible, select:focus') || document.querySelector('dialog[open]')) return wake();
  document.body.classList.add('away'); dock.classList.add('away');
}
for (const e of ['pointermove', 'pointerdown', 'keydown', 'focusin']) addEventListener(e, wake, { passive: true, capture: true });
// The ⋯ menu opens above its button, right edges lined up.
$('menu').addEventListener('beforetoggle', (e) => {
  if (e.newState !== 'open') return;
  const r = $('more').getBoundingClientRect(), m = $('menu').style;
  m.right = `${Math.max(8, innerWidth - r.right)}px`;
  m.bottom = `${innerHeight - r.top + 10}px`;
  m.transformOrigin = 'bottom right';
});
$('menu').addEventListener('toggle', (e) => { menuOpen = e.newState === 'open'; if (!menuOpen) wake(); });
$('download').addEventListener('click', () => $('menu').hidePopover());

// ---------- text size ----------
let size = store.get('me.size', innerWidth < 640 ? 28 : 40);
const applySize = () => document.documentElement.style.setProperty('--size', `${size}px`);
for (const b of document.querySelectorAll('[data-size]')) {
  b.onclick = () => {
    size = Math.max(16, Math.min(80, size + Number(b.dataset.size)));
    store.set('me.size', size);
    applySize();
    if (stick) $('scroll').scrollTop = $('scroll').scrollHeight;
    textH = $('text').offsetHeight; // re-wrapped, not a new line: nothing slides
  };
}
applySize();
render();

// ---------- the guided start: one thing per screen, the first time; Settings reopens one ----------
const STEPS = ['ai', 'lang', 'sound'];
let steps = [], at = 0, editing = false;
// The language and sound choices are the start screen's own; a step borrows them while it's open.
const homeChoices = () => $('call').before($('g-src'), $('g-lang'), $('g-test'));
function openSetup(list, i = 0, edit = false) {
  steps = list; at = i; editing = edit;
  setupOpen = true;
  paint();
  showStep();
}
function showStep() {
  const step = steps[at];
  for (const el of document.querySelectorAll('.step')) el.classList.toggle('hidden', el.dataset.step !== step);
  homeChoices();
  if (step === 'lang') $('slot-lang').append($('g-lang'));
  if (step === 'sound') $('slot-sound').append($('g-src'), $('g-test'));
  $('progress').innerHTML = editing || steps.length < 2 ? '' : steps.map((_, i) => `<span class="${i <= at ? 'on' : ''}"></span>`).join('');
  $('kicker').textContent = editing ? t.settings : steps.length > 1 ? t.step(at + 1, steps.length) : t.chip;
  $('back').classList.toggle('hidden', editing || at === 0);
  $('next').textContent = editing ? t.done : at === steps.length - 1 ? t.start : t.next;
  if (step !== 'sound' && cap && !running) stop(); // a sound test ends when you leave its step
  const h = /** @type {HTMLElement} */ (document.querySelector(`[data-step="${step}"] h2`));
  h.tabIndex = -1;
  h.focus();
}
function closeSetup(startNow) {
  store.set('me.onboarded', true);
  setupOpen = false;
  homeChoices();
  if (cap && !running && !startNow) stop();
  if (startNow && !running) start(); else { paint(); render(); }
}
$('back').onclick = () => { at--; showStep(); };
$('next').onclick = () => {
  if (steps[at] === 'lang') store.set('me.to', to); // the suggested language counts as chosen
  if (steps[at] === 'sound') store.set('me.source', source);
  if (editing || at === steps.length - 1) return closeSetup(!editing);
  at++;
  showStep();
};
$('ai-fix').onclick = () => openSetup(['ai'], 0, true);

// Settings: Basic/Advanced, and each choice reopens its step.
function openSettings() {
  const now = { ai: engineName(isMock() ? 'mock' : S.engine), lang: to ? names(to) : t.none, sound: t[source] };
  for (const b of $('dlg-settings').querySelectorAll('[data-open]')) b.querySelector('small').textContent = now[b.dataset.open];
  $('dlg-settings').showModal();
}
$('settings').onclick = openSettings;
$('menu-settings').onclick = () => { $('menu').hidePopover(); openSettings(); };
$('set-close').onclick = () => $('dlg-settings').close();
$('dlg-settings').addEventListener('click', (e) => {
  const step = /** @type {HTMLElement} */ (e.target).closest('[data-open]')?.dataset.open;
  if (!step) return;
  $('dlg-settings').close();
  openSetup([step], 0, true);
});

// First visit: the steps not done yet (a key already saved, a language or sound already chosen are skipped).
// ?step=ai|lang|sound opens one, ?step=captions the captions (links, and the accessibility check).
const want = new URLSearchParams(location.search).get('step');
// The first time, only what can't be guessed: the AI. The language is the computer's and the sound the microphone,
// both right on the start screen, so the captions are one click from here.
const todo = !isMock() || S.ai?.set ? [] : ['ai'];
if (STEPS.includes(want)) openSetup([want], 0, true);
else if (want === 'captions' || store.get('me.onboarded', false) || !todo.length) closeSetup(false);
else openSetup(todo);

// Captioning when the page went away (the page language reloads it, F5, a tab reopened): carry on. The microphone needs
// no click; sharing the computer's sound does, so the big button says "Continue captions".
if (live.resumed && !inSetup()) {
  if (source === 'mic') start(); else { resumeWanted = true; goLabel(); setStatus(t.reshare, 'warn'); }
}
checkCalls(); // here, after everything it reads is set up
setInterval(checkCalls, 15_000);
