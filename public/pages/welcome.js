// welcome.html: page script (kept out of the HTML so the Content-Security-Policy can forbid inline scripts).
import { esc, store } from '/common.js';
import { prefsControls, LANG } from '/i18n.js';
import { icon } from '/illustrations.js';
import { ensureSignedIn, signInScreen } from '/signin.js';
import { keyPanel, tunnelPanel } from '/connect.js';
import { LANGUAGE_CATALOG } from '/languages.js';
const $ = (id) => document.getElementById(id);
$('prefs-slot').append(prefsControls());
document.documentElement.lang = LANG;

// Written per language (not through the page translator): this page is mostly sentences.
const T = {
  en: {
    title: 'Welcome · OpenCaptions',
    k0: 'Welcome', welcomeH: 'What do you want captions for?', welcomeP: 'Pick one. You can change everything later, and switch from one to the other.',
    forEvent: 'For an event', forEventD: 'Conferences, classes, public meetings: captions on every phone, the screen beside the stage and the livestream. A few questions, about two minutes.',
    meBtn: 'Just for me', meD: 'Your calls, videos and conversations, on this computer: captions in your language, in big text or a window that floats over everything.',
    skipAll: 'Skip setup, I’ll do it later', back: 'Back', next: 'Continue',
    k1: 'Step 1 of 7 · Your event', nameH: 'What’s your event called?', namePh: 'e.g. City Design Week 2026', nameHint: 'It appears on the audience’s phones, on the projector screen and on the QR posters.', skipName: 'Skip, decide later',
    k2: 'Step 2 of 7 · Rooms', roomsH: 'Where will people speak?', roomsP: 'One stage or many. Each room gets its own captions link and QR code.', addRoom: '+ Add a room', skipRooms: 'Skip, keep these rooms', roomPh: (i) => `Room ${i}`, remove: 'Remove room',
    presets: [['One room', ['Main Stage']], ['Two rooms', ['Main Stage', 'Room A']], ['Main stage + 3 rooms', ['Main Stage', 'Room A', 'Room B', 'Room C']]],
    k3: 'Step 3 of 7 · Languages', langsH: 'Which languages?', spokenQ: 'What language will the talks be in?', auto: 'Detect automatically', captionsQ: 'Which captions can the audience choose?', langsHint: 'Not sure? Leave “Detect automatically”: OpenCaptions recognises the language as people speak, even when they switch.', notSure: 'I’m not sure, skip',
    aiLedeForced: 'OpenCaptions was started in demo mode, so captions are simulated even though a key is saved. Start it normally to use Gemini.',
    k4: 'Step 5 of 7 · The AI', aiLedeMock: 'Right now captions are simulated. To caption real talks, connect Google’s Gemini with an API key: it takes about two minutes.', aiLedeOn: 'Captions come from Google’s Gemini, in the cloud.',
    kS: 'Step 6 of 7 · Phones', shareH: 'How will phones reach the captions?', sAddr: 'Address',
    altLocal: 'Or run the AI on this computer', altLocalD: 'No account and no cost per hour, but it needs a recent computer and a one-time install from the terminal:',
    kR: 'Step 4 of 7 · Review', reviewH: 'Check before anything changes', reviewP: 'Nothing has changed yet. Untick anything you don’t want.', apply: 'Apply changes', skipReview: 'Skip, change nothing',
    noChanges: 'Nothing to change: your event already looks like this.',
    lockedMsg: 'Event mode is on, so the setup is locked. Turn it off in the dashboard’s Settings to apply changes.',
    opTz: (z) => `Use your time zone for the agenda (${z})`, opTzNote: 'So 10:00 in the agenda means 10:00 where you are. The server runs in another one.',
    localAddr: 'Phones can’t open this address. Before printing QR codes, create a public address (step 6), or open the dashboard from this computer’s address on the Wi-Fi.',
    moreLang: 'Another language…', moreLangAdd: 'Add', opLangsAdd: (l) => `Add the languages: ${l}`,
    opRename: (n) => `Rename the event to “${n}”`, opCreate: (n) => `Add the room “${n}”`, opRenameRoom: (a, b) => `Rename “${a}” to “${b}”`,
    opDelete: (n) => `Remove “${n}”`, opDeleteNote: (k) => (k ? `It has ${k} transcript${k === 1 ? '' : 's'}: they’re kept, and the room can be restored from History.` : 'You can restore it from History.'),
    opLangs: (n, a, b) => `Change “${n}” from ${a} to ${b}`, opCustom: 'This room has its own language setup: tick to change it too.', aiH: 'How captions are made', later: 'Skip for now',
    gemini: 'Connected to the cloud AI', geminiD: 'Captions and translations come from Google’s Gemini, in the cloud. About 3 seconds behind the speaker.',
    local: 'Running on this computer', localD: 'Speech recognition and translation run here. The audio never leaves the building, and it works without internet.',
    mock: 'Demo mode: captions are simulated', mockD: 'Everything works so you can explore, but the words are made up. To caption real talks, pick one of these and restart:',
    mockGemini: 'Cloud (best quality): add a Gemini API key', mockLocal: 'On this computer, no account needed:',
    backupOn: 'Offline backup is ready', backupOnD: 'If the internet goes down, captions keep running on this computer and switch back when it returns.',
    backupOff: 'Optional: an offline backup', backupOffD: 'Start the server with this command and captions keep running on this computer if the venue loses internet:',
    k5: 'Step 7 of 7 · Sound', audioH: 'Connect the sound', audioP: 'OpenCaptions listens to each room’s sound. Pick how the sound gets here; you can try it right now.',
    whichRoom: 'Which room?',
    mic: 'A microphone or the sound desk, into a computer', micD: 'A computer next to the stage gets the sound by cable and sends it from a browser page.',
    micSteps: ['Plug a microphone into that computer, or a spare output of the sound desk (ask the sound technician for an “aux” output), straight in or through a USB sound card.',
      'Open this room’s sound page on that computer: with the button if it’s this one, or with the link or QR code on another one.',
      'Pick the input, press Start captioning and say something: the level bar moves and the captions appear.'],
    openHere: 'Open the sound page here', makeLink: 'Link for another computer', copy: 'Copy', copied: 'Copied', open: 'Open',
    linkNote: (hm) => `Works once, until ${hm}: it lets that computer send this room’s sound and nothing else, with no password to type.`,
    linkQr: 'QR code of the link, to open it with a tablet or phone camera',
    linkHttp: 'This address isn’t secure (http), so the browser on the other computer won’t let it use a microphone. Create a public address first (step 6), then make the link again.',
    stream: 'OBS, vMix or another streaming app', streamD: 'Already streaming the event? Send OpenCaptions a copy of the stream, with no extra computer.',
    getAddr: 'Get an address for this room', rtmp: 'RTMP (OBS, vMix)', srt: 'SRT', protoQ: 'Your app sends',
    rtmpSteps: ['In OBS: Settings → Stream → Service: Custom. In vMix: Settings → Outputs / Streaming → Destination: Custom RTMP Server.',
      'Paste the server and the stream key below, and start streaming.',
      'The room’s card in the dashboard shows the sound arriving.'],
    srtSteps: ['In OBS: Settings → Stream → Service: Custom. In vMix: Settings → Outputs / Streaming → Destination: SRT, type Caller.',
      'Paste the address below (in vMix, its host name and port), and start streaming.',
      'The room’s card in the dashboard shows the sound arriving.'],
    server: 'Server', key: 'Stream key', address: 'Address',
    replaces: (u) => `This room gets its sound from ${u} now. A new address replaces it.`,
    sameNet: (p) => `The computer that streams must reach this one on the network. If it doesn’t connect, the firewall here must let port ${p} in. Streaming from this same computer? Use 127.0.0.1 instead.`,
    noFfmpeg: 'This needs ffmpeg, which didn’t install with OpenCaptions on this computer. Use a computer with a microphone instead, or install ffmpeg and restart.',
    rec: 'A recording', recD: 'A video or audio file of a talk: OpenCaptions captions it in minutes and keeps the transcript with the room’s others.', recOpen: 'Choose the recording',
    test: 'Just try it first', testD: 'Talk into your microphone and watch the captions appear.',
    more: 'More details: every way to connect the sound, in the guide',
    k6: 'All set', doneH: 'You’re ready.', sEvent: 'Event', sRooms: 'Rooms', sLangs: 'Captions', sAI: 'AI',
    openDash: 'Open the dashboard', printQr: 'Print the QR codes', seeAudience: 'See what the audience sees', autoL: 'auto-detected',
    aiG: 'In the cloud', aiL: 'This computer', aiM: 'Demo mode', withBackup: ' + offline backup',
  },
  es: {
    title: 'Bienvenida · OpenCaptions',
    k0: 'Bienvenida', welcomeH: '¿Para qué querés subtítulos?', welcomeP: 'Elegí una. Podés cambiar todo después, y pasar de una a la otra.',
    forEvent: 'Para un evento', forEventD: 'Congresos, clases, sesiones públicas: subtítulos en cada celular, en la pantalla junto al escenario y en el streaming. Unas preguntas, unos dos minutos.',
    meBtn: 'Solo para mí', meD: 'Tus llamadas, videos y conversaciones, en esta compu: subtítulos en tu idioma, con letra grande o en una ventana que flota sobre todo.',
    skipAll: 'Saltar, lo hago después', back: 'Atrás', next: 'Continuar',
    k1: 'Paso 1 de 7 · Tu evento', nameH: '¿Cómo se llama tu evento?', namePh: 'Ej: Semana del Diseño 2026', nameHint: 'Aparece en los celulares del público, en la pantalla del proyector y en los carteles con QR.', skipName: 'Saltar, lo decido después',
    k2: 'Paso 2 de 7 · Salas', roomsH: '¿Dónde va a hablar la gente?', roomsP: 'Un escenario o varios. Cada sala tiene su propio link de subtítulos y su QR.', addRoom: '+ Agregar una sala', skipRooms: 'Saltar, dejar estas salas', roomPh: (i) => `Sala ${i}`, remove: 'Quitar sala',
    presets: [['Una sala', ['Escenario principal']], ['Dos salas', ['Escenario principal', 'Sala A']], ['Principal + 3 salas', ['Escenario principal', 'Sala A', 'Sala B', 'Sala C']]],
    k3: 'Paso 3 de 7 · Idiomas', langsH: '¿Qué idiomas?', spokenQ: '¿En qué idioma van a ser las charlas?', auto: 'Detectar automáticamente', captionsQ: '¿Qué subtítulos puede elegir el público?', langsHint: '¿No sabés? Dejá “Detectar automáticamente”: OpenCaptions reconoce el idioma mientras hablan, aunque cambien.', notSure: 'No sé, saltar',
    aiLedeForced: 'OpenCaptions se inició en modo demo, así que los subtítulos son simulados aunque haya una key guardada. Inicialo normalmente para usar Gemini.',
    k4: 'Paso 5 de 7 · La IA', aiLedeMock: 'Por ahora los subtítulos son simulados. Para subtitular charlas reales, conectá Gemini de Google con una API key: son unos dos minutos.', aiLedeOn: 'Los subtítulos vienen de Gemini de Google, en la nube.',
    kS: 'Paso 6 de 7 · Celulares', shareH: '¿Cómo llegan los celulares a los subtítulos?', sAddr: 'Dirección',
    altLocal: 'O usar la IA de esta computadora', altLocalD: 'Sin cuenta ni costo por hora, pero necesita una computadora reciente y una instalación desde la terminal (una sola vez):',
    kR: 'Paso 4 de 7 · Revisión', reviewH: 'Revisá antes de cambiar nada', reviewP: 'Todavía no cambió nada. Destildá lo que no quieras.', apply: 'Aplicar cambios', skipReview: 'Saltar, no cambiar nada',
    noChanges: 'No hay nada que cambiar: tu evento ya está así.',
    lockedMsg: 'El modo evento está activado, así que la configuración está bloqueada. Desactivalo en Ajustes del panel para aplicar cambios.',
    opTz: (z) => `Usar tu zona horaria para la agenda (${z})`, opTzNote: 'Así las 10:00 de la agenda son las 10:00 donde estás. El servidor está en otra.',
    localAddr: 'Los celulares no pueden abrir esta dirección. Antes de imprimir los QR, creá una dirección pública (paso 6) o abrí el panel desde la dirección de esta computadora en el Wi-Fi.',
    moreLang: 'Otro idioma…', moreLangAdd: 'Agregar', opLangsAdd: (l) => `Agregar los idiomas: ${l}`,
    opRename: (n) => `Renombrar el evento a “${n}”`, opCreate: (n) => `Agregar la sala “${n}”`, opRenameRoom: (a, b) => `Renombrar “${a}” a “${b}”`,
    opDelete: (n) => `Quitar “${n}”`, opDeleteNote: (k) => (k ? `Tiene ${k} ${k === 1 ? 'transcripción' : 'transcripciones'}: se conservan, y la sala se puede recuperar desde el Historial.` : 'Podés recuperarla desde el Historial.'),
    opLangs: (n, a, b) => `Cambiar “${n}” de ${a} a ${b}`, opCustom: 'Esta sala tiene su propia configuración de idiomas: tildala para cambiarla también.', aiH: 'Cómo se generan los subtítulos', later: 'Saltar por ahora',
    gemini: 'Conectado a la IA en la nube', geminiD: 'Los subtítulos y traducciones vienen de Gemini de Google, en la nube. Unos 3 segundos detrás de quien habla.',
    local: 'Funcionando en esta computadora', localD: 'El reconocimiento de voz y la traducción corren acá. El audio no sale del lugar y funciona sin internet.',
    mock: 'Modo demo: los subtítulos son simulados', mockD: 'Todo funciona para que lo recorras, pero las palabras son inventadas. Para subtitular charlas reales, elegí una opción y reiniciá:',
    mockGemini: 'En la nube (mejor calidad): agregá una API key de Gemini', mockLocal: 'En esta computadora, sin cuenta:',
    backupOn: 'Respaldo sin internet listo', backupOnD: 'Si se corta internet, los subtítulos siguen en esta computadora y vuelven a la nube cuando regresa.',
    backupOff: 'Opcional: un respaldo sin internet', backupOffD: 'Iniciá el servidor con este comando y los subtítulos siguen en esta computadora si el lugar se queda sin internet:',
    k5: 'Paso 7 de 7 · Sonido', audioH: 'Conectá el sonido', audioP: 'OpenCaptions escucha el sonido de cada sala. Elegí cómo llega el sonido; podés probarlo ahora mismo.',
    whichRoom: '¿Qué sala?',
    mic: 'Un micrófono o la consola, a una computadora', micD: 'Una computadora junto al escenario recibe el sonido por cable y lo envía desde una página del navegador.',
    micSteps: ['Conectá a esa computadora un micrófono, o una salida libre de la consola (pedile a quien maneja el sonido una salida “aux”), directo o con una placa de sonido USB.',
      'Abrí la página de sonido de esta sala en esa computadora: con el botón si es esta, o con el enlace o el QR si es otra.',
      'Elegí la entrada, tocá Empezar a transcribir y decí algo: la barra de nivel se mueve y aparecen los subtítulos.'],
    openHere: 'Abrir la página de sonido acá', makeLink: 'Enlace para otra computadora', copy: 'Copiar', copied: 'Copiado', open: 'Abrir',
    linkNote: (hm) => `Sirve una vez, hasta las ${hm}: deja que esa computadora envíe el sonido de esta sala y nada más, sin escribir contraseñas.`,
    linkQr: 'QR del enlace, para abrirlo con la cámara de una tablet o un celular',
    linkHttp: 'Esta dirección no es segura (http), así que el navegador de la otra computadora no le va a dejar usar un micrófono. Creá primero una dirección pública (paso 6) y volvé a crear el enlace.',
    stream: 'OBS, vMix u otro programa de streaming', streamD: '¿Ya transmiten el evento? Mandale a OpenCaptions una copia de la transmisión, sin otra computadora.',
    getAddr: 'Crear una dirección para esta sala', rtmp: 'RTMP (OBS, vMix)', srt: 'SRT', protoQ: 'Tu programa envía',
    rtmpSteps: ['En OBS: Ajustes → Emisión → Servicio: Personalizado. En vMix: Settings → Outputs / Streaming → Destination: Custom RTMP Server.',
      'Pegá el servidor y la clave de retransmisión de abajo, y empezá a transmitir.',
      'La tarjeta de la sala en el panel muestra que llega el sonido.'],
    srtSteps: ['En OBS: Ajustes → Emisión → Servicio: Personalizado. En vMix: Settings → Outputs / Streaming → Destination: SRT, tipo Caller.',
      'Pegá la dirección de abajo (en vMix, el nombre del host y el puerto), y empezá a transmitir.',
      'La tarjeta de la sala en el panel muestra que llega el sonido.'],
    server: 'Servidor', key: 'Clave de retransmisión', address: 'Dirección',
    replaces: (u) => `Ahora esta sala toma el sonido de ${u}. Una dirección nueva la reemplaza.`,
    sameNet: (p) => `La computadora que transmite tiene que llegar a esta por la red. Si no conecta, el firewall de esta tiene que dejar entrar el puerto ${p}. ¿Transmitís desde esta misma computadora? Usá 127.0.0.1.`,
    noFfmpeg: 'Esto necesita ffmpeg, que no se instaló con OpenCaptions en esta computadora. Usá una computadora con micrófono, o instalá ffmpeg y reiniciá.',
    rec: 'Una grabación', recD: 'Un archivo de video o audio de una charla: OpenCaptions lo subtitula en minutos y guarda la transcripción con las demás de la sala.', recOpen: 'Elegir la grabación',
    test: 'Probarlo primero', testD: 'Hablá al micrófono y mirá cómo aparecen los subtítulos.',
    more: 'Más detalles: todas las formas de conectar el sonido, en la guía',
    k6: 'Listo', doneH: 'Ya está todo.', sEvent: 'Evento', sRooms: 'Salas', sLangs: 'Subtítulos', sAI: 'IA',
    openDash: 'Abrir el panel', printQr: 'Imprimir los QR', seeAudience: 'Ver lo que ve el público', autoL: 'detección automática',
    aiG: 'En la nube', aiL: 'Esta computadora', aiM: 'Modo demo', withBackup: ' + respaldo sin internet',
  },
};
const t = T[LANG] || T.en;
document.title = t.title;
for (const el of document.querySelectorAll('[data-t]')) el.textContent = t[el.dataset.t];
$('name').placeholder = t.namePh;

