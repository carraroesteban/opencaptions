// Shared helpers for all OpenCaptions pages (no build step, plain ES modules).
import '/select.js';
export const qs = new URLSearchParams(location.search);

// A new data folder (a fresh start, FRESH=1, or a deleted data/) starts this browser afresh too: what it remembered
// here (choices, tips already seen) belonged to the old one. The page asks which data folder the server runs on (no
// cookie: caption pages set none); the first page after a change reloads once, without the old choices.
fetch('/api/instance', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => {
  if (!j?.id) return;
  const was = localStorage.getItem('oc.data');
  if (was === JSON.stringify(j.id)) return;
  const old = Object.keys(localStorage).filter((k) => k.startsWith('oc.'));
  if (was) for (const k of old) localStorage.removeItem(k);
  localStorage.setItem('oc.data', JSON.stringify(j.id));
  if (was && old.some((k) => k !== 'oc.data')) location.reload();
}).catch(() => { /* offline, or storage blocked: nothing to forget */ });

const browserLang = (navigator.language || 'es').slice(0, 2).toLowerCase();
const savedUi = (() => { try { return JSON.parse(localStorage.getItem('oc.ui')); } catch { return null; } })();
export const UI = qs.get('ui') || savedUi || (['es', 'pt'].includes(browserLang) ? (browserLang === 'pt' ? 'pt' : 'es') : 'en');
document.documentElement.lang = UI; // screen readers read the page in its language (captions say their own, see watch.js)

