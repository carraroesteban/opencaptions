// Connectors: send a room's captions where people already are (a Zoom meeting, a YouTube live stream, a Teams
// meeting) or to any system (webhooks). Each one is a link the organizer pastes from that platform:
//   • Zoom: "Closed caption → Copy the API token" in the meeting. POST plain text, ?seq=N (+1 per new caption).
//   • YouTube Live: "Captions ingestion URL" in the stream's settings. POST "timestamp\ntext\n", ?seq=N.
//   • Microsoft Teams: the CART caption link from the meeting options. POST plain text, one short line per POST.
//   • Webhook: POST JSON (each caption and/or each finished talk), signed with HMAC-SHA256.
// The links carry the meeting's or stream's credentials, so they're kept with the other secrets (data/secrets.json),
// shown masked, and only the platform's own host is accepted for each type.
import crypto from 'node:crypto';
import { readSecret, saveSecret } from './aikey.js';
import { checkPullUrl } from './security.js';

export const TYPES = {
  zoom: { hosts: [/(^|\.)zoom\.us$/i], path: /^\/closedcaption/i, max: 400 },
  youtube: { hosts: [/^upload\.youtube\.com$/i], path: /^\/closedcaption/i, max: 400 },
  teams: { hosts: [/^api\.captions\.office\.microsoft\.com$/i], path: /^\/cartcaption/i, max: 120 },
  webhook: { hosts: null, path: null, max: 0 },
};
// Region codes the platforms expect (Zoom's examples: en-US, es-ES, de-DE…); unknown ones are left out.
const REGION = { en: 'en-US', es: 'es-ES', pt: 'pt-BR', fr: 'fr-FR', de: 'de-DE', it: 'it-IT', ja: 'ja-JP', zh: 'zh-CN', ko: 'ko-KR', nl: 'nl-NL', ru: 'ru-RU', ar: 'ar-SA', hi: 'hi-IN', pl: 'pl-PL', tr: 'tr-TR', uk: 'uk-UA', sv: 'sv-SE', ca: 'ca-ES' };

const nowIso = () => new Date().toISOString().slice(0, 23); // YouTube: UTC, milliseconds, no "Z"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mask = (u) => { try { const x = new URL(u); return `${x.host}${x.pathname}…`; } catch { return '…'; } };