// ---------- server ----------
// The wizard changes the setup: admins only (the crew goes to the live dashboard).
if ((await ensureSignedIn()).role !== 'admin') location.replace('/admin.html');
const api = async (method, url, body) => {
  const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 401) {
    await signInScreen();
    return api(method, url, body);
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || r.statusText), { body: j });
  return j;
};
const fail = (e) => { $('err').textContent = e.message || String(e); };
let S = await api('GET', '/api/setup');
const langNames = { ...(S.languages || { es: 'Español', en: 'English', pt: 'Português' }) };
const extraLangs = {}; // picked here from the catalog: added to the event only when the plan is applied

// ---------- answers ----------
const A = {
  name: S.named === false ? '' : S.name, // a new install has no name yet: leave the field empty
  rooms: S.stages.map((s) => ({ id: s.id, name: s.name })),
  spoken: S.stages[0]?.source || 'auto',
  targets: [...(S.stages[0]?.targets || S.defaultTargets)],
};
$('name').value = A.name;

// ---------- steps ----------
const steps = [...document.querySelectorAll('.step')];
let cur = 0;
$('progress').innerHTML = steps.map(() => '<span></span>').join('');
function show(i) {
  $('err').textContent = '';
  cur = Math.max(0, Math.min(steps.length - 1, i));
  steps.forEach((s, k) => s.classList.toggle('on', k === cur));
  document.querySelector('.wiz').classList.toggle('choosing', steps[cur].dataset.step === 'welcome');
  [...$('progress').children].forEach((p, k) => p.classList.toggle('on', k <= cur));
  const img = $('art'), src = `/art/${steps[cur].dataset.art}.webp`;
  if (!img.src.endsWith(src)) { img.classList.add('fade'); setTimeout(() => { img.src = src; img.onload = () => img.classList.remove('fade'); }, 150); }
  if (steps[cur].dataset.step === 'done') renderSummary();
  if (steps[cur].dataset.step === 'review') buildPlan().catch(fail);
  if (steps[cur].dataset.step === 'audio') renderSound();
  steps[cur].querySelector('input, .primary')?.focus({ preventScroll: true });
  history.replaceState(null, '', `#${steps[cur].dataset.step}`);
  store.set('welcome.at', { step: steps[cur].dataset.step, t: Date.now() });
}
// Where to start: the step in the address, else where this browser left off today (the dashboard sends an unfinished
// setup back here, and opening the room's sound page from step 7 must not mean starting over from step 1).
const left = store.get('welcome.at', null);
const resume = !location.hash && left && Date.now() - left.t < 24 * 3600_000 ? `#${left.step}` : location.hash;
const start = steps.findIndex((s) => `#${s.dataset.step}` === resume);
// Preload the illustrations so steps switch instantly.
for (const s of steps) new Image().src = `/art/${s.dataset.art}.webp`;