const T = {
  es: {
    chooseStage: 'Elegí una sala', chooseLang: 'Idioma de los subtítulos', live: 'En vivo', paused: 'En pausa', offline: 'Todavía no llega sonido',
    original: 'Original', listen: 'Escuchar', stopListen: 'Dejar de escuchar', download: 'Descargar', dual: 'Ver original',
    backToLive: 'Volver al vivo', waiting: 'Esperando que empiece a hablar alguien…', connecting: 'Conectando…', startsHere: 'Los subtítulos aparecen acá en cuanto empiece. Elegí tu idioma arriba.', reconnecting: 'Reconectando…', noNet: 'Sin conexión',
    followOnPhone: 'Seguí los subtítulos en tu celu', scan: 'Escaneá el QR', stages: 'Salas', uiLang: 'Idioma de la página', fmtText: 'texto', fmtSubs: 'subtítulos', fmtWeb: 'web', screenTitle: 'Pantalla', liveCaptions: 'Subtítulos en vivo', production: 'Producción', myTranscripts: 'Mis transcripciones', myTranscriptsHint: 'Todo lo que subtitulaste en esta compu: leelo, buscalo o descargalo.', backCaptions: 'Subtítulos',
    fontSize: 'Tamaño', newTalk: 'Nueva charla', poweredBy: 'Subtítulos generados con IA · pueden contener errores',
    listenHint: 'Usá auriculares', roomSoundHint: 'El sonido de la sala · usá auriculares o conectá tus audífonos', soundFull: 'El sonido de la sala está completo: ya lo escucha el máximo de personas. Los subtítulos siguen. Probá de nuevo en unos minutos.', soundOff: 'El sonido de la sala se apagó. Los subtítulos siguen.', talkChanged: 'Empezó una nueva charla', allStages: 'Todas las salas', theme: 'Tema',
    brk: 'Pausa', brkSub: 'Los subtítulos siguen cuando vuelva la charla.', backAt: 'Volvemos a las', nextUp: 'Próxima charla', musicOn: 'Suena música · los subtítulos vuelven cuando alguien hable',
    fixTalk: 'Corregir', fixHint: 'Tocá una frase para corregirla: se guarda al salir de ella (Enter). Las descargas usan el texto corregido.',
    deleteTalk: 'Eliminar', deleteTalkQ: '¿Eliminar para siempre esta transcripción? No se puede deshacer.',
    catchUp: '¿Qué me perdí?', lastMinutes: 'Últimos 5 min', wholeTalk: 'Toda la charla', askTalk: 'Preguntale a la charla', askPlaceholder: 'Ej: ¿cuáles fueron las ideas principales?', askBtn: 'Preguntar', thinking: 'Pensando…', aiNote: 'Generado con IA a partir de la transcripción · puede contener errores', noAiNote: 'Momentos destacados de la transcripción', notFound: 'No lo encontré en lo que se dijo hasta ahora.', nothingYet: 'Todavía no hay suficiente para resumir. Volvé en un rato.', transcript: 'Transcripción', settings: 'Ajustes', textSize: 'Tamaño del texto', font: 'Tipografía', fontDefault: 'Estándar', fontLegible: 'Alta legibilidad', fontEasy: 'Lectura fácil', lineSpacing: 'Interlineado', themeAuto: 'Automático', themeLight: 'Claro', themeDark: 'Oscuro', themeContrast: 'Alto contraste', flow: 'Subtítulos', wordByWord: 'Palabra por palabra', wholeSentences: 'Oraciones completas', close: 'Cerrar', search: 'Buscar en la transcripción', matches: 'coincidencias', match: 'coincidencia', summary: 'Resumen', keyTerms: 'Temas clave', library: 'Transcripciones de las charlas', libraryHint: 'Cada charla, en tu idioma.', liveNow: 'En vivo ahora', untitled: 'Charla sin título', copyLink: 'Copiar link', copied: '✓ Copiado', print: 'Imprimir', followLive: 'Seguir en vivo', noTalks: 'Todavía no hay transcripciones.', readTranscript: 'Leer la transcripción completa', quotesFrom: 'Lo que se dijo', tooMany: 'Muchas preguntas ahora mismo, probá en un minuto.', error: 'No se pudo completar. Probá de nuevo.', seeLive: 'Ver subtítulos en vivo', allTalks: 'Todas las charlas', generate: 'Generar resumen', transcriptOf: 'Transcripción de', aiOff: 'Las funciones de IA están desactivadas en este evento.', accessibility: 'Accesibilidad', searchTalks: 'Buscar por título o sala', next: 'A continuación', speaker: 'Speaker', yes: 'Sí', no: 'No', floating: 'Subtítulos flotantes', fullscreen: 'pantalla completa',
    // a transcript with nothing to show says why, and what to do
    cancel: 'Cancelar', retry: 'Probar de nuevo', txEmpty: 'Todavía no se dijo nada en {room}', txEmptyBody: 'La transcripción aparece acá en cuanto alguien habla, y queda guardada cuando termina la charla.',
    txGone: 'Esta transcripción no existe', txGoneBody: 'Puede que la hayan eliminado, o que al enlace le falte una parte. Buscala entre todas las charlas.',
    txPrivate: 'Esta transcripción no es pública', txPrivateBody: 'Los organizadores no la publicaron. Si sos del equipo, abrila desde Transcripciones en el panel de producción.',
    txFail: 'No se pudo abrir la transcripción', txFailBody: 'Revisá la conexión y probá de nuevo.', libPrivate: 'Las transcripciones de este evento no son públicas.',
    // audience redesign
    homeHint: 'Subtítulos y traducción en vivo de cada sala, en tu idioma.', roomsLive1: '1 sala en vivo', roomsLiveN: '{n} salas en vivo', otherRooms: 'Más salas', readIn: 'Leer en', noResults: 'Ninguna charla coincide con la búsqueda.',
    smaller: 'Texto más chico', bigger: 'Texto más grande', lhTight: 'Compacto', lhNormal: 'Normal', lhLoose: 'Amplio', send: 'Enviar',
    askSuggest1: '¿Cuáles son las ideas principales hasta ahora?', askSuggest2: '¿Qué dijo recién?', noSound: 'Sin sonido', captionsBy: 'Subtítulos por OpenCaptions',
  },
  en: {
    chooseStage: 'Choose a room', chooseLang: 'Caption language', live: 'Live', paused: 'Paused', offline: 'No sound yet',
    original: 'Original', listen: 'Listen', stopListen: 'Stop listening', download: 'Download', dual: 'Show original',
    backToLive: 'Back to live', waiting: 'Waiting for someone to start speaking…', connecting: 'Connecting…', startsHere: 'Captions appear here as soon as it starts. Pick your language above.', reconnecting: 'Reconnecting…', noNet: 'No connection',
    followOnPhone: 'Follow the captions on your phone', scan: 'Scan the QR code', stages: 'Rooms', uiLang: 'Page language', fmtText: 'text', fmtSubs: 'captions', fmtWeb: 'web', screenTitle: 'Screen', liveCaptions: 'Live captions', production: 'Production', myTranscripts: 'My transcripts', myTranscriptsHint: 'Everything you captioned on this computer: read, search or download it.', backCaptions: 'Captions',
    fontSize: 'Size', newTalk: 'New talk', poweredBy: 'AI-generated captions · may contain errors',
    listenHint: 'Use headphones', roomSoundHint: 'The room’s sound · use earbuds or connect your hearing aids', soundFull: 'The room’s sound is full: the most people it allows are already listening. Captions keep working. Try again in a few minutes.', soundOff: 'The room’s sound was turned off. Captions keep working.', talkChanged: 'A new talk started', allStages: 'All rooms', theme: 'Theme',
    brk: 'Break', brkSub: 'Captions continue when the talk resumes.', backAt: 'Back at', nextUp: 'Next talk', musicOn: 'Music playing · captions return when someone speaks',
    fixTalk: 'Correct', fixHint: 'Tap a sentence to correct it: it’s saved when you leave it (Enter). Downloads use the corrected text.',
    deleteTalk: 'Delete', deleteTalkQ: 'Delete this transcript for good? This can’t be undone.',
    catchUp: 'What did I miss?', lastMinutes: 'Last 5 min', wholeTalk: 'Whole talk', askTalk: 'Ask the talk', askPlaceholder: 'e.g. What were the main takeaways?', askBtn: 'Ask', thinking: 'Thinking…', aiNote: 'AI-generated from the transcript · may contain errors', noAiNote: 'Highlights from the transcript', notFound: "I couldn't find that in what has been said so far.", nothingYet: 'Not enough yet to summarize. Check back in a bit.', transcript: 'Transcript', settings: 'Settings', textSize: 'Text size', font: 'Font', fontDefault: 'Standard', fontLegible: 'High legibility', fontEasy: 'Easy reading', lineSpacing: 'Line spacing', themeAuto: 'Automatic', themeLight: 'Light', themeDark: 'Dark', themeContrast: 'High contrast', flow: 'Captions', wordByWord: 'Word by word', wholeSentences: 'Whole sentences', close: 'Close', search: 'Search the transcript', matches: 'matches', match: 'match', summary: 'Summary', keyTerms: 'Key topics', library: 'Talk transcripts', libraryHint: 'Every talk, in your language.', liveNow: 'Live now', untitled: 'Untitled talk', copyLink: 'Copy link', copied: '✓ Copied', print: 'Print', followLive: 'Follow live', noTalks: 'No transcripts yet.', readTranscript: 'Read the full transcript', quotesFrom: 'What was said', tooMany: 'Lots of questions right now — try again in a minute.', error: "Couldn't complete that. Please try again.", seeLive: 'See live captions', allTalks: 'All talks', generate: 'Generate summary', transcriptOf: 'Transcript of', aiOff: 'AI features are turned off for this event.', accessibility: 'Accessibility', searchTalks: 'Search by title or room', next: 'Up next', speaker: 'Speaker', yes: 'Yes', no: 'No', floating: 'Floating captions', fullscreen: 'full screen',
    // a transcript with nothing to show says why, and what to do
    cancel: 'Cancel', retry: 'Try again', txEmpty: 'Nothing has been said in {room} yet', txEmptyBody: 'The transcript shows up here as soon as someone speaks, and it’s kept when the talk ends.',
    txGone: 'This transcript doesn’t exist', txGoneBody: 'It may have been deleted, or part of the link is missing. Look for it among all the talks.',
    txPrivate: 'This transcript isn’t public', txPrivateBody: 'The organizers haven’t published it. If you’re on the team, open it from Transcripts in the production dashboard.',
    txFail: 'Couldn’t open the transcript', txFailBody: 'Check the connection and try again.', libPrivate: 'This event’s transcripts aren’t public.',
    // audience redesign
    homeHint: 'Live captions and translation for every room, in your language.', roomsLive1: '1 room live', roomsLiveN: '{n} rooms live', otherRooms: 'More rooms', readIn: 'Read in', noResults: 'No talks match your search.',
    smaller: 'Smaller text', bigger: 'Larger text', lhTight: 'Compact', lhNormal: 'Normal', lhLoose: 'Relaxed', send: 'Send',
    askSuggest1: 'What are the main ideas so far?', askSuggest2: 'What was just said?', noSound: 'No sound yet', captionsBy: 'Captions by OpenCaptions',
  },
  pt: {
    chooseStage: 'Escolha uma sala', chooseLang: 'Idioma das legendas', live: 'Ao vivo', paused: 'Em pausa', offline: 'Ainda sem som',
    original: 'Original', listen: 'Ouvir', stopListen: 'Parar de ouvir', download: 'Baixar', dual: 'Ver original',
    backToLive: 'Voltar ao vivo', waiting: 'Esperando alguém começar a falar…', connecting: 'Conectando…', startsHere: 'As legendas aparecem aqui assim que começar. Escolha seu idioma acima.', reconnecting: 'Reconectando…', noNet: 'Sem conexão',
    followOnPhone: 'Acompanhe as legendas no celular', scan: 'Escaneie o QR', stages: 'Salas', uiLang: 'Idioma da página', fmtText: 'texto', fmtSubs: 'legendas', fmtWeb: 'web', screenTitle: 'Tela', liveCaptions: 'Legendas ao vivo', production: 'Produção', myTranscripts: 'Minhas transcrições', myTranscriptsHint: 'Tudo o que você legendou neste computador: leia, pesquise ou baixe.', backCaptions: 'Legendas',
    fontSize: 'Tamanho', newTalk: 'Nova palestra', poweredBy: 'Legendas geradas por IA · podem conter erros',
    listenHint: 'Use fones de ouvido', roomSoundHint: 'O som da sala · use fones de ouvido ou conecte seus aparelhos auditivos', soundFull: 'O som da sala está lotado: o máximo de pessoas já está ouvindo. As legendas continuam. Tente de novo em alguns minutos.', soundOff: 'O som da sala foi desligado. As legendas continuam.', talkChanged: 'Começou uma nova palestra', allStages: 'Todas as salas', theme: 'Tema',
    brk: 'Intervalo', brkSub: 'As legendas continuam quando a palestra voltar.', backAt: 'Voltamos às', nextUp: 'Próxima palestra', musicOn: 'Tocando música · as legendas voltam quando alguém falar',
    fixTalk: 'Corrigir', fixHint: 'Toque numa frase para corrigi-la: ela é salva quando você sai dela (Enter). Os downloads usam o texto corrigido.',
    deleteTalk: 'Excluir', deleteTalkQ: 'Excluir esta transcrição para sempre? Não dá para desfazer.',
    catchUp: 'O que eu perdi?', lastMinutes: 'Últimos 5 min', wholeTalk: 'Palestra inteira', askTalk: 'Pergunte à palestra', askPlaceholder: 'Ex.: quais foram as ideias principais?', askBtn: 'Perguntar', thinking: 'Pensando…', aiNote: 'Gerado por IA a partir da transcrição · pode conter erros', noAiNote: 'Destaques da transcrição', notFound: 'Não encontrei isso no que foi dito até agora.', nothingYet: 'Ainda não há o suficiente para resumir. Volte daqui a pouco.', transcript: 'Transcrição', settings: 'Ajustes', textSize: 'Tamanho do texto', font: 'Fonte', fontDefault: 'Padrão', fontLegible: 'Alta legibilidade', fontEasy: 'Leitura fácil', lineSpacing: 'Espaçamento', themeAuto: 'Automático', themeLight: 'Claro', themeDark: 'Escuro', themeContrast: 'Alto contraste', flow: 'Legendas', wordByWord: 'Palavra por palavra', wholeSentences: 'Frases completas', close: 'Fechar', search: 'Buscar na transcrição', matches: 'resultados', match: 'resultado', summary: 'Resumo', keyTerms: 'Temas principais', library: 'Transcrições das palestras', libraryHint: 'Cada palestra, no seu idioma.', liveNow: 'Ao vivo agora', untitled: 'Palestra sem título', copyLink: 'Copiar link', copied: '✓ Copiado', print: 'Imprimir', followLive: 'Acompanhar ao vivo', noTalks: 'Ainda não há transcrições.', readTranscript: 'Ler a transcrição completa', quotesFrom: 'O que foi dito', tooMany: 'Muitas perguntas agora — tente em um minuto.', error: 'Não foi possível concluir. Tente de novo.', seeLive: 'Ver legendas ao vivo', allTalks: 'Todas as palestras', generate: 'Gerar resumo', transcriptOf: 'Transcrição de', aiOff: 'As funções de IA estão desativadas neste evento.', accessibility: 'Acessibilidade', searchTalks: 'Buscar por título ou sala', next: 'A seguir', speaker: 'Palestrante', yes: 'Sim', no: 'Não', floating: 'Legendas flutuantes', fullscreen: 'tela cheia',
    // a transcript with nothing to show says why, and what to do
    cancel: 'Cancelar', retry: 'Tentar de novo', txEmpty: 'Ainda não foi dito nada em {room}', txEmptyBody: 'A transcrição aparece aqui assim que alguém fala, e fica salva quando a palestra termina.',
    txGone: 'Esta transcrição não existe', txGoneBody: 'Talvez tenha sido excluída, ou falta uma parte do link. Procure entre todas as palestras.',
    txPrivate: 'Esta transcrição não é pública', txPrivateBody: 'Os organizadores não a publicaram. Se você é da equipe, abra em Transcrições no painel de produção.',
    txFail: 'Não foi possível abrir a transcrição', txFailBody: 'Verifique a conexão e tente de novo.', libPrivate: 'As transcrições deste evento não são públicas.',
    // audience redesign
    homeHint: 'Legendas e tradução ao vivo de cada sala, no seu idioma.', roomsLive1: '1 sala ao vivo', roomsLiveN: '{n} salas ao vivo', otherRooms: 'Mais salas', readIn: 'Ler em', noResults: 'Nenhuma palestra corresponde à busca.',
    smaller: 'Texto menor', bigger: 'Texto maior', lhTight: 'Compacto', lhNormal: 'Normal', lhLoose: 'Amplo', send: 'Enviar',
    askSuggest1: 'Quais são as ideias principais até agora?', askSuggest2: 'O que acabou de ser dito?', noSound: 'Sem som', captionsBy: 'Legendas por OpenCaptions',
  },
};
export const t = (k) => T[UI]?.[k] ?? T.en[k] ?? k;

