// welcome.html: page script (kept out of the HTML so the Content-Security-Policy can forbid inline scripts).
import { store, takeUrlToken, esc } from '/common.js';
import { prefsControls, LANG } from '/i18n.js';
import { icon } from '/illustrations.js';
const $ = (id) => document.getElementById(id);
$('prefs-slot').append(prefsControls());
document.documentElement.lang = LANG;

// Written per language (not through the page translator): this page is mostly sentences.
const T = {
  en: {
    title: 'Welcome · OpenCaptions',
    k0: 'Welcome', welcomeH: 'Let’s get your event ready.', welcomeP: 'A few quick questions, about two minutes. Skip anything you’re not sure about: you can change all of it later from the dashboard.',
    start: 'Let’s start', skipAll: 'Skip setup, I’ll do it later', back: 'Back', next: 'Continue',
    k1: 'Step 1 of 5 · Your event', nameH: 'What’s your event called?', namePh: 'e.g. City Design Week 2026', nameHint: 'It appears on the audience’s phones, on the projector screen and on the QR posters.', skipName: 'Skip, decide later',
    k2: 'Step 2 of 5 · Rooms', roomsH: 'Where will people speak?', roomsP: 'One stage or many. Each room gets its own captions link and QR code.', addRoom: '+ Add a room', skipRooms: 'Skip, keep these rooms', roomPh: (i) => `Room ${i}`, remove: 'Remove room',
    presets: [['One room', ['Main Stage']], ['Two rooms', ['Main Stage', 'Room A']], ['Main stage + 3 rooms', ['Main Stage', 'Room A', 'Room B', 'Room C']]],
    k3: 'Step 3 of 5 · Languages', langsH: 'Which languages?', spokenQ: 'What language will the talks be in?', auto: 'Detect automatically', captionsQ: 'Which captions can the audience choose?', langsHint: 'Not sure? Leave “Detect automatically”: OpenCaptions recognises the language as people speak, even when they switch.', notSure: 'I’m not sure, skip',
    k4: 'Step 4 of 5 · The AI', aiH: 'How captions are made', later: 'Skip for now',
    gemini: 'Connected to Gemini', geminiD: 'Captions and translations come from Google’s Gemini, in the cloud. About 3 seconds behind the speaker.',
    local: 'Running on this computer', localD: 'Speech recognition and translation run here. The audio never leaves the building, and it works without internet.',
    mock: 'Demo mode: captions are simulated', mockD: 'Everything works so you can explore, but the words are made up. To caption real talks, pick one of these and restart:',
    mockGemini: 'Cloud (best quality): add a Gemini API key', mockLocal: 'On this computer, no account needed:',
    backupOn: 'Offline backup is ready', backupOnD: 'If the internet goes down, captions keep running on this computer and switch back when it returns.',
    backupOff: 'Optional: an offline backup', backupOffD: 'Start the server with this command and captions keep running on this computer if the venue loses internet:',
    k5: 'Step 5 of 5 · Sound', audioH: 'Connect the sound', audioP: 'OpenCaptions listens to each room’s audio. Pick whatever is easiest; you can try it right now.',
    mic: 'A microphone on this computer', micD: 'Open the room’s audio page in a browser next to the stage and allow the microphone.',
    mixer: 'The sound desk or a stream', mixerD: 'Send the mixer’s output, OBS, vMix or an RTMP/SRT stream. Ask your AV team, it takes a minute.',
    test: 'Just try it first', testD: 'Talk into your microphone and watch the captions appear.',
    k6: 'All set', doneH: 'You’re ready. 🎉', sEvent: 'Event', sRooms: 'Rooms', sLangs: 'Captions', sAI: 'AI',
    openDash: 'Open the dashboard', printQr: 'Print the QR codes', seeAudience: 'See what the audience sees', autoL: 'auto-detected',
    aiG: 'Gemini (cloud)', aiL: 'This computer', aiM: 'Demo mode', withBackup: ' + offline backup',
  },
  es: {
    title: 'Bienvenida · OpenCaptions',
    k0: 'Bienvenida', welcomeH: 'Preparemos tu evento.', welcomeP: 'Unas pocas preguntas, unos dos minutos. Saltá lo que no sepas: podés cambiar todo después desde el panel.',
    start: 'Empezar', skipAll: 'Saltar, lo hago después', back: 'Atrás', next: 'Continuar',
    k1: 'Paso 1 de 5 · Tu evento', nameH: '¿Cómo se llama tu evento?', namePh: 'Ej: Semana del Diseño 2026', nameHint: 'Aparece en los celulares del público, en la pantalla del proyector y en los carteles con QR.', skipName: 'Saltar, lo decido después',
    k2: 'Paso 2 de 5 · Salas', roomsH: '¿Dónde va a hablar la gente?', roomsP: 'Un escenario o varios. Cada sala tiene su propio link de subtítulos y su QR.', addRoom: '+ Agregar una sala', skipRooms: 'Saltar, dejar estas salas', roomPh: (i) => `Sala ${i}`, remove: 'Quitar sala',
    presets: [['Una sala', ['Escenario principal']], ['Dos salas', ['Escenario principal', 'Sala A']], ['Principal + 3 salas', ['Escenario principal', 'Sala A', 'Sala B', 'Sala C']]],
    k3: 'Paso 3 de 5 · Idiomas', langsH: '¿Qué idiomas?', spokenQ: '¿En qué idioma van a ser las charlas?', auto: 'Detectar automáticamente', captionsQ: '¿Qué subtítulos puede elegir el público?', langsHint: '¿No sabés? Dejá “Detectar automáticamente”: OpenCaptions reconoce el idioma mientras hablan, aunque cambien.', notSure: 'No sé, saltar',
    k4: 'Paso 4 de 5 · La IA', aiH: 'Cómo se generan los subtítulos', later: 'Saltar por ahora',
    gemini: 'Conectado a Gemini', geminiD: 'Los subtítulos y traducciones vienen de Gemini de Google, en la nube. Unos 3 segundos detrás de quien habla.',
    local: 'Funcionando en esta computadora', localD: 'El reconocimiento de voz y la traducción corren acá. El audio no sale del lugar y funciona sin internet.',
    mock: 'Modo demo: los subtítulos son simulados', mockD: 'Todo funciona para que lo recorras, pero las palabras son inventadas. Para subtitular charlas reales, elegí una opción y reiniciá:',
    mockGemini: 'En la nube (mejor calidad): agregá una API key de Gemini', mockLocal: 'En esta computadora, sin cuenta:',
    backupOn: 'Respaldo sin internet listo', backupOnD: 'Si se corta internet, los subtítulos siguen en esta computadora y vuelven a la nube cuando regresa.',
    backupOff: 'Opcional: un respaldo sin internet', backupOffD: 'Iniciá el servidor con este comando y los subtítulos siguen en esta computadora si el lugar se queda sin internet:',
    k5: 'Paso 5 de 5 · Sonido', audioH: 'Conectá el sonido', audioP: 'OpenCaptions escucha el audio de cada sala. Elegí lo más fácil; podés probarlo ahora mismo.',
    mic: 'Un micrófono en esta computadora', micD: 'Abrí la página de audio de la sala en un navegador junto al escenario y permití el micrófono.',
    mixer: 'La consola de sonido o un stream', mixerD: 'Mandá la salida de la consola, OBS, vMix o un stream RTMP/SRT. Pedíselo a técnica, es un minuto.',
    test: 'Probarlo primero', testD: 'Hablá al micrófono y mirá cómo aparecen los subtítulos.',
    k6: 'Listo', doneH: 'Ya está todo. 🎉', sEvent: 'Evento', sRooms: 'Salas', sLangs: 'Subtítulos', sAI: 'IA',
    openDash: 'Abrir el panel', printQr: 'Imprimir los QR', seeAudience: 'Ver lo que ve el público', autoL: 'detección automática',
    aiG: 'Gemini (nube)', aiL: 'Esta computadora', aiM: 'Modo demo', withBackup: ' + respaldo sin internet',
  },
};
const t = T[LANG] || T.en;
document.title = t.title;
for (const el of document.querySelectorAll('[data-t]')) el.textContent = t[el.dataset.t];
$('name').placeholder = t.namePh;

