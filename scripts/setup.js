#!/usr/bin/env node
// Interactive first-time setup: writes .env (API key, tokens, public URL) and config/event.json (event name,
// rooms, languages) with a few questions, then prints exactly what to do next. Safe to re-run: existing files
// are backed up (.bak) before being replaced.
//
//   npm run setup
import readline from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV = path.join(ROOT, '.env');
const EVENT = path.join(ROOT, 'config', 'event.json');
const b = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;

// Line queue instead of rl.question(): works both interactively and with piped answers (CI, scripts).
const rl = readline.createInterface({ input, terminal: false });
const lines = [];
let waiter = null, ended = false;
rl.on('line', (l) => { if (waiter) { const w = waiter; waiter = null; w(l); } else lines.push(l); });
rl.on('close', () => { ended = true; if (waiter) { const w = waiter; waiter = null; w(null); } });
const nextLine = () => (lines.length ? Promise.resolve(lines.shift()) : ended ? Promise.resolve(null) : new Promise((r) => { waiter = r; }));
const ask = async (q, def = '') => {
  output.write(`${b('?')} ${q}${def ? dim(` (${def})`) : ''}: `);
  const l = await nextLine();
  if (l == null) output.write('\n');
  const a = (l ?? '').trim();
  return a || def;
};
let step = 0;
const n = (q) => `${dim(`[${++step}/8]`)} ${q}`; // progress through the 8 questions
const yes = async (q, def = true) => /^(y|s|yes|si|sí)/i.test(await ask(`${q} [${def ? 'Y/n' : 'y/N'}]`, def ? 'y' : 'n'));
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'room';
const token = () => crypto.randomBytes(18).toString('base64url');

const envOld = fs.existsSync(ENV) ? Object.fromEntries(fs.readFileSync(ENV, 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])) : {};
const evOld = fs.existsSync(EVENT) ? JSON.parse(fs.readFileSync(EVENT, 'utf8')) : {};

console.log(`\n${b('OpenCaptions setup')} — live captions & translation for your event.\n${dim('Press Enter to keep the value in parentheses.')}\n`);

const eventName = await ask(n('Event name'), evOld.eventName || 'My Conference');
console.log(dim('\nGet a Gemini API key at https://aistudio.google.com/apikey (leave empty to try it in simulated mode).'));
let apiKey = await ask(n('Gemini API key'), envOld.GEMINI_API_KEY ? '•••• keep current' : '');
if (apiKey && !apiKey.startsWith('••••') && !/^AIza[\w-]{30,}$/.test(apiKey)) {
  console.log(dim('  That doesn\'t look like a Gemini API key (they start with "AIza" and are about 39 characters).'));
  apiKey = await ask('  Paste it again, or press Enter to keep what you typed', apiKey);
}
const roomsDefault = (evOld.stages || []).map((s) => s.name).join(', ') || 'Main stage, Room A';
const rooms = (await ask(n('Rooms, comma-separated'), roomsDefault)).split(',').map((s) => s.trim()).filter(Boolean);
console.log(dim('\nTalk language: "auto" detects it; pin it (e.g. "en") when you know it — faster and more accurate.'));
const source = await ask(n('Language the talks are usually given in (auto / es / en / pt …)'), 'auto');
const targets = (await ask(n('Caption languages for the audience, comma-separated'), (evOld.defaultTargets || ['es', 'en']).join(','))).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
console.log(dim('\nPublic HTTPS address people will use (QR codes point here). Leave empty for now if you don\'t have one yet — see docs/deployment.md.'));
const publicUrl = (await ask(n('Public URL'), envOld.PUBLIC_URL || '')).replace(/\/$/, '');
const publicTranscripts = (await yes(n('Let the audience read and download transcripts of past talks too?'), (evOld.publicTranscripts || 'all') === 'all')) ? 'all' : 'current';
const tz = await ask(n('Event time zone (for the agenda)'), evOld.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);

