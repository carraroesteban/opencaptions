// admin.html: the production dashboard (kept out of the HTML so the Content-Security-Policy can forbid inline scripts).
//
// Views (sidebar): Live, Rooms, Agenda, Glossary, Integrations, Transcripts, History, and one page per room
// (#room/<room>/<section>: Live, Screens & QR, Sound, Settings). Settings is a window over them (#settings/<section>).
// Safety model: every setup change is recorded on the server and can be undone (History, and an Undo button
// right after each change); deleted rooms go to a trash; Event mode locks the setup on the server, so nothing
// here can delete or change the event's configuration by accident while it's live.
import { qs, esc, store, copyText, wsUrl, Socket, langLabel, setAccent, LISTEN, listenPort, freeListenPort, serverHost } from '/common.js';
import { localize, prefsControls, tr, LANG } from '/i18n.js';
import { menu, popMenu } from '/menu.js';
import { advanced } from '/prefs.js';
import { icon, mountIcons } from '/illustrations.js';
import { ensureSignedIn, signInScreen, signOut } from '/signin.js';
import { accessPanel } from '/access.js';
import { alertsPanel } from '/alerts-ui.js';
import { keyPanel, tunnelPanel, textApiPanel } from '/connect.js';
import { localPanel } from '/local-mode.js';
import { aiBadge } from '/ai-badge.js';
let aiChip = null, aiSetting = null; // the AI badge in the top bar and in Settings → AI, made on the first status
import { LANGUAGE_CATALOG } from '/languages.js';
import { mountNav, setRooms, setCurrent, setCrumbs, home, viewCrumb, addCommands, stateOf, stateLabel, onReorder, initials } from '/nav.js';

const $ = (id) => document.getElementById(id);
/** innerHTML, only when it changed: the dashboard redraws every second and most of it stays the same. */
const setHtml = (el, h) => { if (el._html !== h) { el._html = h; el.innerHTML = h; } };
mountNav();
// Rooms dragged in the sidebar (or Move up / down in a room's menu): saved for everyone, and undoable.
onReorder(async (ids) => {
  try { const r = await api('PUT', '/api/stages/order', { ids }); if (r.change) toast(t.saved, { undo: r.change, ms: 4000 }); } catch { /* the toast says why; the next update puts the order back */ }
});
$('prefs-slot').append(prefsControls());
mountIcons();
// Signed in with a session cookie (public/signin.js): no password is kept on this page.
localize(); // the page behind the sign-in screen, in the right language
const me = await ensureSignedIn();
const isCrew = me.role === 'crew';
document.body.classList.toggle('role-crew', isCrew); // the crew sees the live controls only
let ev = await (await fetch('/api/event')).json();
setAccent(ev.accent);
let last = null;
let locked = false;
const logs = [];
let logsQueued = 0; // a frame is booked to redraw them (renderLogsSoon)
const VIEWS = isCrew ? ['live', 'room', 'transcripts', 'history'] : ['live', 'rooms', 'agenda', 'glossary', 'room', 'integrations', 'transcripts', 'history'];
const TABS = isCrew ? ['live', 'screens', 'sound'] : ['live', 'screens', 'sound', 'settings'];
let view = 'live';
let focusRoom = '';
const ADV_VIEWS = ['glossary', 'integrations', 'history']; // shown in Advanced mode (data-advanced in the sidebar)
const calm = matchMedia('(prefers-reduced-motion: reduce)');
const roomName = (id) => last?.stages.find((x) => x.id === id)?.name || ev.stages?.find((x) => x.id === id)?.name || id;
let roomTab = 'live';
let txRoom = null;

// Sentences with names and numbers in them, per language (the page translator only handles fixed strings).
const L = {
  es: {
    title: (v) => `${v} · Producción`,
    lockOn: 'Modo evento activado', lockOnSub: 'Configuración bloqueada', lockOff: 'Modo evento', lockOffSub: 'Bloqueá la configuración durante el evento',
    lockedBar: 'Modo evento activado: la configuración está bloqueada para que nada se borre ni cambie por error.', unlock: 'Desbloquear',
    lockAsk: '¿Activar el modo evento?', lockAskBody: 'Nadie va a poder borrar ni cambiar salas, la agenda, el glosario ni el nombre del evento hasta que lo desactives. Siguen funcionando: empezar la siguiente charla, renombrar la charla actual, reconectar una sala y el cambio de IA.', lockAskOk: 'Activar el modo evento',
    unlockAsk: '¿Desbloquear la configuración?', unlockAskBody: 'Vas a poder cambiar y borrar salas, la agenda y el glosario. Si el evento está en curso, hacelo solo si sabés lo que vas a cambiar: todo queda en el Historial y se puede deshacer.', unlockAskOk: 'Desbloquear',
    lockedToast: 'El modo evento está activado: desbloquealo en Ajustes para cambiar la configuración.',
    undo: 'Deshacer', undone: 'Deshecho', restore: 'Restaurar', saved: 'Guardado.', done: 'Listo.',
    advLabel: 'Modo avanzado', advOn: 'Modo avanzado: el glosario, las integraciones, el historial y los ajustes técnicos están a la vista.', advOff: 'Modo básico: solo lo esencial.', advAuto: 'Modo avanzado activado para mostrar esta sección.',
    delAsk: (n) => `¿Eliminar «${n}»?`, delAskBody: 'La sala va a la papelera: podés restaurarla tal como estaba desde Salas o el Historial. Sus transcripciones se conservan.', delOk: 'Eliminar sala',
    deleted: (n) => `«${n}» eliminada.`, created: (n) => `«${n}» creada.`, changedRoom: (n) => `«${n}» actualizada.`,
    endAsk: (n) => `¿Terminar la charla de «${n}»?`, endBody: 'Su transcripción queda guardada. Lo que se diga después empieza una charla nueva, sin nombre (nombrala con Siguiente charla).', endOk: 'Terminar la charla', ended: 'Charla terminada.',
    restartAsk: (n) => `¿Reconectar la IA de «${n}»?`, restartAskBody: 'Los subtítulos de esta sala se pausan unos segundos mientras se reconecta. Usalo si la sala parece trabada.', restartOk: 'Reconectar',
    nextTitle: (n) => `Siguiente charla en «${n}»`, nextNote: 'La transcripción de la charla actual queda guardada y la nueva empieza de cero.', nextOk: 'Empezar la charla',
    renameTitle: (n) => `Renombrar la charla en «${n}»`, renameNote: 'Cambia el título de la charla actual en las pantallas, la transcripción y las descargas.', renameOk: 'Guardar',
    over: (m, t) => `Va ${m} min pasada · le toca a «${t}»`, startDue: (t) => `Empezar «${t}»`, next: (t, h) => `Siguiente: ${t} · ${h}`, noTalk: 'Sin charla anunciada',
    speech: { translate: 'Subtítulos + voz traducida', transcribe: 'Solo subtítulos' },
    upAvail: (v) => `OpenCaptions ${v} ya está disponible`, upNotes: 'Novedades', upDownload: 'Descargar', upCmd: 'Para actualizar:', upNow: 'Actualizar ahora',
    upAsk: (v) => `¿Actualizar a OpenCaptions ${v}?`, upOk: 'Actualizar',
    upAskBody: (live) => `OpenCaptions descarga la versión nueva y se reinicia: los subtítulos se pausan cerca de un minuto${live ? ` en ${live === 1 ? 'la sala en vivo' : `las ${live} salas en vivo`}` : ''}, y los celulares, las pantallas y las computadoras de las salas se reconectan solos. Tus ajustes y transcripciones no cambian.`,
    upWorking: (v) => `Descargando OpenCaptions ${v}…`, upRestarting: 'Reiniciando con la versión nueva… esta página se recarga sola.',
    upSlow: 'OpenCaptions tarda en volver. Si su ventana se cerró, abrilo de nuevo.',
    speechHint: { translate: 'Cada sala también puede ofrecer la voz traducida, y cuesta unas cuatro veces más. Elegilo solo si alguien la necesita.', transcribe: 'Para cuando nadie necesita la voz traducida. Si el orador cambia de idioma en medio de la charla, los subtítulos lo manejan peor.' },
    speechAsk: '¿Cambiar el modelo de voz?', speechAskBody: (n) => `Hay ${n} ${n === 1 ? 'sala' : 'salas'} en vivo: los subtítulos se pausan unos segundos mientras se reconectan.`, speechOk: 'Cambiar el modelo',
    agendaNone: 'Todavía no hay agenda. Pegala abajo.', agendaPreview: (a, r, k) => `${a} ${a === 1 ? 'charla nueva' : 'charlas nuevas'} · ${r} ${r === 1 ? 'se quita' : 'se quitan'} · ${k} ${k === 1 ? 'sigue igual' : 'siguen igual'}`, agendaUnknown: (l) => `Salas que no existen: ${l}`, agendaSkipped: (n, l) => `${n} ${n === 1 ? 'fila' : 'filas'} de otras salas ${n === 1 ? 'se ignora' : 'se ignoran'} (${l})`,
    agendaSave: 'Reemplazar la agenda', agendaSame: 'Es igual a la agenda actual: no hay nada que cambiar.', agendaSaved: (n) => `Agenda guardada: ${n} charlas.`, more: (n) => `y ${n} más`,
    glossSaved: (t, c) => `Glosario guardado: ${t} términos, ${c} correcciones.`, unsaved: 'Cambios sin guardar', anyLang: 'Todos',
    renamed: (n) => `El evento ahora se llama «${n}».`,
    conn: {
      titles: { zoom: 'Subtítulos en Zoom', youtube: 'Subtítulos en YouTube Live', teams: 'Subtítulos en Microsoft Teams', webhook: 'Webhook' },
      names: { zoom: 'Zoom', youtube: 'YouTube Live', teams: 'Teams', webhook: 'Webhook' },
      help: {
        zoom: 'En la reunión o el webinar, como anfitrión: Subtítulos → servicio de subtítulos de terceros → «Copiar el token de API», y pegalo acá. Cada reunión tiene su propio enlace. Si la opción no aparece, activá «Permitir el uso del token de API de subtítulos» en la configuración web de Zoom.',
        youtube: 'En YouTube Studio → Transmitir en vivo → la configuración de tu transmisión → Subtítulos: activalos, elegí «Publicar subtítulos en una URL» (HTTP POST) y copiá la URL de ingesta de subtítulos. Una sola fuente de subtítulos por transmisión.',
        teams: 'En las opciones de la reunión (calendario de Teams → la reunión → Opciones de reunión): activá «Proporcionar subtítulos CART», guardá y copiá el enlace CART.',
        webhook: 'Una dirección https:// tuya. Cada envío es JSON, firmado con HMAC-SHA256 en el encabezado X-OpenCaptions-Signature; la clave secreta aparece una sola vez, al conectar.',
      },
      subs: { zoom: 'En la reunión o el webinar, para todos.', youtube: 'En la transmisión, con el botón CC.', teams: 'Subtítulos CART dentro de la reunión.', webhook: 'Cada subtítulo y cada charla, a tu sistema.' },
      hint: { zoom: 'Empieza con https://wmcapi.zoom.us/closedcaption', youtube: 'Empieza con http://upload.youtube.com/closedcaption?cid=', teams: 'Empieza con https://api.captions.office.microsoft.com/cartcaption', webhook: 'Una dirección https:// de tu sistema' },
      good: (n) => `Es un enlace de ${n}.`, bad: (n) => `No parece un enlace de ${n}: copialo de nuevo desde ${n}.`, needHttps: 'Tiene que empezar con https://',
      count: (n) => (n === 1 ? '1 conectada' : `${n} conectadas`), connect: 'Conectar', connectTo: (n) => `Conectar ${n}`, more: (n) => `Opciones de ${n}`,
      orig: 'Original (lo que se habla)', waiting: 'Esperando subtítulos', sent: (n, a) => `${n} enviados · hace ${a}`, failed: (e) => e,
      deleted: 'sala eliminada', test: 'Enviar una prueba', remove: 'Quitar', tested: 'Enviamos una línea de prueba.', removed: 'Desconectado.',
      connected: (n) => `${n} conectado.`, secretTitle: 'La clave de este webhook', secret: 'Guardala ahora para verificar los envíos: no se vuelve a mostrar.', secretLabel: 'Clave', secretOk: 'Ya la guardé',
      removeAsk: '¿Quitar esta conexión?', removeBody: 'Los subtítulos dejan de llegar ahí en el acto. Podés volver a conectarla cuando quieras.',
    },
    txDelete: (n) => `¿Eliminar para siempre la transcripción «${n}»?`, noUndo: 'No se puede deshacer.',
    addrRtmp: 'En OBS: Ajustes → Emisión → Servicio: Personalizado. En vMix: Settings → Outputs / Streaming → Destination: Custom RTMP Server. Pegá el servidor y la clave, guardá la sala y empezá a transmitir.',
    addrSrt: 'En OBS: Ajustes → Emisión → Servicio: Personalizado. En vMix: Settings → Outputs / Streaming → Destination: SRT, tipo Caller. Pegá la dirección (en vMix, el host y el puerto), guardá la sala y empezá a transmitir.',
    addrServer: 'Servidor', addrKey: 'Clave de retransmisión', addrAddress: 'Dirección', addrId: 'Primero escribí el ID de la sala.',
    addrNet: (p) => `La computadora que transmite tiene que llegar a esta por la red. Si no conecta, el firewall de acá tiene que dejar entrar el puerto ${p}. ¿Transmitís desde esta misma computadora? Usá 127.0.0.1.`,
    addrNoFfmpeg: 'Para esto hace falta ffmpeg, que no se instaló con OpenCaptions en esta computadora. Usá la página de sonido con un micrófono, o instalá ffmpeg y reiniciá.',
    toMe: 'Pasar a Solo para mí', toMeBody: (n) => `${n ? `${n === 1 ? 'Hay una sala en vivo' : `Hay ${n} salas en vivo`}: su público deja de ver los subtítulos. ` : ''}Las páginas del público, la pantalla del escenario y el overlay dejan de mostrar el evento hasta que vuelvas a eventos (desde Solo para mí, «Usarlo para eventos»). No se borra nada: salas, agenda y transcripciones quedan como están.`,
    langInUse: (rooms, langs) => `${rooms.join(', ')} ${rooms.length > 1 ? 'usan' : 'usa'} ${langs.join(', ')}: quitalo de ${rooms.length > 1 ? 'esas salas' : 'esa sala'} primero (Salas → Editar).`,
    noTalks: 'Todavía no hay transcripciones en esta sala.', read: 'Leer',
    tx: {
      untitled: 'Charla sin título', live: 'En curso', rec: 'Grabación', min: (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`),
      words: (n) => `${n.toLocaleString('es')} ${n === 1 ? 'palabra' : 'palabras'}`, talks: (n) => `${n} ${n === 1 ? 'charla' : 'charlas'}`,
      read: (n) => `Leer «${n}»`, dl: 'Descargar', dlOf: (n) => `Descargar «${n}»`, more: (n) => `Más opciones de «${n}»`,
      dlNote: 'SRT y VTT: subtítulos para un video. TXT: el texto, para leer o editar.', copyLink: 'Copiar el enlace', del: 'Eliminar…',
      noMatch: (q) => `Ninguna charla de esta sala coincide con «${q}».`, emptyBody: 'Cada charla queda acá cuando termina, con sus descargas en cada idioma.',
    },
    k: {
      'room.create': (c) => (c.undoes ? `Sala «${c.after?.name}» restaurada` : `Sala «${c.after?.name}» creada`),
      'room.update': (c) => `Sala «${c.after?.name}» ${c.undoes ? 'vuelta a como estaba' : 'modificada'}${roomDiff(c, 'es')}`,
      'room.delete': (c) => `Sala «${c.before?.name}» eliminada`,
      'agenda.set': (c) => (c.undoes ? `Agenda vuelta a como estaba (${c.after?.count ?? 0} charlas)` : `Agenda reemplazada (${c.before?.count ?? 0} → ${c.after?.count ?? 0} charlas)`),
      'glossary.set': (c) => (c.undoes ? 'Glosario vuelto a como estaba' : `Glosario guardado (${c.after?.terms ?? 0} términos, ${c.after?.corrections ?? 0} correcciones)`),
      'event.rename': (c) => `Evento renombrado a «${c.after}»`,
      'event.logo': (c) => (c.after ? (c.before ? 'Logo del evento reemplazado' : 'Logo del evento agregado') : 'Logo del evento quitado'),
      'engine.mode': (c) => `IA: ${aiLabel(c.after)}`,
      'ai.speech': (c) => `Modelo de voz: ${t.speech[c.after] || c.after}`,
      'event.lock': (c) => (c.after ? 'Modo evento activado' : 'Modo evento desactivado'),
      'auth.link': (c) => `Enlace creado para la computadora de una sala (${c.after})`,
    },
    fields: { name: 'nombre', source: 'idioma de la charla', targets: 'idiomas', translation: 'modo de traducción', pull: 'fuente de audio', loop: 'loop', musicGuard: 'pausa con música', roomSound: 'sonido de la sala', roomSoundMax: 'máximo de oyentes', vocabulary: 'vocabulario' },
    ai: { auto: 'Automática (nube + respaldo)', cloud: 'Siempre en la nube', local: 'Siempre esta computadora' },
    sys: (y, up) => `Encendido hace ${up} · CPU ${y.cpuPct} % · memoria ${y.rssMB} MB · event loop ${y.loopLagMs.p99} ms (p99)`,
    audioNone: 'Sin sonido', copied: 'Copiado', copyFail: 'No se pudo copiar: seleccioná el texto y copialo a mano.',
    tabs: { live: 'En vivo', screens: 'Pantallas y QR', sound: 'Sonido', settings: 'Ajustes' }, rooms: 'Salas', noCaption: 'Sin subtítulos todavía',
    copy: 'Copiar', open: 'Abrir', qrDl: 'Descargar el QR', poster: 'Cartel para imprimir',
    kinds: { browser: 'página de sonido', agent: 'agente de la sala', pull: 'stream o archivo', personal: 'esta computadora' }, audioStream: 'stream o archivo',
    linkMade: (hm) => `Sirve una vez, hasta las ${hm}. Solo deja enviar el sonido de esta sala: no hace falta contraseña.`, linkQr: 'QR del enlace para la computadora junto al escenario',
    logo: {
      upload: 'Subir el logo', replace: 'Reemplazar', saved: 'Logo guardado: ya se ve en las páginas del público', removed: 'Logo quitado',
      type: 'El logo tiene que ser una imagen PNG, JPEG o WebP (SVG no).', big: 'El logo pesa más de 2 MB: exportalo más chico.', fail: 'No se pudo subir el logo. Probá de nuevo.',
      ask: '¿Quitar el logo del evento?', askBody: 'Los celulares, la pantalla del escenario y los carteles vuelven a mostrar el logo de OpenCaptions.', ok: 'Quitar',
    },
  },
  en: {
    title: (v) => `${v} · Production`,
    lockOn: 'Event mode is on', lockOnSub: 'Setup locked', lockOff: 'Event mode', lockOffSub: 'Lock the setup during the event',
    lockedBar: 'Event mode is on: the setup is locked so nothing gets deleted or changed by accident.', unlock: 'Unlock',
    lockAsk: 'Turn on Event mode?', lockAskBody: 'Nobody will be able to delete or change rooms, the agenda, the glossary or the event name until you turn it off. These keep working: starting the next talk, renaming the current talk, reconnecting a room and switching the AI.', lockAskOk: 'Turn on Event mode',
    unlockAsk: 'Unlock the setup?', unlockAskBody: 'You’ll be able to change and delete rooms, the agenda and the glossary. If the event is running, only do this if you know what you’re about to change: everything is recorded in History and can be undone.', unlockAskOk: 'Unlock',
    lockedToast: 'Event mode is on: unlock it in Settings to change the setup.',
    undo: 'Undo', undone: 'Undone', restore: 'Restore', saved: 'Saved.', done: 'Done.',
    advLabel: 'Advanced mode', advOn: 'Advanced mode: the glossary, integrations, history and technical settings are in view.', advOff: 'Basic mode: just the essentials.', advAuto: 'Advanced mode turned on to show this section.',
    delAsk: (n) => `Delete “${n}”?`, delAskBody: 'The room goes to the trash: you can restore it exactly as it was from Rooms or History. Its transcripts are kept.', delOk: 'Delete room',
    deleted: (n) => `“${n}” deleted.`, created: (n) => `“${n}” created.`, changedRoom: (n) => `“${n}” updated.`,
    endAsk: (n) => `End the talk in “${n}”?`, endBody: 'Its transcript is saved. Whatever is said next starts a new, unnamed talk (name it with Next talk).', endOk: 'End the talk', ended: 'Talk ended.',
    restartAsk: (n) => `Reconnect the AI in “${n}”?`, restartAskBody: 'This room’s captions pause for a few seconds while it reconnects. Use it if the room seems stuck.', restartOk: 'Reconnect',
    nextTitle: (n) => `Next talk in “${n}”`, nextNote: 'The current talk’s transcript is kept and the new one starts fresh.', nextOk: 'Start the talk',
    renameTitle: (n) => `Rename the talk in “${n}”`, renameNote: 'Changes the current talk’s title on screens, in the transcript and in downloads.', renameOk: 'Save',
    over: (m, t) => `${m} min over · “${t}” is due`, startDue: (t) => `Start “${t}”`, next: (t, h) => `Next: ${t} · ${h}`, noTalk: 'No talk announced',
    speech: { translate: 'Captions + translated voice', transcribe: 'Captions only' },
    upAvail: (v) => `OpenCaptions ${v} is available`, upNotes: 'What’s new', upDownload: 'Download', upCmd: 'To update:', upNow: 'Update now',
    upAsk: (v) => `Update to OpenCaptions ${v}?`, upOk: 'Update',
    upAskBody: (live) => `OpenCaptions downloads the new version and restarts: captions pause for about a minute${live ? ` in ${live === 1 ? 'the live room' : `the ${live} live rooms`}` : ''}, and phones, screens and the rooms’ computers reconnect by themselves. Your settings and transcripts don’t change.`,
    upWorking: (v) => `Downloading OpenCaptions ${v}…`, upRestarting: 'Restarting with the new version… this page reloads by itself.',
    upSlow: 'OpenCaptions is taking a while to come back. If its window closed, open it again.',
    speechHint: { translate: 'Each room can also offer the translated voice, and it costs about four times more. Pick it only if someone needs it.', transcribe: 'For when nobody needs the translated voice. Speakers who switch language mid-talk get less clever captions.' },
    speechAsk: 'Change the speech model?', speechAskBody: (n) => `${n} ${n === 1 ? 'room is' : 'rooms are'} live: captions pause for a few seconds while they reconnect.`, speechOk: 'Change the model',
    agendaNone: 'No agenda yet. Paste it below.', agendaPreview: (a, r, k) => `${a} new ${a === 1 ? 'talk' : 'talks'} · ${r} removed · ${k} unchanged`, agendaUnknown: (l) => `Rooms that don’t exist: ${l}`, agendaSkipped: (n, l) => `${n} ${n === 1 ? 'row' : 'rows'} for other rooms ${n === 1 ? 'is' : 'are'} ignored (${l})`,
    agendaSave: 'Replace the agenda', agendaSame: 'It’s the same as the current agenda: nothing to change.', agendaSaved: (n) => `Agenda saved: ${n} talks.`, more: (n) => `and ${n} more`,
    glossSaved: (t, c) => `Glossary saved: ${t} terms, ${c} corrections.`, unsaved: 'Unsaved changes', anyLang: 'All',
    renamed: (n) => `The event is now called “${n}”.`,
    conn: {
      titles: { zoom: 'Captions in Zoom', youtube: 'Captions in YouTube Live', teams: 'Captions in Microsoft Teams', webhook: 'Webhook' },
      names: { zoom: 'Zoom', youtube: 'YouTube Live', teams: 'Teams', webhook: 'Webhook' },
      help: {
        zoom: 'In the meeting or webinar, as host: Captions → third-party captioning service → "Copy the API token", and paste it here. Each meeting has its own link. If the option is missing, turn on "Allow use of caption API token" in Zoom\'s web settings.',
        youtube: 'In YouTube Studio → Go live → your stream\'s settings → Closed captions: turn them on, choose "POST captions to URL" (HTTP POST) and copy the Captions ingestion URL. One caption source per stream.',
        teams: 'In the meeting options (Teams calendar → the meeting → Meeting options): turn on "Provide CART captions", save, and copy the CART link.',
        webhook: 'An https:// address of yours. Each request is JSON, signed with HMAC-SHA256 in the X-OpenCaptions-Signature header; the secret is shown once, when you connect.',
      },
      subs: { zoom: 'In the meeting or webinar, for everyone.', youtube: 'On the stream, with the CC button.', teams: 'CART captions inside the meeting.', webhook: 'Each caption and each talk, to your system.' },
      hint: { zoom: 'Starts with https://wmcapi.zoom.us/closedcaption', youtube: 'Starts with http://upload.youtube.com/closedcaption?cid=', teams: 'Starts with https://api.captions.office.microsoft.com/cartcaption', webhook: 'An https:// address of your system' },
      good: (n) => `That’s a ${n} link.`, bad: (n) => `That doesn’t look like a ${n} link: copy it again from ${n}.`, needHttps: 'It must start with https://',
      count: (n) => `${n} connected`, connect: 'Connect', connectTo: (n) => `Connect ${n}`, more: (n) => `${n} options`,
      orig: 'Original (what is spoken)', waiting: 'Waiting for captions', sent: (n, a) => `${n} sent · ${a} ago`, failed: (e) => e,
      deleted: 'room deleted', test: 'Send a test', remove: 'Remove', tested: 'Sent a test line.', removed: 'Disconnected.',
      connected: (n) => `${n} connected.`, secretTitle: 'This webhook’s secret', secret: 'Keep it now to verify the requests: it isn’t shown again.', secretLabel: 'Secret', secretOk: 'I’ve kept it',
      removeAsk: 'Remove this connection?', removeBody: 'Captions stop going there right away. You can connect it again any time.',
    },
    txDelete: (n) => `Delete the transcript “${n}” for good?`, noUndo: 'This can’t be undone.',
    addrRtmp: 'In OBS: Settings → Stream → Service: Custom. In vMix: Settings → Outputs / Streaming → Destination: Custom RTMP Server. Paste the server and the key, save the room and start streaming.',
    addrSrt: 'In OBS: Settings → Stream → Service: Custom. In vMix: Settings → Outputs / Streaming → Destination: SRT, type Caller. Paste the address (in vMix, its host and port), save the room and start streaming.',
    addrServer: 'Server', addrKey: 'Stream key', addrAddress: 'Address', addrId: 'Type the room’s ID first.',
    addrNet: (p) => `The computer that streams must reach this one on the network. If it doesn’t connect, the firewall here must let port ${p} in. Streaming from this same computer? Use 127.0.0.1 instead.`,
    addrNoFfmpeg: 'This needs ffmpeg, which didn’t install with OpenCaptions on this computer. Use the sound page with a microphone instead, or install ffmpeg and restart.',
    toMe: 'Switch to Just for me', toMeBody: (n) => `${n ? `${n === 1 ? 'A room is live' : `${n} rooms are live`}: its audience stops seeing captions. ` : ''}The audience pages, the stage screen and the overlay stop showing the event until you switch back (from Just for me, “Use it for events”). Nothing is deleted: rooms, the agenda and transcripts stay as they are.`,
    langInUse: (rooms, langs) => `${rooms.join(', ')} ${rooms.length > 1 ? 'use' : 'uses'} ${langs.join(', ')}: remove it from ${rooms.length > 1 ? 'those rooms' : 'that room'} first (Rooms → Edit).`,
    noTalks: 'No transcripts in this room yet.', read: 'Read',
    tx: {
      untitled: 'Untitled talk', live: 'In progress', rec: 'Recording', min: (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`),
      words: (n) => `${n.toLocaleString('en')} ${n === 1 ? 'word' : 'words'}`, talks: (n) => `${n} ${n === 1 ? 'talk' : 'talks'}`,
      read: (n) => `Read “${n}”`, dl: 'Download', dlOf: (n) => `Download “${n}”`, more: (n) => `More options for “${n}”`,
      dlNote: 'SRT and VTT: captions for a video. TXT: the text, to read or edit.', copyLink: 'Copy the link', del: 'Delete…',
      noMatch: (q) => `No talk in this room matches “${q}”.`, emptyBody: 'Each talk lands here when it ends, with its downloads in every language.',
    },
    k: {
      'room.create': (c) => (c.undoes ? `Room “${c.after?.name}” restored` : `Room “${c.after?.name}” created`),
      'room.update': (c) => `Room “${c.after?.name}” ${c.undoes ? 'put back as it was' : 'changed'}${roomDiff(c, 'en')}`,
      'room.delete': (c) => `Room “${c.before?.name}” deleted`,
      'agenda.set': (c) => (c.undoes ? `Agenda put back (${c.after?.count ?? 0} talks)` : `Agenda replaced (${c.before?.count ?? 0} → ${c.after?.count ?? 0} talks)`),
      'glossary.set': (c) => (c.undoes ? 'Glossary put back' : `Glossary saved (${c.after?.terms ?? 0} terms, ${c.after?.corrections ?? 0} corrections)`),
      'event.rename': (c) => `Event renamed to “${c.after}”`,
      'event.logo': (c) => (c.after ? (c.before ? 'Event logo replaced' : 'Event logo added') : 'Event logo removed'),
      'engine.mode': (c) => `AI: ${aiLabel(c.after)}`,
      'ai.speech': (c) => `Speech model: ${t.speech[c.after] || c.after}`,
      'event.lock': (c) => (c.after ? 'Event mode turned on' : 'Event mode turned off'),
      'auth.link': (c) => `Link made for a room computer (${c.after})`,
    },
    fields: { name: 'name', source: 'talk language', targets: 'languages', translation: 'translation mode', pull: 'audio source', loop: 'loop', musicGuard: 'pause for music', roomSound: 'room sound', roomSoundMax: 'most listeners' },
    ai: { auto: 'Automatic (cloud + backup)', cloud: 'Always in the cloud', local: 'Always this computer' },
    sys: (y, up) => `Up for ${up} · CPU ${y.cpuPct}% · memory ${y.rssMB} MB · event loop ${y.loopLagMs.p99} ms (p99)`,
    audioNone: 'No sound', copied: 'Copied', copyFail: 'Couldn’t copy: select the text and copy it yourself.',
    tabs: { live: 'Live', screens: 'Screens & QR', sound: 'Sound', settings: 'Settings' }, rooms: 'Rooms', noCaption: 'No captions yet',
    copy: 'Copy', open: 'Open', qrDl: 'Download the QR', poster: 'Poster to print',
    kinds: { browser: 'sound page', agent: 'room agent', pull: 'stream or file', personal: 'this computer' }, audioStream: 'stream or file',
    linkMade: (hm) => `Works once, until ${hm}. It only lets that computer send this room’s sound: no password needed.`, linkQr: 'QR code of the link for the computer next to the stage',
    logo: {
      upload: 'Upload the logo', replace: 'Replace', saved: 'Logo saved: the audience pages show it now', removed: 'Logo removed',
      type: 'The logo has to be a PNG, JPEG or WebP image (not SVG).', big: 'The logo is over 2 MB: export a smaller one.', fail: 'Couldn’t upload the logo. Try again.',
      ask: 'Remove the event logo?', askBody: 'Phones, the stage screen and the posters go back to showing the OpenCaptions logo.', ok: 'Remove',
    },
  },
};
const t = L[LANG] || L.en;
const aiLabel = (m) => t.ai[m] || m;
function roomDiff(c, lang) {
  if (!c.before || !c.after) return '';
  const f = L[lang].fields;
  const changed = Object.keys(f).filter((k) => JSON.stringify(c.before[k] ?? '') !== JSON.stringify(c.after[k] ?? ''));
  return changed.length ? ` · ${changed.map((k) => f[k]).join(', ')}` : '';
}