/**
 * Captions paused on purpose (server's pauseInfo: a break, or music in the room): what to tell viewers, or null.
 * { kind: 'break'|'music', title, back: 'Back at 11:30', next: 'Next talk: Title · Speaker' }
 */
export function pauseView(p) {
  const hm = (ms) => new Date(ms).toLocaleTimeString(UI, { hour: '2-digit', minute: '2-digit' });
  if (p?.brk) {
    const next = p.brk.next;
    const back = next?.start || p.brk.until;
    return {
      kind: 'break',
      title: p.brk.title || t('brk'),
      back: back && back > Date.now() ? `${t('backAt')} ${hm(back)}` : next ? '' : t('brkSub'),
      next: next ? `${t('nextUp')}: ${next.title}${next.speaker ? ` · ${next.speaker}` : ''}` : '',
    };
  }
  if (p?.music) return { kind: 'music', title: '♪', back: t('musicOn'), next: '' };
  return null;
}

export const store = {
  get(k, d) { try { const v = localStorage.getItem(`oc.${k}`); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`oc.${k}`, JSON.stringify(v)); } catch { /* private mode */ } },
};

// Theme: follows the OS (prefers-color-scheme) unless the viewer picked one.
(() => { const th = store.get('theme', null); if (th) document.documentElement.dataset.theme = th; })();

