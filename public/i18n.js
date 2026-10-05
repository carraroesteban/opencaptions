// Operator-UI localization (dashboard, ingest, demo, style editor).
// Source strings are Spanish; add a language by adding a dictionary below (exact strings + a few patterns
// for interpolated text). A MutationObserver translates content rendered later (live dashboard cards,
// dialogs), so pages don't need to wrap every string. Viewer pages (index/watch/screen) use t() in common.js.
import { store, qs } from '/common.js';

const DICTS = {
  en: {
    // integrations and agenda import
    'Alertas al celular del equipo cuando algo necesita atención.': 'Alerts on the team’s phones when something needs attention.',
    'Cada charla terminada (con el enlace a la transcripción)': 'Each finished talk (with the link to its transcript)',
    'Cada subtítulo': 'Each caption',
    'Cada subtítulo y cada charla terminada, en JSON firmado, a tu sistema (intranet, archivo, Zapier, Make).': 'Each caption and each finished talk, as signed JSON, to your system (intranet, archive, Zapier, Make).',
    'Calendario (.ics)': 'Calendar (.ics)',
    'Calendario': 'Calendar',
    'Conectadas': 'Connected',
    'Conectar': 'Connect',
    'Desde Sessionize (API / Embed → un endpoint con «All») o un enlace de calendario (.ics): la sala es el lugar del evento y el título, su nombre. Las salas se reconocen por su nombre.': 'From Sessionize (API / Embed → an endpoint with "All") or a calendar link (.ics): the room is the event’s location and the title its name. Rooms are matched by name.',
    'Desde el repositorio de GitHub, con un volumen para los datos.': 'From the GitHub repository, with a volume for the data.',
    'En la nube, en minutos': 'In the cloud, in minutes',
    'Enlace': 'Link',
    'Enviar': 'Send',
    'Google y Microsoft': 'Google and Microsoft',
    'Idioma de los subtítulos': 'Caption language',
    'Importar': 'Import',
    'Importar de nuevo': 'Import again',
    'Importá la agenda desde Sessionize o un enlace de calendario (Google, Outlook).': 'Import the agenda from Sessionize or a calendar link (Google, Outlook).',
    'Inicio de sesión con las cuentas de la empresa (OpenID Connect).': 'Sign in with company accounts (OpenID Connect).',
    'Integraciones': 'Integrations',
    'Llevá los subtítulos adonde ya está tu público: una reunión de Zoom o Teams, una transmisión de YouTube, o cualquier sistema con un webhook.': 'Take the captions where your audience already is: a Zoom or Teams meeting, a YouTube stream, or any system with a webhook.',
    'OBS y vMix': 'OBS and vMix',
    'Origen': 'Source',
    'Overlay transparente para el streaming, y audio por RTMP o SRT.': 'Transparent overlay for the stream, and audio over RTMP or SRT.',
    'Sessionize y calendarios': 'Sessionize and calendars',
    'Subtítulos (y traducción) dentro de la reunión o el webinar, para todos los participantes.': 'Captions (and translation) inside the meeting or webinar, for every participant.',
    'Subtítulos CART dentro de la reunión de Teams.': 'CART captions inside the Teams meeting.',
    'Subtítulos en la transmisión en vivo, que el público activa con el botón CC.': 'Captions on the live stream, which viewers turn on with the CC button.',
    'Subtítulos en tus reuniones y transmisiones': 'Captions in your meetings and streams',
    'Tres comandos, cerca de tu público.': 'Three commands, close to your audience.',
    'Un clic: servidor con HTTPS y disco para los datos.': 'One click: a server with HTTPS and a disk for the data.',
    'Ya incluidas': 'Already built in',
    // settings: languages and transcripts
    'Los que pueden elegir las salas. Agregá los que necesites; después elegilos en cada sala.': 'The ones rooms can use. Add the ones you need, then pick them in each room.',
    'Idioma para agregar': 'Language to add',
    'Transcripciones para el público': 'Transcripts for the audience',
    'Qué puede leer y descargar el público sin iniciar sesión. Pedí permiso a los oradores antes de publicar charlas anteriores.': 'What the audience can read and download without signing in. Ask speakers before publishing past talks.',
    'Solo la charla en curso': 'Only the talk in progress',
    'Todas las charlas': 'Every talk',
    'Ninguna (solo el equipo)': 'None (team only)',
    'Lo fija PUBLIC_TRANSCRIPTS en el archivo .env.': 'Set by PUBLIC_TRANSCRIPTS in the .env file.',
    'Guardado': 'Saved',
    // generic
    'Sala': 'Room', 'Salas': 'Rooms', 'Idioma': 'Language', 'Original': 'Original', 'Abrir': 'Open', 'Copiar': 'Copy', 'Cerrar': 'Close',
    'Cancelar': 'Cancel', 'Guardar': 'Save', 'Cargar': 'Load', 'Nombre': 'Name', 'ID': 'ID', 'Estilo': 'Style', 'Fondo': 'Background',
    'Subtítulos': 'Captions', 'Subtítulos en vivo': 'Live captions', 'Micrófono': 'Microphone', '(predeterminado)': '(default)',
    'En vivo': 'Live', 'en vivo': 'live', 'detenido': 'stopped', 'preparando audio…': 'preparing audio…',
    'conectado': 'connected', 'desconectado': 'disconnected', 'reconectando…': 'reconnecting…', 'token inválido': 'invalid token',
    'reemplazado por otra ingesta': 'replaced by another ingest', 'error': 'error', 'Presets': 'Presets',
    // dashboard
    'Nueva sala': 'New room', 'Kit de QR': 'QR kit', 'Transcripciones': 'Transcripts', 'Estilo de subtítulos': 'Caption style', 'Prueba de sonido': 'Sound check', 'Ventana flotante': 'Floating window', 'Agenda': 'Agenda',
    'Primeros pasos': 'Getting started', 'Ocultar': 'Hide', 'Nueva charla': 'New talk', 'Ver detalles': 'See details', 'Ocultar detalles': 'Hide details', 'Reconectar IA': 'Reconnect AI',
    'Sin charla anunciada': 'No talk scheduled', 'Latencia': 'Latency', 'Todavía no hay salas': 'No rooms yet', 'Creá una sala por cada escenario o aula: cada una tiene su QR, su pantalla y su overlay.': 'Create one room per stage or classroom: each gets its own QR code, screen and overlay.',
    'Producción · OpenCaptions': 'Production · OpenCaptions', 'Producción': 'Production', 'Salas en vivo': 'Live rooms', 'Sesiones IA': 'AI sessions',
    'Espectadores': 'Viewers', 'Costo estimado': 'Estimated cost', 'CPU': 'CPU',
    'Glosario': 'Glossary',
    'Empezar': 'Start', 'Detener': 'Stop', 'Empezar a transcribir': 'Start captioning', 'Video de YouTube': 'YouTube video', 'Micrófono en vivo': 'Live microphone',
    'Elegí el micrófono, tocá Empezar y hablá en español o inglés.': 'Pick the microphone, press Start and speak in Spanish or English.',
    'Abrir pantalla para proyector': 'Open projector screen', 'Overlay para vMix/OBS': 'vMix/OBS overlay', 'Vista del público': 'Audience view', 'Panel de producción': 'Production dashboard',
    'Overlay vMix / OBS': 'vMix / OBS overlay', 'Pantalla / proyector': 'Screen / projector', 'Siguiente': 'Next',
    'Híbrido (subtítulos por texto + voz traducida en todos los idiomas)': 'Hybrid (text captions + translated voice in every language)',
    'Sistema': 'System', 'Monoespaciada': 'Monospace', 'Atkinson Hyperlegible (máxima legibilidad)': 'Atkinson Hyperlegible (most legible)',
    "Abrir el asistente": "Open the wizard",
    "Abrir la biblioteca pública": "Open the public library",
    "Agregar": "Add",
    "Agregar corrección": "Add a correction",
    "Ajustes": "Settings",
    "Aparece en los celulares, en la pantalla del escenario y en los carteles.": "It appears on phones, on the stage screen and on the posters.",
    "Automática: Gemini, y esta computadora si se corta internet": "Automatic: Gemini, and this computer if the internet goes down",
    "Cada cambio en la configuración del evento queda acá. Deshacé cualquiera para volver a como estaba.": "Every change to the event’s setup is listed here. Undo any of them to put things back as they were.",
    "Cada sala tiene su QR, su pantalla y su overlay. Cada cambio queda en el Historial y se puede deshacer.": "Each room has its own QR code, screen and overlay. Every change is recorded in History and can be undone.",
    "Con la agenda, cada sala nombra sola sus charlas sin cortar a quien se pasa de tiempo, y los nombres de speakers ayudan a la IA a escribirlos bien.": "With the agenda, each room names its talks by itself without cutting off a speaker who runs over, and speaker names help the AI spell them right.",
    "Correcciones": "Corrections",
    "Cuando la IA escribe algo mal siempre igual, corregilo acá. Podés poner varias variantes separadas por una barra vertical.": "When the AI always gets something wrong the same way, fix it here. Separate several variants with a vertical bar.",
    "Desde Swapcard, Sessionize o una planilla: exportá las sesiones, seleccioná todo (con la fila de títulos), copiá y pegá acá. O una charla por línea: sala, hora, título, speaker.": "From Swapcard, Sessionize or a spreadsheet: export the sessions, select everything (with the header row), copy and paste it here. Or one talk per line: room, time, title, speaker.",
    "Durante el evento, bloqueá la configuración: nadie puede borrar ni cambiar salas, agenda o glosario por error. Las acciones en vivo (siguiente charla, reconectar una sala) siguen funcionando.": "During the event, lock the setup: nobody can delete or change rooms, the agenda or the glossary by accident. Live actions (next talk, reconnecting a room) keep working.",
    "Editar": "Edit",
    "Ej: María José Fernández": "e.g. María José Fernández",
    "Eliminar": "Delete",
    "Escribir": "Write",
    "Guardar glosario": "Save glossary",
    "Hablá al micrófono y mirá los subtítulos.": "Speak into the microphone and watch the captions.",
    "Historial": "History",
    "IA y respaldo sin internet": "AI and offline backup",
    "Idiomas": "Languages",
    "Ingesta (abrir en la PC del escenario)": "Audio input (open on the stage PC)",
    "Lo que va en cada pantalla del lugar: el QR para el público, la pantalla del escenario y el overlay del streaming.": "What goes on each screen at the venue: the QR code for the audience, the stage screen and the livestream overlay.",
    "Modo evento": "Event mode",
    "Nombre del evento": "Event name",
    "Nombres y términos": "Names and terms",
    "Nombres y términos que la IA tiene que escribir bien, y correcciones que se aplican a todos los subtítulos al instante.": "Names and terms the AI has to get right, and corrections applied to every caption instantly.",
    "Overlay vMix/OBS": "vMix/OBS overlay",
    "Pantallas y QR": "Screens and QR",
    "Quitar": "Remove",
    "Reemplazar la agenda": "Replace the agenda",
    "Registro de eventos": "Event log",
    "Renombrar charla": "Rename talk",
    "Salas eliminadas": "Deleted rooms",
    "Servidor": "Server",
    "Si dice": "If it says",
    "Siguiente charla": "Next talk",
    "Speakers, marcas, siglas y palabras técnicas. Ayudan al reconocimiento de voz y a la traducción.": "Speakers, brands, acronyms and technical words. They help speech recognition and translation.",
    "Sus transcripciones se conservan. Restaurá una sala para tenerla de nuevo tal como estaba.": "Their transcripts are kept. Restore a room to get it back exactly as it was.",
    "Texto (frase a frase · menor latencia · 1 sesión Live por sala)": "Text (sentence by sentence · lowest delay · 1 Live session per room)",
    "Tipografía, colores y posición del overlay y la pantalla.": "Fonts, colours and position for the overlay and the screen.",
    "Todas las salas en una ventana siempre visible, encima de OBS o vMix.": "Every room in an always-on-top window, over OBS or vMix.",
    "Todavía no hay cambios.": "No changes yet.",
    "Todo lo que se dijo en cada charla, para leer, buscar y descargar en cada idioma.": "Everything said in each talk, to read, search and download in every language.",
    "Título": "Title",
    "Un cartel A4 por sala, para imprimir.": "One A4 poster per room, ready to print.",
    "Ver qué cambia": "See what changes",
    "Volvé a responder las preguntas del primer día: nombre, salas e idiomas. Antes de aplicar, muestra exactamente qué va a cambiar.": "Answer the first-day questions again: name, rooms and languages. Before applying, it shows exactly what will change.",
    "hace": "",
    'Todas las salas': 'All rooms', 'Modo simulado (sin API key)': 'Simulated mode (no API key)',
    'Asistente de configuración': 'Setup wizard', 'Motor de IA': 'AI engine',
    'Alertas en tu celular': 'Alerts on your phone', 'Para cuando nadie está mirando el panel.': 'For when nobody is looking at the dashboard.',
    'Informe del evento': 'Event report', 'URL de YouTube': 'YouTube URL',
    'Acceso': 'Access', 'Quién puede entrar a este panel, y desde qué dispositivos.': 'Who can open this dashboard, and from which devices.',
    'Gemini (la IA en la nube)': 'Gemini (the AI in the cloud)', 'Conectar Gemini en Ajustes': 'Connect Gemini in Settings', 'Dirección pública': 'Public address',
    'La API key con la que OpenCaptions usa Gemini. Se guarda en este servidor y nunca se muestra completa.': 'The API key OpenCaptions uses for Gemini. It’s kept on this server and never shown in full.',
    'La dirección a la que apuntan los QR y los links.': 'The address the QR codes and links point to.',
    'Siempre Gemini (nube)': 'Always Gemini (cloud)', 'Siempre esta computadora': 'Always this computer',
    'Usando la IA de esta computadora': 'Using this computer’s AI', 'Sin internet: los subtítulos siguen funcionando': 'No internet: captions keep running',
    'La IA de esta computadora genera los subtítulos. Vuelven a Gemini solos cuando la conexión se estabilice.': 'This computer’s AI is making the captions. They go back to Gemini by themselves once the connection is stable.',
    'Elegido desde el panel. Para volver a Gemini, cambiá el selector de IA.': 'Chosen from the dashboard. To go back to Gemini, change the AI selector.',
    'Sin conexión con Gemini': 'Can’t reach Gemini',
    'Si no vuelve en unos segundos, los subtítulos pasan a esta computadora.': 'If it isn’t back in a few seconds, captions move to this computer.',
    'Hay un respaldo listo en esta computadora: elegí «IA automática» o «Siempre esta computadora».': 'A backup is ready on this computer: choose “Automatic AI” or “Always this computer”.',
    'No hay respaldo local. La próxima vez iniciá con: npm run local -- --fallback': 'No local backup. Next time, start with: npm run local -- --fallback',
    'SIN INGESTA': 'NO INGEST', 'EN VIVO': 'LIVE', 'EN PAUSA · silencio': 'PAUSED · silence', 'ESPERANDO VOZ': 'WAITING FOR SPEECH',
    'sesiones cerradas (0 costo)': 'sessions closed (no cost)', 'Latencia orig.': 'Latency orig.', 'Latencia trad.': 'Latency transl.',
    'Público': 'Audience', 'Min · US$': 'Min · US$',
    'Sin fuente de audio. Abrí /ingest.html en la PC del escenario.': 'No audio source. Run the agent or open /ingest.html on the stage PC.',
    'no llega audio': 'no audio arriving', '¿mic muteado? (60s sin señal)': 'mic muted? (60 s without signal)', 'reconectando IA': 'AI reconnecting',
    'latencia alta': 'high latency', 'traducción limitada por cuota → usando Live': 'translation rate-limited → using Live',
    'Idioma de la charla': 'Talk language', 'Detectar automáticamente': 'Detect automatically', 'Traducir a': 'Translate to',
    'Modo de traducción de subtítulos': 'Caption translation mode', 'Por defecto del servidor': 'Server default',
    'Live (speech-to-speech de Gemini · 1 sesión por idioma)': 'Live (Gemini speech-to-speech · 1 session per language)',
    'Pull de audio (opcional): SRT/RTMP/HLS/HTTP o archivo — el server lo toma con ffmpeg': 'Audio pull (optional): SRT/RTMP/HLS/HTTP or file — pulled by the server with ffmpeg',
    'Repetir en loop (archivos de prueba)': 'Loop (test files)', 'Eliminar sala': 'Delete room',
    'Público (celular, QR)': 'Audience (phone, QR)', 'Descargar QR (SVG para imprimir)': 'Download QR (SVG for printing)',
    'Pantalla del escenario / proyector': 'Stage screen / projector', 'Overlay con fondo verde (chroma key)': 'Overlay with green background (chroma key)',
    'Charla': 'Talk',
    'Sin título': 'Untitled', 'Todavía no hay transcripciones.': 'No transcripts yet.',
    // ingest
    'Ingesta de audio · OpenCaptions': 'Audio ingest · OpenCaptions', 'Ingesta de audio del escenario': 'Stage audio ingest', 'Escenario': 'Stage', 'Fuente': 'Source',
    'Micrófono / placa de audio': 'Microphone / sound card', 'Pestaña o pantalla (audio de un stream, YouTube…)': 'Tab or screen (audio from a stream, YouTube…)',
    'Archivo de audio/video': 'Audio/video file', 'Audio de prueba incluido': 'Bundled test audio', 'Entrada': 'Input', 'Canal': 'Channel',
    'Mono (mezcla L+R)': 'Mono (L+R mix)', 'Solo izquierdo': 'Left only', 'Solo derecho': 'Right only', 'Archivo': 'File', 'Audio de prueba': 'Test audio',
    'Charla en inglés (EN → ES)': 'English talk (EN → ES)', 'Charla en español (ES → EN)': 'Spanish talk (ES → EN)', 'Ganancia': 'Gain',
    'Token de ingesta (si el server lo pide)': 'Ingest token (if the server requires it)',
    'Escuchar localmente (archivo/prueba)': 'Monitor locally (file/test)', 'Auto-iniciar al abrir (mini PC)': 'Auto-start on open (stage PC)', 'Nivel de entrada': 'Input level',
    'Una vez iniciado no requiere operador: si hay silencio por un rato se pausa el envío (sin costo) y retoma solo cuando alguien habla. Si se corta la red, reconecta y reenvía lo que quedó en buffer.':
    'Once started it needs no operator: after a while of silence it pauses sending (no cost) and resumes when someone speaks. If the network drops it reconnects and resends what was buffered.',
    'en pausa (silencio)': 'paused (silence)', 'enviando al modelo': 'sending to the model',
    '⚠ Esta página no está en un contexto seguro: el navegador': '⚠ This page is not in a secure context: the browser', 'no va a dejar usar el micrófono': 'will not allow microphone access',
    '. Abrila por': '. Open it over', 'o en': 'or on', '(ver docs/deployment.md → HTTPS).': '(see docs/deployment.md → HTTPS).',
    'No se compartió audio: marcá "Compartir audio de la pestaña".': 'No audio shared: tick "Share tab audio".', 'Elegí un archivo': 'Choose a file',
    // demo
    'Demo · OpenCaptions': 'Demo · OpenCaptions', '· demo': '· demo',
    'URL de YouTube (ej: https://www.youtube.com/watch?v=…)': 'YouTube URL (e.g. https://www.youtube.com/watch?v=…)', 'Desde (s)': 'From (s)',
    'Latencia original': 'Original latency', 'Latencia traducción': 'Translation latency', 'Idioma detectado': 'Detected language',
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
    'Abrila en el navegador de la PC conectada al proyector y tocá F (o doble clic) para pantalla completa.': 'Open it in the browser of the PC connected to the projector and press F (or double-click) for full screen.', 'Auto (llenar pantalla)': 'Auto (fill the screen)',
    'Segunda línea (bilingüe)': 'Second line (bilingual)', 'Ninguna': 'None', 'Motor de IA local': 'Local AI engine', 'Desde Swapcard, Sessionize o una planilla:': 'From Swapcard, Sessionize or a spreadsheet:', 'Todas las salas en una ventana siempre visible, encima de OBS o vMix': 'Every room in an always-on-top window, over OBS or vMix',
    'Conectar Gemini': 'Connect Gemini',
    'Crear las salas': 'Create the rooms',
    'Conectar el audio de cada sala': 'Connect each room\'s audio',
    'Imprimir los QR de cada sala': 'Print each room\'s QR code',
    'Prueba de sonido en cada sala': 'Sound check in every room',
    'listo · ': 'ready · ',
    'runbook': 'runbook',
    ' (opcional)': ' (optional)',
    'Transcripción en vivo (leer, buscar, resumen IA)': 'Live transcript (read, search, AI summary)',
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
  const b = (navigator.language || 'es').toLowerCase();
  return b.startsWith('es') ? 'es' : b.startsWith('pt') ? 'pt' : 'en';
})();

