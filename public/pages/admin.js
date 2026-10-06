// admin.html: the production dashboard (kept out of the HTML so the Content-Security-Policy can forbid inline scripts).
//
// Views (sidebar): Live, Rooms, Agenda, Glossary, Screens and QR, Transcripts, History, Settings.
// Safety model: every setup change is recorded on the server and can be undone (History, and an Undo button
// right after each change); deleted rooms go to a trash; Event mode locks the setup on the server, so nothing
// here can delete or change the event's configuration by accident while it's live.
import { qs, esc, store, wsUrl, Socket, langLabel, setAccent } from '/common.js';
import { localize, prefsControls, tr, LANG } from '/i18n.js';
import { icon, mountIcons } from '/illustrations.js';
import { ensureSignedIn, signInScreen, signOut } from '/signin.js';
import { accessPanel } from '/access.js';
import { alertsPanel } from '/alerts-ui.js';
import { keyPanel, tunnelPanel } from '/connect.js';
import { LANGUAGE_CATALOG } from '/languages.js';

const $ = (id) => document.getElementById(id);
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
const VIEWS = isCrew ? ['live', 'screens', 'transcripts', 'history'] : ['live', 'rooms', 'agenda', 'glossary', 'screens', 'integrations', 'transcripts', 'history', 'settings'];
let view = 'live';
let screensRoom = null;
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
    delAsk: (n) => `¿Eliminar «${n}»?`, delAskBody: 'La sala va a la papelera: podés restaurarla tal como estaba desde Salas o el Historial. Sus transcripciones se conservan.', delOk: 'Eliminar sala',
    deleted: (n) => `«${n}» eliminada.`, created: (n) => `«${n}» creada.`, changedRoom: (n) => `«${n}» actualizada.`,
    restartAsk: (n) => `¿Reconectar la IA de «${n}»?`, restartAskBody: 'Los subtítulos de esta sala se pausan unos segundos mientras se reconecta. Usalo si la sala parece trabada.', restartOk: 'Reconectar',
    nextTitle: (n) => `Siguiente charla en «${n}»`, nextNote: 'La transcripción de la charla actual queda guardada y la nueva empieza de cero.', nextOk: 'Empezar la charla',
    renameTitle: (n) => `Renombrar la charla en «${n}»`, renameNote: 'Cambia el título de la charla actual en las pantallas, la transcripción y las descargas.', renameOk: 'Guardar',
    over: (m, t) => `Va ${m} min pasada · le toca a «${t}»`, startDue: (t) => `Empezar «${t}»`, next: (t, h) => `Siguiente: ${t} · ${h}`, noTalk: 'Sin charla anunciada',
    aiAsk: '¿Cambiar la IA de los subtítulos?', aiAskBody: (l) => `Todas las salas pasan a: ${l}. Los subtítulos se pausan unos segundos en cada sala mientras se reconectan.`, aiOk: 'Cambiar la IA',
    aiDesc: (f) => (f.mode === 'auto' ? 'Gemini en la nube, y esta computadora toma el control si se corta internet.' : f.mode === 'local' ? 'Siempre esta computadora: Whisper y un modelo local.' : 'Siempre Gemini en la nube.') + (f.localReady ? ' El respaldo local está listo.' : ' El respaldo local no está corriendo (npm run local -- --fallback).'),
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
      none: 'Todavía no hay nada conectado. Elegí arriba dónde mostrar los subtítulos.',
      orig: 'Original (lo que se habla)', waiting: 'esperando subtítulos', sent: (n, a) => `✓ ${n} enviados · hace ${a}`, failed: (e) => `✗ ${e}`,
      deleted: 'sala eliminada', test: 'Probar', remove: 'Quitar', tested: 'Enviamos una línea de prueba.', removed: 'Desconectado.',
      connected: (n) => `${n} conectado.`, secret: (k) => `Guardá esta clave para verificar los envíos (no se vuelve a mostrar):\n\n${k}`,
    },
    txDelete: (n) => `¿Eliminar para siempre la transcripción «${n}»? No se puede deshacer.`,
    wizardLocked: 'Desactivá el modo evento para usar el asistente: puede cambiar salas e idiomas.',
    noTalks: 'Todavía no hay transcripciones en esta sala.', read: 'Leer', segs: (n) => `${n} frases`,
    k: {
      'room.create': (c) => (c.undoes ? `Sala «${c.after?.name}» restaurada` : `Sala «${c.after?.name}» creada`),
      'room.update': (c) => `Sala «${c.after?.name}» ${c.undoes ? 'vuelta a como estaba' : 'modificada'}${roomDiff(c, 'es')}`,
      'room.delete': (c) => `Sala «${c.before?.name}» eliminada`,
      'agenda.set': (c) => (c.undoes ? `Agenda vuelta a como estaba (${c.after?.count ?? 0} charlas)` : `Agenda reemplazada (${c.before?.count ?? 0} → ${c.after?.count ?? 0} charlas)`),
      'glossary.set': (c) => (c.undoes ? 'Glosario vuelto a como estaba' : `Glosario guardado (${c.after?.terms ?? 0} términos, ${c.after?.corrections ?? 0} correcciones)`),
      'event.rename': (c) => `Evento renombrado a «${c.after}»`,
      'engine.mode': (c) => `IA: ${aiLabel(c.after)}`,
      'event.lock': (c) => (c.after ? 'Modo evento activado' : 'Modo evento desactivado'),
    },
    fields: { name: 'nombre', source: 'idioma de la charla', targets: 'idiomas', translation: 'modo de traducción', pull: 'fuente de audio', loop: 'loop' },
    ai: { auto: 'Automática (Gemini + respaldo)', cloud: 'Siempre Gemini', local: 'Siempre esta computadora' },
    sys: (y, up) => `Encendido hace ${up} · CPU ${y.cpuPct} % · memoria ${y.rssMB} MB · event loop ${y.loopLagMs.p99} ms (p99)`,
    audioNone: 'Sin audio', copied: 'Copiado',
  },
  en: {
    title: (v) => `${v} · Production`,
    lockOn: 'Event mode is on', lockOnSub: 'Setup locked', lockOff: 'Event mode', lockOffSub: 'Lock the setup during the event',
    lockedBar: 'Event mode is on: the setup is locked so nothing gets deleted or changed by accident.', unlock: 'Unlock',
    lockAsk: 'Turn on Event mode?', lockAskBody: 'Nobody will be able to delete or change rooms, the agenda, the glossary or the event name until you turn it off. These keep working: starting the next talk, renaming the current talk, reconnecting a room and switching the AI.', lockAskOk: 'Turn on Event mode',
    unlockAsk: 'Unlock the setup?', unlockAskBody: 'You’ll be able to change and delete rooms, the agenda and the glossary. If the event is running, only do this if you know what you’re about to change: everything is recorded in History and can be undone.', unlockAskOk: 'Unlock',
    lockedToast: 'Event mode is on: unlock it in Settings to change the setup.',
    undo: 'Undo', undone: 'Undone', restore: 'Restore', saved: 'Saved.', done: 'Done.',
    delAsk: (n) => `Delete “${n}”?`, delAskBody: 'The room goes to the trash: you can restore it exactly as it was from Rooms or History. Its transcripts are kept.', delOk: 'Delete room',
    deleted: (n) => `“${n}” deleted.`, created: (n) => `“${n}” created.`, changedRoom: (n) => `“${n}” updated.`,
    restartAsk: (n) => `Reconnect the AI in “${n}”?`, restartAskBody: 'This room’s captions pause for a few seconds while it reconnects. Use it if the room seems stuck.', restartOk: 'Reconnect',
    nextTitle: (n) => `Next talk in “${n}”`, nextNote: 'The current talk’s transcript is kept and the new one starts fresh.', nextOk: 'Start the talk',
    renameTitle: (n) => `Rename the talk in “${n}”`, renameNote: 'Changes the current talk’s title on screens, in the transcript and in downloads.', renameOk: 'Save',
    over: (m, t) => `${m} min over · “${t}” is due`, startDue: (t) => `Start “${t}”`, next: (t, h) => `Next: ${t} · ${h}`, noTalk: 'No talk announced',
    aiAsk: 'Switch the captions AI?', aiAskBody: (l) => `Every room switches to: ${l}. Captions pause for a few seconds in each room while they reconnect.`, aiOk: 'Switch the AI',
    aiDesc: (f) => (f.mode === 'auto' ? 'Gemini in the cloud, and this computer takes over if the internet goes down.' : f.mode === 'local' ? 'Always this computer: Whisper and a local model.' : 'Always Gemini in the cloud.') + (f.localReady ? ' The local backup is ready.' : ' The local backup isn’t running (npm run local -- --fallback).'),
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
      none: 'Nothing connected yet. Choose above where to show the captions.',
      orig: 'Original (what is spoken)', waiting: 'waiting for captions', sent: (n, a) => `✓ ${n} sent · ${a} ago`, failed: (e) => `✗ ${e}`,
      deleted: 'room deleted', test: 'Test', remove: 'Remove', tested: 'Sent a test line.', removed: 'Disconnected.',
      connected: (n) => `${n} connected.`, secret: (k) => `Keep this secret to verify the requests (it isn't shown again):\n\n${k}`,
    },
    txDelete: (n) => `Delete the transcript “${n}” for good? This can’t be undone.`,
    wizardLocked: 'Turn off Event mode to use the setup wizard: it can change rooms and languages.',
    noTalks: 'No transcripts in this room yet.', read: 'Read', segs: (n) => `${n} lines`,
    k: {
      'room.create': (c) => (c.undoes ? `Room “${c.after?.name}” restored` : `Room “${c.after?.name}” created`),
      'room.update': (c) => `Room “${c.after?.name}” ${c.undoes ? 'put back as it was' : 'changed'}${roomDiff(c, 'en')}`,
      'room.delete': (c) => `Room “${c.before?.name}” deleted`,
      'agenda.set': (c) => (c.undoes ? `Agenda put back (${c.after?.count ?? 0} talks)` : `Agenda replaced (${c.before?.count ?? 0} → ${c.after?.count ?? 0} talks)`),
      'glossary.set': (c) => (c.undoes ? 'Glossary put back' : `Glossary saved (${c.after?.terms ?? 0} terms, ${c.after?.corrections ?? 0} corrections)`),
      'event.rename': (c) => `Event renamed to “${c.after}”`,
      'engine.mode': (c) => `AI: ${aiLabel(c.after)}`,
      'event.lock': (c) => (c.after ? 'Event mode turned on' : 'Event mode turned off'),
    },
    fields: { name: 'name', source: 'talk language', targets: 'languages', translation: 'translation mode', pull: 'audio source', loop: 'loop' },
    ai: { auto: 'Automatic (Gemini + backup)', cloud: 'Always Gemini', local: 'Always this computer' },
    sys: (y, up) => `Up for ${up} · CPU ${y.cpuPct}% · memory ${y.rssMB} MB · event loop ${y.loopLagMs.p99} ms (p99)`,
    audioNone: 'No audio', copied: 'Copied',
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
    else if (m.type === 'log') { logs.push(m); if (logs.length > 400) logs.shift(); renderLogs(); }
    else if (m.type === 'logs') { logs.splice(0, logs.length, ...m.logs); renderLogs(); }
    else if (m.type === 'history') { refreshSchedule(); if (view === 'history') loadHistory(); }
  },
  close(e) { if (e.code === 4001) askToken(); },
});

