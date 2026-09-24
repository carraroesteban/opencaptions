// Shared helpers for all OpenCaptions pages (no build step, plain ES modules).
export const qs = new URLSearchParams(location.search);

const browserLang = (navigator.language || 'es').slice(0, 2).toLowerCase();
const savedUi = (() => { try { return JSON.parse(localStorage.getItem('oc.ui')); } catch { return null; } })();
export const UI = qs.get('ui') || savedUi || (['es', 'pt'].includes(browserLang) ? (browserLang === 'pt' ? 'pt' : 'es') : 'en');

const T = {
  es: {
    chooseStage: 'Elegí una sala', chooseLang: 'Idioma de los subtítulos', live: 'EN VIVO', paused: 'En pausa', offline: 'Sin audio',
    original: 'Original', listen: 'Escuchar', stopListen: 'Dejar de escuchar', download: 'Descargar', dual: 'Ver original',
    backToLive: 'Volver al vivo', waiting: 'Esperando que empiece a hablar alguien…', connecting: 'Conectando…',
    followOnPhone: 'Seguí los subtítulos en tu celu', scan: 'Escaneá el QR', stages: 'Salas', production: 'Producción',
    fontSize: 'Tamaño', newTalk: 'Nueva charla', poweredBy: 'Subtítulos generados con IA · pueden contener errores',
    listenHint: 'Usá auriculares 🎧', talkChanged: 'Empezó una nueva charla', allStages: 'Todas las salas', theme: 'Tema',
  },
  en: {
    chooseStage: 'Choose a room', chooseLang: 'Caption language', live: 'LIVE', paused: 'Paused', offline: 'No audio',
    original: 'Original', listen: 'Listen', stopListen: 'Stop listening', download: 'Download', dual: 'Show original',
    backToLive: 'Back to live', waiting: 'Waiting for someone to start speaking…', connecting: 'Connecting…',
    followOnPhone: 'Follow the captions on your phone', scan: 'Scan the QR code', stages: 'Rooms', production: 'Production',
    fontSize: 'Size', newTalk: 'New talk', poweredBy: 'AI-generated captions · may contain errors',
    listenHint: 'Use headphones 🎧', talkChanged: 'A new talk started', allStages: 'All rooms', theme: 'Theme',
  },
  pt: {
    chooseStage: 'Escolha uma sala', chooseLang: 'Idioma das legendas', live: 'AO VIVO', paused: 'Em pausa', offline: 'Sem áudio',
    original: 'Original', listen: 'Ouvir', stopListen: 'Parar de ouvir', download: 'Baixar', dual: 'Ver original',
    backToLive: 'Voltar ao vivo', waiting: 'Esperando alguém começar a falar…', connecting: 'Conectando…',
    followOnPhone: 'Acompanhe as legendas no celular', scan: 'Escaneie o QR', stages: 'Salas', production: 'Produção',
    fontSize: 'Tamanho', newTalk: 'Nova palestra', poweredBy: 'Legendas geradas por IA · podem conter erros',
    listenHint: 'Use fones de ouvido 🎧', talkChanged: 'Começou uma nova palestra', allStages: 'Todas as salas', theme: 'Tema',
  },
};
export const t = (k) => T[UI]?.[k] ?? T.en[k] ?? k;

export const store = {
  get(k, d) { try { const v = localStorage.getItem(`oc.${k}`); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`oc.${k}`, JSON.stringify(v)); } catch { /* private mode */ } },
};

// Theme: follows the OS (prefers-color-scheme) unless the viewer picked one.
(() => { const th = store.get('theme', null); if (th) document.documentElement.dataset.theme = th; })();

export async function getEvent() {
  const r = await fetch('/api/event');
  const ev = await r.json();
  if (ev.accent) document.documentElement.style.setProperty('--accent', ev.accent);
  return ev;
}

export function wsUrl(path, params = {}) {
  const u = new URL(path, location.href);
  u.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') u.searchParams.set(k, v);
  return u.toString();
}