export async function getEvent() {
  const r = await fetch('/api/event');
  const ev = await r.json();
  setAccent(ev.accent);
  return ev;
}

/** Event accent colour → --accent, plus ink or paper on top of it (--on-accent) so text on it stays readable. */
export function setAccent(c) {
  if (!c) return;
  const root = document.documentElement.style;
  root.setProperty('--accent', c);
  const m = /rgba?\((\d+), (\d+), (\d+)/.exec(toColor(c) || '');
  if (!m) return root.removeProperty('--on-accent');
  const [r, g, b] = m.slice(1, 4).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  root.setProperty('--on-accent', 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.18 ? '#111014' : '#FAF8F3');
}

/**
 * Write a caption into an element. While it's still being spoken (not final), the last word is a .live-word span,
 * which fades in; the span is reused while the word doesn't change, so the fade plays once per word.
 */
export function liveText(el, text, final) {
  text = String(text ?? '');
  if (final) { el.textContent = text; return; }
  const cut = text.search(/\S+\s*$/);
  const head = cut > 0 ? text.slice(0, cut) : '', word = cut >= 0 ? text.slice(cut).trimEnd() : '';
  const span = el.lastChild?.nodeType === 1 && el.lastChild.classList.contains('live-word') ? el.lastChild : null;
  if (span && span.textContent === word && el.childNodes.length === 2 && el.firstChild.nodeType === 3) { el.firstChild.nodeValue = head; return; }
  el.textContent = '';
  el.append(document.createTextNode(head));
  if (word) { const w = Object.assign(document.createElement('span'), { className: 'live-word', textContent: word }); w.dataset.w = word; el.append(w); }
}

/**
 * Read a ?token= from the address bar once, remember it on this device and remove it from the URL, so it
 * doesn't stay in history, screenshots, screen shares or Referer headers.
 */
export function takeUrlToken(key) {
  const tk = qs.get('token');
  if (tk) {
    store.set(key, tk);
    const u = new URL(location.href);
    u.searchParams.delete('token');
    history.replaceState(null, '', u.pathname + u.search + u.hash);
  }
  return tk || store.get(key, '');
}

export function wsUrl(path, params = {}) {
  const u = new URL(path, location.href);
  u.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') u.searchParams.set(k, v);
  return u.toString();
}

/**
 * A one-minute, single-use ticket to send a room's audio (POST /api/ingest/ticket), so the ingest password never
 * travels in a WebSocket URL (where proxies log it). The password goes in a header; on the server computer, or
 * with a dashboard session, none is needed. '' when the server refuses it: the socket then closes with 4001.
 * Any other failure (a restart, a proxy's 502) throws, so Socket tries again instead of stopping the room's sound.
 * @param {string} [password]
 */
export async function ingestTicket(password = '') {
  const r = await fetch('/api/ingest/ticket', { method: 'POST', headers: password ? { authorization: `Bearer ${password}` } : {} });
  if (r.status === 401 || r.status === 403 || r.status === 429) return '';
  if (!r.ok) throw new Error(`ticket: HTTP ${r.status}`);
  return (await r.json()).ticket || '';
}

/** WebSocket with automatic reconnect + backoff. `urlFn` may be async (e.g. it fetches an ingest ticket). */
export class Socket {
  constructor(urlFn, handlers = {}) {
    this.urlFn = typeof urlFn === 'function' ? urlFn : () => urlFn;
    this.h = handlers;
    this.backoff = 500;
    this.closed = false;
    this.open();
  }
  async open() {
    const n = (this.opens = (this.opens || 0) + 1);
    let url;
    try { url = await this.urlFn(); } catch { return this.retry(); } // offline: try again like a dropped socket
    if (this.closed || n !== this.opens) return; // closed, or another open() started meanwhile (reconnect)
    const prev = this.ws;
    const ws = (this.ws = new WebSocket(url));
    if (prev && prev.readyState < 2) prev.close(); // a retry that was already scheduled: one connection at a time
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => { this.backoff = 500; this.h.open?.(); };
    ws.onmessage = (e) => (typeof e.data === 'string' ? this.h.message?.(JSON.parse(e.data)) : this.h.binary?.(e.data));
    ws.onclose = (e) => {
      if (ws !== this.ws) return; // replaced already (reconnect)
      this.h.close?.(e);
      // 4000 = replaced by another ingest, 4001 = bad token, 4004 = unknown room: don't fight it. Anything else is
      // reconnected with backoff, 1012 included (the server restarting, or the room removed: then 4004 follows).
      if (this.closed || e.code === 4000 || e.code === 4004 || e.code === 4001) return;
      this.retry();
    };
  }
  retry() {
    if (this.closed) return;
    // Jitter spreads reconnects when hundreds of phones lose the server at the same moment.
    setTimeout(() => this.open(), this.backoff * (0.5 + Math.random()));
    this.backoff = Math.min(this.backoff * 2, 8000);
  }
  get ready() { return this.ws?.readyState === 1; }
  send(obj) { if (this.ready) this.ws.send(typeof obj === 'string' || obj instanceof ArrayBuffer || ArrayBuffer.isView(obj) ? obj : JSON.stringify(obj)); }
  /** Open a new connection now (new parameters): no waiting, as there would be after a drop. */
  reconnect() {
    const old = this.ws;
    this.ws = null;
    try { old?.close(); } catch { /* ignore */ }
    this.open();
  }
  /** A viewer changes languages (or Listen) on the same connection; the server answers with a new hello. */
  subscribe(langs, audio = '0') {
    if (this.ready) this.send({ type: 'subscribe', langs, audio }); else this.reconnect();
  }
  close() { this.closed = true; this.ws?.close(); }
}

export function langLabel(code, names = {}) {
  if (code === 'orig') return t('original');
  return names[code] || code.toUpperCase();
}

/** Keeps finals + current partial for one channel. */
export class CaptionState {
  constructor(max = 200) { this.finals = []; this.partial = null; this.max = max; this.updatedAt = 0; }
  load(history = [], partial = null) { this.finals = history.slice(); this.partial = partial; this.updatedAt = Date.now(); }
  apply(seg) {
    this.updatedAt = Date.now();
    if (seg.final) {
      const i = this.finals.findIndex((f) => f.id === seg.id);
      if (i >= 0) this.finals[i] = seg; else this.finals.push(seg);
      if (this.finals.length > this.max) this.finals.shift();
      if (this.partial?.id === seg.id) this.partial = null;
    } else this.partial = seg;
  }
  clear() { this.finals = []; this.partial = null; }
  /** Last ~n characters of speech, for rolling (broadcast-style) captions. */
  tail(chars = 160) {
    const parts = [];
    for (let i = this.finals.length - 1; i >= 0 && parts.join(' ').length < chars; i--) parts.unshift(this.finals[i].text);
    if (this.partial?.text) parts.push(this.partial.text);
    let s = parts.join(' ').trim();
    if (s.length > chars) { s = s.slice(-chars); s = s.slice(s.indexOf(' ') + 1); }
    return s;
  }
}

/** Does this caption end a sentence? (Also in languages that write 。？！) */
export const endsSentence = (text) => /[.?!…。？！]["'”’»)\]]*\s*$/.test(String(text || ''));

/**
 * Captions as paragraphs to read (the phone page, Just for me). Each caption is a span in a paragraph. Captions
 * that continue a sentence flow on in the same paragraph (the local engine cuts at every pause, often mid-sentence);
 * a new paragraph starts after a sentence once the paragraph is long enough, or when another person speaks.
 * Only the caption that changed is touched, so the newest word's fade-in plays once.
 */
export class CaptionFlow {
  /** @param {HTMLElement} box  @param {{ chars?: number, bright?: number, max?: number }} [o] */
  constructor(box, { chars = 160, bright = 2, max = 120 } = {}) { Object.assign(this, { box, chars, bright, max }); }

  /** Everything again (history, another language). */
  render(segs) {
    this.box.replaceChildren();
    for (const s of segs) if (s?.text) this.update(s, false);
    this.#dim();
  }

  /** One caption arrived or changed. */
  update(seg, dim = true) {
    this.box.querySelector('.empty')?.remove();
    let span = this.box.querySelector(`span[data-id="${CSS.escape(seg.id)}"]`);
    if (!span) {
      let p = this.box.lastElementChild;
      const lastText = p?.lastElementChild?.textContent || '';
      const spk = seg.spk || '';
      if (!p || p.tagName !== 'P' || (spk && spk !== (p.dataset.who || '')) || (endsSentence(lastText) && p.textContent.length >= this.chars)) {
        const prev = p?.tagName === 'P' ? p.dataset.who || '' : '';
        p = document.createElement('p');
        p.dataset.who = spk || prev;
        if (spk && spk !== prev) p.dataset.spk = spk; // who is speaking, when it changes
        this.box.append(p);
        while (this.box.children.length > this.max) this.box.firstElementChild.remove();
      } else p.append(' ');
      span = Object.assign(document.createElement('span'), { className: 'cap-seg' });
      span.dataset.id = seg.id;
      p.append(span);
    }
    liveText(span, seg.text, seg.final);
    span.classList.toggle('partial', !seg.final);
    // Screen readers read each caption once, when it's final, not every word as it's being written.
    if (seg.final) span.removeAttribute('aria-hidden'); else span.setAttribute('aria-hidden', 'true');
    if (dim) this.#dim();
  }

  /** The last paragraphs in full colour, older ones dimmed. */
  #dim() {
    const ps = this.box.children;
    for (let i = 0; i < ps.length; i++) ps[i].classList.toggle('old', i < ps.length - this.bright);
  }
}

// G.711 μ-law byte → sample (-1..1): the room's sound comes this way, half the bytes of PCM16 (src/audio.js).
const MU_LAW = Float32Array.from({ length: 256 }, (_, b) => {
  const u = ~b & 0xff, exp = (u >> 4) & 7;
  const s = ((((u & 0x0f) << 3) + 0x84) << exp) - 0x84;
  return (u & 0x80 ? -s : s) / 32768;
});

/**
 * Plays streamed audio: the AI's translated voice (PCM16, 24 kHz) or the room's own sound (μ-law, 16 kHz).
 * Each chunk is queued right after the previous one; a short cushion absorbs network jitter. Once more than `maxAhead`
 * seconds are queued (a burst after the network stalled), new chunks are skipped until only `catchUp` seconds are left:
 * never two chunks at once, and the room's sound comes back close to the speaker's lips.
 */
export class PcmPlayer {
  /** @param {number} [rate]  @param {{ format?: 'pcm16'|'mulaw', maxAhead?: number, catchUp?: number }} [o] */
  constructor(rate = 24000, { format = 'pcm16', maxAhead = 3, catchUp = maxAhead } = {}) {
    Object.assign(this, { rate, format, maxAhead, catchUp, ctx: null, t: 0, catching: false });
  }
  async start() {
    // iOS: play even with the ring/silent switch on (Web Audio is muted as "ambient" otherwise).
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* older browsers */ }
    this.ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: this.rate });
    await this.ctx.resume();
    this.t = this.ctx.currentTime + 0.15;
  }
  push(ab) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.t > now + this.maxAhead) this.catching = true;
    if (this.catching) { if (this.t > now + this.catchUp) return; this.catching = false; } // too far behind → skip
    const mu = this.format === 'mulaw';
    const src8 = mu ? new Uint8Array(ab) : null, i16 = mu ? null : new Int16Array(ab, 0, ab.byteLength >> 1);
    const n = mu ? src8.length : i16.length;
    if (!n) return;
    const buf = this.ctx.createBuffer(1, n, this.rate);
    const ch = buf.getChannelData(0);
    if (mu) for (let i = 0; i < n; i++) ch[i] = MU_LAW[src8[i]];
    else for (let i = 0; i < n; i++) ch[i] = i16[i] / 32768;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.ctx.destination);
    if (this.t < now + 0.05) this.t = now + 0.1; // underrun → small cushion
    src.start(this.t);
    this.t += buf.duration;
  }
  stop() { this.ctx?.close(); this.ctx = null; }
}