// The steps only collect answers; nothing on the server changes until the review step's "Apply changes".
const save = {
  async name() { A.name = $('name').value.trim() || S.name; },
  async rooms() {
    if (!A.rooms.some((r) => r.name.trim())) throw new Error(LANG === 'es' ? 'Dejá al menos una sala.' : 'Keep at least one room.');
  },
  async langs() {
    if (!A.targets.length) throw new Error(LANG === 'es' ? 'Elegí al menos un idioma de subtítulos.' : 'Pick at least one caption language.');
  },
};

// ---------- review: every change listed, each one can be unticked ----------
const cfgKey = (src, tg) => `${src}|${[...tg].sort().join(',')}`;
const langText = (src, tg) => `${src === 'auto' ? t.auto : langNames[src] || src} → ${tg.map((k) => langNames[k] || k).join(', ')}`;
let ops = [];
async function buildPlan() {
  S = await api('GET', '/api/setup');
  ops = [];
  if (A.name && A.name !== S.name) ops.push({ type: 'rename', label: t.opRename(A.name), on: true });
  // The server may run elsewhere (Docker defaults to UTC): agenda times should mean the organizer's local time.
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (tz && S.timezone && tz !== S.timezone && !S.timezoneFixed) ops.push({ type: 'timezone', tz, label: t.opTz(tz), note: t.opTzNote, on: true });
  if (Object.keys(extraLangs).length) ops.push({ type: 'languages', label: t.opLangsAdd(Object.values(extraLangs).join(', ')), on: true });
  const want = A.rooms.filter((r) => r.name.trim());
  const keep = new Set(want.filter((r) => r.id).map((r) => r.id));
  for (const r of want) {
    const old = r.id && S.stages.find((x) => x.id === r.id);
    if (!old) ops.push({ type: 'create', name: r.name.trim(), label: t.opCreate(r.name.trim()), on: true });
    else if (old.name !== r.name.trim()) ops.push({ type: 'renameRoom', id: old.id, name: r.name.trim(), label: t.opRenameRoom(old.name, r.name.trim()), on: true });
  }
  // Languages: rooms set up like most of the others follow the new answer; a room with its own setup
  // (say, the only one with Portuguese) is listed unticked so it isn't overwritten by accident.
  const counts = {};
  for (const x of S.stages) counts[cfgKey(x.source, x.targets)] = (counts[cfgKey(x.source, x.targets)] || 0) + 1;
  const common = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  for (const x of S.stages.filter((x) => keep.has(x.id))) {
    if (cfgKey(x.source, x.targets) === cfgKey(A.spoken, A.targets)) continue;
    const custom = cfgKey(x.source, x.targets) !== common && S.stages.length > 1;
    ops.push({ type: 'langs', id: x.id, label: t.opLangs(x.name, langText(x.source, x.targets), langText(A.spoken, A.targets)), note: custom ? t.opCustom : '', on: !custom });
  }
  for (const x of S.stages.filter((x) => !keep.has(x.id))) {
    let talks;
    try { talks = (await api('GET', `/api/stages/${encodeURIComponent(x.id)}/talks`)).filter((k) => k.segments > 0).length; } catch { /* unknown: be careful */ talks = 1; }
    ops.push({ type: 'delete', id: x.id, label: t.opDelete(x.name), note: t.opDeleteNote(talks), on: talks === 0, danger: true });
  }
  $('locknote').classList.toggle('hidden', !S.locked);
  $('apply').disabled = !!S.locked || !ops.length;
  $('ops').innerHTML = ops.length
    ? ops.map((o, i) => `<label class="op${o.danger ? ' danger' : ''}"><input type="checkbox" data-op="${i}" ${o.on ? 'checked' : ''} ${S.locked ? 'disabled' : ''} /><span>${esc(o.label)}${o.note ? `<small>${esc(o.note)}</small>` : ''}</span></label>`).join('')
    : `<p class="hint">${esc(t.noChanges)}</p>`;
}
$('ops').addEventListener('change', (e) => { const i = e.target.dataset.op; if (i != null) ops[+i].on = e.target.checked; });
async function applyPlan() {
  const todo = ops.filter((o) => o.on);
  const taken = new Set(S.stages.map((x) => x.id));
  // Additions and renames first, removals last: a failure part-way never leaves the event with fewer rooms.
  if (todo.some((o) => o.type === 'rename')) await api('PUT', '/api/setup', { name: A.name });
  if (todo.some((o) => o.type === 'languages')) await api('PUT', '/api/setup', { languages: { ...S.addedLanguages, ...extraLangs } });
  const tzOp = todo.find((o) => o.type === 'timezone');
  if (tzOp) await api('PUT', '/api/setup', { timezone: tzOp.tz });
  for (const o of todo.filter((o) => o.type === 'create')) {
    let id = slug(o.name) || 'room', n = 2;
    while (taken.has(id)) id = `${slug(o.name) || 'room'}-${n++}`;
    taken.add(id);
    await api('POST', '/api/stages', { id, name: o.name, source: A.spoken, targets: A.targets });
  }
  for (const o of todo.filter((o) => o.type === 'renameRoom')) await api('PATCH', `/api/stages/${encodeURIComponent(o.id)}`, { name: o.name });
  for (const o of todo.filter((o) => o.type === 'langs')) await api('PATCH', `/api/stages/${encodeURIComponent(o.id)}`, { source: A.spoken, targets: A.targets });
  for (const o of todo.filter((o) => o.type === 'delete')) await api('DELETE', `/api/stages/${encodeURIComponent(o.id)}`);
  S = await api('GET', '/api/setup');
  A.name = S.name;
  A.rooms = S.stages.map((x) => ({ id: x.id, name: x.name }));
  renderRooms();
}
$('apply').onclick = async () => {
  $('apply').disabled = true;
  try { await applyPlan(); show(cur + 1); } catch (err) { fail(err); } finally { $('apply').disabled = false; }
};
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

