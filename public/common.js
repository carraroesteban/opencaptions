// Shared helpers for all OpenCaptions pages (no build step, plain ES modules).
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

const T = {
  es: {
    chooseStage: 'Elegí una sala', chooseLang: 'Idioma de los subtítulos', live: 'EN VIVO', paused: 'En pausa', offline: 'Sin audio',
    original: 'Original', listen: 'Escuchar', stopListen: 'Dejar de escuchar', download: 'Descargar', dual: 'Ver original',
    backToLive: 'Volver al vivo', waiting: 'Esperando que empiece a hablar alguien…', connecting: 'Conectando…',
    followOnPhone: 'Seguí los subtítulos en tu celu', scan: 'Escaneá el QR', stages: 'Salas', uiLang: 'Idioma de la página', fmtText: 'texto', fmtSubs: 'subtítulos', fmtWeb: 'web', screenTitle: 'Pantalla', liveCaptions: 'Subtítulos en vivo', production: 'Producción', myTranscripts: 'Mis transcripciones', myTranscriptsHint: 'Todo lo que subtitulaste en esta compu: leelo, buscalo o descargalo.', backCaptions: 'Subtítulos',
    fontSize: 'Tamaño', newTalk: 'Nueva charla', poweredBy: 'Subtítulos generados con IA · pueden contener errores',
    listenHint: 'Usá auriculares', roomSoundHint: 'El sonido de la sala · usá auriculares o conectá tus audífonos', soundFull: 'El sonido de la sala está completo: ya lo escucha el máximo de personas. Los subtítulos siguen. Probá de nuevo en unos minutos.', soundOff: 'El sonido de la sala se apagó. Los subtítulos siguen.', talkChanged: 'Empezó una nueva charla', allStages: 'Todas las salas', theme: 'Tema',
    brk: 'Pausa', brkSub: 'Los subtítulos siguen cuando vuelva la charla.', backAt: 'Volvemos a las', nextUp: 'Próxima charla', musicOn: 'Suena música · los subtítulos vuelven cuando alguien hable',
    fixTalk: 'Corregir', fixHint: 'Tocá una frase para corregirla: se guarda al salir de ella (Enter). Las descargas usan el texto corregido.',
    deleteTalk: 'Eliminar', deleteTalkQ: '¿Eliminar para siempre esta transcripción? No se puede deshacer.',
    catchUp: '¿Qué me perdí?', lastMinutes: 'Últimos 5 min', wholeTalk: 'Toda la charla', askTalk: 'Preguntale a la charla', askPlaceholder: 'Ej: ¿cuáles fueron las ideas principales?', askBtn: 'Preguntar', thinking: 'Pensando…', aiNote: 'Generado con IA a partir de la transcripción · puede contener errores', noAiNote: 'Momentos destacados de la transcripción', notFound: 'No lo encontré en lo que se dijo hasta ahora.', nothingYet: 'Todavía no hay suficiente para resumir. Volvé en un rato.', transcript: 'Transcripción', settings: 'Ajustes', textSize: 'Tamaño del texto', font: 'Tipografía', fontDefault: 'Estándar', fontLegible: 'Alta legibilidad', fontEasy: 'Lectura fácil', lineSpacing: 'Interlineado', themeAuto: 'Automático', themeLight: 'Claro', themeDark: 'Oscuro', themeContrast: 'Alto contraste', flow: 'Subtítulos', wordByWord: 'Palabra por palabra', wholeSentences: 'Oraciones completas', close: 'Cerrar', search: 'Buscar en la transcripción', matches: 'coincidencias', match: 'coincidencia', summary: 'Resumen', keyTerms: 'Temas clave', library: 'Transcripciones de las charlas', libraryHint: 'Leé, buscá y descargá lo que se dijo en cada charla — en tu idioma.', liveNow: 'En vivo ahora', untitled: 'Charla sin título', copyLink: 'Copiar link', copied: '✓ Copiado', print: 'Imprimir', followLive: 'Seguir en vivo', noTalks: 'Todavía no hay transcripciones.', readTranscript: 'Leer la transcripción completa', quotesFrom: 'Lo que se dijo', tooMany: 'Muchas preguntas ahora mismo, probá en un minuto.', error: 'No se pudo completar. Probá de nuevo.', seeLive: 'Ver subtítulos en vivo', allTalks: 'Todas las charlas', generate: 'Generar resumen', transcriptOf: 'Transcripción de', aiOff: 'Las funciones de IA están desactivadas en este evento.', accessibility: 'Accesibilidad', searchTalks: 'Buscar por título o sala', next: 'A continuación', speaker: 'Speaker', yes: 'Sí', no: 'No', floating: 'Subtítulos flotantes', fullscreen: 'pantalla completa',
  },
  en: {
    chooseStage: 'Choose a room', chooseLang: 'Caption language', live: 'LIVE', paused: 'Paused', offline: 'No audio',
    original: 'Original', listen: 'Listen', stopListen: 'Stop listening', download: 'Download', dual: 'Show original',
    backToLive: 'Back to live', waiting: 'Waiting for someone to start speaking…', connecting: 'Connecting…',
    followOnPhone: 'Follow the captions on your phone', scan: 'Scan the QR code', stages: 'Rooms', uiLang: 'Page language', fmtText: 'text', fmtSubs: 'captions', fmtWeb: 'web', screenTitle: 'Screen', liveCaptions: 'Live captions', production: 'Production', myTranscripts: 'My transcripts', myTranscriptsHint: 'Everything you captioned on this computer: read, search or download it.', backCaptions: 'Captions',
    fontSize: 'Size', newTalk: 'New talk', poweredBy: 'AI-generated captions · may contain errors',
    listenHint: 'Use headphones', roomSoundHint: 'The room’s sound · use earbuds or connect your hearing aids', soundFull: 'The room’s sound is full: the most people it allows are already listening. Captions keep working. Try again in a few minutes.', soundOff: 'The room’s sound was turned off. Captions keep working.', talkChanged: 'A new talk started', allStages: 'All rooms', theme: 'Theme',
    brk: 'Break', brkSub: 'Captions continue when the talk resumes.', backAt: 'Back at', nextUp: 'Next talk', musicOn: 'Music playing · captions return when someone speaks',
    fixTalk: 'Correct', fixHint: 'Tap a sentence to correct it: it’s saved when you leave it (Enter). Downloads use the corrected text.',
    deleteTalk: 'Delete', deleteTalkQ: 'Delete this transcript for good? This can’t be undone.',
    catchUp: 'What did I miss?', lastMinutes: 'Last 5 min', wholeTalk: 'Whole talk', askTalk: 'Ask the talk', askPlaceholder: 'e.g. What were the main takeaways?', askBtn: 'Ask', thinking: 'Thinking…', aiNote: 'AI-generated from the transcript · may contain errors', noAiNote: 'Highlights from the transcript', notFound: "I couldn't find that in what has been said so far.", nothingYet: 'Not enough yet to summarize. Check back in a bit.', transcript: 'Transcript', settings: 'Settings', textSize: 'Text size', font: 'Font', fontDefault: 'Standard', fontLegible: 'High legibility', fontEasy: 'Easy reading', lineSpacing: 'Line spacing', themeAuto: 'Automatic', themeLight: 'Light', themeDark: 'Dark', themeContrast: 'High contrast', flow: 'Captions', wordByWord: 'Word by word', wholeSentences: 'Whole sentences', close: 'Close', search: 'Search the transcript', matches: 'matches', match: 'match', summary: 'Summary', keyTerms: 'Key topics', library: 'Talk transcripts', libraryHint: 'Read, search and download what was said in each talk — in your language.', liveNow: 'Live now', untitled: 'Untitled talk', copyLink: 'Copy link', copied: '✓ Copied', print: 'Print', followLive: 'Follow live', noTalks: 'No transcripts yet.', readTranscript: 'Read the full transcript', quotesFrom: 'What was said', tooMany: 'Lots of questions right now — try again in a minute.', error: "Couldn't complete that. Please try again.", seeLive: 'See live captions', allTalks: 'All talks', generate: 'Generate summary', transcriptOf: 'Transcript of', aiOff: 'AI features are turned off for this event.', accessibility: 'Accessibility', searchTalks: 'Search by title or room', next: 'Up next', speaker: 'Speaker', yes: 'Yes', no: 'No', floating: 'Floating captions', fullscreen: 'full screen',
  },
  pt: {
    chooseStage: 'Escolha uma sala', chooseLang: 'Idioma das legendas', live: 'AO VIVO', paused: 'Em pausa', offline: 'Sem áudio',
    original: 'Original', listen: 'Ouvir', stopListen: 'Parar de ouvir', download: 'Baixar', dual: 'Ver original',
    backToLive: 'Voltar ao vivo', waiting: 'Esperando alguém começar a falar…', connecting: 'Conectando…',
    followOnPhone: 'Acompanhe as legendas no celular', scan: 'Escaneie o QR', stages: 'Salas', uiLang: 'Idioma da página', fmtText: 'texto', fmtSubs: 'legendas', fmtWeb: 'web', screenTitle: 'Tela', liveCaptions: 'Legendas ao vivo', production: 'Produção', myTranscripts: 'Minhas transcrições', myTranscriptsHint: 'Tudo o que você legendou neste computador: leia, pesquise ou baixe.', backCaptions: 'Legendas',
    fontSize: 'Tamanho', newTalk: 'Nova palestra', poweredBy: 'Legendas geradas por IA · podem conter erros',
    listenHint: 'Use fones de ouvido', roomSoundHint: 'O som da sala · use fones de ouvido ou conecte seus aparelhos auditivos', soundFull: 'O som da sala está lotado: o máximo de pessoas já está ouvindo. As legendas continuam. Tente de novo em alguns minutos.', soundOff: 'O som da sala foi desligado. As legendas continuam.', talkChanged: 'Começou uma nova palestra', allStages: 'Todas as salas', theme: 'Tema',
    brk: 'Intervalo', brkSub: 'As legendas continuam quando a palestra voltar.', backAt: 'Voltamos às', nextUp: 'Próxima palestra', musicOn: 'Tocando música · as legendas voltam quando alguém falar',
    fixTalk: 'Corrigir', fixHint: 'Toque numa frase para corrigi-la: ela é salva quando você sai dela (Enter). Os downloads usam o texto corrigido.',
    deleteTalk: 'Excluir', deleteTalkQ: 'Excluir esta transcrição para sempre? Não dá para desfazer.',
    catchUp: 'O que eu perdi?', lastMinutes: 'Últimos 5 min', wholeTalk: 'Palestra inteira', askTalk: 'Pergunte à palestra', askPlaceholder: 'Ex.: quais foram as ideias principais?', askBtn: 'Perguntar', thinking: 'Pensando…', aiNote: 'Gerado por IA a partir da transcrição · pode conter erros', noAiNote: 'Destaques da transcrição', notFound: 'Não encontrei isso no que foi dito até agora.', nothingYet: 'Ainda não há o suficiente para resumir. Volte daqui a pouco.', transcript: 'Transcrição', settings: 'Ajustes', textSize: 'Tamanho do texto', font: 'Fonte', fontDefault: 'Padrão', fontLegible: 'Alta legibilidade', fontEasy: 'Leitura fácil', lineSpacing: 'Espaçamento', themeAuto: 'Automático', themeLight: 'Claro', themeDark: 'Escuro', themeContrast: 'Alto contraste', flow: 'Legendas', wordByWord: 'Palavra por palavra', wholeSentences: 'Frases completas', close: 'Fechar', search: 'Buscar na transcrição', matches: 'resultados', match: 'resultado', summary: 'Resumo', keyTerms: 'Temas principais', library: 'Transcrições das palestras', libraryHint: 'Leia, busque e baixe o que foi dito em cada palestra — no seu idioma.', liveNow: 'Ao vivo agora', untitled: 'Palestra sem título', copyLink: 'Copiar link', copied: '✓ Copiado', print: 'Imprimir', followLive: 'Acompanhar ao vivo', noTalks: 'Ainda não há transcrições.', readTranscript: 'Ler a transcrição completa', quotesFrom: 'O que foi dito', tooMany: 'Muitas perguntas agora — tente em um minuto.', error: 'Não foi possível concluir. Tente de novo.', seeLive: 'Ver legendas ao vivo', allTalks: 'Todas as palestras', generate: 'Gerar resumo', transcriptOf: 'Transcrição de', aiOff: 'As funções de IA estão desativadas neste evento.', accessibility: 'Acessibilidade', searchTalks: 'Buscar por título ou sala', next: 'A seguir', speaker: 'Palestrante', yes: 'Sim', no: 'Não', floating: 'Legendas flutuantes', fullscreen: 'tela cheia',
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
 * @param {string} [password]
 */
export async function ingestTicket(password = '') {
  const r = await fetch('/api/ingest/ticket', { method: 'POST', headers: password ? { authorization: `Bearer ${password}` } : {} });
  if (!r.ok) return '';
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
    let url;
    try { url = await this.urlFn(); } catch { return this.retry(); } // offline: try again like a dropped socket
    if (this.closed) return;
    const ws = (this.ws = new WebSocket(url));
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => { this.backoff = 500; this.h.open?.(); };
    ws.onmessage = (e) => (typeof e.data === 'string' ? this.h.message?.(JSON.parse(e.data)) : this.h.binary?.(e.data));
    ws.onclose = (e) => {
      this.h.close?.(e);
      // 4000 = replaced by another ingest, 4001 = bad token, 4004 = unknown room: don't fight it.
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
  reconnect() { try { this.ws.close(); } catch { /* ignore */ } }
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
      span = Object.assign(document.createElement('span'), { className: 'seg' });
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
