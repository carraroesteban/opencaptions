// The vision mixer says when it's a break. Streams switch to a "Break", "Pausa" or "Publicidad" scene for
// intermissions and ads; when the program (live) output shows one, its room pauses captions and screens show the
// break, and when it switches back the break ends. Works with:
//   • vMix: its Web Controller API, http://<vmix-pc>:8088/api (Settings → Web Controller), polled every second.
//   • OBS Studio 28+: obs-websocket v5, ws://<obs-pc>:4455 (Tools → WebSocket Server Settings), scene events.
// Both run on the production network, so private addresses are allowed (admins only add them). The OBS password is
// kept with the other secrets (data/secrets.json) and never shown again.
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { readSecret, saveSecret } from './aikey.js';

export const DEFAULT_SCENES = 'break, pausa, intervalo, receso, almuerzo, lunch, coffee, cafe, publicidad, tanda, comercial, commercial, ads, sponsor, brb, be right back, volvemos, starting soon, empezamos, intermission';
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Does this scene's name mean "break"? `words`: comma-separated, matched as whole words anywhere in the name. */
export function isBreakScene(scene, words = DEFAULT_SCENES) {
  const n = ` ${norm(scene)} `;
  return String(words).split(',').map(norm).filter(Boolean).some((w) => n.includes(` ${w} `));
}

/** vMix's /api XML → the title of the input on program (live), or ''. */
export function vmixProgram(xml) {
  const active = /<active>(\d+)<\/active>/.exec(xml)?.[1];
  if (!active) return '';
  const input = new RegExp(`<input\\b[^>]*\\bnumber="${active}"[^>]*>`).exec(xml)?.[0] || '';
  const title = /\btitle="([^"]*)"/.exec(input)?.[1] || '';
  return title.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/** OBS websocket v5 authentication string. */
export function obsAuth(password, salt, challenge) {
  const secret = crypto.createHash('sha256').update(password + salt).digest('base64');
  return crypto.createHash('sha256').update(secret + challenge).digest('base64');
}

/** Check a switcher before saving it. Returns the normalized address. Throws with a readable message. */
export function validate(o) {
  if (!['vmix', 'obs'].includes(o.type)) throw new Error('type: vmix or obs');
  let raw = String(o.url || '').trim();
  if (!/^[a-z]+:\/\//i.test(raw)) raw = `${o.type === 'obs' ? 'ws' : 'http'}://${raw}`;
  let u;
  try { u = new URL(raw); } catch { throw new Error('write the address of the computer, e.g. 192.168.1.20'); }
  if (o.type === 'vmix') {
    if (!/^https?:$/.test(u.protocol)) throw new Error('vMix: http://<computer>:8088');
    if (!u.port && u.protocol === 'http:') u.port = '8088';
    u.pathname = '/api';
  } else {
    if (!/^wss?:$/.test(u.protocol)) throw new Error('OBS: ws://<computer>:4455');
    if (!u.port && u.protocol === 'ws:') u.port = '4455';
  }
  u.username = ''; u.password = ''; u.search = ''; u.hash = '';
  return u.href;
}

/** One vision mixer watching its program output for one room. */
class Watcher extends EventEmitter {
  constructor(def, { fetchImpl = fetch, WebSocketImpl = WebSocket, pollMs = 1000 } = {}) {
    super();
    this.def = def;
    this.fetch = fetchImpl;
    this.WS = WebSocketImpl;
    this.pollMs = pollMs;
    this.status = { state: 'connecting', scene: '', lastError: '', since: Date.now() };
    this.stopped = false;
    this.backoff = 1000;
    def.type === 'vmix' ? this.#poll() : this.#connect();
  }

  #set(patch) {
    Object.assign(this.status, patch);
    if (patch.scene !== undefined) this.emit('scene', patch.scene);
  }

  async #poll() {
    while (!this.stopped) {
      try {
        const r = await this.fetch(this.def.url, { signal: AbortSignal.timeout(2500) });
        if (!r.ok) throw new Error(`vMix answered ${r.status}`);
        const scene = vmixProgram(await r.text());
        if (this.status.state !== 'ok') this.#set({ state: 'ok', lastError: '', since: Date.now() });
        if (scene !== this.status.scene) this.#set({ scene });
      } catch (e) {
        this.#set({ state: 'error', lastError: e.name === 'TimeoutError' ? 'no answer: is vMix open, with Web Controller on?' : e.cause?.code || e.message });
      }
      await new Promise((r) => { this.timer = setTimeout(r, this.status.state === 'ok' ? this.pollMs : 3000); });
    }
  }

  #connect() {
    if (this.stopped) return;
    let ws;
    try { ws = this.ws = new this.WS(this.def.url); } catch (e) { this.#set({ state: 'error', lastError: e.message }); return this.#retry(); }
    const send = (op, d) => ws.readyState === 1 && ws.send(JSON.stringify({ op, d }));
    ws.on('message', (data) => {
      let m;
      try { m = JSON.parse(data.toString()); } catch { return; }
      if (m.op === 0) { // Hello
        const a = m.d?.authentication;
        if (a && !this.def.password) { this.#set({ state: 'error', lastError: 'OBS asks for a password' }); return ws.close(); }
        send(1, { rpcVersion: 1, eventSubscriptions: 1 << 2, ...(a ? { authentication: obsAuth(this.def.password, a.salt, a.challenge) } : {}) });
      } else if (m.op === 2) { // Identified
        this.backoff = 1000;
        this.#set({ state: 'ok', lastError: '', since: Date.now() });
        send(6, { requestType: 'GetCurrentProgramScene', requestId: 'oc-scene' });
      } else if (m.op === 7 && m.d?.requestId === 'oc-scene') {
        const scene = m.d.responseData?.currentProgramSceneName ?? m.d.responseData?.sceneName ?? '';
        if (scene !== this.status.scene) this.#set({ scene });
      } else if (m.op === 5 && m.d?.eventType === 'CurrentProgramSceneChanged') {
        const scene = m.d.eventData?.sceneName ?? '';
        if (scene !== this.status.scene) this.#set({ scene });
      }
    });
    ws.on('close', (code, reason) => {
      if (this.stopped) return;
      // 4009: authentication failed; 4010: unsupported rpc version.
      const why = code === 4009 ? 'wrong OBS password' : code === 4010 ? 'OBS is too old (needs 28 or newer)' : String(reason || '') || this.status.lastError || 'connection closed';
      this.#set({ state: 'error', lastError: why });
      this.#retry();
    });
    ws.on('error', (e) => this.#set({ state: 'error', lastError: e.code === 'ECONNREFUSED' ? 'can’t reach OBS: is it open, with the WebSocket server on?' : e.code || e.message }));
  }

  #retry() {
    if (this.stopped) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.#connect(), this.backoff);
    this.backoff = Math.min(this.backoff * 2, 15000);
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    try { this.ws?.close(); } catch { /* closed */ }
  }
}