// Looked up by trimmed text (see tr), so keys are trimmed too: "No se pudo iniciar: " must still match.
const dict = DICTS[LANG] ? Object.fromEntries(Object.entries(DICTS[LANG]).map(([k, v]) => [k.trim(), v.trim()])) : null;
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

const PREFS_LABELS = {
  es: { lang: 'Idioma de la página', theme: 'Claro / oscuro' },
  en: { lang: 'Page language', theme: 'Light / dark' },
  pt: { lang: 'Idioma da página', theme: 'Claro / escuro' },
};

/**
 * Language + theme switcher for page headers.
 * @param {{ langs?: string[] }} [o]  languages to offer (audience pages add 'pt'); default: Spanish and English
 */
export function prefsControls({ langs = ['es', 'en', ...Object.keys(DICTS).filter((k) => k !== 'en')] } = {}) {
  const wrap = document.createElement('span');
  wrap.className = 'row prefs';
  wrap.setAttribute('data-no-i18n', '');
  const cur = langs.includes(LANG) ? LANG : 'es';
  const L = PREFS_LABELS[cur] || PREFS_LABELS.en;
  wrap.innerHTML = `<select aria-label="${L.lang}" title="${L.lang}">${[...new Set(langs)].map((k) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${k.toUpperCase()}</option>`).join('')}</select>
    <button type="button" aria-label="${L.theme}" title="${L.theme}">◐</button>`;
  wrap.querySelector('select').onchange = (e) => {
    store.set('ui', e.target.value);
    const u = new URL(location.href);
    u.searchParams.delete('ui');
    // Same address (e.g. only a #hash): assigning it wouldn't reload the page.
    if (u.href === location.href || u.href.split('#')[0] === location.href.split('#')[0]) location.reload(); else location.href = u.href;
  };
  wrap.querySelector('button').onclick = () => {
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    const next = cur === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    store.set('theme', next);
  };
  return wrap;
}