// ---------- toasts and confirmations ----------
function toast(msg, { undo = null, error = false, ms = 7000 } = {}) {
  const el = document.createElement('div');
  el.className = `note${error ? ' err' : ''}`;
  el.innerHTML = `<span>${esc(msg)}</span>${undo ? `<button type="button">${esc(t.undo)}</button>` : ''}`;
  if (undo) el.querySelector('button').onclick = async () => { el.remove(); await undoChange(undo); };
  $('toasts').append(el);
  setTimeout(() => el.remove(), ms);
}
/** A real dialog instead of window.confirm: says what will happen, with a clearly labelled button. */
function confirmDialog({ title, body, ok, danger = false }) {
  $('cf-title').textContent = title;
  $('cf-body').innerHTML = `<p>${esc(body)}</p>`;
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
  for (const b of [$('lockbtn'), $('lock2')]) {
    b.classList.toggle('on', on);
    b.dataset.state = on ? 'on' : 'off';
  }
  $('lockbtn').innerHTML = `${icon('lock')}<span><b>${esc(on ? t.lockOn : t.lockOff)}</b><small>${esc(on ? t.lockOnSub : t.lockOffSub)}</small></span>`;
  $('lock2').innerHTML = `${icon('lock')} ${esc(on ? t.unlock : t.lockAskOk)}`;
  $('lock2').className = on ? '' : 'primary';
  const showBar = on && ['rooms', 'agenda', 'glossary', 'settings', 'history'].includes(view);
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
$('lockbtn').onclick = toggleLock;
$('lock2').onclick = toggleLock;

// ---------- views ----------
function go() {
  const h = location.hash.slice(1).split('?')[0];
  view = VIEWS.includes(h) ? h : 'live';
  for (const s of document.querySelectorAll('.view')) s.classList.toggle('on', s.dataset.view === view);
  for (const a of document.querySelectorAll('#nav a')) a.classList.toggle('on', a.dataset.view === view);
  const link = document.querySelector(`#nav a[data-view="${view}"]`);
  $('view-title').textContent = [...link.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim(); // not the alert badge
  setLocked(locked);
  refreshView();
  window.scrollTo(0, 0);
}
function refreshView() {
  if (view === 'rooms') loadRooms();
  else if (view === 'agenda') loadAgenda();
  else if (view === 'glossary') loadGlossary();
  else if (view === 'screens') loadScreens();
  else if (view === 'integrations') loadIntegrations();
  else if (view === 'transcripts') loadTranscripts();
  else if (view === 'history') loadHistory();
  else if (view === 'settings') loadSettings();
}
addEventListener('hashchange', go);

const fmtDur = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h ${m}m` : `${m}m ${s % 60}s`; };
const ago = (ms) => { if (!ms) return '—'; const s = Math.round((Date.now() - ms) / 1000); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : `${Math.floor(s / 3600)}h`; };
const sec = (ms) => (ms == null ? '—' : (ms / 1000).toFixed(1) + 's');
const hm = (ms) => new Date(ms).toLocaleTimeString(LANG, { hour: '2-digit', minute: '2-digit' });
const when = (ms) => new Date(ms).toLocaleString(LANG, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
const langsOf = (st) => `${st.source === 'auto' || !st.source ? 'auto' : st.source} → ${(st.targets || []).filter((x) => x !== st.source).join(', ') || '—'}`;
const stateChip = (s) => {
  if (!s.ingest) return `<span class="chip">${esc(tr('SIN INGESTA'))}</span>`;
  if (s.engines.length && !s.gated) return `<span class="chip bad"><span class="dot live"></span> ${esc(tr('EN VIVO'))}</span>`;
  if (s.engines.length) return `<span class="chip warn">${esc(tr('EN PAUSA · silencio'))}</span>`;
  return `<span class="chip">${esc(tr('ESPERANDO VOZ'))}</span>`;
};
const engChip = (e) => {
  const cls = e.state === 'live' ? 'ok' : e.state === 'reconnecting' || e.state === 'resuming' || e.state === 'connecting' ? 'warn' : e.state === 'idle' ? '' : 'bad';
  return `<span class="chip ${cls}" title="${esc(e.lastError || '')}">${esc(e.target)} · ${esc(e.state)}${e.reconnects ? ` · ${e.reconnects}×` : ''}</span>`;
};
const alertText = (a) => tr(({ 'no-audio': 'no llega audio', 'muted?': '¿mic muteado? (60s sin señal)', reconnecting: 'reconectando IA', 'high-latency': 'latencia alta', 'mt-throttled': 'traducción limitada por cuota → usando Live' })[a] || a);

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
    engineLocal: 'Motor de IA local', engineGemini: 'Conectar Gemini', ready: (m) => `listo · ${m}`,
    noKey: '<a href="#settings">pegá tu API key en Ajustes</a> (unos dos minutos), o corré la IA en esta computadora con <code>npm run local</code>. Mientras tanto, los subtítulos son simulados.',
    address: 'Dirección pública para los celulares', addressD: (u) => (u ? esc(u) : '<a href="#settings">creala en Ajustes</a> para que los celulares abran los subtítulos desde cualquier red (opcional si comparten el Wi-Fi)'),
    rooms: 'Crear las salas', roomsD: (n) => `${n} ${n === 1 ? 'sala' : 'salas'} · <a href="#rooms">ver salas</a>`,
    audio: 'Conectar el audio de cada sala', audioD: (a, n) => `${a} de ${n} con audio · agente, navegador o stream (<a href="https://github.com/carraroesteban/opencaptions/blob/main/docs/operations/runbook.md" target="_blank">cómo</a>)`,
    agenda: 'Cargar la agenda', agendaD: (n) => (n ? `${n} ${n === 1 ? 'charla cargada' : 'charlas cargadas'}` : '<a href="#agenda">pegar la agenda</a> para que las charlas tomen su título (opcional)'),
    kit: 'Imprimir los QR de cada sala', kitD: '<a href="/kit.html" target="_blank" data-ob="kit">abrir el kit de QR</a>',
    sound: 'Prueba de sonido en cada sala', soundD: '<a href="/demo.html?mode=mic" target="_blank" data-ob="sound">abrir la prueba de sonido</a>',
    lock: 'Activar el modo evento al abrir las puertas', lockD: '<a href="#settings">en Ajustes</a>: bloquea la configuración durante el evento',
  },
  en: {
    localNoAsr: (u) => `the speech server isn't responding (<code>${u}</code>): run <code>npm run local</code>`,
    localLlmOff: (m) => `transcription only, no translations or summaries · ${m}`,
    localNoLlm: (u) => `the translation model isn't responding (<code>${u}</code>): run <code>npm run local</code> or open Ollama`,
    localMissing: (m) => `model <code>${m}</code> is missing: <code>ollama pull ${m}</code>`,
    localReady: (m) => `ready · ${m} · audio never leaves this computer`,
    engineLocal: 'Local AI engine', engineGemini: 'Connect Gemini', ready: (m) => `ready · ${m}`,
    noKey: '<a href="#settings">paste your API key in Settings</a> (about two minutes), or run the AI on this computer with <code>npm run local</code>. Until then, captions are simulated.',
    address: 'A public address for phones', addressD: (u) => (u ? esc(u) : '<a href="#settings">create one in Settings</a> so phones can open the captions from any network (optional on a shared Wi-Fi)'),
    rooms: 'Create your rooms', roomsD: (n) => `${n} ${n === 1 ? 'room' : 'rooms'} · <a href="#rooms">see rooms</a>`,
    audio: 'Connect each room’s audio', audioD: (a, n) => `${a} of ${n} with audio · agent, browser or stream (<a href="https://github.com/carraroesteban/opencaptions/blob/main/docs/operations/runbook.md" target="_blank">how</a>)`,
    agenda: 'Load the agenda', agendaD: (n) => (n ? `${n} ${n === 1 ? 'talk' : 'talks'} loaded` : '<a href="#agenda">paste your agenda</a> so talks get their titles (optional)'),
    kit: 'Print each room’s QR code', kitD: '<a href="/kit.html" target="_blank" data-ob="kit">open the QR kit</a>',
    sound: 'Sound check in every room', soundD: '<a href="/demo.html?mode=mic" target="_blank" data-ob="sound">open the sound check</a>',
    lock: 'Turn on Event mode when doors open', lockD: '<a href="#settings">in Settings</a>: locks the setup during the event',
  },
};
const ob = OB[LANG] || OB.en;
function localDetail(s) {
  const l = s.local || {};
  if (l.asr === false) return ob.localNoAsr(esc(l.asrUrl || ''));
  if (l.llmOff) return ob.localLlmOff(esc(s.model));
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
    [withAudio === s.stages.length && s.stages.length > 0, ob.audio, ob.audioD(withAudio, s.stages.length)],
    [scheduleCount > 0, ob.agenda, ob.agendaD(scheduleCount)],
    [store.get('admin.kitDone', false), ob.kit, ob.kitD],
    [store.get('admin.soundDone', false), ob.sound, ob.soundD],
    [s.locked, ob.lock, ob.lockD],
  ];
  $('ob-steps').innerHTML = steps.map(([ok, title, detail]) => `<li class="${ok ? 'done' : ''}"><span class="ck${ok ? ' on' : ''}" role="img" aria-label="${ok ? '✓' : '·'}"></span><span><b>${title}</b> <span class="muted">— ${detail}</span></span></li>`).join('');
  $('onboard').classList.toggle('hidden', steps.every(([ok]) => ok));
}
$('ob-steps').onclick = (e) => {
  const a = e.target.closest('[data-ob]');
  if (a?.dataset.ob === 'kit') store.set('admin.kitDone', true);
  if (a?.dataset.ob === 'sound') store.set('admin.soundDone', true);
};
$('ob-hide').onclick = () => { store.set('admin.obHidden', true); $('onboard').classList.add('hidden'); };

