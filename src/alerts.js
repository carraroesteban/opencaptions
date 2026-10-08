// Alerts on the organizer's phone, for when nobody is looking at the dashboard: a room loses its sound, the AI keeps
// failing, a talk runs over, the internet drops, the public address breaks. Each problem is reported once when it
// has lasted a little while (most fix themselves in seconds), and once more when it's over.
//
// Where they go (Settings → Alerts, kept in data/secrets.json):
//   ntfy     → the free ntfy app (iPhone, Android, desktop): no account, just a hard-to-guess topic name
//   telegram → a Telegram bot (token from @BotFather) and a chat id
//   slack / discord → an incoming webhook URL
//   webhook  → any URL, which gets a JSON POST (Zapier, Make, n8n, your own script…)
import { readSecret, saveSecret } from './aikey.js';

/** @typedef {{ type: 'ntfy' | 'telegram' | 'slack' | 'discord' | 'webhook', topic?: string, server?: string, token?: string, chat?: string, url?: string }} Channel */
/** @typedef {{ lang: 'es' | 'en', channels: Channel[], snoozeUntil: number }} AlertConfig */
/** @typedef {{ key: string, room?: string, severity: 'urgent' | 'info', title: string, text: string, resolved?: boolean }} Message */

const M = {
  en: {
    lost: (r, m) => [`${r}: audio disconnected`, `The audio source of ${r} disconnected ${m} min ago. Check the room computer or the stream.`],
    lostOk: (r) => [`${r}: audio is back`, `The audio source of ${r} is connected again.`],
    silent: (r) => [`${r}: no sound`, `${r}'s audio source is connected but sending no sound. Check the cable or the input.`],
    silentOk: (r) => [`${r}: sound is back`, `${r} is receiving sound again.`],
    muted: (r) => [`${r}: microphone muted?`, `The sound level in ${r} has been very low for a few minutes. Is a microphone or the mixer muted?`],
    mutedOk: (r) => [`${r}: sound level is back`, `The sound level in ${r} is normal again.`],
    ai: (r) => [`${r}: captions keep failing`, `The AI connection for ${r} has been reconnecting for over a minute. Captions may be missing.`],
    aiOk: (r) => [`${r}: captions are back`, `The AI connection for ${r} is working again.`],
    mt: (r) => [`${r}: translations throttled`, `Translations for ${r} are being slowed down by the AI's quota. Check the plan or billing in AI Studio.`],
    mtOk: (r) => [`${r}: translations are back`, `Translations for ${r} are running normally again.`],
    late: (r) => [`${r}: captions running late`, `Captions in ${r} have been more than 6 seconds behind for a few minutes.`],
    lateOk: (r) => [`${r}: captions on time again`, `Captions in ${r} are back to their usual delay.`],
    over: (r, m, t) => [`${r}: ${m} min over`, `${r} is ${m} min past the agenda: "${t}" is due. Start it from the dashboard when the speaker finishes.`],
    offline: () => ['No internet', 'This server can\'t reach Google\'s AI and there\'s no offline backup running. Captions have stopped.'],
    offlineOk: () => ['Internet is back', 'This server can reach Google\'s AI again.'],
    toLocal: () => ['Switched to the offline backup', 'The internet dropped: captions now run on this computer.'],
    toCloud: () => ['Back on Gemini', 'The connection is stable again: captions are back on Gemini.'],
    tunnel: (e) => ['Public address down', `The public address isn't working (${e}). Phones on other networks can't open the captions.`],
    tunnelOk: () => ['Public address is back', 'The public address is working again.'],
    moved: (u) => ['The public address changed', `It's now ${u}. Printed QR codes point to the old one: print them again or turn on a fixed address.`],
    test: () => ['Test alert', 'Alerts from OpenCaptions will arrive here.'],
    more: (n) => [`${n} more alerts`, `${n} more alerts in the last minutes. Open the dashboard.`],
  },
  es: {
    lost: (r, m) => [`${r}: se desconectó el audio`, `La fuente de audio de ${r} se desconectó hace ${m} min. Revisá la computadora de la sala o el stream.`],
    lostOk: (r) => [`${r}: volvió el audio`, `La fuente de audio de ${r} se conectó de nuevo.`],
    silent: (r) => [`${r}: sin sonido`, `La fuente de audio de ${r} está conectada pero no manda sonido. Revisá el cable o la entrada.`],
    silentOk: (r) => [`${r}: volvió el sonido`, `${r} vuelve a recibir sonido.`],
    muted: (r) => [`${r}: ¿micrófono silenciado?`, `El nivel de sonido de ${r} lleva unos minutos muy bajo. ¿Hay un micrófono o la consola en mute?`],
    mutedOk: (r) => [`${r}: el nivel volvió`, `El nivel de sonido de ${r} es normal otra vez.`],
    ai: (r) => [`${r}: los subtítulos fallan`, `La conexión con la IA de ${r} lleva más de un minuto reconectándose. Pueden faltar subtítulos.`],
    aiOk: (r) => [`${r}: volvieron los subtítulos`, `La conexión con la IA de ${r} funciona de nuevo.`],
    mt: (r) => [`${r}: traducciones limitadas`, `Las traducciones de ${r} se están frenando por la cuota de la IA. Revisá el plan o la facturación en AI Studio.`],
    mtOk: (r) => [`${r}: volvieron las traducciones`, `Las traducciones de ${r} funcionan normalmente.`],
    late: (r) => [`${r}: subtítulos atrasados`, `Los subtítulos de ${r} llevan unos minutos más de 6 segundos atrás.`],
    lateOk: (r) => [`${r}: subtítulos a tiempo`, `Los subtítulos de ${r} volvieron a su demora habitual.`],
    over: (r, m, t) => [`${r}: ${m} min pasados`, `${r} va ${m} min atrasada respecto de la agenda: toca "${t}". Iniciala desde el panel cuando termine quien habla.`],
    offline: () => ['Sin internet', 'Este servidor no llega a la IA de Google y no hay respaldo sin internet. Los subtítulos se frenaron.'],
    offlineOk: () => ['Volvió internet', 'Este servidor vuelve a llegar a la IA de Google.'],
    toLocal: () => ['Pasó al respaldo sin internet', 'Se cortó internet: los subtítulos ahora salen de esta computadora.'],
    toCloud: () => ['De vuelta en Gemini', 'La conexión se estabilizó: los subtítulos vuelven a Gemini.'],
    tunnel: (e) => ['Se cayó la dirección pública', `La dirección pública no funciona (${e}). Los celulares de otras redes no pueden abrir los subtítulos.`],
    tunnelOk: () => ['Volvió la dirección pública', 'La dirección pública funciona de nuevo.'],
    moved: (u) => ['Cambió la dirección pública', `Ahora es ${u}. Los QR impresos apuntan a la anterior: volvé a imprimirlos o usá una dirección fija.`],
    test: () => ['Alerta de prueba', 'Las alertas de OpenCaptions van a llegar acá.'],
    more: (n) => [`${n} alertas más`, `${n} alertas más en los últimos minutos. Abrí el panel.`],
  },
};