document.addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.hasAttribute('data-back')) return show(cur - 1);
  if (b.hasAttribute('data-skip')) return show(cur + 1);
  if (b.hasAttribute('data-next')) {
    b.disabled = true;
    try { await save[steps[cur].dataset.step]?.(); show(cur + 1); } catch (err) { fail(err); } finally { b.disabled = false; }
  }
  if (b.hasAttribute('data-finish')) {
    try { await api('PUT', '/api/setup', { done: true, mode: 'event' }); } catch (err) { return fail(err); }
    store.set('welcome.at', null); // done: next time (Settings → the wizard) starts from the beginning
    location.href = '/admin.html';
  }
});
$('name').addEventListener('keydown', (e) => { if (e.key === 'Enter') steps[cur].querySelector('[data-next]').click(); });
$('open-kit').onclick = () => window.open('/kit.html', '_blank');
$('open-audience').onclick = () => window.open('/', '_blank');

// ---------- rooms ----------
function renderRooms() {
  $('rooms').innerHTML = A.rooms.map((r, i) => `<div class="room"><input value="${esc(r.name)}" placeholder="${esc(t.roomPh(i + 1))}" maxlength="80" data-i="${i}" aria-label="${esc(t.roomPh(i + 1))}" /><button type="button" data-rm="${i}" title="${esc(t.remove)}" aria-label="${esc(t.remove)}" ${A.rooms.length < 2 ? 'disabled' : ''}>×</button></div>`).join('');
}
$('rooms').addEventListener('input', (e) => { if (e.target.dataset.i) A.rooms[+e.target.dataset.i].name = e.target.value; });
$('rooms').addEventListener('click', (e) => { const i = e.target.closest('[data-rm]')?.dataset.rm; if (i != null) { A.rooms.splice(+i, 1); renderRooms(); } });
$('add-room').onclick = () => { A.rooms.push({ name: '' }); renderRooms(); $('rooms').lastElementChild.querySelector('input').focus(); };
$('presets').innerHTML = t.presets.map(([label], i) => `<button type="button" class="pill" data-preset="${i}">${esc(label)}</button>`).join('');
$('presets').onclick = (e) => {
  const i = e.target.closest('[data-preset]')?.dataset.preset;
  if (i == null) return;
  // Reuse existing rooms in order (their links and QR codes stay valid), rename them, add or drop the rest.
  const names = t.presets[i][1];
  A.rooms = names.map((name, k) => ({ id: A.rooms[k]?.id, name }));
  renderRooms();
};
renderRooms();