// ---------- offline backup banner ----------
function renderNet(f) {
  $('ai-setting').classList.toggle('hidden', !f);
  if (!f) return $('netbar').classList.add('hidden');
  if (document.activeElement !== $('ai-mode')) $('ai-mode').value = f.mode;
  $('ai-mode').querySelector('[value=local]').disabled = !f.localReady;
  $('ai-desc').textContent = t.aiDesc(f);
  let html = '';
  let bad = false;
  if (f.active === 'local') {
    html = `${icon('offline')}<div><b>${esc(tr(f.mode === 'local' ? 'Usando la IA de esta computadora' : 'Sin internet: los subtítulos siguen funcionando'))}</b><p>${esc(tr(f.mode === 'auto' ? 'La IA de esta computadora genera los subtítulos. Vuelven a Gemini solos cuando la conexión se estabilice.' : 'Elegido desde el panel. Para volver a Gemini, cambiá el selector de IA.'))}</p></div>`;
  } else if (f.online === false) {
    bad = !f.localReady;
    html = `${icon('offline')}<div><b>${esc(tr('Sin conexión con Gemini'))}</b><p>${esc(tr(f.localReady ? (f.mode === 'auto' ? 'Si no vuelve en unos segundos, los subtítulos pasan a esta computadora.' : 'Hay un respaldo listo en esta computadora: elegí «IA automática» o «Siempre esta computadora».') : 'No hay respaldo local. La próxima vez iniciá con: npm run local -- --fallback'))}</p></div>`;
  }
  $('netbar').classList.toggle('hidden', !html);
  $('netbar').classList.toggle('bad', bad);
  if (html && $('netbar').dataset.html !== html) { $('netbar').innerHTML = html; $('netbar').dataset.html = html; }
}
$('ai-mode').onchange = async (e) => {
  const mode = e.target.value;
  const ok = await confirmDialog({ title: t.aiAsk, body: t.aiAskBody(aiLabel(mode)), ok: t.aiOk });
  if (!ok) { e.target.value = last?.failover?.mode || 'auto'; return; }
  try { const r = await api('POST', '/api/engine', { mode }); if (r.change) toast(t.saved, { undo: r.change }); } catch { e.target.value = last?.failover?.mode || 'auto'; }
};

