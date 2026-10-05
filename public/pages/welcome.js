// welcome.html: page script (kept out of the HTML so the Content-Security-Policy can forbid inline scripts).
import { esc } from '/common.js';
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
    gemini: 'Connected to Gemini', geminiD: 'Captions and translations come from Google’s Gemini, in the cloud. About 3 seconds behind the speaker.',
    local: 'Running on this computer', localD: 'Speech recognition and translation run here. The audio never leaves the building, and it works without internet.',
    mock: 'Demo mode: captions are simulated', mockD: 'Everything works so you can explore, but the words are made up. To caption real talks, pick one of these and restart:',
    mockGemini: 'Cloud (best quality): add a Gemini API key', mockLocal: 'On this computer, no account needed:',
    backupOn: 'Offline backup is ready', backupOnD: 'If the internet goes down, captions keep running on this computer and switch back when it returns.',
    backupOff: 'Optional: an offline backup', backupOffD: 'Start the server with this command and captions keep running on this computer if the venue loses internet:',
    k5: 'Step 7 of 7 · Sound', audioH: 'Connect the sound', audioP: 'OpenCaptions listens to each room’s audio. Pick whatever is easiest; you can try it right now.',
    mic: 'A microphone on this computer', micD: 'Open the room’s audio page in a browser next to the stage and allow the microphone.',
    mixer: 'The sound desk or a stream', mixerD: 'Send the mixer’s output, OBS, vMix or an RTMP/SRT stream. Ask your AV team, it takes a minute.',
    test: 'Just try it first', testD: 'Talk into your microphone and watch the captions appear.',
    k6: 'All set', doneH: 'You’re ready.', sEvent: 'Event', sRooms: 'Rooms', sLangs: 'Captions', sAI: 'AI',
    openDash: 'Open the dashboard', printQr: 'Print the QR codes', seeAudience: 'See what the audience sees', autoL: 'auto-detected',
    aiG: 'Gemini (cloud)', aiL: 'This computer', aiM: 'Demo mode', withBackup: ' + offline backup',
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
    gemini: 'Conectado a Gemini', geminiD: 'Los subtítulos y traducciones vienen de Gemini de Google, en la nube. Unos 3 segundos detrás de quien habla.',
    local: 'Funcionando en esta computadora', localD: 'El reconocimiento de voz y la traducción corren acá. El audio no sale del lugar y funciona sin internet.',
    mock: 'Modo demo: los subtítulos son simulados', mockD: 'Todo funciona para que lo recorras, pero las palabras son inventadas. Para subtitular charlas reales, elegí una opción y reiniciá:',
    mockGemini: 'En la nube (mejor calidad): agregá una API key de Gemini', mockLocal: 'En esta computadora, sin cuenta:',
    backupOn: 'Respaldo sin internet listo', backupOnD: 'Si se corta internet, los subtítulos siguen en esta computadora y vuelven a la nube cuando regresa.',
    backupOff: 'Opcional: un respaldo sin internet', backupOffD: 'Iniciá el servidor con este comando y los subtítulos siguen en esta computadora si el lugar se queda sin internet:',
    k5: 'Paso 7 de 7 · Sonido', audioH: 'Conectá el sonido', audioP: 'OpenCaptions escucha el audio de cada sala. Elegí lo más fácil; podés probarlo ahora mismo.',
    mic: 'Un micrófono en esta computadora', micD: 'Abrí la página de audio de la sala en un navegador junto al escenario y permití el micrófono.',
    mixer: 'La consola de sonido o un stream', mixerD: 'Mandá la salida de la consola, OBS, vMix o un stream RTMP/SRT. Pedíselo a técnica, es un minuto.',
    test: 'Probarlo primero', testD: 'Hablá al micrófono y mirá cómo aparecen los subtítulos.',
    k6: 'Listo', doneH: 'Ya está todo.', sEvent: 'Evento', sRooms: 'Salas', sLangs: 'Subtítulos', sAI: 'IA',
    openDash: 'Abrir el panel', printQr: 'Imprimir los QR', seeAudience: 'Ver lo que ve el público', autoL: 'detección automática',
    aiG: 'Gemini (nube)', aiL: 'Esta computadora', aiM: 'Modo demo', withBackup: ' + respaldo sin internet',
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
  steps[cur].querySelector('input, .primary')?.focus({ preventScroll: true });
  history.replaceState(null, '', `#${steps[cur].dataset.step}`);
}
const start = steps.findIndex((s) => `#${s.dataset.step}` === location.hash);
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
    let talks = 0;
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

// ---------- audio ----------
$('audio').innerHTML = [
  ['mic', t.mic, t.micD, '/ingest.html'],
  ['sliders', t.mixer, t.mixerD, 'https://github.com/carraroesteban/opencaptions/blob/main/docs/operations/runbook.md'],
  ['play', t.test, t.testD, '/demo.html?mode=mic'],
].map(([ic, title, desc, href]) => `<a class="opt" href="${href}" target="_blank" rel="noopener"><div class="ic">${icon(ic)}</div><div><b>${title}</b><span>${desc}</span></div></a>`).join('');

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
  location.href = '/me.html';
};