// ---------- languages ----------
function renderLangs() {
  const opts = [['auto', t.auto], ...Object.entries(langNames)];
  $('spoken').innerHTML = opts.map(([k, v]) => `<button type="button" class="pill" role="radio" aria-pressed="${A.spoken === k}" aria-checked="${A.spoken === k}" data-k="${esc(k)}">${esc(v)}</button>`).join('');
  $('targets').innerHTML = Object.entries(langNames).map(([k, v]) => `<button type="button" class="pill" aria-pressed="${A.targets.includes(k)}" data-k="${esc(k)}">${esc(v)}</button>`).join('');
  const free = Object.entries(LANGUAGE_CATALOG).filter(([c]) => !(c in langNames)).sort((a, b) => a[1].localeCompare(b[1]));
  $('more-lang').innerHTML = `<option value="">${esc(t.moreLang)}</option>` + free.map(([c, n]) => `<option value="${c}">${esc(n)}</option>`).join('');
}
$('more-lang-add').textContent = t.moreLangAdd;
$('more-lang').setAttribute('aria-label', t.moreLang);
$('more-lang-form').onsubmit = (e) => {
  e.preventDefault();
  const c = $('more-lang').value;
  if (!c) return;
  langNames[c] = extraLangs[c] = LANGUAGE_CATALOG[c];
  if (!A.targets.includes(c)) A.targets = [...A.targets, c];
  renderLangs();
};
$('spoken').onclick = (e) => { const k = e.target.closest('[data-k]')?.dataset.k; if (k) { A.spoken = k; renderLangs(); } };
$('targets').onclick = (e) => {
  const k = e.target.closest('[data-k]')?.dataset.k;
  if (!k) return;
  A.targets = A.targets.includes(k) ? A.targets.filter((x) => x !== k) : [...A.targets, k];
  renderLangs();
};
renderLangs();

