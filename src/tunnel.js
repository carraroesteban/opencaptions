// Public HTTPS address with one click, through Cloudflare Tunnel (the free `cloudflared` program). No inbound
// ports, no certificates, no router settings: cloudflared connects out to Cloudflare, which serves the address.
//
//   quick → a random https://<words>.trycloudflare.com address, no account needed. It changes every time the
//           tunnel starts, and Cloudflare offers it for testing and small events (about 200 requests at once),
//           so print the QR posters after starting it and keep OpenCaptions running.
//   token → a fixed address on your own domain: a tunnel made in the Cloudflare dashboard (Networks → Tunnels)
//           with a public hostname pointing at http://localhost:<PORT>. Paste its token and the hostname.
//
// cloudflared is taken from CLOUDFLARED_PATH, the PATH, or local/bin/ (downloaded there the first time, from
// Cloudflare's GitHub releases). The Docker image ships it.
import { EventEmitter } from 'node:events';
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import dns from 'node:dns';
import https from 'node:https';
import path from 'node:path';
import { ROOT } from './config.js';

const BIN_DIR = path.join(ROOT, 'local', 'bin');
const EXE = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
// A pinned release, checked against GitHub's SHA-256 for each file: what runs on organizers' computers is exactly
// what was reviewed. To update: pick a release on github.com/cloudflare/cloudflared and copy the new digests
// (gh api repos/cloudflare/cloudflared/releases/tags/<version> --jq '.assets[] | .name + " " + .digest').
const VERSION = '2026.9.3';
const RELEASES = `https://github.com/cloudflare/cloudflared/releases/download/${VERSION}/`;
const SHA256 = {
  'cloudflared-darwin-amd64.tgz': 'd1155d0837487f261183b15c1eab6c4ebcad9dc49b94675f1524c3564cea3977',
  'cloudflared-darwin-arm64.tgz': '587c2cfb1c230fe36c7fa7727da78be459dae028cabe8c001291999350f07095',
  'cloudflared-linux-amd64': '77e26d8d900e0b8469f416239d14b5f296525fdf79fee6f511ef55609e3fbac2',
  'cloudflared-linux-arm64': 'aaeb2d7d0da3614634c7e03ab13487a1522c2e79165ed2929cfe23d5e95b326d',
  'cloudflared-linux-arm': '967dc371a3fedbf09e881c13ee7ba317155ebc336cbd4afb756b46fc6785e5af',
  'cloudflared-linux-386': 'd6b2f917e2e78b3e3afba760af726e51751d10c2fcad4a2fb2a69feb4bd47421',
  'cloudflared-windows-amd64.exe': 'f096265ec2fcbe9bb6e2d64268db167ced3fcbb83d894bdb9e2fcdb26f2ea7e2',
  'cloudflared-windows-386.exe': '9b95ddc2eba67b86ed3dc4cc2a15881960563031b52ce564376af41fb91ad402',
};

/** The release file for this computer, or null if Cloudflare doesn't publish one. */
function releaseAsset() {
  const arch = { x64: 'amd64', arm64: 'arm64', arm: 'arm', ia32: '386' }[process.arch];
  if (process.platform === 'darwin') return arch === 'arm64' || arch === 'amd64' ? `cloudflared-darwin-${arch}.tgz` : null;
  if (process.platform === 'linux') return arch ? `cloudflared-linux-${arch}` : null;
  if (process.platform === 'win32') return arch === '386' ? 'cloudflared-windows-386.exe' : 'cloudflared-windows-amd64.exe';
  return null;
}

/** An installed cloudflared, or '' if there is none yet. */
export function findCloudflared() {
  if (process.env.CLOUDFLARED_PATH) return process.env.CLOUDFLARED_PATH;
  const local = path.join(BIN_DIR, EXE);
  if (fs.existsSync(local)) return local;
  const dirs = [...(process.env.PATH || '').split(path.delimiter), '/opt/homebrew/bin', '/usr/local/bin'];
  for (const d of dirs) {
    const p = d && path.join(d, EXE);
    if (p && fs.existsSync(p)) return p;
  }
  return '';
}