/** Same as liveText(), as an HTML string (for pages that render with innerHTML). */
export function liveHtml(text) {
  const m = /^([\s\S]*?)(\S+)\s*$/.exec(String(text ?? ''));
  return m ? `${esc(m[1])}<span class="live-word" data-w="${esc(m[2])}">${esc(m[2])}</span>` : esc(text);
}

/** Copies text. The Clipboard API exists only on https or localhost, and some browsers refuse it without a
 *  permission; then the old way (select a hidden text box, execCommand) still works. Rejects when neither does. */
export async function copyText(text) {
  if (navigator.clipboard && isSecureContext && (await navigator.clipboard.writeText(text).then(() => true, () => false))) return;
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.className = 'sr-only';
  (document.querySelector('dialog[open]') || document.body).append(ta); // a modal dialog makes the rest inert
  ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  if (!ok) throw new Error('copy failed');
}
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Keep the screen on (phones reading captions, projector PCs). Silently does nothing if unsupported. */
export async function wakeLock() {
  const req = async () => { try { return await navigator.wakeLock?.request('screen'); } catch { return null; } };
  let lock = await req();
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') lock = await req();
  });
  return lock;
}

// ---------- reading preferences for the audience (watch + transcript pages) ----------
export const READING_FONTS = { default: null, legible: 'atkinson', easy: 'lexend' };
/** Apply saved font / line spacing as CSS variables (--read-font, --read-lh). */
export function applyReadingPrefs() {
  const p = store.get('reading', {});
  const root = document.documentElement.style;
  root.setProperty('--read-font', p.font && READING_FONTS[p.font] ? loadFont(READING_FONTS[p.font]) : 'var(--font)');
  root.setProperty('--read-lh', String(p.lh || 1.45));
  return p;
}
export function setReadingPref(k, v) {
  const p = store.get('reading', {});
  p[k] = v;
  store.set('reading', p);
  return applyReadingPrefs();
}
export function setTheme(th) {
  if (th === 'auto') { delete document.documentElement.dataset.theme; store.set('theme', null); }
  else { document.documentElement.dataset.theme = th; store.set('theme', th); }
}
/**
 * A segmented control (iOS, Linear): buttons on a track and a thumb that glides to the chosen one.
 * items: [value, label HTML (escape it), aria-label?]; onPick(value) runs on a new choice.
 */
