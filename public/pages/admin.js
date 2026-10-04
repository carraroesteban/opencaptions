// admin.html: page script (kept out of the HTML so the Content-Security-Policy can forbid inline scripts).
import { qs, esc, store, wsUrl, Socket, langLabel, takeUrlToken, setAccent } from '/common.js';
import { localize, prefsControls, tr, LANG } from '/i18n.js';
import { icon, mountIcons } from '/illustrations.js';
const $ = (id) => document.getElementById(id);
$('prefs-slot').append(prefsControls());
mountIcons();
let token = takeUrlToken('admin.token');
let ev = await (await fetch('/api/event')).json();
setAccent(ev.accent);
$('event').textContent = `${ev.name} · Producción`;
let last = null;
const logs = [];

const api = async (method, url, body) => {
  const r = await fetch(url, { method, headers: { 'content-type': 'application/json', 'x-admin-token': token }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 401) { askToken(); throw new Error('token'); }
  const j = await r.json();
  if (!r.ok) { alert(tr(j.error || r.statusText)); throw new Error(j.error); }
  return j;
};
// First run: the welcome wizard asks for the event name, rooms and languages before showing the dashboard.
try {
  const setup = await api('GET', '/api/setup');
  if (!setup.done && !qs.has('dashboard')) { location.replace('/welcome.html'); await new Promise(() => {}); }
} catch { /* no token yet: the dashboard asks for it */ }
function askToken() {
  const t = prompt(tr('ADMIN_TOKEN del servidor:'));
  if (t != null) { token = t; store.set('admin.token', t); location.reload(); }
}

new Socket(() => wsUrl('/ws/admin', { token }), {
  message(m) {
    if (m.type === 'status') render(m);
    else if (m.type === 'log') { logs.push(m); if (logs.length > 400) logs.shift(); renderLogs(); }
    else if (m.type === 'logs') { logs.splice(0, logs.length, ...m.logs); renderLogs(); }
  },
  close(e) { if (e.code === 4001) askToken(); },
});

const fmtDur = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h ${m}m` : `${m}m ${s % 60}s`; };
const ago = (t) => { if (!t) return '—'; const s = Math.round((Date.now() - t) / 1000); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : `${Math.floor(s / 3600)}h`; };
const sec = (ms) => (ms == null ? '—' : (ms / 1000).toFixed(1) + 's');
const stateChip = (s) => {
  if (!s.ingest) return '<span class="chip">SIN INGESTA</span>';
  if (s.engines.length && !s.gated) return '<span class="chip bad"><span class="dot live"></span> EN VIVO</span>';
  if (s.engines.length) return '<span class="chip warn">EN PAUSA · silencio</span>';
  return '<span class="chip">ESPERANDO VOZ</span>';
};
const engChip = (e) => {
  const cls = e.state === 'live' ? 'ok' : e.state === 'reconnecting' || e.state === 'resuming' || e.state === 'connecting' ? 'warn' : e.state === 'idle' ? '' : 'bad';
  return `<span class="chip ${cls}" title="${esc(e.lastError || '')}">${esc(e.target)} · ${esc(e.state)}${e.reconnects ? ` · ↻${e.reconnects}` : ''}${e.level && e.level !== 'full' && e.level !== 'mock' ? ` · cfg:${e.level}` : ''}</span>`;
};

// ---------- first-run guide: what's left to do before doors open ----------
let scheduleCount = null;
async function refreshSchedule() { try { scheduleCount = (await (await fetch('/api/schedule')).json()).length; } catch { scheduleCount = 0; } }
refreshSchedule();
// Local engine (npm run local): speech server + text model health, checked by the server every 15 s.
const localOk = (l) => !!l && l.asr !== false && (l.llmOff || l.llm !== false);
// First-run guide. Its sentences mix text and links/code, so they're written per language here instead of
// going through the word-by-word page translator.
const OB = {
  es: {
    localNoAsr: (u) => `no responde el servidor de voz (<code>${u}</code>): corré <code>npm run local</code>`,
    localLlmOff: (m) => `solo transcripción, sin traducciones ni resúmenes · ${m}`,
    localNoLlm: (u) => `no responde el modelo de traducción (<code>${u}</code>): corré <code>npm run local</code> o abrí Ollama`,
    localMissing: (m) => `falta el modelo <code>${m}</code>: <code>ollama pull ${m}</code>`,
    localReady: (m) => `listo · ${m} · el audio no sale de esta computadora`,
    engineLocal: 'Motor de IA local', engineGemini: 'Conectar Gemini', ready: (m) => `listo · ${m}`,
    noKey: 'agregá <code>GEMINI_API_KEY</code> al archivo <code>.env</code> y reiniciá, o usá <code>npm run local</code> para correr la IA en esta computadora. Mientras tanto, los subtítulos son simulados.',
    rooms: 'Crear las salas', roomsD: (n) => `${n} ${n === 1 ? 'sala' : 'salas'} · <a href="#" data-ob="add">nueva sala</a>`,
    audio: 'Conectar el audio de cada sala', audioD: (a, n) => `${a} de ${n} con audio · agente, navegador o stream (<a href="https://github.com/carraroesteban/opencaptions/blob/main/docs/operations/runbook.md" target="_blank">cómo</a>)`,
    agenda: 'Cargar la agenda', agendaD: (n) => (n ? `${n} ${n === 1 ? 'charla cargada' : 'charlas cargadas'}` : '<a href="#" data-ob="agenda">pegar la agenda</a> para que las charlas tomen su título (opcional)'),
    kit: 'Imprimir los QR de cada sala', kitD: '<a href="/kit.html" target="_blank" data-ob="kit">abrir el kit de QR</a>',
    sound: 'Prueba de sonido en cada sala', soundD: '<a href="/demo.html?mode=mic" target="_blank" data-ob="sound">abrir la prueba de sonido</a>',
  },
  en: {
    localNoAsr: (u) => `the speech server isn't responding (<code>${u}</code>): run <code>npm run local</code>`,
    localLlmOff: (m) => `transcription only, no translations or summaries · ${m}`,
    localNoLlm: (u) => `the translation model isn't responding (<code>${u}</code>): run <code>npm run local</code> or open Ollama`,
    localMissing: (m) => `model <code>${m}</code> is missing: <code>ollama pull ${m}</code>`,
    localReady: (m) => `ready · ${m} · audio never leaves this computer`,
    engineLocal: 'Local AI engine', engineGemini: 'Connect Gemini', ready: (m) => `ready · ${m}`,
    noKey: 'add <code>GEMINI_API_KEY</code> to the <code>.env</code> file and restart, or use <code>npm run local</code> to run the AI on this computer. Until then, captions are simulated.',
    rooms: 'Create your rooms', roomsD: (n) => `${n} ${n === 1 ? 'room' : 'rooms'} · <a href="#" data-ob="add">new room</a>`,
    audio: 'Connect each room’s audio', audioD: (a, n) => `${a} of ${n} with audio · agent, browser or stream (<a href="https://github.com/carraroesteban/opencaptions/blob/main/docs/operations/runbook.md" target="_blank">how</a>)`,
    agenda: 'Load the agenda', agendaD: (n) => (n ? `${n} ${n === 1 ? 'talk' : 'talks'} loaded` : '<a href="#" data-ob="agenda">paste your agenda</a> so talks get their titles (optional)'),
    kit: 'Print each room’s QR code', kitD: '<a href="/kit.html" target="_blank" data-ob="kit">open the QR kit</a>',
    sound: 'Sound check in every room', soundD: '<a href="/demo.html?mode=mic" target="_blank" data-ob="sound">open the sound check</a>',
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
  if (store.get('admin.obHidden', false)) return $('onboard').classList.add('hidden');
  const withAudio = s.stages.filter((x) => x.ingest).length;
  const steps = [
    s.engine === 'local'
      ? [localOk(s.local), ob.engineLocal, localDetail(s)]
      : [s.engine === 'gemini', ob.engineGemini, s.engine === 'gemini' ? ob.ready(esc(s.model)) : ob.noKey],
    [s.stages.length > 0, ob.rooms, ob.roomsD(s.stages.length)],
    [withAudio === s.stages.length && s.stages.length > 0, ob.audio, ob.audioD(withAudio, s.stages.length)],
    [scheduleCount > 0, ob.agenda, ob.agendaD(scheduleCount)],
    [store.get('admin.kitDone', false), ob.kit, ob.kitD],
    [store.get('admin.soundDone', false), ob.sound, ob.soundD],
  ];
  $('ob-steps').innerHTML = steps.map(([ok, title, detail]) => `<li class="${ok ? 'done' : ''}"><span class="ck${ok ? ' on' : ''}" role="img" aria-label="${ok ? '✓' : '·'}"></span><span><b>${title}</b> <span class="muted">— ${detail}</span></span></li>`).join('');
  $('onboard').classList.toggle('hidden', steps.every(([ok]) => ok));
}
$('ob-steps').onclick = (e) => {
  const a = e.target.closest('[data-ob]');
  if (!a) return;
  if (a.dataset.ob === 'add') { e.preventDefault(); openEdit(null); }
  if (a.dataset.ob === 'agenda') { e.preventDefault(); openAgenda(); }
  if (a.dataset.ob === 'kit') store.set('admin.kitDone', true);
  if (a.dataset.ob === 'sound') store.set('admin.soundDone', true);
};
$('ob-hide').onclick = () => { store.set('admin.obHidden', true); $('onboard').classList.add('hidden'); };