// ---------- server ----------
const api = async (method, url, body, { quiet = false } = {}) => {
  const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 401) { askToken(); throw new Error('signed out'); }
  const j = await r.json().catch(() => ({}));
  if (r.status === 423) { setLocked(true); toast(t.lockedToast, { error: true }); throw new Error('locked'); }
  if (!r.ok) { if (!quiet) toast(tr(j.error || r.statusText), { error: true }); throw Object.assign(new Error(j.error || r.statusText), { body: j }); }
  return j;
};
// First run: the welcome wizard asks for the event name, rooms and languages before showing the dashboard.
try {
  const setup = await api('GET', '/api/setup', null, { quiet: true });
  if (!setup.done && !qs.has('dashboard') && !isCrew) { location.replace('/welcome.html'); await new Promise(() => {}); }
  if (setup.mode === 'personal' && !isCrew) { location.replace('/me.html'); await new Promise(() => {}); } // "just for me"
  setLocked(!!setup.locked);
} catch { /* signed out meanwhile: askToken() shows the sign-in */ }
// Signed out (expired, or signed out from another device): one sign-in screen, then start over.
let signingIn = false;
function askToken() {
  if (signingIn) return;
  signingIn = true;
  signInScreen().then(() => location.reload());
}

new Socket(() => wsUrl('/ws/admin', {}), {
  message(m) {
    if (m.type === 'status') render(m);
    else if (m.type === 'log') { logs.push(m); if (logs.length > 400) logs.shift(); renderLogsSoon(); }
    else if (m.type === 'logs') { logs.splice(0, logs.length, ...m.logs); renderLogsSoon(); }
    else if (m.type === 'history') { refreshSchedule(); if (view === 'history') loadHistory(); }
  },
  close(e) { if (e.code === 4001) askToken(); },
});

// ---------- toasts and confirmations ----------
$('toasts').showPopover(); // the top layer, so a Settings window doesn't cover it
function toast(msg, { undo = null, error = false, ms = 7000 } = {}) {
  const el = document.createElement('div');
  el.className = `note${error ? ' err' : ''}`;
  el.innerHTML = `<span>${esc(msg)}</span>${undo ? `<button type="button">${esc(t.undo)}</button>` : ''}`;
  const bye = () => { if (calm.matches) return el.remove(); el.classList.add('out'); setTimeout(() => el.remove(), 220); }; // it leaves, it doesn't vanish
  if (undo) el.querySelector('button').onclick = async () => { bye(); await undoChange(undo); };
  $('toasts').append(el);
  if (document.querySelector('dialog:modal')) { $('toasts').hidePopover(); $('toasts').showPopover(); } // back on top of a window opened since
  while ($('toasts').children.length > 3) $('toasts').firstElementChild.remove(); // a burst: the newest three
  setTimeout(bye, ms);
}
/**
 * A real dialog instead of window.confirm: says what will happen, with a clearly labelled button. info: only an OK
 * (something to read, like a secret shown once); html: more below the text (a copy row).
 */
function confirmDialog({ title, body, ok, danger = false, info = false, html = '' }) {
  $('cf-title').textContent = title;
  $('cf-body').innerHTML = `<p>${esc(body)}</p>${html}`;
  $('cf-ok').previousElementSibling.classList.toggle('hidden', info);
  $('cf-ok').textContent = ok;
  $('cf-ok').className = danger ? 'danger' : 'primary';
  const d = $('dlg-confirm');
  d.returnValue = '';
  d.showModal();
  return new Promise((res) => d.addEventListener('close', () => res(d.returnValue === 'ok'), { once: true }));
}
async function undoChange(id) {
  await api('POST', `/api/history/${id}/undo`);
  toast(t.done, { ms: 3000 });
  refreshView();
}

// ---------- Event mode ----------
function setLocked(on) {
  locked = on;
  document.body.classList.toggle('locked', on);
  // A switch in the sidebar and one in Settings. Off, one quiet line (what it does is in its tooltip); on, the
  // sidebar row turns solid and says the setup is locked.
  $('lockbtn').checked = $('lock2').checked = on;
  $('lockrow').classList.toggle('on', on);
  $('lockrow').title = on ? t.lockOn : t.lockOffSub;
  $('lock-sub').textContent = on ? t.lockOnSub : '';
  const showBar = on && ['rooms', 'agenda', 'glossary', 'history'].includes(view);
  $('lockedbar').classList.toggle('hidden', !showBar);
  $('lockedbar').innerHTML = `${icon('lock')}<span>${esc(t.lockedBar)}</span><button type="button" id="unlock-now">${esc(t.unlock)}</button>`;
  $('unlock-now').onclick = toggleLock;
  for (const el of document.querySelectorAll('[data-setup]')) el.disabled = on || isCrew;
}
async function toggleLock() {
  const turnOn = !locked;
  const ok = await confirmDialog(turnOn ? { title: t.lockAsk, body: t.lockAskBody, ok: t.lockAskOk } : { title: t.unlockAsk, body: t.unlockAskBody, ok: t.unlockAskOk, danger: true });
  if (!ok) return;
  const r = await api('POST', '/api/lock', { locked: turnOn });
  setLocked(r.locked);
  refreshView();
}
// The switches only flip once the change is confirmed (and the server agrees): until then they stay as they were.
$('lockbtn').onchange = $('lock2').onchange = (e) => { e.target.checked = locked; toggleLock(); };
if (!isCrew) addCommands(() => [{ ic: 'lock', label: locked ? t.unlock : t.lockAskOk, sub: t.lockOff, run: toggleLock }]);

// ---------- Basic and Advanced ----------
// Basic: the live rooms, the agenda, transcripts and the essential settings. Advanced adds the glossary, integrations,
// history, the technical side of each room (costs, AI sessions, translation modes…). Remembered per browser (prefs.js).
const syncAdvanced = () => { $('adv-sw').checked = $('adv-sw2').checked = advanced.get(); };
function setAdvanced(on) {
  advanced.set(on); // no page-wide transition: it froze the live captions and flashed the whole page
  syncAdvanced();
  if (!$('dlg-settings').open) toast(on ? t.advOn : t.advOff, { ms: 3000 }); // in Settings the switch itself says it
  if (!on && ADV_VIEWS.includes(view)) location.hash = '#live';
}
$('adv-sw').onchange = $('adv-sw2').onchange = (e) => setAdvanced(e.target.checked);
addEventListener('oc:advanced', syncAdvanced); // ⌘K turned it on to open something
syncAdvanced();
addCommands(() => [{ ic: 'sliders', label: t.advLabel, sub: advanced.get() ? '✓' : '', run: () => setAdvanced(!advanced.get()) }]);

// ---------- views ----------
// Old addresses still work: #live/<room>, #screens/<room> and #rooms/<room> are now sections of the room's page.
function oldHash(h, sub) {
  if (h === 'rooms' && sub) return `#room/${sub}${sub === 'new' ? '' : '/settings'}`;
  if (h === 'live' && sub) return `#room/${sub}`;
  if (h === 'screens') return sub ? `#room/${sub}/screens` : '#rooms';
  return '';
}
const gridHome = $('grid').nextElementSibling; // where the rooms' cards live on Live (a room's page borrows its card)
let formRoom = null; // the room the Settings form was filled for, so live updates don't wipe what's being typed
let shown = ''; // the view, room and section on screen: a new one crossfades in, the same one just refreshes
function go() {
  let [h, sub, tab] = location.hash.slice(1).split('?')[0].split('/');
  const moved = oldHash(h, sub);
  if (moved) { history.replaceState(history.state, '', moved); [h, sub, tab] = moved.slice(1).split('/'); }
  if (h === 'settings' && !isCrew) {
    openSettings(sub);
    if (document.querySelector('.view.on')) return; // the view behind it stays as it was
  } else if ($('dlg-settings').open) $('dlg-settings').close();
  const next = VIEWS.includes(h) && (h !== 'room' || sub) ? h : 'live';
  const key = [next, sub, tab].join('/');
  const swap = () => show(h, sub, tab);
  // Another section: the page body crossfades (the sidebar stays; its marker slides). Not on the first draw.
  if (shown && shown !== key && document.startViewTransition && !calm.matches) {
    try { document.startViewTransition({ update: swap, types: ['oc-view'] }); } catch { swap(); }
  } else swap();
  shown = key;
}
function show(h, sub, tab) {
  view = VIEWS.includes(h) && (h !== 'room' || sub) ? h : 'live';
  if (ADV_VIEWS.includes(view) && !advanced.get()) { advanced.set(true); syncAdvanced(); toast(t.advAuto, { ms: 3000 }); } // opened from ⌘K, a link or a shortcut
  focusRoom = view === 'room' ? decodeURIComponent(sub) : '';
  const isNew = focusRoom === 'new' && !isCrew;
  roomTab = isNew ? 'settings' : TABS.includes(tab) ? tab : 'live';
  const forRoom = sub && view === 'transcripts' ? decodeURIComponent(sub) : ''; // #transcripts/<room>
  if (forRoom) txRoom = forRoom;
  for (const s of document.querySelectorAll('.view')) s.classList.toggle('on', s.dataset.view === view);
  setCurrent(view === 'room' ? 'rooms' : view, focusRoom);
  const link = document.querySelector(`#side a[data-view="${view}"]`); // the Rooms heading is a link with no icon label
  const label = view === 'room' ? (isNew ? tr('Nueva sala') : roomName(focusRoom)) : (link?.querySelector('.lbl') || link)?.textContent || '';
  $('view-title').textContent = label;
  setCrumbs(view === 'live' ? [home()] : view === 'room' ? [home(), viewCrumb('rooms'), { label }] : forRoom ? [home(), viewCrumb(view), { label: roomName(forRoom) }] : [home(), { label }]);
  const help = $(`help-${view}`); // the view's one-line explanation (its <p id="help-<view>">), under the title
  $('view-sub').textContent = help?.textContent || '';
  $('view-sub').classList.toggle('hidden', !help);
  // A room's page: its sections as tabs, and its card from Live in the first one
  if (view === 'room') $('room-live').append($('grid')); else gridHome.before($('grid'));
  for (const el of $('grid').querySelectorAll('.stage')) { el.classList.toggle('hidden', !!focusRoom && el.dataset.id !== focusRoom); foldDetails(el); }
  if (view === 'room') {
    const id = encodeURIComponent(focusRoom);
    $('room-tabs').innerHTML = (isNew ? ['settings'] : TABS).map((k) => `<a href="#room/${id}/${k}"${k === roomTab ? ' aria-current="page"' : ''}>${esc(t.tabs[k])}</a>`).join('');
    for (const p of document.querySelectorAll('.room-pane')) p.classList.toggle('on', p.dataset.tab === roomTab);
    if (formRoom !== focusRoom && !isCrew) { formRoom = focusRoom; openEdit(isNew ? null : focusRoom); }
  } else formRoom = null;
  setLocked(locked);
  refreshView();
  window.scrollTo(0, 0);
}
function refreshView() {
  if (view === 'rooms') loadRooms();
  else if (view === 'agenda') loadAgenda();
  else if (view === 'glossary') loadGlossary();
  else if (view === 'room' && focusRoom !== 'new') loadRoom(focusRoom);
  else if (view === 'integrations') { intgCards(); loadConnections().catch(() => {}); }
  else if (view === 'transcripts') loadTranscripts();
  else if (view === 'history') loadHistory();
}
addEventListener('hashchange', go);