// How long a problem must last before it's worth a message (most fix themselves in seconds).
const AFTER = { lost: 60_000, silent: 60_000, muted: 120_000, ai: 60_000, mt: 120_000, late: 180_000, offline: 30_000, tunnel: 30_000 };

export function loadConfig() {
  try { return { lang: 'en', channels: [], snoozeUntil: 0, ...JSON.parse(readSecret('alerts') || '{}') }; } catch { return { lang: 'en', channels: [], snoozeUntil: 0 }; }
}
export const saveConfig = (cfg) => saveSecret('alerts', JSON.stringify(cfg));

/** Channels as the dashboard may see them: tokens and webhook paths hidden. */
export function publicConfig(cfg) {
  const hide = (s) => (s ? `…${String(s).slice(-4)}` : '');
  const host = (u) => { try { return new URL(u).host; } catch { return ''; } };
  return {
    lang: cfg.lang,
    snoozeUntil: cfg.snoozeUntil > Date.now() ? cfg.snoozeUntil : 0,
    channels: cfg.channels.map((c) => ({ type: c.type, topic: c.topic, server: c.server, chat: c.chat, token: hide(c.token), url: c.url ? `${host(c.url)}/…${hide(c.url)}` : '' })),
  };
}

/** Validate what the dashboard sends; an empty secret field keeps the one already saved for that type. */
export function mergeChannels(incoming, current) {
  const out = [];
  for (const c of Array.isArray(incoming) ? incoming : []) {
    const old = current.find((x) => x.type === c.type) || {};
    // A hidden value (as publicConfig shows it, with "…") or an empty field keeps what's saved.
    const pick = (k) => (String(c[k] || '').includes('…') || !c[k] ? old[k] : String(c[k]).trim());
    if (c.type === 'ntfy') {
      const topic = String(c.topic || '').trim();
      if (!/^[A-Za-z0-9_-]{8,64}$/.test(topic)) throw new Error('ntfy topic: 8 to 64 letters, numbers, - or _ (make it hard to guess: anyone who knows it can read the alerts)');
      const server = String(c.server || '').trim().replace(/\/$/, '');
      if (server && !/^https?:\/\//.test(server)) throw new Error('ntfy server: an http(s) address');
      out.push({ type: 'ntfy', topic, ...(server ? { server } : {}) });
    } else if (c.type === 'telegram') {
      const token = pick('token'), chat = String(c.chat || '').trim();
      if (!/^\d+:[\w-]{30,}$/.test(token || '')) throw new Error('Telegram: paste the bot token from @BotFather (numbers:letters)');
      if (!/^-?\d+$|^@\w+$/.test(chat)) throw new Error('Telegram: the chat id is a number (or @channel)');
      out.push({ type: 'telegram', token, chat });
    } else if (['slack', 'discord', 'webhook'].includes(c.type)) {
      const url = pick('url');
      if (!/^https?:\/\/\S+$/.test(url || '')) throw new Error(`${c.type}: paste the full https:// address`);
      out.push({ type: c.type, url });
    }
  }
  return out;
}

/**
 * Send one message to one channel.
 * @param {Channel} ch @param {Message} m
 */
export async function deliver(ch, m) {
  const post = async (url, body, headers = {}) => {
    const r = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`${r.status} ${(await r.text().catch(() => '')).slice(0, 120)}`);
  };
  const json = { 'content-type': 'application/json' };
  const line = `${m.title}\n${m.text}`;
  if (ch.type === 'ntfy') {
    // JSON publishing (not headers): titles in Spanish need more than ASCII.
    return post(`${ch.server || 'https://ntfy.sh'}/`, JSON.stringify({
      topic: ch.topic, title: m.title, message: m.text,
      priority: m.severity === 'urgent' && !m.resolved ? 4 : 3,
      tags: [m.resolved ? 'white_check_mark' : m.severity === 'urgent' ? 'warning' : 'information_source'],
    }), json);
  }
  if (ch.type === 'telegram') return post(`https://api.telegram.org/bot${ch.token}/sendMessage`, JSON.stringify({ chat_id: ch.chat, text: line }), json);
  if (ch.type === 'slack') return post(ch.url, JSON.stringify({ text: `*${m.title}*\n${m.text}` }), json);
  if (ch.type === 'discord') return post(ch.url, JSON.stringify({ content: `**${m.title}**\n${m.text}` }), json);
  return post(ch.url, JSON.stringify({ source: 'opencaptions', event: m.key, room: m.room || null, severity: m.severity, resolved: !!m.resolved, title: m.title, text: m.text, at: new Date().toISOString() }), json);
}

