// Operator-UI localization (dashboard, ingest, demo, style editor).
// Source strings are Spanish; add a language by adding a dictionary below (exact strings + a few patterns
// for interpolated text). A MutationObserver translates content rendered later (live dashboard cards,
// dialogs), so pages don't need to wrap every string. Viewer pages (index/watch/screen) use t() in common.js.
import { store, qs } from '/common.js';

const DICTS = {
  en: {
    // integrations and agenda import
    'Alertas al celular del equipo cuando algo necesita atención (Ajustes → Alertas).': 'Alerts on the team’s phones when something needs attention (Settings → Alerts).',
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
    'Solo para mí': 'Just for me',
    'Usá OpenCaptions solo para vos: tus llamadas, videos y conversaciones en esta compu. Las salas, la agenda y las transcripciones quedan guardadas para cuando vuelvas.': 'Use OpenCaptions just for you: your calls, videos and conversations on this computer. Rooms, the agenda and transcripts are kept for when you come back.',
    'Pasar a Solo para mí': 'Switch to Just for me',
    'Los que pueden elegir las salas. Agregá los que necesites y quitá los que no; después elegilos en cada sala.': 'The ones rooms can use. Add the ones you need and remove the ones you don’t, then pick them in each room.',
    'Idioma para agregar': 'Language to add',
    'Transcripciones para el público': 'Transcripts for the audience',
    'Qué puede leer y descargar el público sin iniciar sesión. Pedí permiso a los oradores antes de publicar charlas anteriores.': 'What the audience can read and download without signing in. Ask speakers before publishing past talks.',
    'Solo la charla en curso': 'Only the talk in progress',
    'Todas las charlas': 'Every talk',
    'Ninguna (solo el equipo)': 'None (team only)',
    'Lo fija PUBLIC_TRANSCRIPTS en el archivo .env.': 'Set by PUBLIC_TRANSCRIPTS in the .env file.',
    'Guardado': 'Saved',
    'Modelo de voz': 'Speech model',
    'Con qué modelo de Gemini se escucha al orador en las salas que traducen los subtítulos como texto (el modo normal).': 'Which Gemini model listens to the speaker in rooms that translate captions as text (the usual mode).',
    'Subtítulos + voz traducida (Live Translate, unos US$ 2,2 por hora de sala)': 'Captions + translated voice (Live Translate, about US$ 2.2 per room-hour)',
    'Solo subtítulos (Transcribe Live, unos US$ 0,54 por hora de sala; recomendado)': 'Captions only (Transcribe Live, about US$ 0.54 per room-hour; recommended)',
    'Lo fija TRANSCRIBE_MODEL en el archivo .env.': 'Set by TRANSCRIBE_MODEL in the .env file.',
    'Subtítulos + voz traducida': 'Captions + translated voice', 'Solo subtítulos': 'Captions only',
    // breaks and music
    'PAUSA': 'BREAK', 'agenda': 'agenda', 'desde la sala': 'from the room', 'MÚSICA · en pausa': 'MUSIC · paused', 'Pausa': 'Break', 'Reanudar subtítulos': 'Resume captions',
    'Termina la pausa: los subtítulos vuelven cuando alguien habla.': 'Ends the break: captions come back when someone speaks.',
    'Pausa (intervalo, publicidad): los subtítulos se detienen y las pantallas y los celulares muestran la pausa y la próxima charla.': 'Break (intermission, ads): captions stop, and screens and phones show the break and the next talk.',
    'hay alguien hablando durante la pausa': 'someone is speaking during the break',
    'Suena música: los subtítulos vuelven solos cuando alguien hable.': 'Music playing: captions come back by themselves when someone speaks.',
    'Es una charla: subtitular igual': 'It’s a talk: caption anyway',
    'Subtítulos reanudados.': 'Captions resumed.', 'Pausa: las pantallas y los celulares lo muestran.': 'Break: screens and phones show it.',
    'Se subtitula igual hasta la próxima charla.': 'Captioning anyway until the next talk.',
    'Pausas desde la mezcla de video': 'Breaks from the vision mixer',
    'Cuando la transmisión pasa a una escena de pausa («Pausa», «Break», «Publicidad»…), los subtítulos de esa sala se pausan solos y las pantallas muestran la pausa y la próxima charla. Al volver, siguen.': 'When the stream switches to a break scene (“Break”, “Intermission”, “Ads”…), that room’s captions pause by themselves and the screens show the break and the next talk. When it switches back, they continue.',
    'Lee qué entrada está al aire (Web Controller, puerto 8088).': 'Reads which input is on air (Web Controller, port 8088).',
    'Lee la escena al aire (servidor WebSocket de OBS 28 o más nuevo, puerto 4455).': 'Reads the scene on air (OBS 28 or newer WebSocket server, port 4455).',
    'Dirección de la computadora': 'Computer’s address', 'Contraseña del servidor WebSocket': 'WebSocket server password',
    'Escenas de pausa (palabras separadas por comas)': 'Break scenes (words, separated by commas)',
    'al aire:': 'on air:', 'conectando…': 'connecting…', 'Escenas de pausa:': 'Break scenes:',
    'Ninguna mezcla conectada.': 'No vision mixer connected.', 'Desconectado.': 'Disconnected.',
    'En OBS: Herramientas → Configuración del servidor WebSocket → Habilitar. Copiá la contraseña. La dirección es la IP de la computadora con OBS (puerto 4455).': 'In OBS: Tools → WebSocket Server Settings → Enable. Copy the password. The address is the IP of the computer running OBS (port 4455).',
    'En vMix: Settings → Web Controller → Enable. La dirección es la IP de la computadora con vMix (puerto 8088). Se usa el título de la entrada al aire.': 'In vMix: Settings → Web Controller → Enable. The address is the IP of the computer running vMix (port 8088). The title of the input on air is used.',
    'Conectado. Al pasar a una escena de pausa, los subtítulos de la sala se pausan.': 'Connected. When it switches to a break scene, the room’s captions pause.',
    'respaldo · al aire': 'backup · on air', 'respaldo · en espera': 'backup · standby', 'Es el respaldo de la sala': 'This is the room’s backup',
    'Otra computadora (u otra salida de la consola) para la misma sala: queda en espera y entra sola si la principal se corta o se queda muda.': 'Another computer (or another output of the sound desk) for the same room: it waits on standby and takes over by itself if the main one stops or goes silent.',
    'RESPALDO AL AIRE': 'BACKUP ON AIR', 'respaldo en espera': 'backup on standby', 'usando el audio de respaldo': 'using the backup audio',
    'Corregir subtítulos': 'Fix captions', 'Guardar correcciones': 'Save corrections',
    'Corregí una frase (un nombre mal escuchado, un número): las pantallas, los celulares y la transcripción la reemplazan al instante.': 'Fix a sentence (a misheard name, a number): screens, phones and the transcript replace it at once.',
    'Todavía no hay frases en esta charla.': 'No sentences in this talk yet.',
    'Corregido en las pantallas, los celulares y la transcripción.': 'Fixed on the screens, the phones and the transcript.',
    '¿Escribirlo siempre así?': 'Always write it this way?',
    'Se agrega al glosario: corrige las próximas frases y ayuda a la IA a reconocerlo. Se puede deshacer desde el Historial.': 'It’s added to the glossary: it fixes the next sentences and helps the AI recognize it. You can undo it from the History.',
    'Siempre así': 'Always', 'Agregado al glosario.': 'Added to the glossary.',
    'Pausar los subtítulos cuando suena música (entre charlas, videos)': 'Pause captions while music plays (between talks, videos)',
    'El sonido de la sala en los celulares (escucha asistida)': 'The room’s sound on phones (assistive listening)',
    'Para quien usa audífonos o auriculares: escucha la sala en su celular, en Original → Escuchar. Cualquiera que tenga el enlace de la sala la escucha, aunque no esté en ella: activalo solo si lo que se dice ahí es público. El sonido no se guarda.': 'For people with hearing aids or earbuds: they hear the room on their phone, in Original → Listen. Anyone with the room’s link can hear it, even from outside the room: turn it on only if what’s said there is public. The sound isn’t recorded.',
    'Máximo de personas escuchando a la vez': 'Most people listening at once', 'Escuchando el sonido de la sala': 'Listening to the room’s sound',
    'Pausa (B)': 'Break (B)', 'Reanudar subtítulos (B)': 'Resume captions (B)', 'pausa': 'break', 'música: subtítulos en pausa': 'music: captions paused',
    'se oye: voz': 'hearing: voice', 'se oye: música': 'hearing: music', 'se oye: silencio': 'hearing: silence',
    'Pausa (intervalo, publicidad): los subtítulos se detienen y las pantallas muestran la pausa. Tecla B.': 'Break (intermission, ads): captions stop and the screens show the break. Key B.',
    // generic
    'Sala': 'Room', 'Salas': 'Rooms', 'Idioma': 'Language', 'Original': 'Original', 'Abrir': 'Open', 'Copiar': 'Copy', 'Cerrar': 'Close',
    'Cancelar': 'Cancel', 'Guardar': 'Save', 'Cargar': 'Load', 'Nombre': 'Name', 'ID': 'ID', 'Estilo': 'Style', 'Fondo': 'Background',
    'Subtítulos': 'Captions', 'Subtítulos en vivo': 'Live captions', 'Micrófono': 'Microphone', '(predeterminado)': '(default)',
    'En vivo': 'Live', 'en vivo': 'live', 'detenido': 'stopped', 'preparando audio…': 'preparing audio…',
    'conectado': 'connected', 'desconectado': 'disconnected', 'reconectando…': 'reconnecting…', 'token inválido': 'invalid token',
    'otra computadora tomó esta sala': 'another computer took over this room', 'falta el enlace o la contraseña': 'needs the room link or the password', 'error': 'error', 'Presets': 'Presets',
    'sala inexistente': 'unknown room', 'archivo terminado': 'file finished', 'Empezar de nuevo': 'Start again',
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
    "Automática: la nube, y esta computadora si se corta internet": "Automatic: the cloud, and this computer if the internet goes down",
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
    'IA en la nube': 'AI in the cloud', 'Conectar la IA en la nube en Ajustes': 'Connect the cloud AI in Settings', 'Dirección pública': 'Public address',
    'La API key de Gemini, la IA de Google con la que OpenCaptions subtitula en la nube. Se guarda en este servidor y nunca se muestra completa.': 'The API key for Gemini, Google’s AI that OpenCaptions uses for captions in the cloud. It’s kept on this server and never shown in full.',
    'La dirección a la que apuntan los QR y los links.': 'The address the QR codes and links point to.',
    'Siempre en la nube': 'Always in the cloud', 'Siempre esta computadora': 'Always this computer',
    'Usando la IA de esta computadora': 'Using this computer’s AI', 'Sin internet: los subtítulos siguen funcionando': 'No internet: captions keep running',
    'La IA de esta computadora genera los subtítulos. Vuelven a Gemini solos cuando la conexión se estabilice.': 'This computer’s AI is making the captions. They go back to Gemini by themselves once the connection is stable.',
    'Elegido desde el panel. Para volver a Gemini, cambiá el selector de IA.': 'Chosen from the dashboard. To go back to Gemini, change the AI selector.',
    'Sin conexión con la IA en la nube': 'Can’t reach the cloud AI',
    'Si no vuelve en unos segundos, los subtítulos pasan a esta computadora.': 'If it isn’t back in a few seconds, captions move to this computer.',
    'Hay un respaldo listo en esta computadora: elegí «IA automática» o «Siempre esta computadora».': 'A backup is ready on this computer: choose “Automatic AI” or “Always this computer”.',
    'No hay respaldo local. La próxima vez iniciá con: npm run local -- --fallback': 'No local backup. Next time, start with: npm run local -- --fallback',
    'SIN SONIDO': 'NO SOUND YET', 'ESPERANDO EL STREAM': 'WAITING FOR THE STREAM', 'EN VIVO': 'LIVE', 'EN PAUSA · silencio': 'PAUSED · silence', 'ESPERANDO VOZ': 'WAITING FOR SPEECH',
    'sesiones cerradas (0 costo)': 'sessions closed (no cost)', 'Latencia orig.': 'Latency orig.', 'Latencia trad.': 'Latency transl.',
    'Público': 'Audience', 'Min · US$': 'Min · US$',
    'Todavía no llega sonido.': 'No sound yet.', 'sonido desde': 'sound from',
    'no llega audio': 'no audio arriving', '¿mic muteado? (60s sin señal)': 'mic muted? (60 s without signal)', 'reconectando IA': 'AI reconnecting',
    'latencia alta': 'high latency', 'traducción limitada por cuota → usando Live': 'translation rate-limited → using Live',
    'Idioma de la charla': 'Talk language', 'Detectar automáticamente': 'Detect automatically', 'Traducir a': 'Translate to',
    'Modo de traducción de subtítulos': 'Caption translation mode', 'Por defecto del servidor': 'Server default',
    'Live (speech-to-speech de Gemini · 1 sesión por idioma)': 'Live (Gemini speech-to-speech · 1 session per language)',
    'Sonido desde un stream o un archivo (opcional)': 'Sound from a stream or a file (optional)',
    'Dejalo vacío si el sonido llega desde la página de sonido de la sala. Para OBS o vMix, el asistente crea la dirección (Ajustes → Abrir el asistente, paso 7). También acepta el enlace de un stream (SRT, RTMP, HLS) o un archivo de la carpeta samples de OpenCaptions.':
    'Leave it empty when the sound comes from the room’s sound page. For OBS or vMix, the setup wizard makes the address (Settings → Open the wizard, step 7). It also takes a stream link (SRT, RTMP, HLS) or a file in OpenCaptions’ samples folder.',
    'Repetir en loop (archivos de prueba)': 'Loop (test files)', 'Eliminar sala': 'Delete room',
    'Público (celular, QR)': 'Audience (phone, QR)', 'Descargar QR (SVG para imprimir)': 'Download QR (SVG for printing)',
    'Pantalla del escenario / proyector': 'Stage screen / projector', 'Overlay con fondo verde (chroma key)': 'Overlay with green background (chroma key)',
    'Charla': 'Talk',
    'Sin título': 'Untitled', 'Todavía no hay transcripciones.': 'No transcripts yet.',
    'Descargar todo (.zip)': 'Download all (.zip)', 'Todas las charlas de esta sala, en cada idioma: SRT, VTT y TXT': 'Every talk in this room, in each language: SRT, VTT and TXT',
    'Es demasiado para un solo archivo. Desde la API se puede descargar un día por vez.': 'Too much for one file. The API can download one day at a time.',
    'No se pudo preparar la descarga.': 'The download couldn’t be prepared.',
    // caption a recording
    'Subtitular una grabación': 'Caption a recording', 'Un archivo de audio o video de tu computadora, mucho más rápido que el tiempo real': 'An audio or video file from your computer, much faster than real time',
    'Un archivo de audio o video de tu computadora queda como una transcripción más de la sala, con sus subtítulos en cada idioma. Mucho más rápido que el tiempo real, y sin pasar por la sala en vivo.':
    'An audio or video file from your computer becomes one more transcript of the room, with its captions in each language. Much faster than real time, and without going through the live room.',
    'Arrastrá el archivo acá': 'Drop the file here', 'Elegir un archivo': 'Choose a file', 'Idioma que se habla': 'Spoken language',
    'Subtítulos en': 'Captions in', 'Subtitular': 'Caption it', 'Abrir la transcripción': 'Open the transcript', 'Algo salió mal.': 'Something went wrong.',
    // ingest
    'Sonido de la sala · OpenCaptions': 'Room sound · OpenCaptions', 'Enviar el sonido de esta sala': 'Send this room’s sound', 'Escenario': 'Stage', 'Fuente': 'Source',
    'Abrí esta página en la computadora que recibe el sonido del escenario: un micrófono, o una salida de la consola.': 'Open this page on the computer that gets the stage’s sound: a microphone, or an output of the sound desk.',
    '¿De dónde viene el sonido?': 'Where does the sound come from?',
    'Un micrófono o una placa de sonido': 'A microphone or a sound card', 'Otra pestaña o ventana (un stream, YouTube…)': 'Another tab or window (a stream, YouTube…)',
    'Una grabación (archivo de audio o video)': 'A recording (audio or video file)', 'Una charla de prueba': 'A sample talk', 'Entrada': 'Input', 'Canal': 'Channel',
    'Mono (mezcla L+R)': 'Mono (L+R mix)', 'Solo izquierdo': 'Left only', 'Solo derecho': 'Right only', 'Archivo': 'File', 'Audio de prueba': 'Test audio', 'Grabación': 'Recording', 'Charla de prueba': 'Sample talk',
    'Charla en inglés (EN → ES)': 'English talk (EN → ES)', 'Charla en español (ES → EN)': 'Spanish talk (ES → EN)', 'Ganancia': 'Gain', 'Volumen': 'Volume',
    'Esta computadora todavía no puede enviar sonido': 'This computer can’t send sound yet', 'Contraseña de las computadoras de sala': 'Room computer password',
    'Abrí el enlace de esta sala que te pasó quien organiza (está en el panel: Pantallas y QR → Computadora junto al escenario). Sin enlace, escribí la contraseña de las computadoras de sala: el servidor la muestra al iniciar, y en Ajustes → Acceso se puede crear una nueva. En la computadora del servidor no hace falta nada de esto.':
    'Open the link for this room that the organizer gave you (it’s in the dashboard: Screens and QR → Computer next to the stage). No link? Type the room computer password: the server shows it when it starts, and Settings → Access can make a new one. The server’s own computer needs none of this.',
    'Este enlace ya se usó o tiene más de 30 minutos. Pedí uno nuevo a quien organiza: en el panel, Pantallas y QR → Computadora junto al escenario.': 'This link was already used or is more than 30 minutes old. Ask the organizer for a new one: in the dashboard, Screens and QR → Computer next to the stage.',
    'No se pudo abrir el enlace de la sala. Revisá la conexión y abrilo de nuevo.': 'The room link couldn’t be opened. Check the connection and open it again.',
    'Escucharla también en esta computadora (grabación o prueba)': 'Also play it on this computer (recording or sample)', 'Empezar solo al abrir esta página': 'Start by itself when this page opens', 'Nivel de entrada': 'Input level',
    'Una vez que empieza, no necesita a nadie: si hay silencio un rato deja de enviar (sin costo) y sigue solo cuando alguien habla. Si se corta la red, se vuelve a conectar y manda lo que quedó pendiente.':
    'Once it starts it needs nobody: after a while of silence it stops sending (no cost) and carries on when someone speaks. If the network drops, it reconnects and sends what was waiting.',
    'en pausa (silencio)': 'paused (silence)', 'subtitulando': 'captioning', 'en espera': 'standby', 'retomando…': 'resuming…',
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
    'Conectar la IA en la nube': 'Connect the cloud AI',
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
    // sending a room's sound: the room card, Screens and QR
    'Todavía no llega sonido': 'No sound yet', 'Esperando el stream': 'Waiting for the stream',
    'Abrí la página de sonido de esta sala en la computadora junto al escenario.': 'Open this room’s sound page on the computer next to the stage.',
    'Empezá a transmitir desde OBS o vMix a la dirección de esta sala.': 'Start streaming from OBS or vMix to this room’s address.',
    'Abrir la página de sonido': 'Open the sound page', 'Abrir la página de sonido acá': 'Open the sound page here', 'Enlace para otra computadora': 'Link for another computer', 'Ver la dirección': 'See the address',
    'Computadora junto al escenario': 'Computer next to the stage',
    'La computadora que recibe el sonido de la sala (un micrófono o una salida de la consola) abre la página de sonido. Desde otra computadora, usá un enlace: sirve una vez y no pide contraseña.':
    'The computer that gets the room’s sound (a microphone or an output of the sound desk) opens the sound page. From another computer, use a link: it works once and asks for no password.',
    'Esta dirección no es segura (http), así que el navegador de la otra computadora no le va a dejar usar un micrófono. Creá primero una dirección pública (Ajustes → Dirección pública) y volvé a crear el enlace.':
    'This address isn’t secure (http), so the browser on the other computer won’t let it use a microphone. Create a public address first (Settings → Public address), then make the link again.',
    'Crear un enlace para esa computadora': 'Make a link for that computer', 'Enlace para la computadora junto al escenario': 'Link for the computer next to the stage',
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