// ---------- AI ----------
const opt = (ic, title, desc, extra = '', cls = '') => `<div class="opt ${cls}"><div class="ic">${icon(ic)}</div><div><b>${title}</b><span>${desc}</span>${extra}</div></div>`;
const cmd = (c) => `<pre class="cmd"><code>${esc(c)}</code></pre>`;
const keyP = keyPanel($('ai-key'), { api, onChange: (s) => { S = { ...S, ...s, primaryEngine: s.engine === 'gemini' && S.primaryEngine === 'mock' ? 'gemini' : S.primaryEngine }; renderAi(); } });
function renderAi() {
  const f = S.failover;
  let html = '';
  // Started in demo mode on purpose (--mock) although a key is saved: say so instead of "connect a key".
  $('ai-lede').textContent = S.primaryEngine === 'mock' ? (S.ai?.set ? t.aiLedeForced : t.aiLedeMock) : S.primaryEngine === 'gemini' ? t.aiLedeOn : '';
  $('ai-key').classList.toggle('hidden', S.primaryEngine === 'local');
  keyP.update(S);
  if (S.primaryEngine === 'gemini') {
    html += f?.mode === 'auto' && f.localReady
      ? opt('shield', t.backupOn, t.backupOnD, '', 'good')
      : opt('shield', t.backupOff, t.backupOffD, cmd('npm run local -- --fallback'));
  } else if (S.primaryEngine === 'local') {
    html += opt('shield', t.local, t.localD, '', 'good');
  } else {
    html += opt('shield', t.altLocal, t.altLocalD, cmd('npm run local'));
  }
  $('ai').innerHTML = html;
}
renderAi();