export class Alerts {
  /** @param {{ send?: typeof deliver, log?: (s: string) => void, scale?: number }} [o]  scale shortens the waits (tests) */
  constructor({ send = deliver, log = () => {}, scale = 1 } = {}) {
    this.send = send;
    this.log = log;
    this.scale = scale;
    this.cfg = loadConfig();
    /** @type {Map<string, { since: number, fired: boolean, ok?: Message }>} */
    this.open = new Map();
    this.seen = new Set(); // rooms that had an audio source at some point
    this.lastUrl = '';
    this.lastActive = '';
    this.sent = []; // timestamps, for the flood limit
    this.held = 0;
  }

  get t() { return M[this.cfg.lang] || M.en; }

  /**
   * Called every few seconds with the server's state.
   * @param {{ stages: Array<{ id: string, name: string, ingest: boolean, had?: boolean, alerts: string[], dueTalk?: { title: string, start: number } | null, expected: boolean }>, failover?: any, tunnel?: any }} s
   */
  observe(s, now = Date.now()) {
    const t = this.t;
    const live = new Set();
    for (const st of s.stages) {
      if (st.ingest || st.had) this.seen.add(st.id);
      const on = (cond, kind, text, okText, after = AFTER[kind]) => {
        const key = `${st.id}:${kind}`;
        if (cond) { live.add(key); this.#hold(key, now, after, { key, room: st.id, severity: 'urgent', ...pair(text) }, okText && { key, room: st.id, severity: 'urgent', resolved: true, ...pair(okText) }); }
      };
      const mins = (k) => Math.max(1, Math.round((now - (this.open.get(`${st.id}:${k}`)?.since || now)) / 60_000));
      // An audio source that disconnects is news only if the room had one, and the agenda says it's on.
      on(!st.ingest && this.seen.has(st.id) && st.expected, 'lost', t.lost(st.name, mins('lost')), t.lostOk(st.name));
      on(st.alerts.includes('no-audio'), 'silent', t.silent(st.name), t.silentOk(st.name));
      on(st.alerts.includes('muted?'), 'muted', t.muted(st.name), t.mutedOk(st.name));
      on(st.alerts.includes('reconnecting'), 'ai', t.ai(st.name), t.aiOk(st.name));
      on(st.alerts.includes('mt-throttled'), 'mt', t.mt(st.name), t.mtOk(st.name));
      on(st.alerts.includes('high-latency'), 'late', t.late(st.name), t.lateOk(st.name));
      if (st.dueTalk) {
        const over = Math.round((now - st.dueTalk.start) / 60_000);
        // Once per due talk, when it's 5 minutes late (a speaker finishing a sentence isn't news).
        on(over >= 5, `over:${st.dueTalk.title}`, t.over(st.name, over, st.dueTalk.title), null, 0);
      }
    }
    const f = s.failover;
    if (f) {
      if (this.lastActive && f.active !== this.lastActive) this.#emit({ key: 'failover', severity: 'info', ...pair(f.active === 'local' ? t.toLocal() : t.toCloud()) });
      this.lastActive = f.active;
      const offline = f.online === false && !(f.active === 'local');
      if (offline) { live.add('offline'); this.#hold('offline', now, AFTER.offline, { key: 'offline', severity: 'urgent', ...pair(t.offline()) }, { key: 'offline', severity: 'urgent', resolved: true, ...pair(t.offlineOk()) }); }
    }
    const tu = s.tunnel;
    if (tu && tu.mode !== 'off') {
      if (tu.state === 'error' || (tu.state === 'starting' && tu.error)) { live.add('tunnel'); this.#hold('tunnel', now, AFTER.tunnel, { key: 'tunnel', severity: 'urgent', ...pair(t.tunnel(tu.error || '?')) }, { key: 'tunnel', severity: 'urgent', resolved: true, ...pair(t.tunnelOk()) }); }
      if (tu.mode === 'quick' && tu.state === 'on' && tu.url) {
        if (this.lastUrl && tu.url !== this.lastUrl) this.#emit({ key: 'tunnel.moved', severity: 'urgent', ...pair(t.moved(tu.url)) });
        this.lastUrl = tu.url;
      }
    } else this.lastUrl = '';
    // Problems that cleared: "it's over" for the ones we had reported, silence for the rest.
    for (const [key, o] of this.open) {
      if (live.has(key)) continue;
      this.open.delete(key);
      if (o.fired && o.ok) this.#emit(o.ok);
    }
  }

  #hold(key, now, after, msg, ok) {
    const o = this.open.get(key) || { since: now, fired: false, ok };
    this.open.set(key, o);
    if (!o.fired && now - o.since >= after * this.scale) {
      o.fired = true;
      // The message is built when it's sent, so "N min ago" is right.
      this.#emit(msg);
    }
  }

  /** @param {Message} m */
  #emit(m) {
    if (!this.cfg.channels.length || this.cfg.snoozeUntil > Date.now()) return;
    const now = Date.now();
    this.sent = this.sent.filter((x) => now - x < 10 * 60_000);
    // Flood limit: a power cut in every room is one bad minute, not forty messages.
    if (this.sent.length >= 20) { this.held++; return; }
    if (this.held) { const n = this.held; this.held = 0; this.#emit({ key: 'more', severity: 'info', ...pair(this.t.more(n)) }); }
    this.sent.push(now);
    return this.dispatch(m);
  }

  /**
   * Send to every channel, or to one kind (`type`, e.g. a test right after setting it up).
   * @param {Message} m @param {string} [type] @returns {Promise<Array<{ type: string, ok: boolean, error?: string }>>}
   */
  async dispatch(m, type = '') {
    const results = await Promise.all(this.cfg.channels.filter((ch) => !type || ch.type === type).map(async (ch) => {
      try { await this.send(ch, m); return { type: ch.type, ok: true }; } catch (e) { return { type: ch.type, ok: false, error: e.message }; }
    }));
    for (const r of results) if (!r.ok) this.log(`alert to ${r.type} failed: ${r.error}`);
    return results;
  }

  /** @param {string} [type]  only this destination */
  test(type = '') { return this.dispatch({ key: 'test', severity: 'info', ...pair(this.t.test()) }, type); }

  /** @param {Partial<AlertConfig>} patch */
  configure(patch) {
    this.cfg = { ...this.cfg, ...patch };
    saveConfig(this.cfg);
  }
}

const pair = ([title, text]) => ({ title, text });