// ---------- Live ----------
function render(s) {
  last = s;
  if (s.locked !== locked) setLocked(!!s.locked);
  $('event').textContent = s.event;
  document.title = t.title(s.event);
  renderOnboard(s);
  $('engine').textContent = s.engine === 'gemini' ? `Gemini · ${s.model}` : s.engine === 'local' ? `Local · ${s.model}` : tr('Modo simulado (sin API key)');
  $('engine').className = 'chip ' + (s.engine === 'mock' ? 'warn' : s.engine === 'local' && !localOk(s.local) ? 'bad' : 'ok');
  $('engine').title = s.engine === 'mock' ? tr('Conectar Gemini en Ajustes') : '';
  $('engine').style.cursor = s.engine === 'mock' ? 'pointer' : '';
  renderNet(s.failover);
  $('k-live').textContent = `${s.totals.live}/${s.totals.stages}`;
  $('k-sessions').textContent = s.totals.sessions;
  $('k-viewers').textContent = s.totals.viewers;
  $('k-cost').textContent = `US$ ${s.totals.costUsd.toFixed(2)}`;
  if (s.system && view === 'settings') $('sys').textContent = t.sys(s.system, fmtDur(s.uptimeSec));
  if (view === 'settings' && settingsSetup) { settingsSetup = { ...settingsSetup, tunnel: s.tunnel, ai: s.ai, engine: s.engine }; keyP.update(settingsSetup); tunnelP.update(settingsSetup); }
  const alerts = s.stages.filter((x) => x.alerts.some((a) => a !== 'no-ingest') || x.dueTalk).length;
  const navLive = document.querySelector('#nav a[data-view="live"]');
  navLive.querySelector('.n')?.remove();
  if (alerts) navLive.insertAdjacentHTML('beforeend', `<span class="n">${alerts}</span>`);
  renderGrid(s);
  renderMini(s);
}

