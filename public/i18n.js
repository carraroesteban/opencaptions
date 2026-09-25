// Operator-UI localization (dashboard, ingest, demo, style editor).
// Source strings are Spanish; add a language by adding a dictionary below (exact strings + a few patterns
// for interpolated text). A MutationObserver translates content rendered later (live dashboard cards,
// dialogs), so pages don't need to wrap every string. Viewer pages (index/watch/screen) use t() in common.js.
import { store, qs } from '/common.js';

const DICTS = {
  en: {
    // generic
    'Sala': 'Room', 'Salas': 'Rooms', 'Idioma': 'Language', 'Original': 'Original', 'Abrir': 'Open', 'Copiar': 'Copy', 'Cerrar': 'Close',
    'Cancelar': 'Cancel', 'Guardar': 'Save', 'Cargar': 'Load', 'Nombre': 'Name', 'ID': 'ID', 'Estilo': 'Style', 'Fondo': 'Background',
    'Subtítulos': 'Captions', 'Subtítulos en vivo': 'Live captions', 'Micrófono': 'Microphone', '(predeterminado)': '(default)',
    'En vivo': 'Live', 'en vivo': 'live', 'en vivo 🎙': 'live 🎙', 'detenido': 'stopped', 'preparando audio…': 'preparing audio…',
    'conectado': 'connected', 'desconectado': 'disconnected', 'reconectando…': 'reconnecting…', 'token inválido': 'invalid token',
    'reemplazado por otra ingesta': 'replaced by another ingest', 'error': 'error', 'Presets': 'Presets',
    // dashboard
    'Producción · OpenCaptions': 'Production · OpenCaptions', '📊 Producción': '📊 Production', 'Producción': 'Production', 'Salas en vivo': 'Live rooms', 'Sesiones IA': 'AI sessions',
    'Espectadores': 'Viewers', 'Costo estimado': 'Estimated cost', 'Uptime': 'Uptime', 'CPU': 'CPU', 'Memoria': 'Memory', 'Event loop': 'Event loop',
    '+ Sala': '+ Room', 'Glosario': 'Glossary', '🎨 Estilo': '🎨 Style', '🎙 Prueba de sonido': '🎙 Sound check', 'Eventos': 'Events',
    'Todas las salas': 'All rooms', 'Modo simulado (sin API key)': 'Simulated mode (no API key)',
    'SIN INGESTA': 'NO INGEST', 'EN VIVO': 'LIVE', 'EN PAUSA · silencio': 'PAUSED · silence', 'ESPERANDO VOZ': 'WAITING FOR SPEECH',
    'sesiones cerradas (0 costo)': 'sessions closed (no cost)', 'Latencia orig.': 'Latency orig.', 'Latencia trad.': 'Latency transl.',
    'Público': 'Audience', 'Min · US$': 'Min · US$', '🔗 Links / QR': '🔗 Links / QR', '＋ Nueva charla': '＋ New talk',
    '⬇ Transcripciones': '⬇ Transcripts', 'Reconectar sesiones de IA': 'Reconnect AI sessions',
    'Sin fuente de audio. Abrí /ingest.html en la PC del escenario.': 'No audio source. Run the agent or open /ingest.html on the stage PC.',
    'no llega audio': 'no audio arriving', '¿mic muteado? (60s sin señal)': 'mic muted? (60 s without signal)', 'reconectando IA': 'AI reconnecting',
    'latencia alta': 'high latency', 'traducción limitada por cuota → usando Live': 'translation rate-limited → using Live',
    'Nueva sala': 'New room', 'Charla actual (título)': 'Current talk (title)', 'Ej: Observabilidad en Kubernetes — Ana García': 'e.g. Observability in Kubernetes — Jane Doe',
    'Idioma de la charla': 'Talk language', 'Detectar automáticamente': 'Detect automatically', 'Traducir a': 'Translate to',
    'Modo de traducción de subtítulos': 'Caption translation mode', 'Por defecto del servidor': 'Server default',
    'Texto (clause a clause · menor latencia · 1 sesión Live por sala)': 'Text (sentence by sentence · lowest latency · 1 Live session per room)',
    'Live (speech-to-speech de Gemini · 1 sesión por idioma)': 'Live (Gemini speech-to-speech · 1 session per language)',
    'Híbrido (subtítulos por texto + voz traducida 🎧 en todos los idiomas)': 'Hybrid (text captions + translated voice 🎧 in every language)',
    'Pull de audio (opcional): SRT/RTMP/HLS/HTTP o archivo — el server lo toma con ffmpeg': 'Audio pull (optional): SRT/RTMP/HLS/HTTP or file — pulled by the server with ffmpeg',
    'Repetir en loop (archivos de prueba)': 'Loop (test files)', 'Eliminar sala': 'Delete room',
    'Público (celular, QR)': 'Audience (phone, QR)', 'Descargar QR (SVG para imprimir)': 'Download QR (SVG for printing)',
    'Pantalla del escenario / proyector': 'Stage screen / projector', 'Overlay con fondo verde (chroma key)': 'Overlay with green background (chroma key)',
    'Ingesta (abrir en la mini PC del escenario)': 'Ingest (open on the stage PC)', 'Charla': 'Talk', 'Seg.': 'Seg.', 'Descargas': 'Downloads',
    'Sin título': 'Untitled', 'Todavía no hay transcripciones.': 'No transcripts yet.', 'Glosario técnico': 'Technical glossary',
    ': términos que se le pasan al reconocimiento de voz.': ': terms passed to speech recognition.',
    ': correcciones que se aplican a todos los subtítulos (se aplican al instante, sin reiniciar).': ': fixes applied to every caption (take effect instantly, no restart).',
    'ADMIN_TOKEN del servidor:': 'Server ADMIN_TOKEN:', 'Título de la nueva charla (opcional). La transcripción actual queda guardada.': 'Title of the new talk (optional). The current transcript is kept.',
    'JSON inválido: ': 'Invalid JSON: ',
    // ingest
    'Ingesta de audio · OpenCaptions': 'Audio ingest · OpenCaptions', 'Ingesta de audio del escenario': 'Stage audio ingest', 'Escenario': 'Stage', 'Fuente': 'Source',
    'Micrófono / placa de audio': 'Microphone / sound card', 'Pestaña o pantalla (audio de un stream, YouTube…)': 'Tab or screen (audio from a stream, YouTube…)',
    'Archivo de audio/video': 'Audio/video file', 'Audio de prueba incluido': 'Bundled test audio', 'Entrada': 'Input', 'Canal': 'Channel',
    'Mono (mezcla L+R)': 'Mono (L+R mix)', 'Solo izquierdo': 'Left only', 'Solo derecho': 'Right only', 'Archivo': 'File', 'Audio de prueba': 'Test audio',
    'Charla en inglés (EN → ES)': 'English talk (EN → ES)', 'Charla en español (ES → EN)': 'Spanish talk (ES → EN)', 'Ganancia': 'Gain',
    'Token de ingesta (si el server lo pide)': 'Ingest token (if the server requires it)', '▶ Empezar a transcribir': '▶ Start captioning', '■ Detener': '■ Stop',
    'Escuchar localmente (archivo/prueba)': 'Monitor locally (file/test)', 'Auto-iniciar al abrir (mini PC)': 'Auto-start on open (stage PC)', 'Nivel de entrada': 'Input level',
    'Una vez iniciado no requiere operador: si hay silencio por un rato se pausa el envío (sin costo) y retoma solo cuando alguien habla. Si se corta la red, reconecta y reenvía lo que quedó en buffer.':
      'Once started it needs no operator: after a while of silence it pauses sending (no cost) and resumes when someone speaks. If the network drops it reconnects and resends what was buffered.',
    'en pausa (silencio)': 'paused (silence)', 'enviando al modelo': 'sending to the model',
    '🖥️ Abrir pantalla para proyector': '🖥️ Open projector screen', '🎬 Overlay para vMix/OBS': '🎬 vMix/OBS overlay', '📱 Vista del público': '📱 Audience view', '📊 Panel de producción': '📊 Production dashboard',
    '⚠ Esta página no está en un contexto seguro: el navegador': '⚠ This page is not in a secure context: the browser', 'no va a dejar usar el micrófono': 'will not allow microphone access',
    '. Abrila por': '. Open it over', 'o en': 'or on', '(ver docs/deployment.md → HTTPS).': '(see docs/deployment.md → HTTPS).',
    'No se compartió audio: marcá "Compartir audio de la pestaña".': 'No audio shared: tick "Share tab audio".', 'Elegí un archivo': 'Choose a file',
    // demo
    'Demo · OpenCaptions': 'Demo · OpenCaptions', '· demo': '· demo', '▶ Video de YouTube': '▶ YouTube video', '🎙 Micrófono en vivo': '🎙 Live microphone',
    'URL de YouTube (ej: https://www.youtube.com/watch?v=…)': 'YouTube URL (e.g. https://www.youtube.com/watch?v=…)', 'Desde (s)': 'From (s)',
    'Latencia original': 'Original latency', 'Latencia traducción': 'Translation latency', 'Idioma detectado': 'Detected language',
    '🎙 Elegí el micrófono, tocá ▶ Start y hablá en español o inglés.': '🎙 Pick the microphone, press ▶ Start and speak in Spanish or English.',
    'Play/pausa/adelantar el video mueve también el audio que procesa el server (≈1 s de diferencia al arrancar). La demora que ves entre la voz y el subtítulo es la latencia real del sistema.':
      'Play/pause/seek also moves the audio the server processes (≈1 s offset at start). The delay you see between speech and caption is the real system latency.',
    'Prueba de sonido / demo en vivo: el audio del micrófono va al server igual que desde la mini PC del escenario. Ideal para chequear cada sala antes de abrir puertas.':
      'Sound check / live demo: the microphone audio goes to the server exactly like from a stage PC. Ideal to check each room before doors open.',
    '⚠ El micrófono solo funciona en': '⚠ The microphone only works on', '. Abrí esta página como https://… (ver docs/deployment.md → HTTPS).': '. Open this page as https://… (see docs/deployment.md → HTTPS).',
    'No se pudo cargar el reproductor de YouTube (¿sin internet o bloqueado?).': 'Could not load the YouTube player (offline or blocked?).',
    'El micrófono requiere localhost o HTTPS.': 'The microphone requires localhost or HTTPS.', 'No se pudo abrir el micrófono: ': 'Could not open the microphone: ',
    'No se pudo iniciar: ': 'Could not start: ',
    // style editor
    'Estilo de subtítulos · OpenCaptions': 'Caption style · OpenCaptions', '· estilo de subtítulos': '· caption style',
    '🎬 Overlay vMix / OBS': '🎬 vMix / OBS overlay', '🖥️ Pantalla / proyector': '🖥️ Screen / projector',
    'Diseñá el estilo, copiá la URL y pegala en vMix (Web Browser input), OBS (Browser Source) o el navegador del proyector.':
      'Design the style, copy the URL and paste it into vMix (Web Browser input), OBS (Browser Source) or the projector browser.',
    'Tipografía': 'Font', 'Tamaño': 'Size', 'Peso': 'Weight', 'Líneas': 'Lines', 'Alineación': 'Alignment', 'Centro': 'Center', 'Izquierda': 'Left',
    'Color del texto': 'Text color', 'Caja': 'Box', 'Contorno': 'Outline', 'Sombra': 'Shadow', 'Sin efecto': 'None', 'Color caja / contorno': 'Box / outline color',
    'Opacidad caja': 'Box opacity', 'MAYÚSCULAS': 'UPPERCASE', 'Posición': 'Position', 'Abajo': 'Bottom', 'Arriba': 'Top', 'Ancho máx.': 'Max width',
    'Fondo de la página': 'Page background', 'Transparente (alpha)': 'Transparent (alpha)', 'Verde chroma': 'Chroma green', 'Negro': 'Black',
    'Color de acento': 'Accent color', 'Mostrar también el original': 'Also show the original', 'Mostrar QR': 'Show QR',
    'Accesibilidad: máximo 2 líneas, alto contraste (texto claro sobre caja oscura ≥ 70 %) y tipografías legibles como Atkinson Hyperlegible.':
      'Accessibility: max 2 lines, high contrast (light text on a ≥ 70 % dark box) and legible fonts such as Atkinson Hyperlegible.',
    'URL para usar en el evento': 'URL to use at the event', '✓ Copiada': '✓ Copied', 'TV clásico': 'Classic TV', 'Alto contraste': 'High contrast',
    'vMix: Add Input → Web Browser → 1920×1080 → pegá la URL. OBS: Fuente → Navegador → 1920×1080.': 'vMix: Add Input → Web Browser → 1920×1080 → paste the URL. OBS: Source → Browser → 1920×1080.',
    'Abrila en el navegador de la mini PC conectada al proyector, en pantalla completa (F11).': 'Open it full-screen (F11) in the browser of the PC connected to the projector.',
    'Programa (cámara / slides)': 'Program (camera / slides)',
    '📅 Agenda': '📅 Agenda',
    '🖨 Kit de QR': '🖨 QR kit', '📌 Flotante': '📌 Float', 'Todas las salas en una ventana siempre visible, encima de OBS o vMix': 'Every room in an always-on-top window, over OBS or vMix',
    '📚 Transcripciones': '📚 Transcripts',
    '🚀 Primeros pasos': '🚀 Getting started',
    'Ocultar': 'Hide',
    'Conectar Gemini': 'Connect Gemini',
    'Crear las salas': 'Create the rooms',
    'Conectar el audio de cada sala': 'Connect each room\'s audio',
    'Cargar la agenda (títulos automáticos)': 'Load the agenda (automatic titles)',
    'Imprimir los QR de cada sala': 'Print each room\'s QR code',
    'Prueba de sonido en cada sala': 'Sound check in every room',
    'listo · ': 'ready · ',
    'poné ': 'put ',
    'y reiniciá (hoy corre en modo simulado)': 'and restart (running in simulated mode now)',
    ' en ': ' in ',
    'runbook': 'runbook',
    '📅 pegar agenda': '📅 paste agenda',
    ' (opcional)': ' (optional)',
    '🖨 abrir kit': '🖨 open kit',
    '🎙 abrir': '🎙 open',
    '📅 Agenda del evento': '📅 Event agenda',
    'Transcripción en vivo (leer, buscar, resumen IA)': 'Live transcript (read, search, AI summary)',
    'Cada sala toma el título solo cuando empieza su charla, y si el speaker anterior se pasa de tiempo espera una pausa para no cortarlo.': 'Each room picks up the title when its talk starts; if the previous speaker runs late it waits for a pause so the talk isn\'t cut.',
    'Pegá la agenda (CSV: ': 'Paste the agenda (CSV: ',
    ' — una charla por línea, la hora como ': ' — one talk per line, time as ',
    ' para hoy o ': ' for today or ',
    'La entrada de audio se desconectó. Revisá el cable/placa y volvé a empezar.': 'The audio input was disconnected. Check the cable/interface and start again.',
    'entrada desconectada': 'input disconnected',
    'El navegador bloqueó el audio: hacé clic en la página (o usá el agente nativo).': 'The browser blocked audio: click the page (or use the native agent).',
  },
};