/** Split long text at word boundaries into lines of at most `max` characters (Teams: 80–120 reads best). */
export function lines(text, max) {
  if (!max || text.length <= max) return [text];
  const out = [];
  let cur = '';
  for (const w of text.split(/\s+/)) {
    if (cur && (cur + ' ' + w).length > max) { out.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) out.push(cur);
  return out;
}

/** Check a connector before saving it. Throws with a readable message. */
export async function validate(o) {
  const t = TYPES[o.type];
  if (!t) throw new Error('type: zoom, youtube, teams or webhook');
  let u;
  try { u = new URL(String(o.url || '').trim()); } catch { throw new Error('paste the whole link (starting with https://)'); }
  if (o.type === 'webhook') {
    await checkPullUrl(u.href, { httpOnly: true });
    // Plain http only on your own network, when PULL_ALLOW_PRIVATE allows reaching it (a receiver on the venue LAN).
    if (u.protocol !== 'https:' && !/^(1|true|yes)$/i.test(process.env.PULL_ALLOW_PRIVATE || '')) throw new Error('webhooks need an https:// address');
  } else {
    const label = { zoom: 'Zoom', youtube: 'YouTube', teams: 'Teams' }[o.type];
    if (!t.hosts.some((re) => re.test(u.hostname)) || !t.path.test(u.pathname)) throw new Error(`that isn't a ${label} caption link (copy it again from ${label})`);
    if (o.type === 'youtube' && !u.searchParams.get('cid')) throw new Error('that YouTube link has no stream id (cid): copy the whole Captions ingestion URL');
    if (u.protocol !== 'https:' && o.type !== 'youtube') throw new Error('the link must start with https://');
  }
  return u.href;
}

/** One connector sending one room's captions in one language. */
class Sender {
  constructor(def, { fetchImpl = fetch } = {}) {
    this.def = def;
    this.fetch = fetchImpl;
    this.seq = Number(def.seq || 0);
    this.queue = [];
    this.busy = false;
    this.status = { state: 'idle', sent: 0, failed: 0, lastError: '', lastAt: 0 };
  }

  push(payload) {
    if (this.queue.length > 200) { this.queue.shift(); this.status.failed++; } // the platform is down: don't pile up
    this.queue.push(payload);
    if (!this.busy) this.#drain();
  }

  async #drain() {
    this.busy = true;
    while (this.queue.length) {
      const p = this.queue.shift();
      if (this.def.type === 'zoom' || this.def.type === 'youtube') this.seq++; // +1 per new caption, never for a retry
      // Retries with randomized exponential backoff (Zoom's guidance), giving up after ~5 s: a caption that late
      // is no longer useful, the next one is.
      let ok = false;
      for (let attempt = 0, wait = 250; attempt < 5 && !ok; attempt++, wait *= 2) {
        if (attempt) await sleep(wait * (0.5 + Math.random()));
        try {
          const r = await this.fetch(...this.request(p));
          if (r.ok) ok = true;
          else {
            this.status.lastError = `${r.status} ${(await r.text().catch(() => '')).slice(0, 120)}`.trim();
            const why = {
              zoom: { 400: 'the Zoom meeting hasn’t started (or has ended)', 403: 'Zoom refused the link: copy a new API token' },
              teams: { 404: 'the Teams meeting hasn’t started, or its captions aren’t on', 401: 'the CART link expired: copy a new one in Teams' },
            }[this.def.type]?.[r.status];
            if (why) this.status.lastError = `${why} (${r.status})`;
            if ([401, 403, 404].includes(r.status)) break; // a wrong or expired link, or no meeting yet: retrying now won't help

          }
        } catch (e) {
          const code = e.cause?.code;
          this.status.lastError = e.name === 'TimeoutError' ? 'no answer (timeout)'
            : code === 'ENOTFOUND' ? `can’t find ${new URL(this.def.url).host} (no internet, or the link is wrong)`
              : code ? `can’t reach ${new URL(this.def.url).host} (${code})` : e.message;
        }
      }
      if (ok) Object.assign(this.status, { state: 'ok', sent: this.status.sent + 1, lastError: '', lastAt: Date.now() });
      else Object.assign(this.status, { state: 'error', failed: this.status.failed + 1 });
    }
    this.busy = false;
  }

  /** @returns {[string, RequestInit]} */
  request(p) {
    const { type, url } = this.def;
    const u = new URL(url);
    const signal = AbortSignal.timeout(5000);
    if (type === 'webhook') {
      const body = JSON.stringify(p);
      const sig = crypto.createHmac('sha256', this.def.secret).update(body).digest('hex');
      return [u.href, { method: 'POST', headers: { 'content-type': 'application/json', 'x-opencaptions-signature': `sha256=${sig}` }, body, signal }];
    }
    if (type !== 'teams') u.searchParams.set('seq', String(this.seq)); // Teams: the CART link is used as it is
    if (type === 'zoom' && REGION[p.lang]) u.searchParams.set('lang', REGION[p.lang]);
    // YouTube rejects a charset in the content type; the others take plain UTF-8 text.
    const body = type === 'youtube' ? `${nowIso()}\n${p.text}\n` : p.text;
    return [u.href, { method: 'POST', headers: { 'content-type': type === 'youtube' ? 'text/plain' : 'text/plain; charset=utf-8' }, body, signal }];
  }
}

/**
 * All connectors. `stages` is the server's Map of rooms; `talkUrl(stage, talk)` builds the transcript link for
 * webhooks. Re-attaches whenever rooms are added or connectors change.
 */
export class Integrations {
  /** @param {{ stages: Map<string, any>, talkUrl?: (stage: string, talk: string) => string, fetchImpl?: typeof fetch }} o */
  constructor({ stages, talkUrl = () => '', fetchImpl }) {
    this.stages = stages;
    this.talkUrl = talkUrl;
    this.fetchImpl = fetchImpl;
    this.senders = new Map(); // id → Sender
    this.hooked = new Map(); // stage id → detach()
    let saved = [];
    try { saved = JSON.parse(readSecret('integrations') || '[]'); } catch { /* none */ }
    this.defs = Array.isArray(saved) ? saved : [];
    this.attachAll();
  }