const fmtDur = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h ${m}m` : `${m}m ${s % 60}s`; };
const ago = (ms) => { if (!ms) return '—'; const s = Math.round((Date.now() - ms) / 1000); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : `${Math.floor(s / 3600)}h`; };
const sec = (ms) => (ms == null ? '—' : (ms / 1000).toFixed(1) + 's');
const hm = (ms) => new Date(ms).toLocaleTimeString(LANG, { hour: '2-digit', minute: '2-digit' });
const when = (ms) => new Date(ms).toLocaleString(LANG, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
const langsOf = (st) => `${st.source === 'auto' || !st.source ? 'auto' : st.source} → ${(st.targets || []).filter((x) => x !== st.source).join(', ') || '—'}`;
const stateChip = (s) => {
  if (s.brk) return `<span class="chip warn">${icon('pause')} ${esc(tr('Pausa'))}${s.brk.by === 'agenda' ? ` · ${esc(tr('agenda'))}` : s.brk.by === 'switcher' ? ' · vMix/OBS' : s.brk.by === 'room' ? ` · ${esc(tr('desde la sala'))}` : ''}</span>`;
  if (s.music) return `<span class="chip warn">${icon('music')} ${esc(tr('Música · en pausa'))}</span>`;
  if (!s.ingest) return `<span class="chip">${esc(tr(s.pull ? 'Esperando el stream' : 'Todavía no llega sonido'))}</span>`;
  if (s.engines.length && !s.gated) return `<span class="chip live"><span class="dot live"></span> ${esc(tr('En vivo'))}</span>`;
  if (s.engines.length) return `<span class="chip">${esc(tr('Escuchando · nadie habla'))}</span>`;
  return `<span class="chip">${esc(tr('Esperando voz'))}</span>`;
};
const engChip = (e) => {
  const cls = e.state === 'live' ? 'ok' : e.state === 'reconnecting' || e.state === 'resuming' || e.state === 'connecting' ? 'warn' : e.state === 'idle' ? '' : 'bad';
  return `<span class="chip ${cls}" title="${esc(e.lastError || '')}">${esc(e.target)} · ${esc(e.state)}${e.reconnects ? ` · ${e.reconnects}×` : ''}</span>`;
};
const alertText = (a) => tr(({ 'no-audio': 'no llega audio', 'muted?': '¿mic muteado? (60s sin señal)', reconnecting: 'reconectando IA', 'high-latency': 'latencia alta', 'mt-throttled': 'traducción limitada por cuota → usando Live', 'ai-quota': 'la key de Gemini llegó a su límite', 'voice-in-break': 'hay alguien hablando durante la pausa', 'on-backup': 'usando el audio de respaldo', 'not-saving': 'no se guardan las transcripciones (¿disco lleno?)', 'ai-errors': 'la IA está dando errores (ver el registro)', budget: 'se terminó el presupuesto de IA de esta semana' })[a] || a);

// ---------- first-run guide (Live view, until everything is done) ----------
let scheduleCount = null;
async function refreshSchedule() { try { scheduleCount = (await (await fetch('/api/schedule')).json()).length; } catch { scheduleCount = 0; } }
refreshSchedule();
const localOk = (l) => !!l && l.asr !== false && (l.llmOff || l.llm !== false);
const OB = {
  es: {
    localNoAsr: (u) => `no responde el servidor de voz (<code>${u}</code>): corré <code>npm run local</code>`,
    localLlmOff: (m) => `solo transcripción, sin traducciones ni resúmenes · ${m}`,
    localNoLlm: (u) => `no responde el modelo de traducción (<code>${u}</code>): corré <code>npm run local</code> o abrí Ollama`,
    localMissing: (m) => `falta el modelo <code>${m}</code>: <code>ollama pull ${m}</code>`,
    localReady: (m) => `listo · ${m} · el audio no sale de esta computadora`,
    engineLocal: 'Motor de IA local', engineGemini: 'Conectar la IA en la nube', ready: () => 'listo',
    count: (a, n) => `${a} de ${n}`, all: 'Ver todos los pasos', fewer: 'Ver solo el siguiente',
    noKey: '<a href="#settings/ai">pegar la API key</a> · por ahora, subtítulos simulados',
    address: 'Dirección pública para los celulares', addressD: (u) => (u ? esc(u) : '<a href="#settings/address">crearla</a> (opcional con Wi-Fi compartido)'),
    rooms: 'Crear las salas', roomsD: (n) => `${n} ${n === 1 ? 'sala' : 'salas'} · <a href="#rooms">ver salas</a>`,
    audio: 'Conectar el sonido de cada sala', audioD: (a, n, room) => `${a} de ${n} · <a href="#room/${room}/sound">conectar</a>`,
    agenda: 'Cargar la agenda', agendaD: (n) => (n ? `${n} ${n === 1 ? 'charla cargada' : 'charlas cargadas'}` : '<a href="#agenda">pegarla</a> (opcional)'),
    kit: 'Imprimir los QR de cada sala', kitD: '<a href="/kit.html" target="_blank" data-ob="kit">abrir el kit de QR</a>',
    sound: 'Prueba de sonido en cada sala', soundD: '<a href="/demo.html?mode=mic" target="_blank" data-ob="sound">abrir la prueba de sonido</a>',
    lock: 'Activar el modo evento al abrir las puertas', lockD: '<a href="#settings/general">activar</a>',
  },
  en: {
    localNoAsr: (u) => `the speech server isn't responding (<code>${u}</code>): run <code>npm run local</code>`,
    localLlmOff: (m) => `transcription only, no translations or summaries · ${m}`,
    localNoLlm: (u) => `the translation model isn't responding (<code>${u}</code>): run <code>npm run local</code> or open Ollama`,
    localMissing: (m) => `model <code>${m}</code> is missing: <code>ollama pull ${m}</code>`,
    localReady: (m) => `ready · ${m} · audio never leaves this computer`,
    engineLocal: 'Local AI engine', engineGemini: 'Connect the cloud AI', ready: () => 'ready',
    count: (a, n) => `${a} of ${n}`, all: 'See all steps', fewer: 'Only the next step',
    noKey: '<a href="#settings/ai">paste the API key</a> · simulated captions until then',
    address: 'A public address for phones', addressD: (u) => (u ? esc(u) : '<a href="#settings/address">create it</a> (optional on a shared Wi-Fi)'),
    rooms: 'Create your rooms', roomsD: (n) => `${n} ${n === 1 ? 'room' : 'rooms'} · <a href="#rooms">see rooms</a>`,
    audio: 'Connect each room’s sound', audioD: (a, n, room) => `${a} of ${n} · <a href="#room/${room}/sound">connect</a>`,
    agenda: 'Load the agenda', agendaD: (n) => (n ? `${n} ${n === 1 ? 'talk' : 'talks'} loaded` : '<a href="#agenda">paste it</a> (optional)'),
    kit: 'Print each room’s QR code', kitD: '<a href="/kit.html" target="_blank" data-ob="kit">open the QR kit</a>',
    sound: 'Sound check in every room', soundD: '<a href="/demo.html?mode=mic" target="_blank" data-ob="sound">open the sound check</a>',
    lock: 'Turn on Event mode when doors open', lockD: '<a href="#settings/general">turn it on</a>',
  },
};
const ob = OB[LANG] || OB.en;
function localDetail(s) {
  const l = s.local || {};
  if (l.asr === false) return ob.localNoAsr(esc(l.asrUrl || ''));
  if (l.llmOff) return l.apple ? ob.localReady(esc(s.model)) : ob.localLlmOff(esc(s.model)); // Apple translates without Ollama
  if (l.llm === false) return ob.localNoLlm(esc(l.llmUrl || ''));
  if (l.modelInstalled === false) return ob.localMissing(esc((l.missing || [])[0] || l.llmModel || ''));
  return ob.localReady(esc(s.model));
}
function renderOnboard(s) {
  if (store.get('admin.obHidden', false) || s.locked || isCrew) return $('onboard').classList.add('hidden'); // setup tasks: admins only
  const withAudio = s.stages.filter((x) => x.ingest).length;
  const steps = [
    s.engine === 'local' ? [localOk(s.local), ob.engineLocal, localDetail(s)] : [s.engine === 'gemini', ob.engineGemini, s.engine === 'gemini' ? ob.ready(esc(s.model)) : ob.noKey],
    [s.stages.length > 0, ob.rooms, ob.roomsD(s.stages.length)],
    [!!s.publicUrl, ob.address, ob.addressD(s.publicUrl)],
    [withAudio === s.stages.length && s.stages.length > 0, ob.audio, ob.audioD(withAudio, s.stages.length, encodeURIComponent((s.stages.find((x) => !x.ingest) || s.stages[0])?.id || ''))],
    [scheduleCount > 0, ob.agenda, ob.agendaD(scheduleCount)],
    [store.get('admin.kitDone', false), ob.kit, ob.kitD],
    [store.get('admin.soundDone', false), ob.sound, ob.soundD],
    [s.locked, ob.lock, ob.lockD],
  ];
  const next = steps.findIndex(([ok]) => !ok), done = steps.filter(([ok]) => ok).length;
  $('ob-steps').innerHTML = steps.map(([ok, title, detail], i) => `<li class="${ok ? 'done' : ''}${i === next ? ' next' : ''}"><span class="ck${ok ? ' on' : ''}" role="img" aria-label="${ok ? '✓' : '·'}"></span><span><b>${title}</b> <span class="muted">— ${detail}</span></span></li>`).join('');
  $('ob-count').textContent = ob.count(done, steps.length);
  $('ob-bar').style.width = `${(done / steps.length) * 100}%`;
  const all = $('onboard').classList.contains('all');
  $('ob-all').textContent = all ? ob.fewer : ob.all;
  $('ob-all').setAttribute('aria-expanded', all);
  $('onboard').classList.toggle('hidden', steps.every(([ok]) => ok));
}
$('ob-all').onclick = () => { $('onboard').classList.toggle('all'); if (last) renderOnboard(last); };
$('ob-steps').onclick = (e) => {
  const a = e.target.closest('[data-ob]');
  if (a?.dataset.ob === 'kit') store.set('admin.kitDone', true);
  if (a?.dataset.ob === 'sound') store.set('admin.soundDone', true);
};
$('ob-hide').onclick = () => { store.set('admin.obHidden', true); $('onboard').classList.add('hidden'); };

// A new version on GitHub (src/updates.js): one quiet line with "Update now" (it asks first; nothing is installed
// otherwise), or the download, or for a Docker container the command to run.
let updatingTo = '';
function renderUpdate(up) {
  const el = $('update-note');
  el.classList.toggle('hidden', !up && !updatingTo);
  if (!up || updatingTo || el.dataset.v === up.version) return; // redrawn only when it changes, so a command stays selectable
  el.dataset.v = up.version;
  const action = up.canUpdate ? `<button type="button" class="update-btn" id="update-now">${esc(t.upNow)}</button>`
    : up.command ? `${esc(t.upCmd)} <code>${esc(up.command)}</code>` : `<a href="${esc(up.download)}" rel="noopener">${esc(t.upDownload)}</a>`;
  el.innerHTML = `${esc(t.upAvail(up.version))} · <a href="${esc(up.notes)}" target="_blank" rel="noopener">${esc(t.upNotes)}</a> · ${action}`;
  $('update-now')?.addEventListener('click', () => updateNow(up.version));
}
async function updateNow(v) {
  if (!(await confirmDialog({ title: t.upAsk(v), body: t.upAskBody(last?.totals?.live || 0), ok: t.upOk }))) return;
  const el = $('update-note');
  updatingTo = v;
  el.textContent = t.upWorking(v);
  try { await api('POST', '/api/update'); } catch { updatingTo = ''; el.dataset.v = ''; renderUpdate(last?.update); return; } // the toast says why
  el.textContent = t.upRestarting;
  // The old server is gone within about a second; the new one answers once it has started (a minute at most, more
  // when it installs new libraries). Then this page reloads with the new version.
  for (let i = 0; i < 150; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    try { if ((await fetch('/healthz', { cache: 'no-store' })).ok) return location.reload(); } catch { /* restarting */ }
  }
  el.textContent = t.upSlow;
}
/** The internet dropped (the offline backup): a banner over the dashboard says what's captioning now. */
function renderNet(f) {
  if (!f) return $('netbar').classList.add('hidden');
  let html = '';
  let bad = false;
  if (f.active === 'local') {
    html = `${icon('offline')}<div><b>${esc(tr(f.mode === 'local' ? 'Usando la IA de esta computadora' : 'Sin internet: los subtítulos siguen funcionando'))}</b><p>${esc(tr(f.mode === 'auto' ? 'La IA de esta computadora genera los subtítulos. Vuelven a Gemini solos cuando la conexión se estabilice.' : 'Elegido desde el panel. Para volver a Gemini, cambiá el selector de IA.'))}</p></div>`;
  } else if (f.online === false) {
    bad = !f.localReady;
    html = `${icon('offline')}<div><b>${esc(tr('Sin conexión con la IA en la nube'))}</b><p>${esc(tr(f.localReady ? (f.mode === 'auto' ? 'Si no vuelve en unos segundos, los subtítulos pasan a esta computadora.' : 'Hay un respaldo listo en esta computadora: elegí «IA automática» o «Siempre esta computadora».') : 'No hay respaldo local. La próxima vez iniciá con: npm run local -- --fallback'))}</p></div>`;
  }
  $('netbar').classList.toggle('hidden', !html);
  $('netbar').classList.toggle('bad', bad);
  if (html && $('netbar').dataset.html !== html) { $('netbar').innerHTML = html; $('netbar').dataset.html = html; }
}

// ---------- Live ----------
function render(s) {
  last = s;
  if (s.locked !== locked) setLocked(!!s.locked);
  renderMini(s); // the floating mini-dashboard stays live while this tab hides behind OBS
  if (document.hidden) return; // drawn again the moment the tab shows (visibilitychange below)
  $('event').textContent = s.event;
  $('event').classList.toggle('hidden', !s.event || s.event === 'OpenCaptions'); // no event name yet: not the logo twice
  document.title = t.title(s.event);
  renderOnboard(s);
  // Which AI makes the captions: the same badge as Just for me's; for an admin, also the switch (ai-badge.js).
  (aiChip ??= aiBadge($('engine'), { api: isCrew ? undefined : api, settings: '#settings/ai' })).update(s.aiNow);
  if (!isCrew) (aiSetting ??= aiBadge($('ai-use'), { api })).update(s.aiNow); // the same switch in Settings → AI
  renderNet(s.failover);
  renderUpdate(isCrew ? null : s.update);
  // A free Gemini key out of quota: offer this computer (public/local-mode.js), and keep it in view while it gets ready.
  const lm = localP?.status();
  const quota = s.engine === 'gemini' && s.stages.some((x) => x.alerts?.includes('ai-quota') || x.alerts?.includes('mt-throttled'));
  $('local-offer').classList.toggle('hidden', isCrew || !(quota || (lm && lm.state !== 'idle' && lm.text !== 'ready')));
  // The numbers count to their new value when they change (never on an update that changes nothing).
  countTo($('k-live'), s.totals.live);
  $('k-of').textContent = `/${s.totals.stages}`;
  $('kpis').classList.toggle('on-air', s.totals.live > 0);
  // Languages the audience can read, across the rooms (not counting "Original").
  countTo($('k-langs'), new Set(s.stages.flatMap((x) => x.languages.filter((l) => l !== 'orig'))).size);
  countTo($('k-viewers'), s.totals.viewers);
  // A hosted test instance (BUDGET_USD_WEEK): this week's spend against its cap, which renews on Monday.
  countTo($('k-cost'), s.budget ? s.budget.usedUsd : s.totals.costUsd, (v) => (s.budget ? `US$ ${v.toFixed(2)} / ${s.budget.capUsd}` : `US$ ${v.toFixed(2)}`));
  $('k-cost').title = s.budget ? tr('Presupuesto de IA de esta semana: se renueva el lunes') : '';
  if (s.system && $('dlg-settings').open) $('sys').textContent = t.sys(s.system, fmtDur(s.uptimeSec));
  if ($('dlg-settings').open && settingsSetup) { settingsSetup = { ...settingsSetup, tunnel: s.tunnel, ai: s.ai, engine: s.engine }; keyP.update(settingsSetup); tunnelP.update(settingsSetup); }
  const alerts = s.stages.filter((x) => x.alerts.some((a) => a !== 'no-ingest') || x.dueTalk).length;
  const navLive = document.querySelector('#nav a[data-view="live"]');
  const badge = navLive.querySelector('.n');
  if ((badge?.textContent ?? '0') !== String(alerts)) { badge?.remove(); if (alerts) navLive.insertAdjacentHTML('beforeend', `<span class="n">${alerts}</span>`); }
  setRooms(s.stages);
  if (view === 'room' && focusRoom !== 'new' && $('view-title').textContent !== roomName(focusRoom)) go(); // the room's name arrived, or it was renamed
  if (view === 'rooms') renderRooms(s);
  renderGrid(s);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && last) render(last); });
/** Shows a number, counting up (or down) to it over half a second when it changes. */
function countTo(el, v, fmt = (x) => String(Math.round(x))) {
  if (el._v === v) return;
  const from = el._v ?? 0;
  el._v = v;
  cancelAnimationFrame(el._raf);
  if (calm.matches || from === v) { el.textContent = fmt(v); return; }
  const t0 = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - t0) / 650);
    el.textContent = fmt(p < 1 ? from + (v - from) * (1 - (1 - p) ** 4) : v);
    if (p < 1) el._raf = requestAnimationFrame(step);
  };
  el._raf = requestAnimationFrame(step);
}
/** A card's More: open, its contents usable; closed, out of the tab order too. A room's own page has it always open. */
const foldDetails = (el) => { el.querySelector('.details > div').inert = !(el.classList.contains('open') || (view === 'room' && el.dataset.id === focusRoom)); };
let firstGrid = true;