// ---------- public address ----------
const shareP = tunnelPanel($('share'), { api, onChange: (s) => { S = { ...S, tunnel: s.tunnel }; } });
shareP.update(S);
// While the address is being set up, follow it (it takes a minute or two).
setInterval(async () => {
  const st = S.tunnel?.state;
  if (steps[cur].dataset.step !== 'share' || !st || (st === 'off' || st === 'error' || (st === 'on' && S.tunnel.reachable !== null))) return;
  try { S = await api('GET', '/api/setup'); shareP.update(S); } catch { /* next time */ }
}, 2000);

// ---------- sound: each way in, with its steps right here ----------
// "I have a recording": the room's sound page plays the file today. When the dashboard can caption a recording by
// itself (Transcripts), point this there instead.
const recordingUrl = (room) => `/admin.html?dashboard#transcripts?record=${encodeURIComponent(room)}`; // Transcripts → Caption a recording
const RUNBOOK = 'https://github.com/carraroesteban/opencaptions/blob/main/docs/operations/runbook.md#two-hours-before-set-up-each-room';
let soundRoom = new URLSearchParams(location.search).get('room') || S.stages[0]?.id || ''; // ?room= from a room's card
let proto = 'rtmp';
const roomLinks = {}; // room → { url, until } from POST /api/ingest/link
// OBS and vMix stream to this computer (ffmpeg listens): RTMP on 1935 and up, SRT on 9001 and up, one port per room.
const LISTEN = {
  rtmp: { re: /^rtmps?:\/\/(?:0\.0\.0\.0|\[::\])(?::(\d+))?\/live\/(.+)$/i, base: 1935, pull: (port, room) => `rtmp://0.0.0.0:${port}/live/${room}` },
  srt: { re: /^srt:\/\/(?:0\.0\.0\.0|\[::\])?:(\d+)\?mode=listener$/i, base: 9001, pull: (port) => `srt://0.0.0.0:${port}?mode=listener` },
};
const listening = (room, p) => { const m = (S.stages.find((x) => x.id === room)?.pull || '').match(LISTEN[p].re); return m ? Number(m[1] || 1935) : 0; };
const pickProto = () => { proto = listening(soundRoom, 'srt') ? 'srt' : 'rtmp'; }; // show the address the room already has
pickProto();
function freePort(room, p) {
  const used = new Set(S.stages.filter((x) => x.id !== room).map((x) => listening(x.id, p)).filter(Boolean));
  let port = LISTEN[p].base;
  while (used.has(port)) port++;
  return port;
}
// The address OBS or vMix types in: this computer on the venue network, not "localhost" (unless that's all there is).
function serverHost() {
  const loop = /^(localhost|127\.0\.0\.1|\[::1\])$/i;
  for (const u of [S.lanUrl, location.origin, S.tunnel?.state === 'on' ? '' : S.publicUrl]) {
    try { const h = new URL(u).hostname; if (h && !loop.test(h)) return h; } catch { /* not set */ }
  }
  return '127.0.0.1';
}
const copyRow = (label, value) => `<label class="field">${esc(label)}<div class="copy"><input readonly value="${esc(value)}" /><button type="button" data-copy="${esc(value)}">${esc(t.copy)}</button></div></label>`;
const steps3 = (list) => `<ol class="steps">${list.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>`;
function micBody() {
  const l = roomLinks[soundRoom];
  return `${steps3(t.micSteps)}
    <div class="row-btns"><a href="/ingest.html?stage=${encodeURIComponent(soundRoom)}" target="_blank" rel="noopener"><button type="button" class="primary" tabindex="-1">${icon('mic')}<span>${esc(t.openHere)}</span></button></a><button type="button" data-sound="link">${icon('link')}<span>${esc(t.makeLink)}</span></button></div>
    ${l ? `<div class="qrrow"><img src="/api/qr.svg?text=${encodeURIComponent(l.url)}" alt="${esc(t.linkQr)}" width="140" height="140" /><div class="u-stack8 u-minw0">${copyRow(t.makeLink, l.url)}<p class="hint u-m0">${esc(t.linkNote(l.until))}</p>${l.url.startsWith('http:') ? `<p class="err u-m0">${esc(t.linkHttp)}</p>` : ''}</div></div>` : ''}`;
}
function streamBody() {
  if (!S.ffmpeg) return `<p class="hint u-m0">${esc(t.noFfmpeg)}</p>`;
  const port = listening(soundRoom, proto), host = serverHost();
  const cur = S.stages.find((x) => x.id === soundRoom)?.pull || '';
  return `<div class="pills" role="radiogroup" aria-label="${esc(t.protoQ)}">${['rtmp', 'srt'].map((p) => `<button type="button" class="pill" role="radio" aria-checked="${proto === p}" aria-pressed="${proto === p}" data-proto="${p}">${esc(t[p])}</button>`).join('')}</div>
    ${port ? `${steps3(proto === 'rtmp' ? t.rtmpSteps : t.srtSteps)}
      ${proto === 'rtmp' ? copyRow(t.server, `rtmp://${host}:${port}/live`) + copyRow(t.key, soundRoom) : copyRow(t.address, `srt://${host}:${port}`)}
      <p class="hint u-m0">${esc(t.sameNet(`${port}${proto === 'srt' ? '/udp' : ''}`))}</p>`
    : `${cur ? `<p class="hint u-m0">${esc(t.replaces(cur))}</p>` : ''}<div class="row-btns"><button type="button" class="primary" data-sound="address">${icon('link')}<span>${esc(t.getAddr)}</span></button></div>`}`;
}
const recBody = () => `<div class="row-btns"><a href="${recordingUrl(soundRoom)}" target="_blank" rel="noopener"><button type="button" class="primary" tabindex="-1">${icon('film')}<span>${esc(t.recOpen)}</span></button></a></div>`;
function renderSound() {
  if (!S.stages.some((x) => x.id === soundRoom)) soundRoom = S.stages[0]?.id || ''; // rooms changed on the review step
  const open = new Set([...$('audio').querySelectorAll('details[open]')].map((d) => d.dataset.k));
  const card = (k, ic, title, desc, body) => `<details class="opt sound" data-k="${k}"${open.has(k) ? ' open' : ''}><summary><div class="ic">${icon(ic)}</div><div><b>${esc(title)}</b><span>${esc(desc)}</span></div><span class="chev">${icon('chevron')}</span></summary><div class="sound-body">${body}</div></details>`;
  $('audio').innerHTML = (S.stages.length > 1 ? `<div><p class="q">${esc(t.whichRoom)}</p><div class="pills u-m0" role="radiogroup" aria-label="${esc(t.whichRoom)}">${S.stages.map((x) => `<button type="button" class="pill" role="radio" aria-checked="${x.id === soundRoom}" aria-pressed="${x.id === soundRoom}" data-room="${esc(x.id)}">${esc(x.name)}</button>`).join('')}</div></div>` : '')
    + card('mic', 'mic', t.mic, t.micD, micBody())
    + card('stream', 'monitor', t.stream, t.streamD, streamBody())
    + card('rec', 'film', t.rec, t.recD, recBody())
    + `<a class="opt" href="/demo.html?mode=mic" target="_blank" rel="noopener"><div class="ic">${icon('play')}</div><div><b>${esc(t.test)}</b><span>${esc(t.testD)}</span></div></a>`
    + `<p class="hint u-m0"><a href="${RUNBOOK}" target="_blank" rel="noopener">${esc(t.more)}</a></p>`;
}
$('audio').addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.room) { soundRoom = b.dataset.room; pickProto(); return renderSound(); }
  if (b.dataset.proto) { proto = b.dataset.proto; return renderSound(); }
  if (b.dataset.copy) {
    try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = t.copied; setTimeout(() => { b.textContent = t.copy; }, 1500); } catch { b.previousElementSibling?.select(); }
    return;
  }
  if (!b.dataset.sound) return; // the buttons inside links just open them
  b.disabled = true;
  try {
    if (b.dataset.sound === 'link') {
      const r = await api('POST', '/api/ingest/link', { stage: soundRoom });
      roomLinks[soundRoom] = { url: r.url, until: new Date(Date.now() + r.expiresIn * 1000).toLocaleTimeString(LANG, { hour: '2-digit', minute: '2-digit' }) };
    } else if (b.dataset.sound === 'address') {
      await api('PATCH', `/api/stages/${encodeURIComponent(soundRoom)}`, { pull: LISTEN[proto].pull(freePort(soundRoom, proto), soundRoom) });
      S = await api('GET', '/api/setup');
    }
    renderSound();
  } catch (err) { fail(err); } finally { b.disabled = false; }
});
renderSound();