export function segment(el, items, cur, onPick) {
  el.classList.add('segmented');
  el.innerHTML = '<span class="thumb" aria-hidden="true"></span>' + items.map(([v, html, aria]) => `<button type="button" data-v="${esc(v)}" aria-pressed="${String(v) === String(cur)}"${aria ? ` aria-label="${esc(aria)}" title="${esc(aria)}"` : ''}>${html}</button>`).join('');
  el.onclick = (e) => {
    const b = e.target.closest('[data-v]');
    if (!b || b.getAttribute('aria-pressed') === 'true') return;
    pressSegment(el, b.dataset.v);
    onPick(b.dataset.v);
  };
  // Re-measure when it becomes visible (a sheet opening) or its labels change width (a font arriving).
  el._ro ??= new ResizeObserver(() => glide(el, true));
  el._ro.disconnect();
  for (const x of [el, ...el.querySelectorAll(':scope > [data-v]')]) el._ro.observe(x); // not the thumb: it resizes as it glides
  glide(el, true);
}
/** Choose a value from code: the thumb glides there. */
export function pressSegment(el, v) {
  for (const x of el.querySelectorAll(':scope > [data-v]')) x.setAttribute('aria-pressed', String(x.dataset.v === String(v)));
  glide(el);
}
function glide(el, instant) {
  const th = el.querySelector(':scope > .thumb');
  const b = el.querySelector(':scope > [aria-pressed="true"]');
  if (!th || !b?.offsetWidth) return;
  if (instant) th.style.transition = 'none';
  Object.assign(th.style, { width: `${b.offsetWidth}px`, height: `${b.offsetHeight}px`, transform: `translate(${b.offsetLeft}px, ${b.offsetTop}px)` });
  th.classList.add('on');
  if (instant) { void th.offsetWidth; th.style.transition = ''; return; }
  // A track that scrolls (many languages): bring the choice into view, without moving the page.
  const l = b.offsetLeft - 24, r = b.offsetLeft + b.offsetWidth + 24 - el.clientWidth;
  if (l < el.scrollLeft) el.scrollTo({ left: l, behavior: 'smooth' }); else if (r > el.scrollLeft) el.scrollTo({ left: r, behavior: 'smooth' });
}
/** The Aa sheet's choices (phone captions and transcript): font, line spacing, theme. */
export const readingItems = {
  font: () => [['default', 'fontDefault'], ['legible', 'fontLegible'], ['easy', 'fontEasy']].map(([v, k]) => [v, `<span data-ff="${v}">${esc(t(k))}</span>`]),
  lh: () => [['1.3', 'lhTight'], ['1.5', 'lhNormal'], ['1.8', 'lhLoose']].map(([v, k]) => [v, `<span class="lh-ic ${k}" aria-hidden="true"><i></i><i></i><i></i></span>`, t(k)]),
  theme: () => [['auto', 'themeAuto'], ['light', 'themeLight'], ['dark', 'themeDark'], ['contrast', 'themeContrast']].map(([v, k]) => [v, `<span class="sw sw-${v}" aria-hidden="true">Aa</span><span class="sw-l">${esc(t(k))}</span>`]),
};
/** Each font choice written in its own font (loads them: call it when the sheet opens). */
export function previewFonts(el) {
  for (const s of el.querySelectorAll('[data-ff]')) s.style.fontFamily = READING_FONTS[s.dataset.ff] ? loadFont(READING_FONTS[s.dataset.ff]) : 'var(--font)';
}
export const fmtClock = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); return `${h ? h + ':' + String(m).padStart(2, '0') : m}:${String(s % 60).padStart(2, '0')}`; };