function renderGrid(s) {
  const grid = $('grid');
  for (const el of grid.querySelectorAll('.sk-card')) el.remove(); // the placeholders, until the first update
  // The first time, the cards arrive one after another; later, only a room that's new rises in.
  if (firstGrid && s.stages.length && !calm.matches) { grid.classList.add('stagger'); setTimeout(() => grid.classList.remove('stagger'), 900); }
  // Same order as the rooms (dragged in the sidebar): move cards only when it changed, so nothing jumps every second.
  const order = s.stages.map((x) => x.id).join('\n');
  if ([...grid.children].map((el) => el.dataset.id).filter(Boolean).join('\n') !== order) for (const st of s.stages) { const el = grid.querySelector(`[data-id="${CSS.escape(st.id)}"]`); if (el) grid.append(el); }
  const ids = new Set(s.stages.map((x) => x.id));
  for (const el of [...grid.children]) if (el.dataset.id && !ids.has(el.dataset.id)) el.remove();
  if (!s.stages.length && !grid.querySelector('.empty-rooms')) grid.innerHTML = `<div class="empty-rooms rise"><img src="/art/waiting.webp" alt="" width="900" height="900" /><h3>${esc(tr('Todavía no hay salas'))}</h3><p class="muted u-m0">${esc(tr('Creá una sala por cada escenario o aula: cada una tiene su QR, su pantalla y su overlay.'))}</p><a href="#room/new"><button class="primary" tabindex="-1">${icon('plus')}${esc(tr('Nueva sala'))}</button></a></div>`;
  if (s.stages.length) grid.querySelector('.empty-rooms')?.remove();
  for (const st of s.stages) {
    let el = grid.querySelector(`[data-id="${CSS.escape(st.id)}"]`);
    if (!el) {
      const rid = encodeURIComponent(st.id);
      el = document.createElement('article');
      el.className = `card stage${firstGrid ? '' : ' rise'}`;
      el.dataset.id = st.id;
      el.classList.toggle('hidden', !!focusRoom && st.id !== focusRoom);
      el.innerHTML = `
        <div class="top"><span class="ini" aria-hidden="true" data-f="ini" data-no-i18n></span><h3 data-no-i18n><a href="#room/${rid}"></a></h3><span data-f="state"></span></div>
        <div class="talk"><div class="talkline" data-f="talkline" data-no-i18n></div><div class="next" data-f="next" data-no-i18n></div></div>
        <div class="screen"><div class="said"><span data-f="said" data-no-i18n></span></div><div class="lvl" aria-hidden="true"><i data-f="lvl"></i><b data-f="pk"></b></div></div>
        <div class="nosound hidden" data-f="nosound">
          <p class="u-m0" data-f="nosound-none">Abrí la página de sonido en la computadora que recibe el micrófono.</p>
          <p class="u-m0" data-f="nosound-pull">Esperando el stream de OBS, vMix o el archivo.</p>
          <div class="row">
            <a href="/ingest.html?stage=${rid}" target="_blank" data-f="nosound-open"><button type="button" class="primary" tabindex="-1">${icon('mic')}Abrir la página de sonido</button></a>
            <a href="#room/${rid}/sound" data-f="nosound-link"><button type="button" class="plain" tabindex="-1">${icon('link')}Enlace para otra computadora</button></a>
            <a href="#room/${rid}/sound" data-f="nosound-addr" data-setup><button type="button" tabindex="-1">${icon('link')}Ver la dirección</button></a>
          </div>
        </div>
        <div class="speakers" data-f="speakers" data-no-i18n data-advanced></div>
        <div class="stats" data-f="stats"></div>
        <div class="row" data-f="alerts"></div>
        <div class="actions">
          <button data-a="due" class="primary hidden"></button>
          <button data-a="break" data-f="brk">${icon('pause')}<span>Pausa</span></button>
          <button data-a="next">${icon('next')}Siguiente charla</button>
          <a href="#room/${rid}/screens" class="on-live"><button type="button" class="ib" tabindex="-1" title="Pantallas y QR">${icon('qr')}<span class="sr-only">Pantallas y QR</span></button></a>
          <button data-a="details" class="more" aria-expanded="false" title="Más"><span class="sr-only">Más</span>${icon('chevron')}</button>
        </div>
        <div class="details"><div><div class="details-body">
          <div class="preview" data-f="preview" data-no-i18n></div>
          <div class="actions">
            <button data-a="fix">${icon('wand')}Corregir subtítulos</button>
            <button data-a="rename">${icon('doc')}Renombrar charla</button>
            <button data-a="end">${icon('check')}Terminar la charla</button>
            <button data-a="export">${icon('download')}Transcripciones</button>
            <button data-a="restart">${icon('refresh')}Reconectar IA</button>
          </div>
          <details class="diag" data-advanced><summary>Diagnóstico</summary>
            <div class="sub" data-f="ingest"></div>
            <div class="sub" data-f="sub" data-no-i18n></div>
            <div class="row" data-f="engines" data-no-i18n></div>
            <div class="metrics" data-f="metrics"></div>
          </details>
        </div></div></div>`;
      grid.append(el);
      foldDetails(el);
      if (![...$('logfilter').options].some((o) => o.value === st.id)) $('logfilter').append(new Option(st.name, st.id));
    }
    const f = (k) => el.querySelector(`[data-f="${k}"]`);
    el.querySelector('h3 a').textContent = st.name;
    f('ini').textContent = initials(st.name);
    f('talkline').textContent = st.talk.title || t.noTalk;
    f('talkline').classList.toggle('none', !st.talk.title);
    const due = st.dueTalk;
    el.classList.toggle('over', !!due);
    el.classList.toggle('brk', !!st.brk);
    f('next').classList.toggle('over', !!due);
    f('next').textContent = due ? t.over(Math.max(1, Math.round((Date.now() - due.start) / 60000)), due.title) : st.nextTalk ? t.next(st.nextTalk.title, hm(st.nextTalk.start)) : '';
    // Who's speaking (Advanced): a tap labels the captions from now on (phones, transcripts, exports).
    const choices = [...new Set([...st.speakers, SPK.host, SPK.qa, ...(st.speaker && !st.speakers.includes(st.speaker) && ![SPK.host, SPK.qa].includes(st.speaker) ? [st.speaker] : [])])];
    const spkKey = JSON.stringify([choices, st.speaker]);
    if (f('speakers').dataset.key !== spkKey) {
      f('speakers').dataset.key = spkKey;
      f('speakers').innerHTML = `<span>${esc(SPK.label)}</span>${choices.map((n) => `<button type="button" class="pill" data-spk="${esc(n)}" aria-pressed="${n === st.speaker}">${esc(n)}</button>`).join('')}<button type="button" class="pill" data-spk-other>${esc(SPK.other)}</button>${st.speaker ? `<button type="button" class="pill" data-spk="" aria-pressed="false">${esc(SPK.none)}</button>` : ''}`;
    }
    const dueBtn = el.querySelector('[data-a="due"]');
    dueBtn.classList.toggle('hidden', !due);
    if (due) dueBtn.textContent = t.startDue(due.title.length > 28 ? due.title.slice(0, 27) + '…' : due.title);
    f('said').textContent = st.said ?? (st.preview.orig ?? Object.values(st.preview)[0] ?? '').slice(-220);
    // Basic: how many people are reading. Advanced adds the delay, the cost and who's listening to the room's sound.
    const lat = Math.max(st.latency.asr || 0, ...Object.values(st.latency.tr).filter((v) => v != null));
    setHtml(f('stats'), `<span title="${esc(tr('Público'))}">${icon('eye')}<b>${st.viewers}</b> ${esc(tr(st.viewers === 1 ? 'persona' : 'personas'))}</span><span data-advanced title="${esc(tr('Latencia'))}">${icon('clock')}<b>${lat ? sec(lat) : '—'}</b></span><span data-advanced title="${esc(tr('Costo estimado'))}">${icon('coin')}<b>US$ ${st.costUsd.toFixed(2)}</b></span>${st.roomSound ? `<span data-advanced title="${esc(tr('Escuchando el sonido de la sala'))}">${icon('headphones')}<b>${st.roomSoundListeners}/${st.roomSoundMax}</b></span>` : ''}`);
    el.classList.toggle('alert', st.alerts.some((a) => a !== 'no-ingest'));
    setHtml(f('state'), stateChip(st));
    setHtml(f('sub'), `<code>${esc(st.id)}</code> · <span class="chip">${esc(st.mode)}</span> · ${esc(st.source === 'auto' ? `auto${st.detectedLang ? ` (${st.detectedLang})` : ''}` : st.source)} → ${esc(st.targets.filter((x) => x !== st.source).join(', ') || '—')}`);
    const db = 20 * Math.log10(st.level || 1e-6), pct = Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
    const pk = Math.max(0, Math.min(100, ((20 * Math.log10(st.peak || 1e-6) + 60) / 60) * 100));
    f('lvl').style.width = pct + '%';
    f('pk').style.left = pk + '%';
    f('nosound').classList.toggle('hidden', !!st.ingest);
    el.classList.toggle('idle', !st.ingest); // nothing to show or pause yet: the card says what to do instead
    for (const [k, on] of [['none', !st.pull], ['open', !st.pull], ['link', !st.pull], ['pull', !!st.pull], ['addr', !!st.pull]]) f(`nosound-${k}`).classList.toggle('hidden', !on);
    f('ingest').textContent = (st.ingest ? `${t.kinds[st.ingest.kind] || st.ingest.kind}${st.ingest.label ? ` · ${st.ingest.label}` : ''} · ${tr('hace')} ${ago(st.ingest.since)}` : st.pull ? `${tr('sonido desde')} ${st.pull}` : tr('Todavía no llega sonido.'))
      + (st.backup ? ` · ${tr(st.backup.active ? 'RESPALDO AL AIRE' : 'respaldo en espera')}: ${st.backup.kind}${st.backup.label ? ` · ${st.backup.label}` : ''}` : '');
    setHtml(f('engines'), st.engines.length ? st.engines.map(engChip).join('') : `<span class="chip">${esc(tr('sesiones cerradas (0 costo)'))}</span>`);
    const trs = Object.entries(st.latency.tr).map(([k, v]) => `${k} ${sec(v)}`).join(' · ');
    setHtml(f('metrics'), `
      <div>${esc(tr('Latencia orig.'))}<b>${sec(st.latency.asr)}</b></div>
      <div title="${esc(trs)}">${esc(tr('Latencia trad.'))}<b>${sec(Math.max(0, ...Object.values(st.latency.tr).filter((v) => v != null)) || null)}</b></div>
      <div>${esc(tr('Público'))}<b>${st.viewers}</b></div>
      <div>Min · US$<b>${st.audioMinIn} · ${st.costUsd.toFixed(2)}</b></div>`);
    setHtml(f('preview'), Object.entries(st.preview).map(([ch, txt]) => `<div><span class="l">${esc(ch === 'orig' ? tr('Original') : langLabel(ch, ev.languages))}</span> ${esc(txt ? (txt.length > 80 ? '…' + txt.slice(-80) : txt) : '…')}</div>`).join(''));
    // Break: the button resumes. Music: captions wait for a voice; "it's a talk" captions anyway.
    const brkBtn = f('brk');
    brkBtn.classList.toggle('primary', !!st.brk);
    brkBtn.querySelector('span').textContent = tr(st.brk ? 'Reanudar subtítulos' : 'Pausa');
    brkBtn.title = tr(st.brk ? 'Termina la pausa: los subtítulos vuelven cuando alguien habla.' : 'Pausa (intervalo, publicidad): los subtítulos se detienen y las pantallas y los celulares muestran la pausa y la próxima charla.');
    const alertsKey = JSON.stringify([st.alerts, st.music]);
    if (f('alerts').dataset.key !== alertsKey) {
      f('alerts').dataset.key = alertsKey;
      f('alerts').innerHTML = st.alerts.filter((a) => a !== 'no-ingest').map((a) => `<span class="chip bad">${esc(alertText(a))}</span>`).join('')
        + (st.music ? `<span class="muted-note">${esc(tr('Suena música: los subtítulos vuelven solos cuando alguien hable.'))}</span> <button data-a="musicok">${esc(tr('Es una charla: subtitular igual'))}</button>` : '');
    }
  }
  if (s.stages.length) firstGrid = false;
}

const SPK = LANG === 'es'
  ? { label: 'Habla:', host: 'Presentación', qa: 'Público (preguntas)', other: 'Otro…', none: 'Sin nombre', ask: 'Nombre de quien habla' }
  : { label: 'Speaking:', host: 'Host', qa: 'Audience (Q&A)', other: 'Other…', none: 'No label', ask: 'Who is speaking?' };
$('grid').addEventListener('click', async (e) => {
  const p = e.target.closest('[data-spk], [data-spk-other]');
  if (!p) return;
  const id = p.closest('[data-id]').dataset.id;
  let name = p.dataset.spk;
  if (p.hasAttribute('data-spk-other')) {
    $('spk-title').textContent = SPK.ask;
    $('spk-name').value = '';
    const d = $('dlg-spk');
    d.returnValue = '';
    d.showModal();
    const ok = await new Promise((res) => d.addEventListener('close', () => res(d.returnValue === 'ok'), { once: true }));
    name = $('spk-name').value.trim();
    if (!ok || !name) return;
  }
  await api('POST', `/api/stages/${id}/speaker`, { name });
});
$('grid').onclick = async (e) => {
  const b = e.target.closest('[data-a]');
  if (!b) return;
  const id = b.closest('[data-id]').dataset.id;
  const st = last.stages.find((x) => x.id === id);
  const a = b.dataset.a;
  if (a === 'details') {
    const card = b.closest('.stage'), open = card.classList.toggle('open');
    b.setAttribute('aria-expanded', open);
    b.querySelector('span').textContent = b.title = tr(open ? 'Menos' : 'Más');
    foldDetails(card);
  } else if (a === 'break') {
    await api('POST', `/api/stages/${id}/break`, { on: !st.brk });
    toast(tr(st.brk ? 'Subtítulos reanudados.' : 'Pausa: las pantallas y los celulares lo muestran.'), { ms: 3000 });
  } else if (a === 'musicok') {
    await api('POST', `/api/stages/${id}/music`, { caption: true });
    toast(tr('Se subtitula igual hasta la próxima charla.'), { ms: 3000 });
  } else if (a === 'due') {
    await api('POST', `/api/stages/${id}/talk`, { title: st.dueTalk.title, speaker: st.dueTalk.speaker || '' });
    toast(t.done, { ms: 3000 });
  } else if (a === 'next') {
    const pre = st.dueTalk || st.nextTalk;
    const r = await talkDialog({ title: t.nextTitle(st.name), note: t.nextNote, ok: t.nextOk, name: pre?.title || '', speaker: pre?.speaker || '' });
    if (r) { await api('POST', `/api/stages/${id}/talk`, { title: r.name, speaker: r.speaker }); toast(t.done, { ms: 3000 }); }
  } else if (a === 'rename') {
    const r = await talkDialog({ title: t.renameTitle(st.name), note: t.renameNote, ok: t.renameOk, name: st.talk.title || '', speaker: st.talk.speaker || '', speakerField: false });
    if (r) { await api('PATCH', `/api/stages/${id}`, { title: r.name }); toast(t.saved, { ms: 3000 }); }
  } else if (a === 'end') {
    // A new, empty talk: the one that ends keeps its transcript and leaves "in progress" (an empty talk isn't listed).
    if (await confirmDialog({ title: t.endAsk(st.name), body: t.endBody, ok: t.endOk })) { await api('POST', `/api/stages/${id}/talk`, { title: '', speaker: '' }); toast(t.ended, { ms: 3000 }); }
  } else if (a === 'restart') {
    if (await confirmDialog({ title: t.restartAsk(st.name), body: t.restartAskBody, ok: t.restartOk })) { await api('POST', `/api/stages/${id}/restart`); toast(t.done, { ms: 3000 }); }
  } else if (a === 'export') openExport(st);
  else if (a === 'fix') openFix(st);
};