/** WebSocket with automatic reconnect + backoff. */
export class Socket {
  constructor(urlFn, handlers = {}) {
    this.urlFn = typeof urlFn === 'function' ? urlFn : () => urlFn;
    this.h = handlers;
    this.backoff = 500;
    this.closed = false;
    this.open();
  }
  open() {
    const ws = (this.ws = new WebSocket(this.urlFn()));
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => { this.backoff = 500; this.h.open?.(); };
    ws.onmessage = (e) => (typeof e.data === 'string' ? this.h.message?.(JSON.parse(e.data)) : this.h.binary?.(e.data));
    ws.onclose = (e) => {
      this.h.close?.(e);
      if (this.closed || e.code === 4004 || e.code === 4001) return;
      setTimeout(() => this.open(), this.backoff);
      this.backoff = Math.min(this.backoff * 2, 8000);
    };
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

/** Plays streamed PCM16 24 kHz translated speech. */
export class PcmPlayer {
  constructor(rate = 24000) { this.rate = rate; this.ctx = null; this.t = 0; }
  async start() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: this.rate });
    await this.ctx.resume();
    this.t = this.ctx.currentTime + 0.15;
  }
  push(ab) {
    if (!this.ctx) return;
    const i16 = new Int16Array(ab);
    const buf = this.ctx.createBuffer(1, i16.length, this.rate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < i16.length; i++) ch[i] = i16[i] / 32768;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.ctx.destination);
    const now = this.ctx.currentTime;
    if (this.t < now + 0.05) this.t = now + 0.1; // underrun → small cushion
    if (this.t > now + 3) this.t = now + 0.1; // drifted too far behind → catch up
    src.start(this.t);
    this.t += buf.duration;
  }
  stop() { this.ctx?.close(); this.ctx = null; }
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export async function wakeLock() {
  try {
    let lock = await navigator.wakeLock?.request('screen');
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible') lock = await navigator.wakeLock?.request('screen');
    });
    return lock;
  } catch { return null; }
}

// ---------- caption styling (shared by overlay.html, screen.html and style.html) ----------
export const FONTS = {
  system: { label: 'Sistema', css: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
  inter: { label: 'Inter', google: 'Inter' },
  atkinson: { label: 'Atkinson Hyperlegible (máxima legibilidad)', google: 'Atkinson Hyperlegible' },
  lexend: { label: 'Lexend', google: 'Lexend' },
  roboto: { label: 'Roboto', google: 'Roboto' },
  opensans: { label: 'Open Sans', google: 'Open Sans' },
  montserrat: { label: 'Montserrat', google: 'Montserrat' },
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
  if (f.google && !document.querySelector(`link[data-font="${key}"]`)) {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.dataset.font = key;
    l.href = `https://fonts.googleapis.com/css2?family=${f.google.replace(/ /g, '+')}:wght@400;500;600;700;800&display=swap`;
    document.head.append(l);
  }
  return f.css || `'${f.google}', system-ui, sans-serif`;
}

/**
 * Apply caption style params (from the URL) as CSS variables on :root.
 * font, weight, color (text), box (box color), alpha (box opacity 0-100), style (box|outline|shadow|none),
 * upper (1), align (center|left), accent (label color).
 */
export function applyCaptionStyle(p, d = {}) {
  const get = (k) => p.get(k) ?? d[k];
  const root = document.documentElement.style;
  root.setProperty('--cap-font', loadFont(get('font') || 'inter'));
  root.setProperty('--cap-weight', get('weight') || 600);
  root.setProperty('--cap-color', toColor(get('color') || 'ffffff'));
  const alpha = get('alpha') != null ? Number(get('alpha')) / 100 : undefined;
  root.setProperty('--cap-box', toColor(get('box') || '000000', alpha ?? 0.78));
  root.setProperty('--cap-transform', get('upper') === '1' ? 'uppercase' : 'none');
  root.setProperty('--cap-align', get('align') || 'center');
  if (get('accent')) root.setProperty('--accent', toColor(get('accent')));
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
    es: ['Bienvenidos a Nerdearla, hoy vamos a hablar de observabilidad en Kubernetes.', 'Lo primero que necesitás son buenas métricas, logs y trazas con OpenTelemetry.', 'Cuando suena el pager a las tres de la mañana, el contexto lo es todo.'],
    en: ['Welcome to Nerdearla, today we are going to talk about observability in Kubernetes.', 'The first thing you need is good metrics, logs and traces with OpenTelemetry.', 'When the pager goes off at three in the morning, context is everything.'],
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