// ---------- caption styling (shared by overlay.html, screen.html and style.html) ----------
export const FONTS = {
  system: { label: 'Sistema', css: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
  atkinsonnext: { label: 'Atkinson Hyperlegible Next (OpenCaptions)', css: "'OC Digits', 'Atkinson Hyperlegible Next', system-ui, sans-serif" },
  inter: { label: 'Inter', family: 'Inter' },
  atkinson: { label: 'Atkinson Hyperlegible (máxima legibilidad)', family: 'Atkinson Hyperlegible' },
  lexend: { label: 'Lexend', family: 'Lexend' },
  roboto: { label: 'Roboto', family: 'Roboto' },
  opensans: { label: 'Open Sans', family: 'Open Sans' },
  montserrat: { label: 'Montserrat', family: 'Montserrat' },
  mono: { label: 'Monoespaciada', css: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace" },
};

/** "#fff" | "fff" | "ffffff80" | "transparent" → CSS color, optionally overriding alpha (0..1). */
export function toColor(v, alpha) {
  if (!v) return null;
  v = String(v).trim();
  if (v === 'transparent') return v;
  const hex = v.replace(/^#/, '');
  if (!/^[0-9a-f]{3,8}$/i.test(hex)) return v; // named colors, rgb(), …
  const full = hex.length <= 4 ? hex.split('').map((c) => c + c).join('') : hex;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  const a = alpha ?? (full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function loadFont(key) {
  const f = FONTS[key] || FONTS.system;
  // Fonts are served by OpenCaptions (public/fonts/<key>.css); the interface font is always loaded by tokens.css.
  if (f.family && !document.querySelector(`link[data-font="${key}"]`)) {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.dataset.font = key;
    l.href = `/fonts/${key}.css`;
    document.head.append(l);
  }
  return f.css || `'${f.family}', system-ui, sans-serif`;
}

/**
 * Apply caption style params (from the URL) as CSS variables on :root.
 * font, weight, color (text), box (box color), alpha (box opacity 0-100), style (box|outline|shadow|none),
 * upper (1), align (center|left), accent (label color).
 */
export function applyCaptionStyle(p, d = {}) {
  const get = (k) => p.get(k) ?? d[k];
  const root = document.documentElement.style;
  root.setProperty('--cap-font', loadFont(get('font') || 'atkinsonnext'));
  root.setProperty('--cap-weight', get('weight') || 700);
  root.setProperty('--cap-color', toColor(get('color') || 'ffffff'));
  const alpha = get('alpha') != null ? Number(get('alpha')) / 100 : undefined;
  root.setProperty('--cap-box', toColor(get('box') || '000000', alpha ?? 0.78));
  root.setProperty('--cap-transform', get('upper') === '1' ? 'uppercase' : 'none');
  root.setProperty('--cap-align', get('align') || 'center');
  if (get('accent')) setAccent(toColor(get('accent')));
  const style = get('style') || 'box';
  const edge = toColor(get('edge') || '000000');
  root.setProperty('--cap-shadow', style === 'outline'
    ? `0 0 3px ${edge}, 0 0 3px ${edge}, 2px 2px 2px ${edge}, -2px -2px 2px ${edge}, 2px -2px 2px ${edge}, -2px 2px 2px ${edge}`
    : style === 'shadow' ? `0 3px 10px ${edge}, 0 1px 2px ${edge}` : 'none');
  root.setProperty('--cap-box-on', style === 'box' ? '1' : '0');
  return style;
}

/** Fake caption stream for style previews (no server needed). */
export function previewStream(onText, lang = 'es') {
  const lines = {
    es: ['Buenos días a todos, y gracias por acompañarnos hoy.', 'Hoy quiero contarles cómo un equipo pequeño convirtió una idea simple en una comunidad global.', 'Todo empezó con una pregunta: ¿y si todas las personas de la sala pudieran seguir la charla?'],
    en: ['Good morning everyone, and thank you for joining us today.', 'Today I want to share how a small team turned a simple idea into a global community.', 'It all started with one question: what if everyone in the room could follow along?'],
  }[lang] || [];
  let s = 0, w = 0, done = '';
  return setInterval(() => {
    const words = lines[s % lines.length].split(' ');
    w++;
    const cur = words.slice(0, w).join(' ');
    onText(`${done} ${cur}`.trim());
    if (w >= words.length) { done = cur; w = 0; s++; }
  }, 380);
}

// ---------- a room's stream address (the welcome wizard's sound step and the dashboard's room panel) ----------
// OBS and vMix stream to this computer (ffmpeg listens): RTMP on 1935 and up, SRT on 9001 and up, one port per room.
export const LISTEN = {
  rtmp: { re: /^rtmps?:\/\/(?:0\.0\.0\.0|\[::\])(?::(\d+))?\/live\/(.+)$/i, base: 1935, pull: (port, room) => `rtmp://0.0.0.0:${port}/live/${room}` },
  srt: { re: /^srt:\/\/(?:0\.0\.0\.0|\[::\])?:(\d+)\?mode=listener$/i, base: 9001, pull: (port) => `srt://0.0.0.0:${port}?mode=listener` },
};
/** The port a room's pull address listens on for this protocol, or 0. */
export const listenPort = (pull, p) => { const m = (pull || '').match(LISTEN[p].re); return m ? Number(m[1] || 1935) : 0; };
/** The first port no other room listens on. */
export function freeListenPort(stages, room, p) {
  const used = new Set(stages.filter((x) => x.id !== room).map((x) => listenPort(x.pull, p)).filter(Boolean));
  let port = LISTEN[p].base;
  while (used.has(port)) port++;
  return port;
}
/** The address OBS or vMix types in: this computer on the venue network, not "localhost" (unless that's all there is). */
export function serverHost(setup) {
  const loop = /^(localhost|127\.0\.0\.1|\[::1\])$/i;
  for (const u of [setup.lanUrl, location.origin, setup.tunnel?.state === 'on' ? '' : setup.publicUrl]) {
    try { const h = new URL(u).hostname; if (h && !loop.test(h)) return h; } catch { /* not set */ }
  }
  return '127.0.0.1';
}

// The page is built (its module scripts have run up to their first wait): show it (style.css keeps it hidden until
// then, so it never flashes half-built or untranslated).
if (document.readyState === 'loading') addEventListener('DOMContentLoaded', () => document.documentElement.classList.add('ready'));
else document.documentElement.classList.add('ready');