// ---------- Live corrections: fix a misheard caption everywhere at once (PATCH /api/stages/:id/captions/:seg) ----------
let fixRoom = null, fixCaps = [];
const mmss = (ms) => { const sec = Math.max(0, Math.round((ms || 0) / 1000)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };
async function loadFix() {
  const r = await api('GET', `/api/stages/${fixRoom.id}/captions?channel=${encodeURIComponent($('fix-ch').value)}&n=8`);
  fixCaps = r.captions;
  $('fix-list').innerHTML = fixCaps.length
    // Newest first (what was just said is what needs fixing), each with when it was said in the talk.
    ? [...fixCaps].reverse().map((c) => `<label class="fix-item"><span class="fix-t">${esc(mmss(c.start))}</span><textarea class="fix-row" rows="2" data-id="${esc(c.id)}" aria-label="${esc(c.text)}" spellcheck="true">${esc(c.text)}</textarea></label>`).join('')
    : `<p class="muted-note">${esc(tr('Todavía no hay frases en esta charla.'))}</p>`;
}
async function openFix(st) {
  fixRoom = st;
  $('fix-title').textContent = `${tr('Corregir subtítulos')} · ${st.name}`;
  $('fix-ch').innerHTML = st.languages.map((l) => `<option value="${esc(l)}">${esc(l === 'orig' ? tr('Original') : langLabel(l, ev.languages))}</option>`).join('');
  $('fix-err').textContent = '';
  await loadFix();
  $('dlg-fix').showModal();
}
$('fix-ch').onchange = loadFix;
/** One word changed ("Nerdarla" → "Nerdearla")? Offer to always write it that way (a glossary correction). */
const oneWord = (a, b) => {
  const x = a.split(/\s+/), y = b.split(/\s+/);
  if (x.length !== y.length) return null;
  const d = x.map((w, i) => [w, y[i]]).filter(([p, q]) => p !== q);
  const strip = (w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  return d.length === 1 && strip(d[0][0]) && strip(d[0][1]) ? { from: strip(d[0][0]), to: strip(d[0][1]) } : null;
};
$('f-fix').addEventListener('submit', async (e) => {
  if (e.submitter?.value !== 'ok') return;
  e.preventDefault();
  const changed = [...$('fix-list').querySelectorAll('.fix-row')].map((el) => ({ el, c: fixCaps.find((x) => x.id === el.dataset.id), text: el.value.replace(/\s+/g, ' ').trim() })).filter(({ c, text }) => c && text && text !== c.text);
  try {
    for (const { c, text } of changed) await api('PATCH', `/api/stages/${fixRoom.id}/captions/${encodeURIComponent(c.id)}`, { channel: $('fix-ch').value, text }, { quiet: true });
  } catch (err) { $('fix-err').textContent = tr(err.message); return; }
  $('dlg-fix').close();
  if (changed.length) toast(tr('Corregido en las pantallas, los celulares y la transcripción.'), { ms: 3000 });
  const words = changed.map(({ c, text }) => oneWord(c.text, text)).filter(Boolean);
  if (!isCrew && words.length) {
    const w = words[0];
    if (await confirmDialog({ title: tr('¿Escribirlo siempre así?'), body: `«${w.from}» → «${w.to}». ${tr('Se agrega al glosario: corrige las próximas frases y ayuda a la IA a reconocerlo. Se puede deshacer desde el Historial.')}`, ok: tr('Siempre así') })) {
      try { await api('POST', '/api/glossary/replacements', w); toast(tr('Agregado al glosario.'), { ms: 3000 }); } catch { /* toast shown */ }
    }
  }
});
function talkDialog({ title, note, ok, name, speaker, speakerField = true }) {
  $('talk-title').textContent = title;
  $('talk-note').textContent = note;
  $('talk-ok').textContent = ok;
  $('talk-name').value = name;
  $('talk-speaker').value = speaker;
  $('talk-speaker').closest('label').classList.toggle('hidden', !speakerField);
  const d = $('dlg-talk');
  d.returnValue = '';
  d.showModal();
  return new Promise((res) => d.addEventListener('close', () => res(d.returnValue === 'ok' ? { name: $('talk-name').value.trim(), speaker: $('talk-speaker').value.trim() } : null), { once: true }));
}

function renderLogs() {
  const flt = $('logfilter').value;
  const box = $('logs');
  const atEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 30;
  box.innerHTML = logs.filter((l) => !flt || l.stage === flt).slice(-200).map((l) => `<div class="${l.level}">${new Date(l.t).toLocaleTimeString(LANG)} [${esc(l.stage)}] ${esc(l.msg)}</div>`).join('');
  if (atEnd) box.scrollTop = box.scrollHeight;
}
$('logfilter').onchange = renderLogs;
// A burst of log lines (an incident) redraws the list once per frame, and not at all while the tab is hidden.
function renderLogsSoon() { logsQueued ||= requestAnimationFrame(() => { logsQueued = 0; renderLogs(); }); }

// ---------- floating mini-dashboard (Document Picture-in-Picture): every room, on top of OBS / vMix ----------
let mini = null;
if ('documentPictureInPicture' in window) $('float').classList.remove('hidden');
$('float').onclick = async () => {
  if (mini) return mini.close();
  try {
    mini = await documentPictureInPicture.requestWindow({ width: 380, height: Math.min(640, 70 + (last?.stages.length || 4) * 52) });
  } catch (e) { mini = null; return toast(e.message, { error: true }); }
  const d = mini.document, root = document.documentElement;
  d.documentElement.style.cssText = root.style.cssText;
  if (root.dataset.theme) d.documentElement.dataset.theme = root.dataset.theme;
  d.head.append(Object.assign(d.createElement('link'), { rel: 'stylesheet', href: new URL('/style.css', location.href).href }));
  d.head.append(Object.assign(d.createElement('link'), { rel: 'stylesheet', href: new URL('/pip.css', location.href).href }));
  d.body.className = 'pip-dash';
  d.title = t.title(ev.name);
  d.body.innerHTML = '<div class="k" id="k"></div><div id="rows"></div>';
  d.getElementById('rows').onclick = (e) => {
    const r = e.target.closest('[data-id]');
    if (!r) return;
    window.focus();
    location.hash = `#room/${encodeURIComponent(r.dataset.id)}`;
  };
  mini.addEventListener('pagehide', () => { mini = null; });
  if (last) renderMini(last);
};
function renderMini(s) {
  if (!mini) return;
  const d = mini.document;
  d.getElementById('k').innerHTML = `<span>${esc(tr('Salas en vivo'))} <b>${s.totals.live}/${s.totals.stages}</b></span><span>${esc(tr('Espectadores'))} <b>${s.totals.viewers}</b></span><span>US$ <b>${s.totals.costUsd.toFixed(2)}</b></span>`;
  d.getElementById('rows').innerHTML = s.stages.map((st) => {
    const alerts = st.alerts.filter((a) => a !== 'no-ingest');
    const dot = alerts.length || st.dueTalk ? 'bad' : !st.ingest ? '' : st.engines.length && !st.gated ? 'live' : 'pause';
    const said = st.preview.orig ?? Object.values(st.preview)[0] ?? '';
    const txt = st.dueTalk ? t.over(Math.max(1, Math.round((Date.now() - st.dueTalk.start) / 60000)), st.dueTalk.title) : alerts.length ? alerts.map(alertText).join(' · ') : !st.ingest ? tr(st.pull ? 'ESPERANDO EL STREAM' : 'SIN SONIDO') : said || '…';
    return `<div class="r${alerts.length ? ' bad' : ''}" data-id="${esc(st.id)}"><span class="d ${dot}"></span><span class="n">${esc(st.name)}</span><span class="v">${icon('eye')} ${st.viewers}</span><span class="t">${esc(txt.length > 90 ? '…' + txt.slice(-90) : txt)}</span></div>`;
  }).join('');
}

// ---------- Rooms: tiles (a dot and the live caption) or a list, remembered ----------
let hist = { changes: [], trash: [] };
async function loadRooms() {
  renderRooms(last || (await api('GET', '/api/status')));
  hist = await api('GET', '/api/history', null, { quiet: true }).catch(() => ({ changes: [], trash: [] }));
  $('trash-box').classList.toggle('hidden', !hist.trash.length);
  $('trash-list').innerHTML = `<table class="table">${hist.trash.map((x) => `<tr><td><b>${esc(x.room.name)}</b><div class="muted-note"><code>${esc(x.room.id)}</code> · ${esc(when(x.at))}</div></td><td class="r"><button data-restore="${x.id}" data-setup>${icon('refresh')} ${esc(t.restore)}</button></td></tr>`).join('')}</table>`;
  setLocked(locked);
}
const roomsView = () => (store.get('rooms.view', 'gallery') === 'list' ? 'list' : 'gallery');
const said = (st) => (st.preview.orig ?? Object.values(st.preview)[0] ?? '').slice(-140) || st.talk.title || t.noCaption;
// Drawn again only when the rooms or the view change; on each update just the dots and captions (keeps focus put)
function renderRooms(s) {
  const box = $('rooms-box'), mode = roomsView();
  const key = JSON.stringify([mode, s.stages.map((x) => [x.id, x.name])]);
  if (box.dataset.key !== key) {
    box.dataset.key = key;
    const href = (st) => `#room/${encodeURIComponent(st.id)}`;
    const name = (st) => `<b><i class="dot" aria-hidden="true"></i>${esc(st.name)}<span class="sr-only" data-f="state"></span></b>`;
    box.innerHTML = !s.stages.length ? `<div class="card empty-art rise"><img src="/art/waiting.webp" alt="" width="900" height="900" /><h3>${esc(tr('Todavía no hay salas'))}</h3><p>${esc(tr('Creá una sala por cada escenario o aula: cada una tiene su QR, su pantalla y su overlay.'))}</p></div>`
      : mode === 'gallery' ? `<ul class="rooms-gallery stagger">${s.stages.map((st) => `<li><a class="card tile lift" href="${href(st)}" data-id="${esc(st.id)}"><span class="tile-top"><span class="ini" aria-hidden="true">${esc(initials(st.name))}</span>${name(st)}</span><span class="said" data-f="said"></span><span class="tl" data-f="langs"></span></a></li>`).join('')}</ul>`
        : `<div class="card flush"><table class="table rooms-list"><thead><tr><th>${esc(tr('Sala'))}</th><th>${esc(tr('Subtítulos'))}</th><th class="hide-sm">${esc(tr('Idiomas'))}</th><th class="hide-sm">${esc(tr('Audio'))}</th></tr></thead><tbody>${s.stages.map((st) => `<tr data-id="${esc(st.id)}"><td><a href="${href(st)}">${name(st)}</a></td><td class="muted-note" data-f="said"></td><td class="hide-sm" data-f="langs"></td><td class="hide-sm" data-f="audio"></td></tr>`).join('')}</tbody></table></div>`;
  }
  for (const st of s.stages) {
    const el = box.querySelector(`[data-id="${CSS.escape(st.id)}"]`);
    if (!el) continue;
    const f = (k) => el.querySelector(`[data-f="${k}"]`), state = stateOf(st);
    el.querySelector('.dot').className = `dot ${state}`;
    f('state').textContent = `, ${stateLabel(state)}`;
    f('said').textContent = said(st);
    if (f('langs')) f('langs').textContent = el.matches('.tile') ? st.languages.filter((l) => l !== 'orig').map((l) => l.toUpperCase()).join(' · ') : langsOf(st);
    if (f('audio')) f('audio').textContent = st.ingest ? `${t.kinds[st.ingest.kind] || st.ingest.kind}${st.ingest.label ? ` · ${st.ingest.label}` : ''}` : st.pull ? t.audioStream : t.audioNone;
  }
  for (const b of document.querySelectorAll('[data-rooms-view]')) b.setAttribute('aria-pressed', String(b.dataset.roomsView === mode));
}
for (const b of document.querySelectorAll('[data-rooms-view]')) b.onclick = () => { store.set('rooms.view', b.dataset.roomsView); if (last) renderRooms(last); };
$('trash-list').onclick = async (e) => {
  const b = e.target.closest('[data-restore]');
  if (b) await undoChange(Number(b.dataset.restore));
};

// ---------- One room: its Settings (the form) and Sound (#room/<room>/settings, /sound) ----------
let editing = null;
let editStages = [], editSetup = {}; // for the stream address: the ports other rooms use, and this computer's address
const fe = $('f-edit');
for (const [code, name] of Object.entries(ev.languages)) fe.source.append(new Option(`${name} (${code})`, code));
async function openEdit(id) {
  [editStages, editSetup] = await Promise.all([api('GET', '/api/status').then((s) => s.stages), api('GET', '/api/setup', null, { quiet: true }).catch(() => ({}))]);
  const st = id ? editStages.find((x) => x.id === id) : null;
  if (id && !st) { toast(tr('Esa sala no existe.'), { error: true }); location.hash = '#rooms'; return; }
  editing = st;
  $('edit-ingest').href = st ? `/ingest.html?stage=${encodeURIComponent(st.id)}` : '';
  fe.id.value = st?.id || '';
  fe.id.disabled = !!st;
  fe.id.closest('label').classList.toggle('hidden', !!st); // the id is only chosen once, for a new room
  idTyped = false;
  fe.name.value = st?.name || '';
  fe.source.value = st?.source || 'auto';
  fe.pull.value = st?.pull || '';
  fe.loop.checked = !!st?.loop;
  fe.musicGuard.checked = st ? st.musicGuard !== false : true;
  fe.roomSound.checked = !!st?.roomSound;
  fe.roomSoundMax.value = st?.roomSoundMax ?? ''; // a new room: the server's default (ROOM_SOUND_MAX, 100)
  fe.roomSoundMax.disabled = !fe.roomSound.checked;
  fe.translation.value = st?.translationDef || '';
  fe.vocabulary.value = (st?.vocabulary || []).join(', ');
  $('room-del').classList.toggle('hidden', !st);
  $('edit-targets').innerHTML = Object.entries(ev.languages).map(([c, n]) => `<label><input type="checkbox" value="${esc(c)}" ${(st?.targets || ['es', 'en']).includes(c) ? 'checked' : ''}/> ${esc(n)}</label>`).join('');
  $('ingest-link').innerHTML = '';
  renderAddr();
  setLocked(locked);
}
// What to type in OBS or vMix, when the room listens for a stream (its pull address is an RTMP or SRT listener).
function renderAddr(note = '') {
  const host = serverHost(editSetup);
  const rtmp = listenPort(fe.pull.value, 'rtmp'), srt = listenPort(fe.pull.value, 'srt');
  $('edit-addr').innerHTML = note ? `<p class="muted-note u-m0">${esc(note)}</p>`
    : rtmp ? `<p class="muted-note u-m0">${esc(t.addrRtmp)}</p>${copyRow(t.addrServer, `rtmp://${host}:${rtmp}/live`, false)}${copyRow(t.addrKey, fe.pull.value.match(LISTEN.rtmp.re)[2], false)}<p class="muted-note u-m0">${esc(t.addrNet(rtmp))}</p>`
      : srt ? `<p class="muted-note u-m0">${esc(t.addrSrt)}</p>${copyRow(t.addrAddress, `srt://${host}:${srt}`, false)}<p class="muted-note u-m0">${esc(t.addrNet(`${srt}/udp`))}</p>` : '';
}
fe.pull.oninput = () => renderAddr();
document.querySelector('.view[data-view="room"]').addEventListener('click', (e) => {
  const c = e.target.closest('[data-copy]');
  if (c) return copy(c.dataset.copy);
  if (e.target.closest('[data-ingest-link]')) return makeIngestLink(focusRoom).catch(() => {});
  const p = e.target.closest('[data-addr]')?.dataset.addr;
  if (!p) return;
  if (!editSetup.ffmpeg) return renderAddr(t.addrNoFfmpeg);
  const room = editing?.id || fe.id.value;
  if (!room || !fe.id.checkValidity()) return renderAddr(t.addrId);
  fe.pull.value = LISTEN[p].pull(freeListenPort(editStages, room, p), room); // saved with the room
  renderAddr();
});
// A new room's id (its addresses: /s/<id>) comes from its name, unless typed in Advanced mode.
let idTyped = false;
const slug = (x) => x.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
function freeId(name) {
  const base = slug(name) || 'room', taken = new Set(editStages.map((x) => x.id));
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base.slice(0, 36)}-${i}`;
  return id;
}
fe.name.addEventListener('input', () => { if (!editing && !idTyped) { fe.id.value = freeId(fe.name.value); renderAddr(); } });
fe.id.oninput = () => { idTyped = true; renderAddr(); };
$('add').onclick = () => { location.hash = '#rooms/new'; };
fe.roomSound.onchange = () => { fe.roomSoundMax.disabled = !fe.roomSound.checked; };
// Saving keeps the form as it is when the server says no (a taken id, a bad stream address), so nothing typed is lost.
fe.onsubmit = async (e) => {
  e.preventDefault();
  // Each tab saves its own fields: Save on Sound sends only the stream, Save on Settings everything but the stream (a
  // stream address picked on Sound and not saved there must never switch the room's sound from Settings).
  const sound = { pull: fe.pull.value.trim(), loop: fe.loop.checked };
  const onSound = editing && e.submitter?.closest('[data-tab="sound"]');
  const body = onSound ? sound : {
    name: fe.name.value, source: fe.source.value, translation: fe.translation.value || '', musicGuard: fe.musicGuard.checked,
    roomSound: fe.roomSound.checked, roomSoundMax: fe.roomSound.checked && fe.roomSoundMax.value ? Number(fe.roomSoundMax.value) : undefined,
    targets: [...$('edit-targets').querySelectorAll('input:checked')].map((i) => i.value),
    vocabulary: [...new Set(fe.vocabulary.value.split(/[,\n]/).map((w) => w.trim()).filter(Boolean))],
    ...(editing ? {} : sound),
  };
  const r = editing ? await api('PATCH', `/api/stages/${editing.id}`, body) : await api('POST', '/api/stages', { id: fe.id.value, ...body });
  if (r.change) toast(editing ? t.changedRoom(body.name) : t.created(body.name), { undo: r.change });
  else if (editing) toast(t.saved, { ms: 2000 });
  ev = await (await fetch('/api/event')).json();
  formRoom = null; // fill it again from what the server kept
  if (editing) go(); else location.hash = `#room/${encodeURIComponent(fe.id.value)}`;
};
$('room-del').onclick = async () => {
  const st = editing;
  if (!st || !(await confirmDialog({ title: t.delAsk(st.name), body: t.delAskBody, ok: t.delOk, danger: true }))) return;
  const r = await api('DELETE', `/api/stages/${encodeURIComponent(st.id)}`);
  toast(t.deleted(st.name), { undo: r.change });
  location.hash = '#rooms';
};

// ---------- Agenda ----------
async function loadAgenda() {
  const list = await (await fetch('/api/schedule')).json();
  scheduleCount = list.length;
  const names = { ...Object.fromEntries(ev.stages.map((x) => [x.id, x.name])), '*': tr('Todas las salas') };
  const byRoom = {};
  for (const e of list) (byRoom[e.stage] ||= []).push(e);
  // Breaks (coffee, lunch…): captions pause and screens show the break and the next talk.
  const brkTag = (e) => (e.break ? ` <span class="chip warn">${icon('pause')} ${esc(tr('pausa'))}</span>` : '');
  $('agenda-current').innerHTML = list.length
    ? Object.entries(byRoom).map(([room, es]) => `<section class="card flush"><table class="table"><thead><tr><th colspan="3">${esc(names[room] || room)}</th></tr></thead><tbody>${es.map((e) => `<tr><td class="u-w120">${esc(when(e.start))}</td><td><b>${esc(e.title)}</b>${brkTag(e)}</td><td class="hide-sm muted-note">${esc(e.speaker || '')}</td></tr>`).join('')}</tbody></table></section>`).join('')
    : `<p class="muted-note">${esc(t.agendaNone)}</p>`;
  $('agenda-h').textContent = tr(list.length ? 'Reemplazar la agenda' : 'Cargar la agenda'); // nothing to replace yet
  $('agenda-diff').classList.add('hidden');
  loadImportSource();
  setLocked(locked);
}
const key = (e) => `${e.stage}|${e.start}|${e.title}`;
$('agenda-preview').dataset.setup = '';
/** Show what an agenda would change (pasted, or imported from Sessionize / a calendar), then save it on request. */
async function previewAgenda(preview, commit) {
  const r = await preview();
  const cur = await (await fetch('/api/schedule')).json();
  const oldK = new Set(cur.map(key)), newK = new Set(r.entries.map(key));
  const added = r.entries.filter((e) => !oldK.has(key(e))), removed = cur.filter((e) => !newK.has(key(e)));
  const kept = r.entries.length - added.length;
  const line = (e, cls, sign) => `<div class="${cls}">${sign} ${esc(when(e.start))} · ${esc(e.title)} <span class="muted-note">(${esc(e.stage)})</span></div>`;
  const lines = [...added.map((e) => line(e, 'add', '+')), ...removed.map((e) => line(e, 'del', '−'))];
  const same = !added.length && !removed.length;
  $('agenda-diff').innerHTML = `<div class="diff">
      <b>${esc(same ? t.agendaSame : t.agendaPreview(added.length, removed.length, kept))}</b>
      ${r.unknownRooms.length ? `<div class="del">${esc(t.agendaUnknown(r.unknownRooms.join(', ')))}</div>` : ''}
      ${r.skipped.count ? `<div class="muted-note">${esc(t.agendaSkipped(r.skipped.count, r.skipped.rooms.join(', ')))}</div>` : ''}
      ${lines.slice(0, 40).join('')}${lines.length > 40 ? `<div class="muted-note">${esc(t.more(lines.length - 40))}</div>` : ''}
    </div>
    ${same ? '' : `<div class="rowbar u-mt12"><span class="spacer"></span><button class="primary" id="agenda-save" data-setup>${icon('check')} ${esc(t.agendaSave)}</button></div>`}`;
  $('agenda-diff').classList.remove('hidden');
  $('agenda-diff').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  const save = $('agenda-save');
  if (save) save.onclick = async () => {
    const res = await commit();
    toast(t.agendaSaved(res.count), { undo: res.change });
    await refreshSchedule();
    loadAgenda();
  };
}
$('agenda-preview').onclick = () => previewAgenda(
  () => api('PUT', '/api/schedule?dryRun=1', { csv: $('agenda-text').value }),
  async () => { const res = await api('PUT', '/api/schedule', { csv: $('agenda-text').value }); $('agenda-text').value = ''; return res; },
);
// Import from Sessionize or a calendar link: same preview, then the server fetches it again to save.
$('import-source').onchange = () => { $('import-ref').placeholder = $('import-source').value === 'ics' ? 'https://calendar.google.com/calendar/ical/…/basic.ics' : 'https://sessionize.com/api/v2/…/view/All'; };
$('import-form').onsubmit = (e) => {
  e.preventDefault();
  const body = { source: $('import-source').value, ref: $('import-ref').value.trim() };
  if (!body.ref) return $('import-ref').focus();
  previewAgenda(() => api('POST', '/api/schedule/import?dryRun=1', body), () => api('POST', '/api/schedule/import', body)).catch(() => { /* toast shown */ });
};
$('import-again').onclick = () => previewAgenda(() => api('POST', '/api/schedule/import?dryRun=1', { again: true }), () => api('POST', '/api/schedule/import', { again: true })).catch(() => { /* toast shown */ });
async function loadImportSource() {
  const src = await api('GET', '/api/schedule/source', null, { quiet: true }).catch(() => null);
  $('import-again').classList.toggle('hidden', !src);
  if (src) $('import-again').title = `${src.source === 'sessionize' ? 'Sessionize' : tr('Calendario')} · ${src.label}`;
}

// ---------- Integrations: captions into Zoom, YouTube Live, Teams, webhooks (src/integrations.js); breaks from vMix /
// OBS (src/switcher.js). What's connected comes first, one row each with its state and a ⋯ menu; then a gallery.
const DOTS = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/></svg>';
const LOGOS = { zoom: 'Z', youtube: icon('play'), teams: 'T', webhook: icon('link'), vmix: 'vM', obs: 'OBS' };
const SW_NAMES = { vmix: 'vMix', obs: 'OBS Studio' };
const logo = (type) => `<span class="logo ${type}" aria-hidden="true">${LOGOS[type]}</span>`;
const DEFAULT_SCENES = 'break, pausa, intervalo, receso, almuerzo, lunch, coffee, cafe, publicidad, tanda, comercial, commercial, ads, sponsor, brb, be right back, volvemos, starting soon, empezamos, intermission';
let conns = [], sws = [];
function intgCards() {
  const n = (type) => (type in SW_NAMES ? sws : conns).filter((c) => c.type === type).length;
  const card = (type, name, sub, data) => `<article class="card intg lift" data-type="${type}">${logo(type)}<div><h3>${esc(name)}</h3><p>${sub}</p></div>
    <div class="intg-foot">${n(type) ? `<span class="count"><i class="dot"></i>${esc(t.conn.count(n(type)))}</span>` : '<span></span>'}<button type="button" class="connect-btn" ${data}="${type}" aria-label="${esc(t.conn.connectTo(name))}">${esc(t.conn.connect)}</button></div></article>`;
  setHtml($('intg-caps'), ['zoom', 'youtube', 'teams', 'webhook'].map((k) => card(k, k === 'teams' ? 'Microsoft Teams' : t.conn.names[k], esc(t.conn.subs[k]), 'data-connect')).join(''));
  setHtml($('intg-sw'), [['vmix', 'Lee qué entrada está al aire (Web Controller, puerto 8088).'], ['obs', 'Lee la escena al aire (servidor WebSocket de OBS 28 o más nuevo, puerto 4455).']].map(([k, sub]) => card(k, SW_NAMES[k], esc(tr(sub)), 'data-switcher')).join(''));
}
/** Both lists at once; each row is kept and updated in place (a ⋯ button keeps its focus while the states tick). */
async function loadConnections() {
  [conns, sws] = await Promise.all([api('GET', '/api/integrations').then((r) => r.connectors), api('GET', '/api/switchers').then((r) => r.switchers)]);
  const names = Object.fromEntries(ev.stages.map((x) => [x.id, x.name]));
  const langName = (l) => (l === 'orig' ? t.conn.orig : langLabel(l, ev.languages));
  const st = (cls, text) => `<span class="st ${cls}" title="${esc(text)}"><i class="dot"></i><span>${esc(text)}</span></span>`;
  const rows = [
    ...conns.map((c) => ({ id: `c${c.id}`, kind: 'conn', type: c.type, name: t.conn.names[c.type], where: `${names[c.stage] || `${c.stage} · ${t.conn.deleted}`} · ${langName(c.lang)}`, code: c.link,
      state: c.status.state === 'error' ? st('bad', t.conn.failed(c.status.lastError || '?')) : c.status.sent ? st('ok', t.conn.sent(c.status.sent, ago(c.status.lastAt))) : st('wait', t.conn.waiting) })),
    ...sws.map((w) => ({ id: `s${w.id}`, kind: 'sw', type: w.type, name: SW_NAMES[w.type], where: names[w.stage] || w.stage, code: w.address,
      state: w.status.state === 'ok' ? st('ok', `${tr('conectado')}${w.status.scene ? ` · ${tr('al aire:')} ${w.status.scene}` : ''}`) : w.status.state === 'error' ? st('bad', w.status.lastError || tr('error')) : st('wait', tr('conectando…')) })),
  ];
  const box = $('conn-list');
  $('conn-sec').classList.toggle('hidden', !rows.length);
  for (const el of [...box.children]) if (!rows.some((r) => r.id === el.dataset.id)) el.remove();
  for (const r of rows) {
    let el = box.querySelector(`[data-id="${r.id}"]`);
    if (!el) {
      el = document.createElement('div');
      el.className = 'conn rise';
      el.dataset.id = r.id;
      el.innerHTML = `${logo(r.type)}<div class="what"><b>${esc(r.name)}</b><span data-f="where"></span><code data-f="code"></code></div><span data-f="state"></span>
        <button type="button" class="kebab" data-menu="${esc(r.id)}" aria-haspopup="menu" aria-expanded="false" aria-label="${esc(t.conn.more(r.name))}" title="${esc(t.conn.more(r.name))}">${DOTS}</button>`;
      box.append(el);
    }
    el.querySelector('[data-f="where"]').textContent = r.where;
    el.querySelector('[data-f="code"]').textContent = r.code;
    setHtml(el.querySelector('[data-f="state"]'), r.state);
  }
  intgCards();
}
setInterval(() => { if (view === 'integrations' && !document.hidden && !$('dlg-conn').open && !$('dlg-sw').open) loadConnections().catch(() => {}); }, 3000);
menu($('conn-menu'));
menu($('tx-menu'));
// ⋯ on a row: Send a test (captions) and Remove
$('conn-list').onclick = (e) => {
  const b = e.target.closest('[data-menu]');
  if (!b) return;
  popMenu($('conn-menu'), b, `${b.dataset.menu[0] === 'c' ? `<button type="button" role="menuitem" data-do="test">${icon('play')}${esc(t.conn.test)}</button>` : ''}<button type="button" role="menuitem" class="danger" data-do="remove">${icon('x')}${esc(t.conn.remove)}</button>`, e);
};
$('conn-menu').onclick = async (e) => {
  const what = e.target.closest('[data-do]')?.dataset.do, id = $('conn-menu')._for?.dataset.menu;
  if (!what || !id) return;
  $('conn-menu').hidePopover();
  const [kind, n] = [id[0], id.slice(1)];
  if (what === 'test') { await api('POST', `/api/integrations/${n}/test`); toast(t.conn.tested); setTimeout(() => loadConnections().catch(() => {}), 1500); return; }
  if (!(await confirmDialog({ title: t.conn.removeAsk, body: t.conn.removeBody, ok: t.conn.remove, danger: true }))) return;
  await api('DELETE', kind === 'c' ? `/api/integrations/${n}` : `/api/switchers/${n}`);
  toast(t.conn.removed);
  loadConnections();
};

// The connect dialogs: where to find the link, the room and language, the link itself checked as it's pasted.
let connType = '';
const fc = $('f-conn');
function connLangs() {
  const st = ev.stages.find((x) => x.id === fc.stage.value);
  fc.lang.innerHTML = (st?.languages || ['orig']).map((l) => `<option value="${esc(l)}">${esc(l === 'orig' ? t.conn.orig : langLabel(l, ev.languages))}</option>`).join('');
}
fc.stage.onchange = connLangs;
// The same rules as the server (src/integrations.js), said before Connect is pressed.
const LINKS = { zoom: [/(^|\.)zoom\.us$/i, /^\/closedcaption/i], youtube: [/^upload\.youtube\.com$/i, /^\/closedcaption/i], teams: [/^api\.captions\.office\.microsoft\.com$/i, /^\/cartcaption/i] };
function connHint() {
  const v = fc.url.value.trim(), name = t.conn.names[connType], h = $('conn-hint');
  let u = null;
  try { u = new URL(v); } catch { /* not a link yet */ }
  const ok = !!u && (connType === 'webhook' ? u.protocol === 'https:' : LINKS[connType][0].test(u.hostname) && LINKS[connType][1].test(u.pathname) && (connType !== 'youtube' || u.searchParams.has('cid')));
  h.className = `hint${!v ? '' : ok ? ' ok' : ' warn'}`;
  h.innerHTML = !v ? esc(t.conn.hint[connType]) : ok ? `${icon('check')}${esc(connType === 'webhook' ? t.conn.hint.webhook : t.conn.good(name))}` : `${icon('alert')}${esc(connType === 'webhook' ? t.conn.needHttps : t.conn.bad(name))}`;
}
fc.url.oninput = connHint;
document.querySelector('section.view[data-view="integrations"]').addEventListener('click', (e) => {
  const type = e.target.closest('[data-connect]')?.dataset.connect;
  if (!type) return;
  connType = type;
  $('conn-logo').className = `logo ${type}`;
  $('conn-logo').innerHTML = LOGOS[type];
  $('conn-title').textContent = t.conn.titles[type];
  $('conn-sub').textContent = t.conn.subs[type];
  $('conn-help').textContent = t.conn.help[type];
  fc.stage.innerHTML = ev.stages.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');
  connLangs();
  fc.url.value = '';
  fc.url.placeholder = { zoom: 'https://wmcapi.zoom.us/closedcaption?id=…', youtube: 'http://upload.youtube.com/closedcaption?cid=…', teams: 'https://api.captions.office.microsoft.com/cartcaption?meetingid=…', webhook: 'https://…' }[type];
  connHint();
  $('conn-events').classList.toggle('hidden', type !== 'webhook');
  $('conn-err').textContent = '';
  $('dlg-conn').showModal();
});
fc.addEventListener('submit', async (e) => {
  if (e.submitter?.value !== 'ok') return;
  e.preventDefault();
  const events = [fc['ev-caption'].checked && 'caption', fc['ev-talk'].checked && 'talk.ended'].filter(Boolean);
  try {
    const c = await api('POST', '/api/integrations', { type: connType, stage: fc.stage.value, lang: fc.lang.value, url: fc.url.value.trim(), events }, { quiet: true });
    $('dlg-conn').close();
    toast(t.conn.connected(t.conn.names[connType]));
    if (c.secret) await confirmDialog({ title: t.conn.secretTitle, body: t.conn.secret, ok: t.conn.secretOk, info: true, html: copyRow(t.conn.secretLabel, c.secret, false) });
    loadConnections();
  } catch (err) { $('conn-err').textContent = tr(err.message); }
});

// vMix / OBS: their break scenes pause a room
let swType = '';
const fs = $('f-sw');
function swHint() {
  const v = fs.url.value.trim(), h = $('sw-hint'), port = swType === 'obs' ? 4455 : 8088;
  const host = /^(?:[a-z]+:\/\/)?([\w.-]+)(?::(\d+))?\/?$/i.exec(v);
  h.className = `hint${!v ? '' : host ? ' ok' : ' warn'}`;
  h.innerHTML = !v ? esc(tr(swType === 'obs' ? 'La IP de la computadora con OBS (puerto 4455).' : 'La IP de la computadora con vMix (puerto 8088).'))
    : host ? `${icon('check')}${esc(`${host[1]}:${host[2] || port}`)}` : `${icon('alert')}${esc(tr('Solo la dirección, por ejemplo 192.168.1.20'))}`;
}
fs.url.oninput = swHint;
document.querySelector('section.view[data-view="integrations"]').addEventListener('click', (e) => {
  const type = e.target.closest('[data-switcher]')?.dataset.switcher;
  if (!type) return;
  swType = type;
  $('sw-logo').className = `logo ${type}`;
  $('sw-logo').innerHTML = LOGOS[type];
  $('sw-title').textContent = `${tr('Conectar')} ${SW_NAMES[type]}`;
  $('sw-sub').textContent = tr('Los subtítulos se pausan solos en las escenas de pausa.');
  $('sw-help').textContent = tr(type === 'obs'
    ? 'En OBS: Herramientas → Configuración del servidor WebSocket → Habilitar. Copiá la contraseña. La dirección es la IP de la computadora con OBS (puerto 4455).'
    : 'En vMix: Settings → Web Controller → Enable. La dirección es la IP de la computadora con vMix (puerto 8088). Se usa el título de la entrada al aire.');
  fs.stage.innerHTML = ev.stages.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');
  fs.url.value = '';
  fs.url.placeholder = type === 'obs' ? '192.168.1.20:4455' : '192.168.1.20:8088';
  swHint();
  fs.password.value = '';
  fs.scenes.value = DEFAULT_SCENES;
  fs.querySelector('details').open = false;
  $('sw-pass').classList.toggle('hidden', type !== 'obs');
  $('sw-err').textContent = '';
  $('dlg-sw').showModal();
});
fs.addEventListener('submit', async (e) => {
  if (e.submitter?.value !== 'ok') return;
  e.preventDefault();
  try {
    await api('POST', '/api/switchers', { type: swType, stage: fs.stage.value, url: fs.url.value.trim(), password: fs.password.value, scenes: fs.scenes.value }, { quiet: true });
    $('dlg-sw').close();
    toast(tr('Conectado. Al pasar a una escena de pausa, los subtítulos de la sala se pausan.'));
    loadConnections();
  } catch (err) { $('sw-err').textContent = tr(err.message); }
});

// ---------- Glossary ----------
let gloss = { vocabulary: [], replacements: [] };
let glossDirty = false;
async function loadGlossary() {
  if (glossDirty) return renderGlossary();
  const g = await api('GET', '/api/glossary');
  gloss = { vocabulary: [...(g.vocabulary || [])], replacements: (g.replacements || []).map((x) => ({ ...x })) };
  renderGlossary();
}
function markGloss() { glossDirty = true; $('gloss-save').innerHTML = `${icon('check')} ${esc(tr('Guardar glosario'))} · ${esc(t.unsaved)}`; }
function renderGlossary() {
  $('terms').innerHTML = gloss.vocabulary.map((v, i) => `<span class="chip">${esc(v)}<button type="button" class="x" data-term="${i}" data-setup aria-label="${esc(tr('Quitar'))} ${esc(v)}">${icon('x')}</button></span>`).join('');
  const langs = [['', t.anyLang], ...Object.entries(ev.languages), ['orig', 'Original']];
  $('reps').innerHTML = gloss.replacements.map((r, i) => `<tr data-i="${i}"><td><input data-k="from" value="${esc(r.from)}" data-setup /></td><td><input data-k="to" value="${esc(r.to)}" data-setup /></td>
    <td class="hide-sm"><select data-k="lang" data-setup>${langs.map(([k, n]) => `<option value="${esc(k)}" ${(r.lang || '') === k ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></td>
    <td class="r"><button type="button" class="x" data-rep="${i}" data-setup aria-label="${esc(tr('Quitar'))} ${esc(r.from)}">${icon('x')}</button></td></tr>`).join('');
  setLocked(locked);
}
$('terms').onclick = (e) => { const i = e.target.closest('[data-term]')?.dataset.term; if (i != null) { gloss.vocabulary.splice(+i, 1); markGloss(); renderGlossary(); } };
$('term-form').onsubmit = (e) => {
  e.preventDefault();
  const v = $('term-in').value.trim();
  if (v && !gloss.vocabulary.includes(v)) { gloss.vocabulary.push(v); markGloss(); renderGlossary(); }
  $('term-in').value = '';
};
$('reps').oninput = (e) => { const tr_ = e.target.closest('[data-i]'); if (tr_ && e.target.dataset.k) { gloss.replacements[+tr_.dataset.i][e.target.dataset.k] = e.target.value; markGloss(); } };
$('reps').onchange = $('reps').oninput;
$('reps').onclick = (e) => { const i = e.target.closest('[data-rep]')?.dataset.rep; if (i != null) { gloss.replacements.splice(+i, 1); markGloss(); renderGlossary(); } };
$('rep-add').onclick = () => { gloss.replacements.push({ from: '', to: '' }); markGloss(); renderGlossary(); $('reps').querySelector('tr:last-child input')?.focus(); };
$('gloss-save').onclick = async () => {
  const body = { vocabulary: gloss.vocabulary, replacements: gloss.replacements.filter((r) => r.from.trim() && r.to.trim()).map((r) => (r.lang ? { from: r.from.trim(), to: r.to.trim(), lang: r.lang } : { from: r.from.trim(), to: r.to.trim() })) };
  const r = await api('PUT', '/api/glossary', body);
  glossDirty = false;
  $('gloss-save').innerHTML = `${icon('check')} ${esc(tr('Guardar glosario'))}`;
  toast(t.glossSaved(r.vocabulary.length, r.replacements.length), { undo: r.change });
  loadGlossary();
};
for (const id of ['add', 'term-in', 'rep-add', 'gloss-save', 'name-in', 'agenda-text', 'lang-add', 'tx-access', 'import-ref', 'import-source', 'import-again']) $(id).dataset.setup = '';
$('import-form').querySelector('button:not([type])').dataset.setup = '';
$('lang-form').querySelector('button').dataset.setup = '';
$('term-form').querySelector('button').dataset.setup = '';
$('name-form').querySelector('button').dataset.setup = '';

// ---------- A room's links: Screens & QR ----------
const origin = () => ev.publicUrl || location.origin;
const copy = (text) => copyText(text).then(() => toast(t.copied, { ms: 1500 }), () => toast(t.copyFail, { error: true }));
// One row: what it is (and the address, small), then Copy and Open.
function copyRow(label, url, open = true) {
  return `<div class="crow"><span class="crow-l">${esc(label)}<span class="crow-v">${esc(url)}</span></span><span class="crow-b"><button type="button" data-copy="${esc(url)}" aria-label="${esc(`${t.copy}: ${label}`)}">${esc(t.copy)}</button>${open ? `<a href="${esc(url)}" target="_blank" aria-label="${esc(`${t.open}: ${label}`)}"><button type="button" tabindex="-1">${esc(t.open)}</button></a>` : ''}</span></div>`;
}
async function loadRoom(id) {
  ev = await (await fetch('/api/event')).json();
  const st = ev.stages.find((s) => s.id === id);
  if (!st) { $('screens-links').innerHTML = ''; return; }
  const o = origin(), aud = `${o}/s/${st.id}`, qr = `/api/qr.svg?text=${encodeURIComponent(aud)}`;
  const others = st.languages.filter((l) => l !== 'orig');
  $('screens-links').innerHTML = `
    <div class="qrrow"><img src="${qr}" alt="QR" /><div class="u-stack8 u-minw0">${copyRow(tr('Público (celular, QR)'), aud)}<div class="row"><a href="${qr}" download="qr-${esc(st.id)}.svg">${esc(t.qrDl)}</a><a href="/kit.html?stage=${encodeURIComponent(st.id)}" target="_blank">${esc(t.poster)}</a></div></div></div>
    ${copyRow(tr('Pantalla del escenario / proyector'), `${o}/screen.html?stage=${st.id}&langs=${others[0] || 'orig'},orig`)}
    ${others.map((l) => copyRow(`${tr('Overlay vMix/OBS')} — ${langLabel(l, ev.languages)}`, `${o}/overlay.html?stage=${st.id}&lang=${l}`)).join('')}
    ${copyRow(tr('Overlay con fondo verde (chroma key)'), `${o}/overlay.html?stage=${st.id}&lang=${others[0] || 'orig'}&bg=%2300ff00&style=outline`)}
    ${copyRow(tr('Transcripción en vivo (leer, buscar, resumen IA)'), `${o}/talk.html?stage=${st.id}`)}`;
}
// The stage computer's link: single use, 30 minutes, sound only (POST /api/ingest/link). It replaces typing the
// room-computer password on a second computer; this page never sees that password.
async function makeIngestLink(id) {
  const r = await api('POST', '/api/ingest/link', { stage: id });
  const until = hm(Date.now() + r.expiresIn * 1000);
  $('ingest-link').innerHTML = `<div class="qrrow"><img src="/api/qr.svg?text=${encodeURIComponent(r.url)}" alt="${esc(t.linkQr)}" /><div class="u-stack8 u-minw0">${copyRow(tr('Enlace para la computadora junto al escenario'), r.url)}<p class="muted-note u-m0">${esc(t.linkMade(until))}</p>${r.url.startsWith('http:') ? `<p class="muted-note u-m0 u-danger-outline">${esc(tr('Esta dirección no es segura (http), así que el navegador de la otra computadora no le va a dejar usar un micrófono. Creá primero una dirección pública (Ajustes → Dirección pública) y volvé a crear el enlace.'))}</p>` : ''}</div></div>`;
}

// ---------- Tools: QR kit, caption style, sound check, the floating window ----------
$('tools-menu').addEventListener('toggle', (e) => {
  if (e.newState !== 'open') return;
  const m = $('tools-menu'), b = document.querySelector('[popovertarget="tools-menu"]').getBoundingClientRect();
  m.style.top = `${b.bottom + 6}px`;
  m.style.left = `${Math.max(8, Math.min(b.right - m.offsetWidth, innerWidth - m.offsetWidth - 8))}px`;
});
$('tools-menu').addEventListener('click', (e) => { if (e.target.closest('a, button')) $('tools-menu').hidePopover(); });

// ---------- Transcripts ----------
async function loadTranscripts() {
  ev = await (await fetch('/api/event')).json();
  const sel = $('tx-room');
  const cur = txRoom || sel.value;
  sel.innerHTML = ev.stages.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
  if (cur && ev.stages.some((s) => s.id === cur)) sel.value = cur;
  renderTranscripts();
  if (!isCrew) pollRec();
}
// The room's talks, newest first, with their word counts from the event report (the talk list doesn't count words).
let txTalks = [], txSeq = 0;
async function renderTranscripts() {
  const st = ev.stages.find((s) => s.id === $('tx-room').value);
  const seq = ++txSeq;
  const [talks, report] = st ? await Promise.all([api('GET', `/api/stages/${encodeURIComponent(st.id)}/talks`), api('GET', '/api/report', null, { quiet: true }).catch(() => null)]) : [[], null];
  if (seq !== txSeq) return; // another room was picked meanwhile
  const more = new Map((report?.rooms.find((r) => r.id === st?.id)?.talks || []).map((x) => [x.id, x]));
  txTalks = talks.map((x) => ({ ...x, words: more.get(x.id)?.words, current: !!more.get(x.id)?.current }));
  drawTranscripts();
}
/** A talk's languages, in the room's order: the original first when asked, then each translation it has. */
const talkLangs = (x, orig) => [...new Set([...(x.languages || []), ...(x.channels || [])])].filter((l) => (x.channels || [l]).includes(l) && (orig || l !== 'orig')).sort((a, b) => (b === 'orig') - (a === 'orig'));
const txUrl = (x) => `/talk.html?stage=${encodeURIComponent($('tx-room').value)}&talk=${encodeURIComponent(x.id)}`;
function drawTranscripts() {
  const st = ev.stages.find((s) => s.id === $('tx-room').value);
  const q = $('tx-q').value.trim();
  const list = txTalks.filter((x) => !q || `${x.title} ${x.speaker || ''}`.toLowerCase().includes(q.toLowerCase()));
  const mins = (ms) => Math.max(1, Math.round((ms || 0) / 60000));
  const words = txTalks.reduce((a, x) => a + (x.words || 0), 0);
  $('tx-sum').textContent = [st?.name, t.tx.talks(txTalks.length), txTalks.length && t.tx.min(mins(txTalks.reduce((a, x) => a + (x.durationMs || 0), 0))), words && t.tx.words(words)].filter(Boolean).join(' · ');
  $('tx-zip').disabled = !txTalks.length;
  const row = (x) => {
    const name = x.title || t.tx.untitled, d = new Date(x.startedAt), langs = talkLangs(x, false);
    return `<div class="tx-row" data-id="${esc(x.id)}">
      <span class="tx-ic" aria-hidden="true">${icon(x.source === 'recording' ? 'film' : 'doc')}</span>
      <div class="tx-main">
        <div class="tx-title"><a href="${txUrl(x)}" target="_blank"${x.title ? '' : ' class="untitled"'}>${esc(name)}</a>${x.current ? `<span class="chip live"><span class="dot live"></span>${esc(t.tx.live)}</span>` : ''}${x.source === 'recording' ? `<span class="chip">${esc(t.tx.rec)}</span>` : ''}</div>
        <div class="tx-meta">${x.speaker ? `<span>${esc(x.speaker)}</span>` : ''}<span>${esc(d.toLocaleDateString(LANG, { weekday: 'short', day: 'numeric', month: 'short' }))}, ${esc(hm(x.startedAt))}</span><span>${esc(t.tx.min(mins(x.durationMs)))}</span>${x.words != null ? `<span>${esc(t.tx.words(x.words))}</span>` : ''}${langs.length ? `<span class="tx-langs">${langs.map((l) => `<span class="chip" title="${esc(langLabel(l, ev.languages))}">${esc(l.toUpperCase())}</span>`).join('')}</span>` : ''}</div>
      </div>
      <div class="tx-acts">
        <a class="tx-read" href="${txUrl(x)}" target="_blank" aria-label="${esc(t.tx.read(name))}">${icon('doc')}${esc(t.read)}</a>
        <button type="button" class="tx-dlb" data-tx-dl="${esc(x.id)}" aria-haspopup="true" aria-expanded="false" aria-label="${esc(t.tx.dlOf(name))}">${icon('download')}<span>${esc(t.tx.dl)}</span></button>
        <button type="button" class="kebab" data-tx-more="${esc(x.id)}" aria-haspopup="menu" aria-expanded="false" aria-label="${esc(t.tx.more(name))}" title="${esc(t.tx.more(name))}">${DOTS}</button>
      </div>
    </div>`;
  };
  $('tx-list').innerHTML = !txTalks.length ? `<div class="empty-art rise"><img src="/art/empty-library.webp" alt="" width="900" height="900" /><h3>${esc(t.noTalks)}</h3><p>${esc(t.tx.emptyBody)}</p></div>`
    : !list.length ? `<p class="empty">${esc(t.tx.noMatch(q))}</p>` : list.map(row).join('');
}
$('dlg-confirm').addEventListener('click', (e) => { const c = e.target.closest('[data-copy]'); if (c) copy(c.dataset.copy); });
// Download: each language's SRT, VTT and TXT. ⋯: copy the link, delete (with a confirmation).
$('tx-list').onclick = (e) => {
  const b = e.target.closest('[data-tx-dl], [data-tx-more]');
  const x = b && txTalks.find((y) => y.id === (b.dataset.txDl || b.dataset.txMore));
  if (!x) return;
  const m = $('tx-menu'), room = encodeURIComponent($('tx-room').value);
  if (b.dataset.txDl) {
    m.removeAttribute('role');
    m.setAttribute('aria-label', t.tx.dlOf(x.title || t.tx.untitled));
    return popMenu(m, b, `${talkLangs(x, true).map((l) => {
      const n = langLabel(l, ev.languages);
      return `<div class="tx-dl" role="group" aria-label="${esc(n)}"><span>${esc(n)}</span>${['srt', 'vtt', 'txt'].map((f) => `<a href="/api/stages/${room}/export.${f}?lang=${encodeURIComponent(l)}&talk=${encodeURIComponent(x.id)}" download aria-label="${esc(`${n} · ${f.toUpperCase()}`)}">${f.toUpperCase()}</a>`).join('')}</div>`;
    }).join('')}<p class="tx-dl-note">${esc(t.tx.dlNote)}</p>`, e);
  }
  m.setAttribute('role', 'menu');
  m.removeAttribute('aria-label');
  popMenu(m, b, `<button type="button" role="menuitem" data-do="copy">${icon('link')}${esc(t.tx.copyLink)}</button>${isCrew ? '' : `<button type="button" role="menuitem" class="danger" data-do="del">${icon('x')}${esc(t.tx.del)}</button>`}`, e);
};
$('tx-menu').onclick = async (e) => {
  const m = $('tx-menu');
  if (e.target.closest('a')) return m.hidePopover(); // a download starts
  const what = e.target.closest('[data-do]')?.dataset.do, x = txTalks.find((y) => y.id === m._for?.dataset.txMore);
  if (!what || !x) return;
  m.hidePopover();
  if (what === 'copy') return copy(`${origin()}${txUrl(x)}`);
  if (!(await confirmDialog({ title: t.txDelete(x.title || t.tx.untitled), body: t.noUndo, ok: tr('Eliminar'), danger: true }))) return;
  await api('DELETE', `/api/stages/${encodeURIComponent($('tx-room').value)}/talks/${encodeURIComponent(x.id)}`);
  toast(t.done, { ms: 3000 });
  renderTranscripts();
};
$('tx-room').onchange = () => { txRoom = $('tx-room').value; renderTranscripts(); };
$('tx-q').oninput = drawTranscripts;
// Every talk of the room in one .zip (SRT, VTT and TXT in each language). Fetched rather than linked, so a refusal
// (too big, nothing yet) shows as a message instead of downloading an error.
$('tx-zip').onclick = async () => {
  const b = $('tx-zip');
  b.disabled = true;
  b.setAttribute('aria-busy', 'true');
  try {
    const r = await fetch(`/api/transcripts.zip?room=${encodeURIComponent($('tx-room').value)}`);
    if (r.status === 401) return askToken();
    if (!r.ok) return toast(r.status === 404 ? t.noTalks : tr(r.status === 413 ? 'Es demasiado para un solo archivo. Desde la API se puede descargar un día por vez.' : 'No se pudo preparar la descarga.'), { error: true });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(await r.blob());
    a.download = /filename="([^"]+)"/.exec(r.headers.get('content-disposition') || '')?.[1] || 'opencaptions-transcripts.zip';
    document.body.append(a); // Firefox only downloads from a link in the page
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
  } catch {
    toast(tr('No se pudo preparar la descarga.'), { error: true });
  } finally {
    b.disabled = false;
    b.removeAttribute('aria-busy');
  }
};
function openExport(st) {
  txRoom = st.id;
  location.hash = '#transcripts';
}

// ---------- Caption a recording (src/recording.js) ----------
// A file from this computer is uploaded in pieces (while the person picks the languages), checked on the server, and
// captioned there much faster than real time into a transcript of the room. The job goes on if the dialog is closed:
// the recordings in progress show above the list. Sentences with numbers in them, per language:
const RL = {
  es: {
    dur: (ms) => { const s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h} h ${String(m).padStart(2, '0')} min` : m ? `${m} min ${String(s % 60).padStart(2, '0')} s` : `${s} s`; },
    est: (d, t, how) => `${d ? `Dura ${d}. ` : ''}Listo en unos ${t}, ${how}.`,
    gemini: (usd) => `con Gemini en la nube: cerca de US$ ${usd}`, local: 'en esta computadora, sin costo', mock: 'con la IA simulada (de prueba)',
    noLength: 'La duración aparece cuando termine de subir.',
    uploading: (p) => `Subiendo el archivo… ${p} %`, checking: 'Revisando el archivo…',
    phase: { queued: 'Esperando a que termine otra grabación…', decode: 'Leyendo el audio…', transcribe: 'Transcribiendo…', translate: 'Traduciendo…', save: 'Guardando…' },
    eta: (t) => `quedan ~${t}`,
    done: (n, t) => `Listo en ${t}: ${n} frases. Está en Transcripciones, con sus descargas.`,
    doneToast: (n) => `«${n}» ya está subtitulada.`,
    hide: 'Seguir en segundo plano', stop: 'Detener', stopAsk: (n) => `¿Detener el subtitulado de «${n}»? Se descarta lo hecho hasta ahora.`,
    jobs: (n, p) => `${n} · ${p} %`,
    err: {
      'not-media': 'Ese archivo no es de audio ni de video.', 'no-audio': 'Ese archivo no tiene sonido.', 'too-big': (mb) => `El archivo pasa el máximo de ${mb} MB (RECORDING_MAX_MB).`,
      'no-ffmpeg': 'Para leer este tipo de archivo, el servidor necesita ffmpeg (brew install ffmpeg). Los WAV de 16 kHz mono funcionan sin él.',
      busy: 'Ya hay varias grabaciones en curso: esperá a que terminen o cancelá alguna.', 'no-speech': 'No se encontró a nadie hablando en la grabación.',
      'asr-down': 'El servidor de voz local no responde: arrancalo con npm run local.', quota: 'Gemini limitó las consultas (cuota). Probá de nuevo en un rato.', budget: 'Se terminó el presupuesto de IA de esta semana: se renueva el lunes.',
      'no-store': 'Este servidor no guarda transcripciones (STORE_TRANSCRIPTS=false).', upload: 'Se cortó la subida. Elegí el archivo de nuevo.',
    },
  },
  en: {
    dur: (ms) => { const s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h} h ${String(m).padStart(2, '0')} min` : m ? `${m} min ${String(s % 60).padStart(2, '0')} s` : `${s} s`; },
    est: (d, t, how) => `${d ? `It lasts ${d}. ` : ''}Ready in about ${t}, ${how}.`,
    gemini: (usd) => `with Gemini in the cloud: about US$ ${usd}`, local: 'on this computer, at no cost', mock: 'with the simulated AI (for testing)',
    noLength: 'Its length shows once it’s uploaded.',
    uploading: (p) => `Uploading the file… ${p}%`, checking: 'Checking the file…',
    phase: { queued: 'Waiting for another recording to finish…', decode: 'Reading the audio…', transcribe: 'Transcribing…', translate: 'Translating…', save: 'Saving…' },
    eta: (t) => `~${t} left`,
    done: (n, t) => `Done in ${t}: ${n} lines. It’s in Transcripts, with its downloads.`,
    doneToast: (n) => `“${n}” is captioned.`,
    hide: 'Keep going in the background', stop: 'Stop', stopAsk: (n) => `Stop captioning “${n}”? What’s done so far is thrown away.`,
    jobs: (n, p) => `${n} · ${p}%`,
    err: {
      'not-media': 'That file isn’t audio or video.', 'no-audio': 'That file has no sound.', 'too-big': (mb) => `The file is over the ${mb} MB limit (RECORDING_MAX_MB).`,
      'no-ffmpeg': 'To read this kind of file the server needs ffmpeg (brew install ffmpeg). 16 kHz mono WAV files work without it.',
      busy: 'Several recordings are already in progress: wait for them to finish or cancel one.', 'no-speech': 'Nobody was found speaking in the recording.',
      'asr-down': 'The local speech server isn’t answering: start it with npm run local.', quota: 'Gemini limited the requests (quota). Try again in a while.', budget: 'This week’s AI budget is used up: it renews on Monday.',
      'no-store': 'This server doesn’t keep transcripts (STORE_TRANSCRIPTS=false).', upload: 'The upload broke off. Choose the file again.',
    },
  },
};
const rt = RL[LANG] || RL.en;
const fr = $('f-rec');
const ACTIVE = ['queued', 'running'];
const MEDIA_EXT = /\.(mp3|m4a|m4b|aac|wav|flac|ogg|oga|opus|wma|aiff?|caf|amr|mp4|m4v|mov|mkv|webm|avi|wmv|flv|ts|mts|m2ts|mpe?g|3gp)$/i;
let recInfo = null; // GET /api/recordings: engine, rates, size limit, jobs
let rec = null; // what the dialog shows: { file, ctl, job, durationMs, step: 'pick' | 'upload' | 'ready' | 'run' | 'end' }
let recTimer;
const seenActive = new Set();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const recError = (code, fallback) => { const m = rt.err[code]; return typeof m === 'function' ? m(recInfo?.maxMb ?? 2048) : m || fallback || tr('Algo salió mal.'); };

/** The length the browser reads from the file itself, for an estimate before the upload ends (null if it can't). */
function mediaDuration(file) {
  return new Promise((resolve) => {
    const el = document.createElement(file.type.startsWith('video') ? 'video' : 'audio');
    const url = URL.createObjectURL(file);
    const done = (v) => { URL.revokeObjectURL(url); el.removeAttribute('src'); resolve(Number.isFinite(v) && v > 0 ? v * 1000 : null); };
    el.preload = 'metadata';
    el.onloadedmetadata = () => done(el.duration);
    el.onerror = () => done(null);
    setTimeout(() => done(null), 5000);
    el.src = url;
  });
}

function recTargets(st) {
  const on = (st?.languages || ['orig', ...(ev.defaultTargets || ['es', 'en'])]).filter((l) => l !== 'orig');
  $('rec-targets').innerHTML = Object.entries(ev.languages).map(([c, n]) => `<label><input type="checkbox" value="${esc(c)}" ${on.includes(c) ? 'checked' : ''}/> ${esc(n)}</label>`).join('');
}
const recChosen = () => [...$('rec-targets').querySelectorAll('input:checked')].map((i) => i.value);

/** "Ready in about 20 s, with Gemini in the cloud: about US$ 0.02": the server's rates, redone as languages change. */
function recEstimate() {
  const r = rec?.job?.rates || recInfo?.rates;
  if (!r || !rec?.file) { $('rec-estimate').textContent = ''; return; }
  const ms = rec.job?.durationMs ?? rec.durationMs;
  if (!ms) { $('rec-estimate').textContent = rt.noLength; return; }
  const min = ms / 60000, n = recChosen().filter((l) => l !== fr.source.value).length;
  const secs = Math.max(1, Math.round(r.fixedSec + min * (r.secPerMin + n * r.secPerMinPerLang)));
  const how = r.engine === 'gemini' ? rt.gemini(Math.max(0.01, min * (r.usdPerMin + n * r.usdPerMinPerLang)).toFixed(2)) : rt[r.engine] || rt.local;
  $('rec-estimate').textContent = rt.est(rt.dur(ms), rt.dur(secs * 1000), how);
}

function recBar(p, text, eta = '') {
  $('rec-prog').classList.remove('hidden');
  const pct = Math.round(Math.max(0, Math.min(1, p)) * 100);
  $('rec-bar').firstElementChild.style.width = `${pct}%`;
  $('rec-bar').setAttribute('aria-valuenow', String(pct));
  $('rec-phase').textContent = text;
  $('rec-eta').textContent = eta;
}

/** Buttons and fields for where the dialog is: choosing, uploading, ready, running, finished. */
function recStep(step) {
  rec.step = step;
  const busy = step === 'run' || step === 'end';
  for (const el of [fr.room, fr.source, fr.title, $('rec-pick'), ...$('rec-targets').querySelectorAll('input')]) el.disabled = busy;
  $('rec-file').disabled = busy;
  $('rec-drop').classList.toggle('hidden', busy);
  $('rec-start').classList.toggle('hidden', busy);
  $('rec-start').disabled = step !== 'ready';
  $('rec-open').classList.add('hidden');
  $('rec-close').textContent = step === 'run' ? rt.hide : step === 'end' ? tr('Cerrar') : tr('Cancelar');
  if (step === 'pick') { $('rec-prog').classList.add('hidden'); $('rec-err').textContent = ''; }
}

async function openRec(file = null) {
  if (rec && ['run', 'end'].includes(rec.step) && !file) return $('dlg-rec').showModal(); // a job in progress: show it
  if (rec?.step === 'run') rec = null; // it goes on in the background, listed above the transcripts
  try { recInfo = await api('GET', '/api/recordings', null, { quiet: true }); } catch { recInfo = null; }
  rec = { file: null, ctl: null, job: null, durationMs: null, step: 'pick' };
  fr.room.innerHTML = ev.stages.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
  fr.room.value = $('tx-room').value || txRoom || ev.stages[0]?.id || '';
  fr.source.innerHTML = `<option value="auto">${esc(tr('Detectar automáticamente'))}</option>${Object.entries(ev.languages).map(([c, n]) => `<option value="${esc(c)}">${esc(n)} (${esc(c)})</option>`).join('')}`;
  fr.title.value = '';
  recTargets(ev.stages.find((s) => s.id === fr.room.value));
  $('rec-file-label').classList.remove('hidden');
  $('rec-file-name').classList.add('hidden');
  $('rec-file').value = '';
  $('rec-estimate').textContent = '';
  recStep('pick');
  $('dlg-rec').showModal();
  if (file) recFile(file);
}

/** Send the file in pieces; a piece that fails is sent again, and the server says where to carry on. */
async function recUpload(file, signal) {
  let j = await api('POST', '/api/recordings', { name: file.name, size: file.size }, { quiet: true });
  rec.job = j;
  let at = 0, fails = 0;
  while (j.state === 'uploading') {
    let r, body;
    try {
      r = await fetch(`/api/recordings/${encodeURIComponent(j.id)}/data?offset=${at}`, { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: file.slice(at, at + j.chunkBytes), signal });
      body = await r.json().catch(() => ({}));
    } catch (e) {
      if (signal.aborted || ++fails > 4) throw Object.assign(e, { body: { code: 'upload' } });
      await sleep(1000 * fails);
      continue;
    }
    if (r.status === 401) { askToken(); throw new Error('signed out'); }
    if (r.status === 409 && body.code === 'offset') { at = body.size; continue; }
    if (!r.ok) throw Object.assign(new Error(body.error || r.statusText), { body });
    fails = 0;
    j = { ...j, ...body };
    at = j.size;
    if (rec?.file === file) recBar(at / file.size, at < file.size ? rt.uploading(Math.floor((at / file.size) * 100)) : rt.checking);
  }
  return j;
}

async function recFile(file) {
  if (!file || !rec || ['run', 'end'].includes(rec.step)) return;
  rec.ctl?.abort();
  if (rec.job?.id) api('DELETE', `/api/recordings/${encodeURIComponent(rec.job.id)}`, null, { quiet: true }).catch(() => {});
  const prevName = rec.file?.name.replace(/\.[^.]+$/, '');
  Object.assign(rec, { file, ctl: new AbortController(), job: null, durationMs: null });
  $('rec-file-label').classList.add('hidden');
  $('rec-file-name').classList.remove('hidden');
  $('rec-file-name').textContent = `${file.name} · ${(file.size / 1e6).toFixed(file.size < 1e7 ? 1 : 0)} MB`;
  if (!fr.title.value || fr.title.value === prevName) fr.title.value = file.name.replace(/\.[^.]+$/, '').slice(0, 200);
  recStep('upload');
  $('rec-err').textContent = '';
  if ((file.type && !/^(audio|video)\//.test(file.type) && !MEDIA_EXT.test(file.name)) || (!file.type && !MEDIA_EXT.test(file.name))) {
    $('rec-err').textContent = recError('not-media');
    return recStep('pick');
  }
  if (recInfo && file.size > recInfo.maxMb * 1024 * 1024) { $('rec-err').textContent = recError('too-big'); return recStep('pick'); }
  mediaDuration(file).then((ms) => { if (rec?.file === file && ms && !rec.job?.durationMs) { rec.durationMs = ms; recEstimate(); } });
  recBar(0, rt.uploading(0));
  recEstimate();
  try {
    const j = await recUpload(file, rec.ctl.signal);
    if (rec?.file !== file) return;
    rec.job = j;
    $('rec-prog').classList.add('hidden');
    recStep('ready');
    recEstimate();
  } catch (e) {
    if (rec?.file !== file || rec.ctl.signal.aborted) return;
    rec.job = null;
    $('rec-prog').classList.add('hidden');
    $('rec-err').textContent = recError(e.body?.code, e.message);
    recStep('pick');
  }
}

/** A job's state in the dialog: its progress, what it's doing, and the result at the end. */
function recShow(j) {
  rec.job = j;
  if (ACTIVE.includes(j.state)) {
    if (rec.step !== 'run') recStep('run');
    const eta = j.state === 'running' && j.etaMs != null && j.progress > 0.02 ? rt.eta(rt.dur(Math.max(1000, j.etaMs))) : '';
    recBar(j.progress, rt.phase[j.phase] || rt.phase.decode, eta);
    $('rec-stop').classList.remove('hidden');
    return;
  }
  $('rec-stop').classList.add('hidden');
  recStep('end');
  if (j.state === 'done') {
    recBar(1, rt.done(j.captions ?? 0, rt.dur(Math.max(1000, j.elapsedMs || 0))));
    if (j.talk) {
      $('rec-open').href = `/talk.html?stage=${encodeURIComponent(j.talk.stage)}&talk=${encodeURIComponent(j.talk.id)}`;
      $('rec-open').classList.remove('hidden');
    }
  } else {
    $('rec-prog').classList.add('hidden');
    $('rec-err').textContent = j.state === 'canceled' ? '' : recError(j.code, j.error);
  }
}

/** The recordings in progress, above the list (and in the dialog, if it shows one), every second while any runs. */
async function pollRec() {
  clearTimeout(recTimer);
  let list;
  try { list = await api('GET', '/api/recordings', null, { quiet: true }); } catch { return; }
  recInfo = list;
  const active = list.jobs.filter((j) => ACTIVE.includes(j.state));
  const mine = rec?.job && list.jobs.find((j) => j.id === rec.job.id);
  if (mine && rec.step === 'run') recShow(mine);
  const others = active.filter((j) => j.id !== (rec?.step === 'run' && $('dlg-rec').open ? rec.job.id : null));
  $('tx-jobs').classList.toggle('hidden', !others.length);
  $('tx-jobs').innerHTML = others.map((j) => `<div class="recjob"><div class="recline"><b>${esc(j.title || j.name)}</b><span>${esc(rt.phase[j.phase] || '')}</span><span class="spacer"></span>
    <span>${esc(rt.jobs(ev.stages.find((s) => s.id === j.room)?.name || j.room || '', Math.round(j.progress * 100)))}</span><button type="button" data-rec-stop="${esc(j.id)}" data-rec-name="${esc(j.title || j.name)}">${esc(rt.stop)}</button></div>
    <div class="recbar" role="progressbar" aria-label="${esc(j.title || j.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(j.progress * 100)}"><i></i></div></div>`).join('');
  // Widths set from here: the Content-Security-Policy refuses inline style attributes.
  $('tx-jobs').querySelectorAll('.recbar').forEach((bar) => { bar.firstElementChild.style.width = `${bar.getAttribute('aria-valuenow')}%`; });
  for (const j of list.jobs) {
    if (!seenActive.has(j.id) || ACTIVE.includes(j.state)) continue;
    seenActive.delete(j.id);
    if (j.state === 'done') {
      if (!(rec?.job?.id === j.id && $('dlg-rec').open)) toast(rt.doneToast(j.title || j.name));
      if (view === 'transcripts') { if (j.room) { txRoom = j.room; $('tx-room').value = j.room; } renderTranscripts(); }
    } else if (j.state === 'failed' && !(rec?.job?.id === j.id && $('dlg-rec').open)) toast(recError(j.code, j.error), { error: true });
  }
  for (const j of active) seenActive.add(j.id);
  if (active.length && (view === 'transcripts' || $('dlg-rec').open)) recTimer = setTimeout(pollRec, 1000);
}

async function recStop(id, name) {
  if (!await confirmDialog({ title: rt.stop, body: rt.stopAsk(name), ok: rt.stop, danger: true })) return;
  await api('DELETE', `/api/recordings/${encodeURIComponent(id)}`, null, { quiet: true }).catch(() => {});
  pollRec();
}

$('tx-rec').onclick = () => openRec();
$('rec-pick').onclick = () => $('rec-file').click();
$('rec-file').onchange = () => recFile($('rec-file').files[0]);
const drop = $('rec-drop');
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); recFile(e.dataTransfer.files[0]); });
// A file dropped anywhere on the Transcripts view opens the dialog with it.
const txView = document.querySelector('.view[data-view="transcripts"]');
txView.addEventListener('dragover', (e) => { if (!isCrew && e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
txView.addEventListener('drop', (e) => { if (isCrew || !e.dataTransfer?.files.length) return; e.preventDefault(); openRec(e.dataTransfer.files[0]); });
fr.room.onchange = () => { recTargets(ev.stages.find((s) => s.id === fr.room.value)); recEstimate(); };
fr.source.onchange = recEstimate;
$('rec-targets').onchange = recEstimate;
fr.onsubmit = (e) => e.preventDefault();
$('rec-start').onclick = async () => {
  if (rec?.step !== 'ready') return;
  $('rec-start').disabled = true;
  $('rec-err').textContent = '';
  try {
    const j = await api('POST', `/api/recordings/${encodeURIComponent(rec.job.id)}/start`, { room: fr.room.value, source: fr.source.value, targets: recChosen(), title: fr.title.value.trim() }, { quiet: true });
    seenActive.add(j.id);
    recShow(j);
    pollRec();
  } catch (e) {
    $('rec-err').textContent = recError(e.body?.code, e.message);
    $('rec-start').disabled = false;
  }
};
$('rec-stop').onclick = () => rec?.job && recStop(rec.job.id, rec.job.title || rec.job.name);
$('tx-jobs').onclick = (e) => { const b = e.target.closest('[data-rec-stop]'); if (b) recStop(b.dataset.recStop, b.dataset.recName); };
// Closing: an upload or a file not started yet is thrown away; a job in progress goes on in the background.
const recClose = () => {
  if (rec && ['pick', 'upload', 'ready'].includes(rec.step)) {
    rec.ctl?.abort();
    if (rec.job?.id) api('DELETE', `/api/recordings/${encodeURIComponent(rec.job.id)}`, null, { quiet: true }).catch(() => {});
    rec = null;
  }
  pollRec();
};
$('rec-close').onclick = () => $('dlg-rec').close();
$('dlg-rec').addEventListener('close', recClose);
// #transcripts?record=<room> opens the dialog (the setup wizard's "I have a recording" links here).
const recFromHash = () => {
  const m = /^#transcripts\?record(?:=([\w-]*))?/.exec(location.hash);
  if (!m || isCrew) return;
  if (m[1] && ev.stages.some((s) => s.id === m[1])) { txRoom = m[1]; $('tx-room').value = m[1]; }
  history.replaceState(history.state, '', `${location.pathname}${location.search}#transcripts`);
  openRec();
};
addEventListener('hashchange', recFromHash);
recFromHash();

// ---------- History ----------
const KIND_ICON = { 'room.create': 'plus', 'room.update': 'gear', 'room.delete': 'x', 'agenda.set': 'calendar', 'glossary.set': 'book', 'event.rename': 'doc', 'event.logo': 'palette', 'engine.mode': 'cloud', 'ai.speech': 'cloud', 'event.lock': 'lock' };
const UNDOABLE = new Set(['room.create', 'room.update', 'room.delete', 'agenda.set', 'glossary.set', 'event.rename', 'engine.mode', 'ai.speech']);
async function loadHistory() {
  hist = await api('GET', '/api/history');
  $('history-list').innerHTML = hist.changes.length ? hist.changes.map((c) => {
    const text = (t.k[c.kind] || (() => c.summary))(c);
    const can = UNDOABLE.has(c.kind) && !c.undone;
    return `<div class="change${c.undone ? ' undone' : ''}"><div class="ic">${icon(KIND_ICON[c.kind] || 'doc')}</div><div><b>${esc(text)}</b><small>${esc(when(c.at))}</small></div>
      <div>${c.undone ? `<span class="chip">${esc(t.undone)}</span>` : can ? `<button data-undo="${c.id}" data-setup>${icon('refresh')} ${esc(t.undo)}</button>` : ''}</div></div>`;
  }).join('') : `<p class="empty">${esc(tr('Todavía no hay cambios.'))}</p>`;
  setLocked(locked);
}
$('history-list').onclick = async (e) => {
  const b = e.target.closest('[data-undo]');
  if (b) await undoChange(Number(b.dataset.undo));
};

// ---------- Settings ----------
// API key and public address (public/connect.js): set up here instead of in .env.
// Who is signed in, in the sidebar, with Sign out (not on the server computer itself: it needs no sign-in).
// The server names a local or password-less sign-in in English: say it in the page's language.
const whoLabel = { 'this computer': LANG === 'es' ? 'Esta computadora' : 'This computer', 'no sign-in (AUTH=off)': LANG === 'es' ? 'Sin inicio de sesión' : 'No sign-in' }[me.label] || me.label;
$('me-av').innerHTML = icon(isCrew ? 'headphones' : 'shield');
$('me').innerHTML = `<b title="${esc(whoLabel)}">${esc(whoLabel)}</b><small>${esc(isCrew ? (LANG === 'es' ? 'Equipo · controles en vivo' : 'Crew · live controls') : (LANG === 'es' ? 'Administración' : 'Admin'))}</small>${me.via === 'session' ? `<button type="button" id="signout">${esc(LANG === 'es' ? 'Salir' : 'Sign out')}</button>` : ''}`;
$('signout')?.addEventListener('click', signOut);
const quietApi = (m, u, b) => api(m, u, b, { quiet: true });
const askFirst = (msg) => { const i = msg.indexOf('?') + 1; return confirmDialog({ title: msg.slice(0, i) || msg, body: msg.slice(i).trim(), ok: LANG === 'es' ? 'Continuar' : 'Continue', danger: true }); };
const keyP = keyPanel($('key-panel'), { api: quietApi, confirm: askFirst });
const tunnelP = tunnelPanel($('tunnel-panel'), { api: quietApi, confirm: askFirst });
const textP = textApiPanel($('text-api-panel'), { api: quietApi, confirm: askFirst });
const localP = isCrew ? null : localPanel($('local-offer'), { api: quietApi, quota: true });
const accessP = isCrew ? null : accessPanel($('access-panel'), { api: quietApi, confirm: askFirst, toast, me });
const alertsP = isCrew ? null : alertsPanel($('alerts-panel'), { api: quietApi, confirm: confirmDialog });
// The Settings window: sections on the left, one at a time on the right (on a phone, the list first), and a search
// box that shows every option that matches. A native modal <dialog>: it keeps focus inside, and Esc closes it.
const SET = $('dlg-settings');
const PANES = [...SET.querySelectorAll('.set-pane')].map((p) => p.dataset.pane);
function openSettings(sub) {
  const pane = PANES.includes(sub) ? sub : null;
  SET.classList.toggle('picked', !!pane); // phone width: the section itself, not the list
  for (const p of SET.querySelectorAll('.set-pane')) p.classList.toggle('on', p.dataset.pane === (pane || 'general'));
  for (const a of SET.querySelectorAll('.set-nav a')) a.toggleAttribute('aria-current', a.dataset.pane === (pane || 'general'));
  for (const a of SET.querySelectorAll('.set-nav a[aria-current]')) a.setAttribute('aria-current', 'page');
  if (SET.open) return;
  $('set-q').value = '';
  filterSettings();
  SET.showModal();
  loadSettings();
}
const fold = (x) => x.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase(); // "dirección" matches "direccion"
function filterSettings() {
  const q = fold($('set-q').value.trim());
  SET.classList.toggle('searching', !!q);
  let any = false;
  for (const p of SET.querySelectorAll('.set-pane')) {
    const inTitle = fold(p.querySelector('.set-h').textContent).includes(q);
    let hit = false;
    for (const c of p.querySelectorAll(':scope > .card')) {
      const m = !q || inTitle || fold(c.textContent).includes(q);
      c.classList.toggle('set-miss', !m);
      hit ||= m && !c.classList.contains('hidden');
    }
    p.classList.toggle('set-hit', !!q && hit);
    SET.querySelector(`.set-nav a[data-pane="${p.dataset.pane}"]`).classList.toggle('set-miss', !!q && !hit);
    any ||= hit;
  }
  $('set-none').classList.toggle('hidden', !q || any);
}
$('set-q').oninput = filterSettings;
// Sections replace the address instead of adding to the history: Back leaves Settings, not each section.
SET.querySelector('.set-nav').onclick = (e) => {
  const a = e.target.closest('a[data-pane]');
  if (!a) return;
  e.preventDefault();
  history.replaceState(history.state, '', a.getAttribute('href'));
  $('set-q').value = '';
  filterSettings();
  openSettings(a.dataset.pane);
  if (!a.offsetParent) $('set-back').focus(); // phone width: the list is gone, so focus goes to the way back
};
$('set-back').onclick = () => {
  const cur = SET.querySelector('.set-nav a[aria-current]');
  history.replaceState(history.state, '', '#settings');
  openSettings(null);
  cur?.focus();
};
$('set-close').onclick = () => SET.close();
SET.addEventListener('close', () => { if (location.hash.startsWith('#settings')) history.replaceState(history.state, '', `#${view}`); });

let settingsSetup = null;
async function loadSettings() {
  accessP?.load();
  alertsP?.load();
  const s = await api('GET', '/api/setup');
  settingsSetup = s;
  keyP.update(s);
  tunnelP.update(s);
  renderLanguages(s);
  $('tx-access').value = s.publicTranscripts;
  if (s.publicTranscriptsFixed) $('tx-access-note').textContent = tr('Lo fija PUBLIC_TRANSCRIPTS en el archivo .env.');
  if (document.activeElement !== $('name-in')) $('name-in').value = s.named === false ? '' : s.name; // unnamed: empty, not the fallback
  $('name-in').placeholder = LANG === 'es' ? 'Ej: Semana del Diseño 2026' : 'e.g. City Design Week 2026';
  if (last?.system) $('sys').textContent = t.sys(last.system, fmtDur(last.uptimeSec));
  setLocked(!!s.locked);
  if (s.publicTranscriptsFixed) $('tx-access').disabled = true;
  renderSpeech(s);
  textP.update(s);
  $('upd-check').checked = !!s.updateCheck;
  $('upd-check').disabled = !!s.updateCheckFixed;
  if (s.updateCheckFixed) $('upd-note').textContent = tr('Lo fija UPDATE_CHECK=0 en el archivo .env.');
}
$('upd-check').onchange = async (e) => {
  try { await api('PUT', '/api/setup', { updateCheck: e.target.checked }); toast(t.saved); } catch { /* toast shown */ }
  await loadSettings();
};
// Speech model: Live Translate (captions + translated voice) or Transcribe Live (captions only, cheaper).
function renderSpeech(s) {
  $('speech-model').value = s.speechModel;
  $('speech-note').textContent = `${tr('Con qué modelo de Gemini se escucha al orador en las salas que traducen los subtítulos como texto (el modo normal).')} ${s.speechModelFixed ? tr('Lo fija TRANSCRIBE_MODEL en el archivo .env.') : t.speechHint[s.speechModel]}`;
  if (s.speechModelFixed) $('speech-model').disabled = true;
}
$('speech-model').onchange = async (e) => {
  const live = last?.totals?.live || 0;
  if (live && !(await confirmDialog({ title: t.speechAsk, body: t.speechAskBody(live), ok: t.speechOk }))) { e.target.value = settingsSetup.speechModel; return; }
  try { const r = await api('PUT', '/api/setup', { speechModel: e.target.value }); if (r.change) toast(t.saved, { undo: r.change }); } catch { /* toast shown */ }
  await loadSettings();
};
$('name-form').onsubmit = async (e) => {
  e.preventDefault();
  const name = $('name-in').value.trim();
  if (!name) return;
  const r = await api('PUT', '/api/setup', { name });
  if (r.change) toast(t.renamed(name), { undo: r.change });
  ev = await (await fetch('/api/event')).json();
};
// Event logo: the audience pages show it instead of OpenCaptions' (the server checks the file's bytes, not just its type).
function renderLogo() {
  const img = $('logo-prev').querySelector('img');
  if (ev.logo) img.src = ev.logo;
  img.classList.toggle('hidden', !ev.logo);
  $('logo-prev').classList.toggle('empty', !ev.logo);
  $('logo-empty').classList.toggle('hidden', !!ev.logo);
  $('logo-del').classList.toggle('hidden', !ev.logo);
  $('logo-pick').lastChild.nodeValue = ev.logo ? t.logo.replace : t.logo.upload;
}
// What went wrong is said in the row itself: a toast would sit behind the Settings window.
const logoErr = (msg = '') => { $('logo-err').textContent = msg; $('logo-err').classList.toggle('hidden', !msg); };
async function uploadLogo(file) {
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return logoErr(t.logo.type);
  if (file.size > 2 * 1024 * 1024) return logoErr(t.logo.big);
  const r = await fetch('/api/event/logo', { method: 'POST', headers: { 'content-type': file.type }, body: file }).catch(() => null);
  if (r?.status === 401) return askToken();
  if (r?.status === 423) setLocked(true);
  if (!r?.ok) return logoErr(r?.status === 423 ? t.lockedToast : r?.status === 415 ? t.logo.type : r?.status === 413 ? t.logo.big : t.logo.fail);
  logoErr();
  ev = await (await fetch('/api/event')).json();
  renderLogo();
  toast(t.logo.saved);
}
$('logo-pick').onclick = () => $('logo-file').click();
$('logo-file').onchange = () => { uploadLogo($('logo-file').files[0]); $('logo-file').value = ''; };
const logoDrop = $('logo-drop');
logoDrop.addEventListener('dragover', (e) => { e.preventDefault(); logoDrop.classList.add('over'); }); // locked: the server says so
logoDrop.addEventListener('dragleave', () => logoDrop.classList.remove('over'));
logoDrop.addEventListener('drop', (e) => { e.preventDefault(); logoDrop.classList.remove('over'); uploadLogo(e.dataTransfer.files[0]); });
$('logo-del').onclick = async () => {
  if (!(await confirmDialog({ title: t.logo.ask, body: t.logo.askBody, ok: t.logo.ok, danger: true }))) return;
  try { await api('DELETE', '/api/event/logo'); } catch { return; /* toast shown */ }
  ev = await (await fetch('/api/event')).json();
  logoErr();
  renderLogo();
  toast(t.logo.removed);
};
renderLogo();
// Languages: any of them can be removed while no room uses it (the server says which room does), and added back.
function renderLanguages(s) {
  const many = Object.keys(s.languages).length > 1;
  $('langs-list').innerHTML = Object.entries(s.languages).map(([c, n]) => `<span class="chip">${esc(n)} <code>${esc(c)}</code>${many ? `<button type="button" class="x" data-lang-del="${esc(c)}" data-setup aria-label="${esc(tr('Quitar'))} ${esc(n)}">${icon('x')}</button>` : ''}</span>`).join('');
  const free = Object.entries(LANGUAGE_CATALOG).filter(([c]) => !(c in s.languages)).sort((a, b) => a[1].localeCompare(b[1]));
  $('lang-add').innerHTML = `<option value="">${esc(tr('Agregar un idioma…'))}</option>` + free.map(([c, n]) => `<option value="${c}">${esc(n)} (${c})</option>`).join('');
  setLocked(locked);
}
async function saveLanguages(body) {
  try { await api('PUT', '/api/setup', body, { quiet: true }); } catch (e) {
    const b = e.body || {};
    toast(b.code === 'language-in-use' ? t.langInUse(b.rooms, b.languages) : tr(e.message), { error: true });
    return;
  }
  ev = await (await fetch('/api/event')).json();
  await loadSettings();
}
$('lang-form').onsubmit = async (e) => {
  e.preventDefault();
  const c = $('lang-add').value;
  const removed = settingsSetup.removedLanguages || [];
  if (!c) return;
  if (removed.includes(c)) await saveLanguages({ removedLanguages: removed.filter((x) => x !== c) }); // one of event.json's, back
  else await saveLanguages({ languages: { ...settingsSetup.addedLanguages, [c]: LANGUAGE_CATALOG[c] } });
};
$('langs-list').onclick = async (e) => {
  const c = e.target.closest('[data-lang-del]')?.dataset.langDel;
  if (!c) return;
  const body = {};
  if (c in (settingsSetup.addedLanguages || {})) { const rest = { ...settingsSetup.addedLanguages }; delete rest[c]; body.languages = rest; }
  if ((settingsSetup.builtInLanguages || []).includes(c)) body.removedLanguages = [...(settingsSetup.removedLanguages || []), c];
  await saveLanguages(body);
};
$('tx-access').onchange = async () => {
  try { await api('PUT', '/api/setup', { publicTranscripts: $('tx-access').value }); toast(tr('Guardado')); } catch { /* toast shown */ }
  await loadSettings();
};
// Back to Just for me (the way back from me.html's "Use it for events"): it takes the event offline, so say so.
$('to-me').onclick = async () => {
  if (!(await confirmDialog({ title: `${t.toMe}?`, body: t.toMeBody(last?.totals?.live || 0), ok: t.toMe, danger: !!last?.totals?.live }))) return;
  await api('PUT', '/api/setup', { mode: 'personal' });
  location.href = '/me.html';
};

localize();
go();