// ---------- server ----------
let token = takeUrlToken('admin.token');
const api = async (method, url, body) => {
  const r = await fetch(url, { method, headers: { 'content-type': 'application/json', 'x-admin-token': token || '' }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 401) {
    const v = prompt('ADMIN_TOKEN');
    if (v) { token = v; store.set('admin.token', v); return api(method, url, body); }
    throw new Error('admin token required');
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
};
const fail = (e) => { $('err').textContent = e.message || String(e); };
let S = await api('GET', '/api/setup');
const langNames = S.languages || { es: 'Español', en: 'English', pt: 'Português' };

// ---------- answers ----------
const A = {
  name: S.name,
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
  [...$('progress').children].forEach((p, k) => p.classList.toggle('on', k <= cur));
  const img = $('art'), src = `/art/${steps[cur].dataset.art}.webp`;
  if (!img.src.endsWith(src)) { img.classList.add('fade'); setTimeout(() => { img.src = src; img.onload = () => img.classList.remove('fade'); }, 150); }
  if (steps[cur].dataset.step === 'done') renderSummary();
  steps[cur].querySelector('input, .primary')?.focus({ preventScroll: true });
  history.replaceState(null, '', `#${steps[cur].dataset.step}`);
}
const start = steps.findIndex((s) => `#${s.dataset.step}` === location.hash);
// Preload the illustrations so steps switch instantly.
for (const s of steps) new Image().src = `/art/${s.dataset.art}.webp`;

// Save what this step changed, then move on. Skipping moves on without saving.
const save = {
  async name() {
    const name = $('name').value.trim();
    if (name && name !== S.name) { await api('PUT', '/api/setup', { name }); S.name = name; }
    A.name = S.name;
  },
  async rooms() {
    const want = A.rooms.filter((r) => r.name.trim());
    if (!want.length) throw new Error(LANG === 'es' ? 'Dejá al menos una sala.' : 'Keep at least one room.');
    const keep = new Set(want.filter((r) => r.id).map((r) => r.id));
    for (const s of S.stages) if (!keep.has(s.id)) await api('DELETE', `/api/stages/${encodeURIComponent(s.id)}`);
    const taken = new Set([...keep]);
    for (const r of want) {
      if (r.id) {
        const old = S.stages.find((s) => s.id === r.id);
        if (old && old.name !== r.name.trim()) await api('PATCH', `/api/stages/${encodeURIComponent(r.id)}`, { name: r.name.trim() });
      } else {
        let id = slug(r.name) || 'room', n = 2;
        while (taken.has(id)) id = `${slug(r.name) || 'room'}-${n++}`;
        taken.add(id);
        await api('POST', '/api/stages', { id, name: r.name.trim(), source: A.spoken, targets: A.targets });
        r.id = id;
      }
    }
    S = await api('GET', '/api/setup');
    A.rooms = S.stages.map((s) => ({ id: s.id, name: s.name }));
  },
  async langs() {
    if (!A.targets.length) throw new Error(LANG === 'es' ? 'Elegí al menos un idioma de subtítulos.' : 'Pick at least one caption language.');
    for (const s of S.stages) {
      if (s.source === A.spoken && s.targets.join() === A.targets.join()) continue;
      await api('PATCH', `/api/stages/${encodeURIComponent(s.id)}`, { source: A.spoken, targets: A.targets });
    }
    S = await api('GET', '/api/setup');
  },
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
    try { await api('PUT', '/api/setup', { done: true }); } catch (err) { return fail(err); }
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
}
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
function renderAi() {
  const f = S.failover;
  let html = '';
  if (S.primaryEngine === 'gemini') {
    html += opt('check', t.gemini, t.geminiD, '', 'good');
    html += f?.mode === 'auto' && f.localReady
      ? opt('shield', t.backupOn, t.backupOnD, '', 'good')
      : opt('shield', t.backupOff, t.backupOffD, cmd('npm run local -- --fallback'));
  } else if (S.primaryEngine === 'local') {
    html += opt('shield', t.local, t.localD, '', 'good');
  } else {
    html += opt('spark', t.mock, t.mockD, `<p style="margin:12px 0 0;font-size:14px">${t.mockGemini}</p>${cmd('npm run setup')}<p style="margin:12px 0 0;font-size:14px">${t.mockLocal}</p>${cmd('npm run local')}`);
  }
  $('ai').innerHTML = html;
}
renderAi();

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
  $('summary').innerHTML = [
    [t.sEvent, S.name],
    [t.sRooms, S.stages.map((s) => s.name).join(', ')],
    [t.sLangs, `${langs}${st?.source === 'auto' ? ` · ${t.autoL}` : ''}`],
    [t.sAI, ai],
  ].map(([k, v]) => `<div><b>${esc(k)}</b><span>${esc(v)}</span></div>`).join('');
}

show(start >= 0 ? start : 0);