function renderGrid(s) {
  const grid = $('grid');
  const ids = new Set(s.stages.map((x) => x.id));
  for (const el of [...grid.children]) if (el.dataset.id && !ids.has(el.dataset.id)) el.remove();
  if (!s.stages.length && !grid.querySelector('.empty-rooms')) grid.innerHTML = `<div class="empty-rooms"><img src="/art/waiting.webp" alt="" /><h3>${esc(tr('Todavía no hay salas'))}</h3><p class="muted u-m0">${esc(tr('Creá una sala por cada escenario o aula: cada una tiene su QR, su pantalla y su overlay.'))}</p><a href="#rooms"><button class="primary" tabindex="-1">${icon('plus')}${esc(tr('Nueva sala'))}</button></a></div>`;
  if (s.stages.length) grid.querySelector('.empty-rooms')?.remove();
  for (const st of s.stages) {
    let el = grid.querySelector(`[data-id="${st.id}"]`);
    if (!el) {
      el = document.createElement('article');
      el.className = 'card stage';
      el.dataset.id = st.id;
      el.innerHTML = `
        <div class="top"><h3 data-no-i18n></h3><span data-f="state"></span></div>
        <div class="talkline" data-f="talkline" data-no-i18n></div>
        <div class="next" data-f="next" data-no-i18n></div>
        <div class="meter"><i data-f="lvl"></i><b data-f="pk"></b></div>
        <div class="said" data-f="said" data-no-i18n></div>
        <div class="speakers" data-f="speakers" data-no-i18n></div>
        <div class="stats" data-f="stats"></div>
        <div class="row" data-f="alerts"></div>
        <div class="actions">
          <button data-a="due" class="primary hidden"></button>
          <button data-a="screens">${icon('qr')}Pantallas y QR</button>
          <button data-a="next">${icon('next')}Siguiente charla</button>
          <button data-a="details" class="more" aria-expanded="false"><span>Ver detalles</span>${icon('chevron')}</button>
        </div>
        <div class="details">
          <div class="sub" data-f="sub" data-no-i18n></div>
          <div class="sub" data-f="ingest"></div>
          <div class="row" data-f="engines" data-no-i18n></div>
          <div class="metrics" data-f="metrics"></div>
          <div class="preview" data-f="preview" data-no-i18n></div>
          <div class="actions">
            <button data-a="rename">${icon('doc')}Renombrar charla</button>
            <button data-a="export">${icon('download')}Transcripciones</button>
            <button data-a="restart">${icon('refresh')}Reconectar IA</button>
          </div>
        </div>`;
      grid.append(el);
      if (![...$('logfilter').options].some((o) => o.value === st.id)) $('logfilter').append(new Option(st.name, st.id));
    }
    const f = (k) => el.querySelector(`[data-f="${k}"]`);
    el.querySelector('h3').textContent = st.name;
    f('talkline').textContent = st.talk.title || t.noTalk;
    f('talkline').classList.toggle('none', !st.talk.title);
    const due = st.dueTalk;
    el.classList.toggle('over', !!due);
    f('next').classList.toggle('over', !!due);
    f('next').textContent = due ? t.over(Math.max(1, Math.round((Date.now() - due.start) / 60000)), due.title) : st.nextTalk ? t.next(st.nextTalk.title, hm(st.nextTalk.start)) : '';
    // Who's speaking: a tap labels the captions from now on (phones, transcripts, exports).
    const choices = [...new Set([...st.speakers, SPK.host, SPK.qa, ...(st.speaker && !st.speakers.includes(st.speaker) && ![SPK.host, SPK.qa].includes(st.speaker) ? [st.speaker] : [])])];
    const spkKey = JSON.stringify([choices, st.speaker]);
    if (f('speakers').dataset.key !== spkKey) {
      f('speakers').dataset.key = spkKey;
      f('speakers').innerHTML = `<span>${esc(SPK.label)}</span>${choices.map((n) => `<button type="button" class="pill" data-spk="${esc(n)}" aria-pressed="${n === st.speaker}">${esc(n)}</button>`).join('')}<button type="button" class="pill" data-spk-other>${esc(SPK.other)}</button>${st.speaker ? `<button type="button" class="pill" data-spk="" aria-pressed="false">${esc(SPK.none)}</button>` : ''}`;
    }
    const dueBtn = el.querySelector('[data-a="due"]');
    dueBtn.classList.toggle('hidden', !due);
    if (due) dueBtn.textContent = t.startDue(due.title.length > 28 ? due.title.slice(0, 27) + '…' : due.title);
    f('said').textContent = (st.preview.orig ?? Object.values(st.preview)[0] ?? '').slice(-220);
    const lat = Math.max(st.latency.asr || 0, ...Object.values(st.latency.tr).filter((v) => v != null));
    f('stats').innerHTML = `<span title="${esc(tr('Público'))}">${icon('eye')}<b>${st.viewers}</b></span><span title="${esc(tr('Latencia'))}">${icon('clock')}<b>${lat ? sec(lat) : '—'}</b></span><span title="${esc(tr('Costo estimado'))}">${icon('coin')}<b>US$ ${st.costUsd.toFixed(2)}</b></span>`;
    el.classList.toggle('alert', st.alerts.some((a) => a !== 'no-ingest'));
    f('state').innerHTML = stateChip(st);
    f('sub').innerHTML = `<code>${esc(st.id)}</code> · <span class="chip">${esc(st.mode)}</span> · ${esc(st.source === 'auto' ? `auto${st.detectedLang ? ` (${st.detectedLang})` : ''}` : st.source)} → ${esc(st.targets.filter((x) => x !== st.source).join(', ') || '—')}`;
    const db = 20 * Math.log10(st.level || 1e-6), pct = Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
    const pk = Math.max(0, Math.min(100, ((20 * Math.log10(st.peak || 1e-6) + 60) / 60) * 100));
    f('lvl').style.width = pct + '%';
    f('pk').style.left = pk + '%';
    f('ingest').textContent = st.ingest ? `${st.ingest.kind}${st.ingest.label ? ` · ${st.ingest.label}` : ''} · ${tr('hace')} ${ago(st.ingest.since)}` : st.pull ? `pull: ${st.pull}` : tr('Sin fuente de audio. Abrí /ingest.html en la PC del escenario.');
    f('engines').innerHTML = st.engines.length ? st.engines.map(engChip).join('') : `<span class="chip">${esc(tr('sesiones cerradas (0 costo)'))}</span>`;
    const trs = Object.entries(st.latency.tr).map(([k, v]) => `${k} ${sec(v)}`).join(' · ');
    f('metrics').innerHTML = `
      <div>${esc(tr('Latencia orig.'))}<b>${sec(st.latency.asr)}</b></div>
      <div title="${esc(trs)}">${esc(tr('Latencia trad.'))}<b>${sec(Math.max(0, ...Object.values(st.latency.tr).filter((v) => v != null)) || null)}</b></div>
      <div>${esc(tr('Público'))}<b>${st.viewers}</b></div>
      <div>Min · US$<b>${st.audioMinIn} · ${st.costUsd.toFixed(2)}</b></div>`;
    f('preview').innerHTML = Object.entries(st.preview).map(([ch, txt]) => `<div><span class="l">${esc(ch)}</span> ${esc(txt ? (txt.length > 80 ? '…' + txt.slice(-80) : txt) : '…')}</div>`).join('');
    f('alerts').innerHTML = st.alerts.filter((a) => a !== 'no-ingest').map((a) => `<span class="chip bad">${esc(alertText(a))}</span>`).join('');
  }
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
    b.querySelector('span').textContent = tr(open ? 'Ocultar detalles' : 'Ver detalles');
  } else if (a === 'screens') {
    screensRoom = id;
    location.hash = '#screens';
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
  } else if (a === 'restart') {
    if (await confirmDialog({ title: t.restartAsk(st.name), body: t.restartAskBody, ok: t.restartOk })) { await api('POST', `/api/stages/${id}/restart`); toast(t.done, { ms: 3000 }); }
  } else if (a === 'export') openExport(st);
};
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
    location.hash = '#live';
    $('grid').querySelector(`[data-id="${CSS.escape(r.dataset.id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
    const txt = st.dueTalk ? t.over(Math.max(1, Math.round((Date.now() - st.dueTalk.start) / 60000)), st.dueTalk.title) : alerts.length ? alerts.map(alertText).join(' · ') : !st.ingest ? tr('SIN INGESTA') : said || '…';
    return `<div class="r${alerts.length ? ' bad' : ''}" data-id="${esc(st.id)}"><span class="d ${dot}"></span><span class="n">${esc(st.name)}</span><span class="v">${icon('eye')} ${st.viewers}</span><span class="t">${esc(txt.length > 90 ? '…' + txt.slice(-90) : txt)}</span></div>`;
  }).join('');
}

// ---------- Rooms ----------
let hist = { changes: [], trash: [] };
async function loadRooms() {
  ev = await (await fetch('/api/event')).json();
  const status = last || (await api('GET', '/api/status'));
  const byId = Object.fromEntries(status.stages.map((x) => [x.id, x]));
  $('rooms-body').innerHTML = ev.stages.map((st) => {
    const s = byId[st.id] || {};
    const audio = s.ingest ? `${s.ingest.kind}${s.ingest.label ? ` · ${s.ingest.label}` : ''}` : s.pull ? 'pull' : t.audioNone;
    return `<tr data-id="${esc(st.id)}"><td><b>${esc(st.name)}</b><div class="muted-note"><code>${esc(st.id)}</code>${st.title ? ` · ${esc(st.title)}` : ''}</div></td>
      <td class="hide-sm">${esc(langsOf({ source: st.source, targets: st.languages.filter((l) => l !== 'orig') }))}</td>
      <td class="hide-sm">${esc(audio)}</td>
      <td class="r"><button data-room="edit" data-setup>${icon('gear')} ${esc(tr('Editar'))}</button> <button data-room="delete" class="danger" data-setup>${esc(tr('Eliminar'))}</button></td></tr>`;
  }).join('') || `<tr><td colspan="4" class="empty">${esc(tr('Todavía no hay salas'))}</td></tr>`;
  hist = await api('GET', '/api/history', null, { quiet: true }).catch(() => ({ changes: [], trash: [] }));
  $('trash-box').classList.toggle('hidden', !hist.trash.length);
  $('trash-list').innerHTML = `<table class="table">${hist.trash.map((x) => `<tr><td><b>${esc(x.room.name)}</b><div class="muted-note"><code>${esc(x.room.id)}</code> · ${esc(when(x.at))}</div></td><td class="r"><button data-restore="${x.id}" data-setup>${icon('refresh')} ${esc(t.restore)}</button></td></tr>`).join('')}</table>`;
  setLocked(locked);
}
$('rooms-body').onclick = async (e) => {
  const b = e.target.closest('[data-room]');
  if (!b) return;
  const id = b.closest('[data-id]').dataset.id;
  const st = ev.stages.find((x) => x.id === id);
  if (b.dataset.room === 'edit') return openEdit(id);
  if (await confirmDialog({ title: t.delAsk(st.name), body: t.delAskBody, ok: t.delOk, danger: true })) {
    const r = await api('DELETE', `/api/stages/${encodeURIComponent(id)}`);
    toast(t.deleted(st.name), { undo: r.change });
    loadRooms();
  }
};
$('trash-list').onclick = async (e) => {
  const b = e.target.closest('[data-restore]');
  if (b) await undoChange(Number(b.dataset.restore));
};

let editing = null;
const fe = $('f-edit');
for (const [code, name] of Object.entries(ev.languages)) fe.source.append(new Option(`${name} (${code})`, code));
async function openEdit(id) {
  const st = id ? (await api('GET', '/api/status')).stages.find((x) => x.id === id) : null;
  editing = st;
  $('edit-title').textContent = st ? `${tr('Editar')} · ${st.name}` : tr('Nueva sala');
  fe.id.value = st?.id || '';
  fe.id.disabled = !!st;
  fe.name.value = st?.name || '';
  fe.source.value = st?.source || 'auto';
  fe.pull.value = st?.pull || '';
  fe.loop.checked = !!st?.loop;
  fe.translation.value = st?.translationDef || '';
  $('edit-targets').innerHTML = Object.entries(ev.languages).map(([c, n]) => `<label class="row"><input type="checkbox" value="${c}" ${(st?.targets || ['es', 'en']).includes(c) ? 'checked' : ''}/> ${esc(n)}</label>`).join('');
  $('dlg-edit').showModal();
}
$('add').onclick = () => openEdit(null);
$('dlg-edit').addEventListener('close', async () => {
  if ($('dlg-edit').returnValue !== 'ok') return;
  const body = {
    name: fe.name.value, source: fe.source.value, translation: fe.translation.value || '', pull: fe.pull.value.trim(), loop: fe.loop.checked,
    targets: [...$('edit-targets').querySelectorAll('input:checked')].map((i) => i.value),
  };
  const r = editing ? await api('PATCH', `/api/stages/${editing.id}`, body) : await api('POST', '/api/stages', { id: fe.id.value, ...body });
  if (r.change) toast(editing ? t.changedRoom(body.name) : t.created(body.name), { undo: r.change });
  ev = await (await fetch('/api/event')).json();
  loadRooms();
});

// ---------- Agenda ----------
async function loadAgenda() {
  const list = await (await fetch('/api/schedule')).json();
  scheduleCount = list.length;
  const names = Object.fromEntries(ev.stages.map((x) => [x.id, x.name]));
  const byRoom = {};
  for (const e of list) (byRoom[e.stage] ||= []).push(e);
  $('agenda-current').innerHTML = list.length
    ? Object.entries(byRoom).map(([room, es]) => `<section class="card flush"><table class="table"><thead><tr><th colspan="3">${esc(names[room] || room)}</th></tr></thead><tbody>${es.map((e) => `<tr><td class="u-w120">${esc(when(e.start))}</td><td><b>${esc(e.title)}</b></td><td class="hide-sm muted-note">${esc(e.speaker || '')}</td></tr>`).join('')}</tbody></table></section>`).join('')
    : `<p class="muted-note">${esc(t.agendaNone)}</p>`;
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

// ---------- Integrations: captions into Zoom, YouTube Live, Teams; webhooks (src/integrations.js) ----------
let conns = [];
async function loadIntegrations() {
  conns = (await api('GET', '/api/integrations')).connectors;
  const names = Object.fromEntries(ev.stages.map((x) => [x.id, x.name]));
  const langName = (l) => (l === 'orig' ? t.conn.orig : langLabel(l, ev.languages));
  const status = (s) => (s.state === 'error' ? `<span class="chip bad">${esc(t.conn.failed(s.lastError || '?'))}</span>` : s.sent ? `<span class="chip ok">${esc(t.conn.sent(s.sent, ago(s.lastAt)))}</span>` : `<span class="chip">${esc(t.conn.waiting)}</span>`);
  $('conn-list').innerHTML = conns.length
    ? `<table class="table">${conns.map((c) => `<tr><td><b>${esc(t.conn.names[c.type])}</b><div class="muted-note">${esc(names[c.stage] || `${c.stage} · ${t.conn.deleted}`)} · ${esc(langName(c.lang))}</div><div class="muted-note hide-sm"><code>${esc(c.link)}</code></div></td>
      <td>${status(c.status)}</td>
      <td class="r"><button data-conn-test="${esc(c.id)}">${esc(t.conn.test)}</button> <button class="danger" data-conn-del="${esc(c.id)}">${esc(t.conn.remove)}</button></td></tr>`).join('')}</table>`
    : `<p class="empty">${esc(t.conn.none)}</p>`;
}
setInterval(() => { if (view === 'integrations' && !$('dlg-conn').open) loadIntegrations().catch(() => {}); }, 3000);
$('conn-list').onclick = async (e) => {
  const test = e.target.closest('[data-conn-test]')?.dataset.connTest, del = e.target.closest('[data-conn-del]')?.dataset.connDel;
  if (test) { await api('POST', `/api/integrations/${test}/test`); toast(t.conn.tested); setTimeout(loadIntegrations, 1500); }
  if (del) { await api('DELETE', `/api/integrations/${del}`); toast(t.conn.removed); loadIntegrations(); }
};
let connType = '';
const fc = $('f-conn');
function connLangs() {
  const st = ev.stages.find((x) => x.id === fc.stage.value);
  fc.lang.innerHTML = (st?.languages || ['orig']).map((l) => `<option value="${esc(l)}">${esc(l === 'orig' ? t.conn.orig : langLabel(l, ev.languages))}</option>`).join('');
}
fc.stage.onchange = connLangs;
document.querySelector('section.view[data-view="integrations"]').addEventListener('click', (e) => {
  const type = e.target.closest('[data-connect]')?.dataset.connect;
  if (!type) return;
  connType = type;
  $('conn-title').textContent = t.conn.titles[type];
  $('conn-help').textContent = t.conn.help[type];
  fc.stage.innerHTML = ev.stages.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');
  connLangs();
  fc.url.value = '';
  fc.url.placeholder = { zoom: 'https://wmcapi.zoom.us/closedcaption?id=…', youtube: 'http://upload.youtube.com/closedcaption?cid=…', teams: 'https://api.captions.office.microsoft.com/cartcaption?meetingid=…', webhook: 'https://…' }[type];
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
    if (c.secret) alert(t.conn.secret(c.secret));
    loadIntegrations();
  } catch (err) { $('conn-err').textContent = tr(err.message); }
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
  $('terms').innerHTML = gloss.vocabulary.map((v, i) => `<span class="chip">${esc(v)}<button type="button" data-term="${i}" data-setup aria-label="${esc(tr('Quitar'))}">×</button></span>`).join('');
  const langs = [['', t.anyLang], ...Object.entries(ev.languages), ['orig', 'Original']];
  $('reps').innerHTML = gloss.replacements.map((r, i) => `<tr data-i="${i}"><td><input data-k="from" value="${esc(r.from)}" data-setup /></td><td><input data-k="to" value="${esc(r.to)}" data-setup /></td>
    <td class="hide-sm"><select data-k="lang" data-setup>${langs.map(([k, n]) => `<option value="${esc(k)}" ${(r.lang || '') === k ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></td>
    <td class="r"><button type="button" data-rep="${i}" data-setup aria-label="${esc(tr('Quitar'))}">×</button></td></tr>`).join('');
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

// ---------- Screens and QR ----------
const origin = () => ev.publicUrl || location.origin;
function copyRow(label, url) {
  return `<label class="field">${esc(label)}<div class="copy"><input readonly value="${esc(url)}" /><button type="button" data-copy="${esc(url)}">${esc(tr('Copiar'))}</button><a href="${esc(url)}" target="_blank"><button type="button" tabindex="-1">${esc(tr('Abrir'))}</button></a></div></label>`;
}
async function loadScreens() {
  ev = await (await fetch('/api/event')).json();
  const sel = $('screens-room');
  sel.innerHTML = ev.stages.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
  sel.value = screensRoom && ev.stages.some((s) => s.id === screensRoom) ? screensRoom : ev.stages[0]?.id || '';
  renderScreens();
}
function renderScreens() {
  const st = ev.stages.find((s) => s.id === $('screens-room').value);
  if (!st) { $('screens-links').innerHTML = ''; return; }
  screensRoom = st.id;
  const o = origin(), aud = `${o}/s/${st.id}`;
  const others = st.languages.filter((l) => l !== 'orig');
  $('screens-links').innerHTML = `
    <div class="qrrow"><img src="/api/qr.svg?text=${encodeURIComponent(aud)}" alt="QR" /><div class="u-stack8 u-minw0">${copyRow(tr('Público (celular, QR)'), aud)}<a href="/api/qr.svg?text=${encodeURIComponent(aud)}" download="qr-${st.id}.svg">${esc(tr('Descargar QR (SVG para imprimir)'))}</a></div></div>
    ${copyRow(tr('Pantalla del escenario / proyector'), `${o}/screen.html?stage=${st.id}&langs=${others[0] || 'orig'},orig`)}
    ${others.map((l) => copyRow(`${tr('Overlay vMix/OBS')} — ${langLabel(l, ev.languages)}`, `${o}/overlay.html?stage=${st.id}&lang=${l}`)).join('')}
    ${copyRow(tr('Overlay con fondo verde (chroma key)'), `${o}/overlay.html?stage=${st.id}&lang=${others[0] || 'orig'}&bg=%2300ff00&style=outline`)}
    ${copyRow(tr('Transcripción en vivo (leer, buscar, resumen IA)'), `${o}/talk.html?stage=${st.id}`)}
    ${copyRow(tr('Ingesta (abrir en la PC del escenario)'), `${o}/ingest.html?stage=${st.id}`)}`;
}
$('screens-room').onchange = renderScreens;
$('screens-links').addEventListener('click', (e) => {
  const b = e.target.closest('[data-copy]');
  if (b) navigator.clipboard.writeText(b.dataset.copy).then(() => toast(t.copied, { ms: 1500 }), () => {});
});

// ---------- Transcripts ----------
async function loadTranscripts() {
  ev = await (await fetch('/api/event')).json();
  const sel = $('tx-room');
  const cur = txRoom || sel.value;
  sel.innerHTML = ev.stages.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
  if (cur && ev.stages.some((s) => s.id === cur)) sel.value = cur;
  renderTranscripts();
}
async function renderTranscripts() {
  const st = ev.stages.find((s) => s.id === $('tx-room').value);
  if (!st) { $('tx-list').innerHTML = ''; return; }
  const talks = await api('GET', `/api/stages/${encodeURIComponent(st.id)}/talks`);
  $('tx-list').innerHTML = talks.length ? `<table class="table">${talks.map((x) => `<tr><td><b>${esc(x.title || tr('Sin título'))}</b><div class="muted-note">${esc(when(x.startedAt))} · ${esc(t.segs(x.segments))}</div></td>
    <td class="hide-sm">${st.languages.map((l) => `<div class="muted-note"><b>${esc(langLabel(l, ev.languages))}</b>: ${['srt', 'vtt', 'txt'].map((f) => `<a href="/api/stages/${st.id}/export.${f}?lang=${l}&talk=${encodeURIComponent(x.id)}">${f}</a>`).join(' · ')}</div>`).join('')}</td>
    <td class="r"><a href="/talk.html?stage=${encodeURIComponent(st.id)}&talk=${encodeURIComponent(x.id)}" target="_blank"><button tabindex="-1">${icon('doc')} ${esc(t.read)}</button></a>${isCrew ? '' : ` <button class="danger" data-tx-del="${esc(x.id)}" data-tx-title="${esc(x.title || '')}">${esc(tr('Eliminar'))}</button>`}</td></tr>`).join('')}</table>` : `<p class="empty">${esc(t.noTalks)}</p>`;
}
$('tx-list').onclick = async (e) => {
  const b = e.target.closest('[data-tx-del]');
  if (!b || !confirm(t.txDelete(b.dataset.txTitle || tr('Sin título')))) return;
  await api('DELETE', `/api/stages/${encodeURIComponent($('tx-room').value)}/talks/${encodeURIComponent(b.dataset.txDel)}`);
  renderTranscripts();
};
$('tx-room').onchange = () => { txRoom = $('tx-room').value; renderTranscripts(); };
function openExport(st) {
  txRoom = st.id;
  location.hash = '#transcripts';
}

// ---------- History ----------
const KIND_ICON = { 'room.create': 'plus', 'room.update': 'gear', 'room.delete': 'x', 'agenda.set': 'calendar', 'glossary.set': 'book', 'event.rename': 'doc', 'engine.mode': 'cloud', 'event.lock': 'lock' };
const UNDOABLE = new Set(['room.create', 'room.update', 'room.delete', 'agenda.set', 'glossary.set', 'event.rename', 'engine.mode']);
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
$('me').innerHTML = `${icon(isCrew ? 'headphones' : 'shield')}<span><b>${esc(me.label)}</b><small>${esc(isCrew ? (LANG === 'es' ? 'Equipo · controles en vivo' : 'Crew · live controls') : (LANG === 'es' ? 'Administración' : 'Admin'))}</small></span>${me.via === 'session' ? `<button type="button" id="signout">${esc(LANG === 'es' ? 'Salir' : 'Sign out')}</button>` : ''}`;
$('signout')?.addEventListener('click', signOut);
$('engine').onclick = () => { if (last?.engine === 'mock') location.hash = '#settings'; };
const quietApi = (m, u, b) => api(m, u, b, { quiet: true });
const askFirst = (msg) => { const i = msg.indexOf('?') + 1; return confirmDialog({ title: msg.slice(0, i) || msg, body: msg.slice(i).trim(), ok: LANG === 'es' ? 'Continuar' : 'Continue', danger: true }); };
const keyP = keyPanel($('key-panel'), { api: quietApi, confirm: askFirst });
const tunnelP = tunnelPanel($('tunnel-panel'), { api: quietApi, confirm: askFirst });
const accessP = isCrew ? null : accessPanel($('access-panel'), { api: quietApi, confirm: askFirst, toast, me });
const alertsP = isCrew ? null : alertsPanel($('alerts-panel'), { api: quietApi, toast });
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
}
$('name-form').onsubmit = async (e) => {
  e.preventDefault();
  const name = $('name-in').value.trim();
  if (!name) return;
  const r = await api('PUT', '/api/setup', { name });
  if (r.change) toast(t.renamed(name), { undo: r.change });
  ev = await (await fetch('/api/event')).json();
};
// Languages: event.json's are fixed here; the ones added from this page can be removed again.
function renderLanguages(s) {
  const added = s.addedLanguages || {};
  $('langs-list').innerHTML = Object.entries(s.languages).map(([c, n]) => `<span class="chip">${esc(n)} <code>${esc(c)}</code>${c in added ? `<button type="button" class="x" data-lang-del="${esc(c)}" data-setup aria-label="${esc(tr('Quitar'))} ${esc(n)}">×</button>` : ''}</span>`).join('');
  const free = Object.entries(LANGUAGE_CATALOG).filter(([c]) => !(c in s.languages)).sort((a, b) => a[1].localeCompare(b[1]));
  $('lang-add').innerHTML = free.map(([c, n]) => `<option value="${c}">${esc(n)} (${c})</option>`).join('');
  setLocked(locked);
}
async function saveLanguages(added) {
  try { await api('PUT', '/api/setup', { languages: added }); } catch { return; } // the toast says why
  ev = await (await fetch('/api/event')).json();
  await loadSettings();
}
$('lang-form').onsubmit = async (e) => {
  e.preventDefault();
  const c = $('lang-add').value;
  if (c) await saveLanguages({ ...settingsSetup.addedLanguages, [c]: LANGUAGE_CATALOG[c] });
};
$('langs-list').onclick = async (e) => {
  const c = e.target.closest('[data-lang-del]')?.dataset.langDel;
  if (!c) return;
  const rest = { ...settingsSetup.addedLanguages };
  delete rest[c];
  await saveLanguages(rest);
};
$('tx-access').onchange = async () => {
  try { await api('PUT', '/api/setup', { publicTranscripts: $('tx-access').value }); toast(tr('Guardado')); } catch { /* toast shown */ }
  await loadSettings();
};
$('wizard-link').onclick = (e) => { if (locked) { e.preventDefault(); toast(t.wizardLocked, { error: true }); } };

localize();
go();