/** Every vision mixer the organizer connected; each one breaks its room when it shows a break scene. */
export class Switchers {
  /** @param {{ stages: Map<string, any>, fetchImpl?: typeof fetch, WebSocketImpl?: any, pollMs?: number }} o */
  constructor({ stages, ...opts }) {
    this.stages = stages;
    this.opts = opts;
    this.watchers = new Map();
    let saved = [];
    try { saved = JSON.parse(readSecret('switchers') || '[]'); } catch { /* none */ }
    this.defs = Array.isArray(saved) ? saved : [];
    for (const d of this.defs) this.#watch(d);
  }

  #save() { saveSecret('switchers', JSON.stringify(this.defs)); }

  list() {
    return this.defs.map((d) => ({ id: d.id, type: d.type, stage: d.stage, scenes: d.scenes, address: new URL(d.url).host, hasPassword: !!d.password, status: this.watchers.get(d.id)?.status || { state: 'idle' } }));
  }

  add(o) {
    if (!this.stages.has(o.stage)) throw new Error('unknown room');
    if (this.defs.length >= 20) throw new Error('up to 20 vision mixers');
    const def = {
      id: crypto.randomBytes(6).toString('hex'), type: o.type, url: validate(o), stage: o.stage,
      password: o.type === 'obs' ? String(o.password || '') : '',
      scenes: String(o.scenes || DEFAULT_SCENES).slice(0, 500),
    };
    this.defs.push(def);
    this.#save();
    this.#watch(def);
    return this.list().find((x) => x.id === def.id);
  }

  remove(id) {
    const d = this.defs.find((x) => x.id === id);
    if (!d) return false;
    this.watchers.get(id)?.stop();
    this.watchers.delete(id);
    this.defs = this.defs.filter((x) => x.id !== id);
    this.#save();
    const st = this.stages.get(d.stage);
    if (st?.brk?.by === 'switcher') st.setBreak(false);
    return true;
  }

  #watch(def) {
    const w = new Watcher(def, this.opts);
    // Only scene changes act, so the crew can still end a break by hand while the mixer stays on it.
    w.on('scene', (scene) => {
      const st = this.stages.get(def.stage);
      if (!st) return;
      if (isBreakScene(scene, def.scenes)) st.setBreak(true, { by: 'switcher', title: scene });
      else if (st.brk?.by === 'switcher') st.setBreak(false);
    });
    this.watchers.set(def.id, w);
  }

  stop() { for (const w of this.watchers.values()) w.stop(); }
}