/** Download cloudflared into local/bin (about 20–40 MB, once). */
export async function installCloudflared() {
  const asset = releaseAsset();
  if (!asset) throw new Error(`Cloudflare doesn't publish cloudflared for ${process.platform}/${process.arch}: install it yourself (developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads)`);
  fs.mkdirSync(BIN_DIR, { recursive: true });
  const res = await fetch(RELEASES + asset, { signal: AbortSignal.timeout(180_000) });
  if (!res.ok) throw new Error(`couldn't download cloudflared (${res.status} ${res.statusText})`);
  const tmp = path.join(BIN_DIR, `${asset}.part`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (crypto.createHash('sha256').update(buf).digest('hex') !== SHA256[asset]) throw new Error('the downloaded cloudflared doesn\'t match its published checksum: not installing it (try again, or install cloudflared yourself)');
  fs.writeFileSync(tmp, buf);
  const dest = path.join(BIN_DIR, EXE);
  if (asset.endsWith('.tgz')) {
    const r = spawnSync('tar', ['-xzf', tmp, '-C', BIN_DIR]);
    fs.rmSync(tmp, { force: true });
    if (r.status !== 0) throw new Error(`couldn't unpack cloudflared: ${String(r.stderr || '').trim()}`);
  } else {
    fs.renameSync(tmp, dest);
  }
  fs.chmodSync(dest, 0o755);
  return dest;
}

const QUICK_URL = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;
// cloudflared's own wording for "this won't work" (bad token, no quick tunnel available, …)
const FATAL = /(Provided Tunnel token is not valid|Invalid tunnel secret|failed to request quick Tunnel|error parsing tunnel ID)/i;

export class Tunnel extends EventEmitter {
  /**
   * @param {{ origin: string, find?: () => string, install?: () => Promise<string>, exec?: typeof spawn, check?: (url: string) => Promise<boolean>, probeDelayMs?: number }} o
   *   origin: where cloudflared sends requests (this server, e.g. http://127.0.0.1:8080). The rest lets tests
   *   replace cloudflared with a script and the reachability check with a stub.
   */
  constructor({ origin, find = findCloudflared, install = installCloudflared, exec = spawn, check = reachable, probeDelayMs = 3000 }) {
    super();
    this.origin = origin;
    this.find = find;
    this.install = install;
    this.exec = exec;
    this.check = check;
    this.probeDelayMs = probeDelayMs;
    this.mode = 'off';
    this.state = 'off'; // off | installing | starting | on | error
    this.url = '';
    this.error = '';
    this.reachable = null;
    this.restarts = 0;
    this.proc = null;
    this.retry = null;
    /** @type {boolean | undefined} is cloudflared on this computer? (checked once, then after installing) */
    this.installed = undefined;
    this.fatal = false; // cloudflared said it can't work (bad token, …): don't retry
    /** @type {{ mode?: string, token?: string, host?: string }} */
    this.opts = {};
  }

  status() {
    this.installed ??= !!this.find();
    return { mode: this.mode, state: this.state, url: this.url, error: this.error, reachable: this.reachable, host: this.opts.host || '', installed: this.installed };
  }

  #set(patch) {
    Object.assign(this, patch);
    this.emit('change', this.status());
  }

  /**
   * @param {{ mode: 'quick' | 'token', token?: string, host?: string }} o
   */
  async start(o) {
    this.stop();
    this.opts = { ...o };
    this.restarts = 0;
    this.#set({ mode: o.mode, url: '', error: '', reachable: null, state: 'starting' });
    await this.#launch();
  }

  async #launch() {
    const { mode, token, host } = this.opts;
    let bin = this.find();
    if (!bin) {
      this.#set({ state: 'installing' });
      try { bin = await this.install(); this.installed = true; } catch (e) { return this.#set({ state: 'error', error: e.message }); }
      if (this.mode === 'off') return; // stopped while downloading
      this.#set({ state: 'starting' });
    }
    const args = mode === 'quick'
      ? ['tunnel', '--no-autoupdate', '--url', this.origin, ...(this.origin.startsWith('https:') ? ['--no-tls-verify'] : [])]
      : ['tunnel', '--no-autoupdate', 'run'];
    // The token goes in the environment, not the command line, so other users of this computer can't read it.
    // A TUNNEL_TOKEN left in .env (Docker's tunnel profile) would turn a quick tunnel into that named one.
    const env = { ...process.env, TUNNEL_TOKEN: mode === 'token' ? token : undefined };
    if (!env.TUNNEL_TOKEN) delete env.TUNNEL_TOKEN;
    const p = this.exec(bin, args, { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    this.proc = p;
    let tail = '';
    const onOutput = (d) => {
      const text = d.toString();
      tail = (tail + text).slice(-2000);
      if (mode === 'quick' && !this.url) {
        const m = text.match(QUICK_URL);
        if (m) { this.#set({ url: m[0], state: 'on', error: '' }); this.#probe(m[0]); }
      }
      if (mode === 'token' && this.state !== 'on' && /Registered tunnel connection/i.test(text)) {
        const url = host ? `https://${String(host).replace(/^https?:\/\//, '').replace(/\/.*$/, '')}` : '';
        this.#set({ url, state: 'on', error: '' });
        if (url) this.#probe(url);
      }
      const fatal = text.match(FATAL);
      if (fatal) { this.fatal = true; this.#set({ state: 'error', error: fatal[0] }); }
    };
    p.stdout.on('data', onOutput);
    p.stderr.on('data', onOutput);
    p.on('error', (e) => this.#set({ state: 'error', error: e.message }));
    p.on('close', (code) => { // 'close', not 'exit': all its output has been read by then
      if (this.proc !== p) return; // stopped or replaced on purpose
      this.proc = null;
      const last = tail.trim().split('\n').pop() || `cloudflared exited (${code})`;
      if (this.fatal || this.restarts >= 20) return this.#set({ state: 'error', error: this.error || last });
      // Lost the tunnel: try again. A quick tunnel comes back with a NEW address (the dashboard says so).
      this.restarts++;
      this.#set({ state: 'starting', error: last, reachable: null, ...(mode === 'quick' ? { url: '' } : {}) });
      this.retry = setTimeout(() => this.#launch(), Math.min(60_000, 2000 * this.restarts));
      this.retry.unref?.();
    });
  }

  /**
   * A new trycloudflare name takes a few seconds to exist. Asking the computer's own DNS too early makes it cache
   * "not found" (macOS for minutes), which would also break the organizer's browser, so this asks a public DNS
   * server directly. Reports when the audience can actually reach the address.
   */
  async #probe(url) {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms).unref?.());
    await wait(this.probeDelayMs);
    for (let i = 0; i < 40 && this.url === url; i++) {
      if (await this.check(url)) return this.url === url && this.#set({ reachable: true });
      await wait(this.probeDelayMs);
    }
    if (this.url === url) this.#set({ reachable: false });
  }

  stop() {
    clearTimeout(this.retry);
    this.fatal = false;
    const p = this.proc;
    this.proc = null;
    if (p) { try { p.kill(); } catch { /* gone */ } }
    if (this.mode !== 'off' || this.state !== 'off') this.#set({ mode: 'off', state: 'off', url: '', error: '', reachable: null });
  }
}

const resolver = new dns.Resolver({ timeout: 3000, tries: 1 });
resolver.setServers(['1.1.1.1', '8.8.8.8']);
/** dns.lookup-compatible, through public DNS (falls back to the system's when the venue blocks public DNS). */
function publicLookup(host, opts, cb) {
  resolver.resolve4(host, (err, addrs) => {
    if (!err && addrs.length) return opts?.all ? cb(null, addrs.map((a) => ({ address: a, family: 4 }))) : cb(null, addrs[0], 4);
    if (err && ['ENOTFOUND', 'ENODATA', 'ENOTIMP'].includes(err.code)) return cb(err); // not there yet
    dns.lookup(host, opts, cb);
  });
}
/** @param {string} url  answers /healthz? */
function reachable(url) {
  return new Promise((resolve) => {
    const req = https.get(`${url}/healthz`, { lookup: /** @type {any} */ (publicLookup), timeout: 5000 }, (res) => { res.resume(); resolve(res.statusCode === 200); });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(false));
  });
}

/** This server as cloudflared should reach it (127.0.0.1: "localhost" can resolve to IPv6, which we may not listen on). */
export const tunnelOrigin = (port, tls) => `${tls ? 'https' : 'http'}://127.0.0.1:${port}`;