const adminToken = envOld.ADMIN_TOKEN || token();
const ingestToken = envOld.INGEST_TOKEN || token();
const langNames = { es: 'Español', en: 'English', pt: 'Português', fr: 'Français', de: 'Deutsch', it: 'Italiano' };

const stages = rooms.map((name) => ({ id: slug(name), name, source, targets }));
const event = {
  ...evOld,
  eventName,
  publicTranscripts,
  timezone: tz,
  languages: Object.fromEntries([...new Set([...targets, ...(source !== 'auto' ? [source] : [])])].map((l) => [l, (evOld.languages || {})[l] || langNames[l] || l.toUpperCase()])),
  defaultTargets: targets,
  stages,
};

const env = {
  ...envOld,
  GEMINI_API_KEY: apiKey.startsWith('••••') ? envOld.GEMINI_API_KEY : apiKey,
  ADMIN_TOKEN: adminToken,
  INGEST_TOKEN: ingestToken,
  ...(publicUrl ? { PUBLIC_URL: publicUrl } : {}),
};

console.log(`\n${b('Summary')}`);
console.log(`  Event      ${eventName} (${tz})`);
console.log(`  Engine     ${env.GEMINI_API_KEY ? 'Gemini' : 'simulated (no API key)'}`);
for (const s of stages) console.log(`  Room       ${s.name} ${dim(`id=${s.id} · ${s.source} → ${s.targets.join(', ')}`)}`);
console.log(`  Public URL ${publicUrl || dim('(not set: QR codes will point to this computer)')}`);
console.log('');
if (!(await yes('Write .env and config/event.json?'))) { console.log('Nothing written.'); process.exit(0); }

for (const f of [ENV, EVENT]) if (fs.existsSync(f)) fs.copyFileSync(f, f + '.bak');
fs.writeFileSync(ENV, Object.entries(env).map(([k, v]) => `${k}=${v ?? ''}`).join('\n') + '\n', { mode: 0o600 });
fs.writeFileSync(EVENT, JSON.stringify(event, null, 2) + '\n');
// Rooms edited from the dashboard live in data/stages.json and win over event.json when newer: start fresh.
const runtime = path.join(ROOT, 'data', 'stages.json');
if (fs.existsSync(runtime)) fs.renameSync(runtime, runtime + '.bak');
rl.close();

// Other devices can't use "localhost": show this computer's LAN address when there's no public URL yet.
const lan = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
const base = publicUrl || `http://${lan || 'localhost'}:8080`;
console.log(`\n${green('✓ Saved.')} ${dim('(previous files kept as .bak)')}\n`);
console.log(b('Next steps'));
console.log(`  1. Start the server:            ${b('npm start')}`);
console.log(`  2. Dashboard on this computer:  http://localhost:8080/admin.html`);
console.log(`     From another device:         ${base}/admin.html?token=${adminToken}`);
console.log(`  3. Print the QR posters:        ${base}/kit.html`);
console.log(`  4. Send audio from each room (headless agent, on the room PC):`);
for (const s of stages) console.log(`       node scripts/agent.js --stage ${s.id} --server ${base.replace(/^http/, 'ws')} --token ${ingestToken}`);
console.log(`     …or open ${base}/ingest.html?token=${ingestToken} in Chrome on that PC.`);
console.log(`  5. Optional: 📅 Agenda in the dashboard — paste your Swapcard/Sessionize/Sheets export so talks get their titles.`);
console.log(`  No audio hardware yet? Feed a sample talk:  ${b(`npm run feed -- --stage ${stages[0]?.id || 'main'} --input samples/talk-en.wav`)}`);
if (!env.GEMINI_API_KEY) console.log(dim('\n  Running without an API key: captions are simulated. Add GEMINI_API_KEY to .env when ready and run npm run check.'));
else console.log(dim('\n  Tip: run npm run check to test your key end to end (25 s).'));
console.log(dim('  Tokens are secrets: share the ingest token only with room PCs and the admin token only with your team.\n'));