// Interpolated strings: [regex, replacement]
const PATTERNS = {
  en: [
    [/\bhace (\d+[smh])\b/g, '$1 ago'], [/pull configurado/g, 'pull configured'], [/ \(reintentando\)/g, ' (retrying)'],
    [/^Transcripción \((.*)\)$/, 'Transcript ($1)'], [/^Transcripciones · /, 'Transcripts · '], [/^Editar /, 'Edit '],
    [/^latencia ([\d.]+)s$/, 'latency $1s'], [/^Overlay vMix\/OBS — (.*)$/, 'vMix/OBS overlay — $1'],
    [/^¿Eliminar la sala (.*)\? \(las transcripciones guardadas se conservan\)$/, 'Delete room $1? (saved transcripts are kept)'],
    [/^Entrada (\d+)$/, 'Input $1'], [/^(\d+) sala\(s\) · $/, '$1 room(s) · '], [/^(\d+)\/(\d+) con audio · agente, navegador o stream \(ver $/, '$1/$2 with audio · agent, browser or stream (see '],
    [/^(\d+) charla\(s\) cargadas\.?$/, '$1 talk(s) loaded'], [/^✓ (\d+) charla\(s\) guardadas(.*)$/, '✓ $1 talk(s) saved$2'], [/ · ⚠ salas desconocidas: /, ' · ⚠ unknown rooms: '], [/ · Producción$/, ' · Production'], [/^Transcripción$/, 'Transcript'],
  ],
};

export const LANG = (() => {
  const q = qs.get('ui');
  if (q) { store.set('ui', q); return q; }
  const saved = store.get('ui', null);
  if (saved) return saved;
  return (navigator.language || 'es').toLowerCase().startsWith('es') ? 'es' : 'en';
})();

const dict = DICTS[LANG] || null;
const patterns = PATTERNS[LANG] || [];

/** Translate a single UI string (for alerts, prompts, confirms). */
export function tr(s) {
  if (!dict || s == null) return s;
  const k = String(s).trim();
  if (dict[k] != null) return String(s).replace(k, dict[k]);
  let out = String(s);
  for (const [re, rep] of patterns) out = out.replace(re, rep);
  return out;
}

function translateNode(n) {
  if (n.nodeType === 3) {
    const v = n.nodeValue;
    if (!v.trim()) return;
    const t = tr(v);
    if (t !== v) n.nodeValue = t;
  } else if (n.nodeType === 1) {
    if (n.tagName === 'SCRIPT' || n.tagName === 'STYLE' || n.hasAttribute('data-no-i18n')) return;
    for (const a of ['placeholder', 'title', 'aria-label']) if (n.hasAttribute(a)) { const v = n.getAttribute(a); const t = tr(v); if (t !== v) n.setAttribute(a, t); }
    for (const c of n.childNodes) translateNode(c);
  }
}

/** Translate the page now and keep translating anything rendered later. */
export function localize() {
  document.documentElement.lang = LANG;
  if (!dict) return;
  document.title = tr(document.title);
  translateNode(document.body);
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') translateNode(m.target);
      else m.addedNodes.forEach(translateNode);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
}

/** Language + theme switcher for page headers. */
export function prefsControls() {
  const wrap = document.createElement('span');
  wrap.className = 'row prefs';
  wrap.setAttribute('data-no-i18n', '');
  const langs = { es: 'ES', en: 'EN', ...Object.fromEntries(Object.keys(DICTS).map((k) => [k, k.toUpperCase()])) };
  wrap.innerHTML = `<select aria-label="UI language" title="UI language">${Object.entries(langs).map(([k, v]) => `<option value="${k}" ${k === LANG ? 'selected' : ''}>${v}</option>`).join('')}</select>
    <button type="button" aria-label="Theme" title="Light / dark">◐</button>`;
  wrap.querySelector('select').onchange = (e) => { store.set('ui', e.target.value); const u = new URL(location.href); u.searchParams.delete('ui'); location.href = u; };
  wrap.querySelector('button').onclick = () => {
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    const next = cur === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    store.set('theme', next);
  };
  return wrap;
}