// ---------- offline backup (Gemini ↔ this computer) ----------
function renderNet(f) {
  $('ai-mode').classList.toggle('hidden', !f);
  if (!f) return $('netbar').classList.add('hidden');
  if (document.activeElement !== $('ai-mode')) $('ai-mode').value = f.mode;
  $('ai-mode').querySelector('[value=local]').disabled = !f.localReady;
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
  try { await api('POST', '/api/engine', { mode: e.target.value }); } catch { /* alert shown */ }
};

function render(s) {
  last = s;
  renderOnboard(s);
  $('engine').textContent = s.engine === 'gemini' ? `Gemini · ${s.model}` : s.engine === 'local' ? `🔒 Local · ${s.model}` : 'Modo simulado (sin API key)';
  $('engine').className = 'chip ' + (s.engine === 'mock' ? 'warn' : s.engine === 'local' && !localOk(s.local) ? 'bad' : 'ok');
  $('engine').title = s.engine === 'local' ? tr('IA local: el audio y el texto no salen de esta computadora') : '';
  renderNet(s.failover);
  $('k-live').textContent = `${s.totals.live}/${s.totals.stages}`;
  $('k-sessions').textContent = s.totals.sessions;
  $('k-viewers').textContent = s.totals.viewers;
  $('k-cost').textContent = `US$ ${s.totals.costUsd.toFixed(2)}`;
  $('k-up').textContent = fmtDur(s.uptimeSec);
  if (s.system) {
    const y = s.system;
    $('k-cpu').textContent = `${y.cpuPct}%`;
    $('k-cpu').style.color = y.cpuPct > 80 ? 'var(--bad)' : y.cpuPct > 50 ? 'var(--warn)' : '';
    $('k-cpu').parentElement.title = `CPU ${y.cpuPct}% (1 core = 100%) · load ${y.load1} / ${y.cores} cores`;
    $('k-mem').textContent = `${y.rssMB} MB`;
    $('k-mem').parentElement.title = `RSS ${y.rssMB} MB · heap ${y.heapMB} MB · host RAM ${y.sysMemPct}% of ${y.sysMemGB} GB`;
    $('k-lag').textContent = `${y.loopLagMs.p99} ms`;
    $('k-lag').style.color = y.loopLagMs.p99 > 100 ? 'var(--bad)' : y.loopLagMs.p99 > 50 ? 'var(--warn)' : '';
  }
  const grid = $('grid');
  const ids = new Set(s.stages.map((x) => x.id));
  for (const el of [...grid.children]) if (!ids.has(el.dataset.id)) el.remove();
  if (!s.stages.length && !grid.querySelector('.empty-rooms')) grid.innerHTML = `<div class="empty-rooms"><img src="/art/waiting.webp" alt="" /><h3>${esc(tr('Todavía no hay salas'))}</h3><p class="muted" style="margin:0">${esc(tr('Creá una sala por cada escenario o aula: cada una tiene su QR, su pantalla y su overlay.'))}</p><button class="primary" data-ob-add>${icon('plus')}${esc(tr('Nueva sala'))}</button></div>`;
  if (s.stages.length) grid.querySelector('.empty-rooms')?.remove();
  for (const st of s.stages) {
    let el = grid.querySelector(`[data-id="${st.id}"]`);
    if (!el) {
      el = document.createElement('article');
      el.className = 'card stage';
      el.dataset.id = st.id;
      el.innerHTML = `
        <div class="top"><h3></h3><span data-f="state"></span></div>
        <div class="talkline" data-f="talkline"></div>
        <div class="sub muted" data-f="next" data-no-i18n></div>
        <div class="meter"><i data-f="lvl"></i><b data-f="pk"></b></div>
        <div class="said" data-f="said" data-no-i18n></div>
        <div class="stats" data-f="stats"></div>
        <div class="row" data-f="alerts"></div>
        <div class="actions">
          <button data-a="links">${icon('qr')}Links y QR</button>
          <button data-a="talk">${icon('newtalk')}Nueva charla</button>
          <button data-a="details" class="more" aria-expanded="false"><span>Ver detalles</span>${icon('chevron')}</button>
        </div>
        <div class="details">
          <div class="sub" data-f="sub"></div>
          <div class="sub" data-f="ingest"></div>
          <div class="row" data-f="engines"></div>
          <div class="metrics" data-f="metrics"></div>
          <div class="preview" data-f="preview" data-no-i18n></div>
          <div class="actions">
            <button data-a="export">${icon('download')}Transcripciones</button>
            <button data-a="restart" title="Reconectar sesiones de IA">${icon('refresh')}Reconectar IA</button>
            <button data-a="edit">${icon('gear')}Ajustes de la sala</button>
          </div>
        </div>`;
      grid.append(el);
      if (![...$('logfilter').options].some((o) => o.value === st.id)) $('logfilter').append(new Option(st.name, st.id));
    }
    const f = (k) => el.querySelector(`[data-f="${k}"]`);
    el.querySelector('h3').textContent = st.name;
    const tl = f('talkline');
    tl.textContent = st.talk.title || tr('Sin charla anunciada');
    tl.classList.toggle('none', !st.talk.title);
    f('said').textContent = (st.preview.orig ?? Object.values(st.preview)[0] ?? '').slice(-220);
    const lat = Math.max(st.latency.asr || 0, ...Object.values(st.latency.tr).filter((v) => v != null));
    f('stats').innerHTML = `<span title="${esc(tr('Público'))}">${icon('eye')}<b>${st.viewers}</b></span><span title="${esc(tr('Latencia'))}">${icon('clock')}<b>${lat ? sec(lat) : '—'}</b></span><span title="${esc(tr('Costo estimado'))}">${icon('coin')}<b>US$ ${st.costUsd.toFixed(2)}</b></span>`;
    el.classList.toggle('alert', st.alerts.some((a) => a !== 'no-ingest'));
    f('state').innerHTML = stateChip(st);
    const tgt = st.targets.filter((x) => x !== st.source).join(', ');
    f('next').textContent = st.nextTalk ? `⏭ ${st.nextTalk.title} · ${new Date(st.nextTalk.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '';
    f('sub').innerHTML = `<code>${esc(st.id)}</code> · <span class="chip">${esc(st.mode)}</span> · ${esc(st.source === 'auto' ? `auto${st.detectedLang ? ` (${st.detectedLang})` : ''}` : st.source)} → ${esc(tgt || '—')}${st.talk.title ? ` · <b>${esc(st.talk.title)}</b>` : ''}`;
    const db = 20 * Math.log10(st.level || 1e-6), pct = Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
    const pk = Math.max(0, Math.min(100, ((20 * Math.log10(st.peak || 1e-6) + 60) / 60) * 100));
    f('lvl').style.width = pct + '%';
    f('pk').style.left = pk + '%';
    f('ingest').textContent = st.ingest ? `🎙 ${st.ingest.kind}${st.ingest.label ? ` · ${st.ingest.label}` : ''} · hace ${ago(st.ingest.since)}${st.pull ? ' · pull configurado' : ''}` : st.pull ? `pull: ${st.pull} (reintentando)` : 'Sin fuente de audio. Abrí /ingest.html en la PC del escenario.';
    f('engines').innerHTML = st.engines.length ? st.engines.map(engChip).join('') : '<span class="chip">sesiones cerradas (0 costo)</span>';
    const trs = Object.entries(st.latency.tr).map(([k, v]) => `${k} ${sec(v)}`).join(' · ');
    f('metrics').innerHTML = `
      <div>Latencia orig.<b>${sec(st.latency.asr)}</b></div>
      <div title="${esc(trs)}">Latencia trad.<b>${sec(Math.max(0, ...Object.values(st.latency.tr).filter((v) => v != null)) || null)}</b></div>
      <div>Público<b>${st.viewers}</b></div>
      <div>Min · US$<b>${st.audioMinIn} · ${st.costUsd.toFixed(2)}</b></div>`;
    f('preview').innerHTML = Object.entries(st.preview).map(([ch, txt]) => `<div><span class="l">${esc(ch)}</span> ${esc(txt ? (txt.length > 80 ? '…' + txt.slice(-80) : txt) : '…')}</div>`).join('');
    f('alerts').innerHTML = st.alerts.filter((a) => a !== 'no-ingest').map((a) => `<span class="chip bad">⚠ ${esc(alertText(a))}</span>`).join('');
  }
  renderMini(s);
}
const alertText = (a) => ({ 'no-audio': 'no llega audio', 'muted?': '¿mic muteado? (60s sin señal)', reconnecting: 'reconectando IA', 'high-latency': 'latencia alta', 'mt-throttled': 'traducción limitada por cuota → usando Live' }[a] || a);

// ---------- 📌 floating mini-dashboard (Document Picture-in-Picture): every room, always on top of OBS / vMix ----------
let mini = null;
if ('documentPictureInPicture' in window) $('float').classList.remove('hidden');
$('float').onclick = async () => {
  if (mini) return mini.close();
  try {
    mini = await documentPictureInPicture.requestWindow({ width: 380, height: Math.min(640, 70 + (last?.stages.length || 4) * 52) });
  } catch (e) { mini = null; return alert(e.message); }
  const d = mini.document, root = document.documentElement;
  d.documentElement.style.cssText = root.style.cssText;
  if (root.dataset.theme) d.documentElement.dataset.theme = root.dataset.theme;
  d.head.append(Object.assign(d.createElement('link'), { rel: 'stylesheet', href: new URL('/style.css', location.href).href }));
  const css = d.createElement('style');
  css.textContent = `body{margin:0;padding:8px;font-size:13px;background:var(--bg);color:var(--fg)}
    .k{display:flex;flex-wrap:wrap;gap:4px 14px;color:var(--fg2);margin:2px 6px 8px}.k b{color:var(--fg)}
    .r{display:grid;grid-template-columns:12px minmax(0,1fr) auto;gap:2px 8px;align-items:center;padding:7px 9px;border-radius:12px;cursor:pointer}
    .r:hover{background:var(--bg2)}.r.bad{background:color-mix(in srgb,var(--bad) 20%,transparent)}
    .d{width:10px;height:10px;border-radius:50%;background:var(--line)}.d.live{background:var(--ok)}.d.pause{background:var(--warn)}.d.bad{background:var(--bad)}
    .n{font-family:var(--font-display);font-weight:800;letter-spacing:-.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.v{color:var(--fg2);font-size:12px}
    .t{grid-column:2/4;color:var(--fg2);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.r.bad .t{color:var(--fg)}`;
  d.head.append(css);
  d.title = `${ev.name} · ${tr('Producción')}`;
  d.body.innerHTML = '<div class="k" id="k"></div><div id="rows"></div>';
  d.getElementById('rows').onclick = (e) => {
    const r = e.target.closest('[data-id]');
    if (!r) return;
    window.focus();
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
    const dot = alerts.length ? 'bad' : !st.ingest ? '' : st.engines.length && !st.gated ? 'live' : 'pause';
    const said = st.preview.orig ?? Object.values(st.preview)[0] ?? '';
    const txt = alerts.length ? '⚠ ' + alerts.map((a) => tr(alertText(a))).join(' · ') : !st.ingest ? tr('SIN INGESTA') : said || '…';
    return `<div class="r${alerts.length ? ' bad' : ''}" data-id="${esc(st.id)}"><span class="d ${dot}"></span><span class="n">${esc(st.name)}</span><span class="v">👁 ${st.viewers}</span><span class="t">${esc(txt.length > 90 ? '…' + txt.slice(-90) : txt)}</span></div>`;
  }).join('');
}

function renderLogs() {
  const flt = $('logfilter').value;
  const box = $('logs');
  const atEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 30;
  box.innerHTML = logs.filter((l) => !flt || l.stage === flt).slice(-200).map((l) =>
    `<div class="${l.level}">${new Date(l.t).toLocaleTimeString()} [${esc(l.stage)}] ${esc(l.msg)}</div>`).join('');
  if (atEnd) box.scrollTop = box.scrollHeight;
}
$('logfilter').onchange = renderLogs;

// ---------- actions ----------
$('grid').onclick = async (e) => {
  if (e.target.closest('[data-ob-add]')) return openEdit(null);
  const b = e.target.closest('[data-a]');
  if (!b) return;
  const id = b.closest('[data-id]').dataset.id;
  const st = last.stages.find((x) => x.id === id);
  const a = b.dataset.a;
  if (a === 'details') {
    const card = b.closest('.stage'), open = card.classList.toggle('open');
    b.setAttribute('aria-expanded', open);
    b.querySelector('span').textContent = tr(open ? 'Ocultar detalles' : 'Ver detalles');
    return;
  }
  if (a === 'talk') {
    const title = prompt(tr('Título de la nueva charla (opcional). La transcripción actual queda guardada.'), '');
    if (title != null) await api('POST', `/api/stages/${id}/talk`, { title });
  } else if (a === 'restart') await api('POST', `/api/stages/${id}/restart`);
  else if (a === 'edit') openEdit(st);
  else if (a === 'links') openLinks(st);
  else if (a === 'export') openExport(st);
};

const origin = () => ev.publicUrl || location.origin;
function copyRow(label, url) {
  return `<label class="field">${esc(label)}<div class="copy"><input readonly value="${esc(url)}" /><button type="button" data-copy="${esc(url)}">Copiar</button><a href="${esc(url)}" target="_blank"><button type="button">Abrir</button></a></div></label>`;
}
// Copy buttons in the links dialog (a delegated listener: the strict CSP allows no inline handlers).
$('links-body').addEventListener('click', (e) => {
  const b = e.target.closest('[data-copy]');
  if (!b) return;
  navigator.clipboard.writeText(b.dataset.copy).then(() => { b.textContent = '✓'; }, () => {});
});
function openLinks(st) {
  const o = origin();
  const aud = `${o}/s/${st.id}`;
  const others = st.languages.filter((l) => l !== 'orig');
  $('links-body').innerHTML = `
    <h3 style="margin:0">${esc(st.name)}</h3>
    <div class="qrrow"><img src="/api/qr.svg?text=${encodeURIComponent(aud)}" alt="QR" /><div style="display:grid;gap:8px">${copyRow('Público (celular, QR)', aud)}<a href="/api/qr.svg?text=${encodeURIComponent(aud)}" download="qr-${st.id}.svg">Descargar QR (SVG para imprimir)</a></div></div>
    ${copyRow('Pantalla del escenario / proyector', `${o}/screen.html?stage=${st.id}&langs=es,orig`)}
    ${others.map((l) => copyRow(`Overlay vMix/OBS — ${langLabel(l, ev.languages)} (1920×1080, fondo transparente)`, `${o}/overlay.html?stage=${st.id}&lang=${l}`)).join('')}
    ${copyRow('Overlay con fondo verde (chroma key)', `${o}/overlay.html?stage=${st.id}&lang=${others[0] || 'orig'}&bg=%2300ff00&style=outline`)}
    ${copyRow('Transcripción en vivo (leer, buscar, resumen IA)', `${o}/talk.html?stage=${st.id}`)}
    ${copyRow('Ingesta (abrir en la mini PC del escenario)', `${o}/ingest.html?stage=${st.id}`)}`;
  $('dlg-links').showModal();
}

async function openExport(st) {
  const talks = await api('GET', `/api/stages/${st.id}/talks`);
  const langs = st.languages;
  $('export-body').innerHTML = `<h3 style="margin-top:0">Transcripciones · ${esc(st.name)}</h3>` + (talks.length ? `<table><tr><th>Charla</th><th>Seg.</th><th>Descargas</th></tr>${talks.map((t) => `
    <tr><td>${esc(t.title || 'Sin título')}<br><span class="muted">${new Date(t.startedAt).toLocaleString()}</span></td><td>${t.segments}</td>
    <td>${langs.map((l) => `<div><b>${esc(langLabel(l, ev.languages))}</b>: ${['srt', 'vtt', 'txt'].map((f) => `<a href="/api/stages/${st.id}/export.${f}?lang=${l}&talk=${encodeURIComponent(t.id)}${token ? `&token=${encodeURIComponent(token)}` : ''}">${f}</a>`).join(' · ')}</div>`).join('')}</td></tr>`).join('')}</table>` : '<p class="muted">Todavía no hay transcripciones.</p>');
  $('dlg-export').showModal();
}

let editing = null;
const fe = $('f-edit');
for (const [code, name] of Object.entries(ev.languages)) fe.source.append(new Option(`${name} (${code})`, code));
function openEdit(st) {
  editing = st;
  $('edit-title').textContent = st ? `Editar ${st.name}` : 'Nueva sala';
  fe.id.value = st?.id || '';
  fe.id.disabled = !!st;
  fe.name.value = st?.name || '';
  fe.title.value = st?.talk?.title || '';
  fe.source.value = st?.source || 'auto';
  fe.pull.value = st?.pull || '';
  fe.loop.checked = !!st?.loop;
  fe.translation.value = st?.translationDef || '';
  $('edit-targets').innerHTML = Object.entries(ev.languages).map(([c, n]) => `<label class="row"><input type="checkbox" value="${c}" ${(st?.targets || ['es', 'en']).includes(c) ? 'checked' : ''}/> ${esc(n)}</label>`).join('');
  $('edit-del').classList.toggle('hidden', !st);
  $('dlg-edit').showModal();
}
$('add').onclick = () => openEdit(null);
$('dlg-edit').addEventListener('close', async () => {
  if ($('dlg-edit').returnValue !== 'ok') return;
  const body = {
    name: fe.name.value, title: fe.title.value, source: fe.source.value, translation: fe.translation.value || '', pull: fe.pull.value.trim(), loop: fe.loop.checked,
    targets: [...$('edit-targets').querySelectorAll('input:checked')].map((i) => i.value),
  };
  if (editing) await api('PATCH', `/api/stages/${editing.id}`, body);
  else await api('POST', '/api/stages', { id: fe.id.value, ...body });
  ev = await (await fetch('/api/event')).json();
});
$('edit-del').onclick = async () => {
  if (!confirm(tr(`¿Eliminar la sala ${editing.name}? (las transcripciones guardadas se conservan)`))) return;
  await api('DELETE', `/api/stages/${editing.id}`);
  $('dlg-edit').close();
};

// ---------- agenda ----------
const two = (n) => String(n).padStart(2, '0');
async function openAgenda() {
  const list = await (await fetch('/api/schedule')).json();
  $('agenda-text').value = list.map((e) => { const d = new Date(e.start); return [e.stage, `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`, /[,"]/.test(e.title) ? `"${e.title.replace(/"/g, '""')}"` : e.title, e.speaker || ''].join(','); }).join('\n');
  $('agenda-msg').textContent = list.length ? `${list.length} charla(s) cargadas.` : '';
  $('dlg-agenda').showModal();
}
$('agenda').onclick = openAgenda;
$('agenda-save').onclick = async (e) => {
  e.preventDefault();
  try {
    const r = await api('PUT', '/api/schedule', { csv: $('agenda-text').value });
    await refreshSchedule();
    const sk = r.skipped?.count ? ` · ${r.skipped.count} fila(s) de otras salas ignoradas (${r.skipped.rooms.join(', ')})` : '';
    $('agenda-msg').textContent = `✓ ${r.count} charla(s) guardadas${sk}${r.unknownRooms.length ? ` · ⚠ salas desconocidas: ${r.unknownRooms.join(', ')}` : ''}`;
    if (!r.unknownRooms.length && !sk) setTimeout(() => $('dlg-agenda').close(), 900);
  } catch { /* api() already showed the error */ }
};

$('gloss').onclick = async () => {
  $('gloss-text').value = JSON.stringify(await api('GET', '/api/glossary'), null, 2);
  $('dlg-gloss').showModal();
};
$('dlg-gloss').addEventListener('close', async () => {
  if ($('dlg-gloss').returnValue !== 'ok') return;
  try { await api('PUT', '/api/glossary', JSON.parse($('gloss-text').value)); } catch (e) { alert(tr('JSON inválido: ') + e.message); }
});
localize();