// ---------- summary ----------
function renderSummary() {
  const f = S.failover;
  const ai = S.primaryEngine === 'gemini' ? t.aiG + (f?.mode === 'auto' ? t.withBackup : '') : S.primaryEngine === 'local' ? t.aiL : t.aiM;
  const st = S.stages[0];
  const langs = (st?.targets || []).map((k) => langNames[k] || k).join(', ');
  const addr = S.tunnel?.state === 'on' && S.tunnel.url ? S.tunnel.url : S.publicUrl;
  $('summary').innerHTML = [
    [t.sEvent, S.name],
    [t.sRooms, S.stages.map((s) => s.name).join(', ')],
    [t.sLangs, `${langs}${st?.source === 'auto' ? ` · ${t.autoL}` : ''}`],
    [t.sAI, ai],
    [t.sAddr, addr],
  ].map(([k, v]) => `<div><b>${esc(k)}</b><span>${esc(v)}</span></div>`).join('')
    // Phones can't open "localhost": say so before anyone prints QR codes with it.
    + (/\/\/(localhost|127\.0\.0\.1|\[::1\])\b/.test(addr) ? `<p class="err">${esc(t.localAddr)}</p>` : '');
}

show(start >= 0 ? start : 0);

// "Just for me": personal captions on this computer (me.html) instead of an event. The dashboard opens it from now on;
// finishing this wizard later switches back to event mode.
$('just-me').onclick = async () => {
  try { await api('PUT', '/api/setup', { done: true, mode: 'personal' }); } catch (err) { return fail(err); }
  store.set('welcome.at', null);
  location.href = '/me.html';
};