  #save() { saveSecret('integrations', JSON.stringify(this.defs)); }

  /** What the dashboard sees: never the link itself or the webhook secret. */
  list() {
    return this.defs.map((d) => ({ id: d.id, type: d.type, stage: d.stage, lang: d.lang, events: d.events, link: mask(d.url), status: this.senders.get(d.id)?.status || { state: 'idle', sent: 0, failed: 0, lastError: '', lastAt: 0 } }));
  }

  async add(o) {
    if (!this.stages.has(o.stage)) throw new Error('unknown room');
    const url = await validate(o);
    if (this.defs.length >= 50) throw new Error('up to 50 connectors');
    const def = {
      id: crypto.randomBytes(6).toString('hex'), type: o.type, stage: o.stage, url,
      lang: String(o.lang || 'orig'),
      events: o.type === 'webhook' ? (Array.isArray(o.events) && o.events.length ? o.events.filter((e) => ['caption', 'talk.ended'].includes(e)) : ['caption', 'talk.ended']) : ['caption'],
      secret: o.type === 'webhook' ? crypto.randomBytes(24).toString('base64url') : undefined,
    };
    this.defs.push(def);
    this.#save();
    this.attachAll();
    return { ...this.list().find((x) => x.id === def.id), secret: def.secret }; // the webhook secret is shown once
  }

  remove(id) {
    const n = this.defs.length;
    this.defs = this.defs.filter((d) => d.id !== id);
    if (this.defs.length === n) return false;
    this.senders.delete(id);
    this.#save();
    this.attachAll();
    return true;
  }

  /** Send a test line through one connector right away. */
  test(id) {
    const s = this.#sender(this.defs.find((d) => d.id === id));
    if (!s) return false;
    s.push(s.def.type === 'webhook' ? { event: 'test', room: s.def.stage, text: 'OpenCaptions test', at: new Date().toISOString() } : { text: 'OpenCaptions: captions connected.', lang: s.def.lang });
    return true;
  }

  #sender(def) {
    if (!def) return null;
    if (!this.senders.has(def.id)) this.senders.set(def.id, new Sender(def, { fetchImpl: this.fetchImpl }));
    return this.senders.get(def.id);
  }

  /** (Re)subscribe every room that has connectors. Cheap: called on any change. */
  attachAll() {
    for (const off of this.hooked.values()) off();
    this.hooked.clear();
    for (const st of this.stages.values()) {
      const mine = this.defs.filter((d) => d.stage === st.id);
      if (!mine.length) continue;
      let talk = { id: st.talk.id, title: st.talk.title, startedAt: st.talk.startedAt, captions: 0 };
      const onCaption = (seg) => {
        if (!seg.final || !seg.text) return;
        talk.captions++;
        for (const d of mine) {
          if (!d.events.includes('caption') || st.channelFor(d.lang) !== seg.channel) continue;
          const lang = seg.channel === 'orig' ? (seg.lang || st.source) : seg.channel;
          const s = this.#sender(d);
          if (d.type === 'webhook') {
            s.push({ event: 'caption', room: st.id, roomName: st.def.name, talk: st.talk.id, lang, text: seg.text, speaker: seg.spk || null, start: seg.start, end: seg.end, at: new Date().toISOString() });
          } else {
            for (const text of lines(seg.text, TYPES[d.type].max)) s.push({ text, lang });
          }
        }
      };
      const onTalk = () => {
        const ended = talk;
        talk = { id: st.talk.id, title: st.talk.title, startedAt: st.talk.startedAt, captions: 0 };
        if (!ended.captions) return;
        for (const d of mine.filter((x) => x.type === 'webhook' && x.events.includes('talk.ended'))) {
          this.#sender(d).push({ event: 'talk.ended', room: st.id, roomName: st.def.name, talk: ended.id, title: ended.title || '', startedAt: ended.startedAt, captions: ended.captions, transcript: this.talkUrl(st.id, ended.id), at: new Date().toISOString() });
        }
      };
      st.on('caption', onCaption);
      st.on('talk', onTalk);
      this.hooked.set(st.id, () => { st.off('caption', onCaption); st.off('talk', onTalk); });
    }
  }
}
