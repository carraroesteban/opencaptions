// Event agenda: names talks automatically, so nobody has to press "New talk" between sessions.
//
// config/schedule.json holds [{ stage, start, title, speaker? }]. Organizers can also paste CSV from their
// agenda spreadsheet in the dashboard:   stage,start,title,speaker
//   main,10:00,Observabilidad en Kubernetes,Ana Pérez          ← HH:MM = today, server's local time
//   sala-a,2026-09-26 14:30,Rust para gente de Go,John Doe     ← or a full date/time (ISO also works)
//
// A room switches to the next talk when that talk's slot has started AND the room is quiet (silence gate),
// so a speaker running late is never cut in half. See Stage#applySchedule.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './config.js';

const FILE = path.resolve(ROOT, process.env.SCHEDULE || 'config/schedule.json');

function parseTime(s, now = new Date()) {
  s = String(s || '').trim();
  const hm = s.match(/^(\d{1,2})[:.](\d{2})$/);
  if (hm) {
    if (Number(hm[1]) > 23 || Number(hm[2]) > 59) return NaN;
    const d = new Date(now);
    d.setHours(Number(hm[1]), Number(hm[2]), 0, 0);
    return d.getTime();
  }
  const t = Date.parse(s.replace(/^(\d{4}-\d{2}-\d{2}) (\d)/, '$1T$2'));
  return Number.isFinite(t) ? t : NaN;
}

function splitCsv(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',' || c === ';' || c === '\t') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

/** Accepts an array of entries or CSV text. Returns normalized, sorted entries; throws on invalid input. */
export function parseSchedule(input, now = new Date()) {
  let rows = input;
  if (typeof input === 'string') {
    rows = input.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map(splitCsv)
      .filter((c) => !/^(stage|sala|room)$/i.test(c[0]))
      .map(([stage, start, title, speaker]) => ({ stage, start, title, speaker }));
  }
  if (!Array.isArray(rows)) throw new Error('schedule must be a list or CSV text');
  if (rows.length > 2000) throw new Error('schedule: at most 2000 entries');
  return rows.map((r, i) => {
    const stage = String(r.stage || '').toLowerCase().trim();
    const start = typeof r.start === 'number' ? r.start : parseTime(r.start, now);
    const title = String(r.title || '').trim().slice(0, 200);
    const speaker = String(r.speaker || '').trim().slice(0, 120);
    if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(stage)) throw new Error(`line ${i + 1}: invalid room id "${r.stage}"`);
    if (!Number.isFinite(start)) throw new Error(`line ${i + 1}: invalid start "${r.start}" (use HH:MM or YYYY-MM-DD HH:MM)`);
    if (!title) throw new Error(`line ${i + 1}: missing title`);
    return { stage, start, title, speaker };
  }).sort((a, b) => a.start - b.start);
}

export class Schedule {
  constructor(file = FILE) {
    this.file = file;
    this.entries = [];
    this.load();
    try { fs.watchFile(this.file, { interval: 3000 }, () => this.load(true)).unref?.(); } catch { /* ignore */ }
  }

  load(log = false) {
    try {
      if (!fs.existsSync(this.file)) { this.entries = []; return; }
      this.entries = parseSchedule(JSON.parse(fs.readFileSync(this.file, 'utf8')));
      if (log) console.log(`[schedule] reloaded (${this.entries.length} talks)`);
    } catch (e) {
      console.warn('[schedule] not loaded — keeping the previous agenda:', e.message);
    }
  }

  set(input) {
    const entries = parseSchedule(input);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(entries.map((e) => ({ ...e, start: new Date(e.start).toISOString() })), null, 2));
    this.entries = entries;
    return entries;
  }

  /** The talk whose slot is running now in a room, and the one after it. */
  slot(stage, now = Date.now()) {
    const list = this.entries.filter((e) => e.stage === stage);
    let current = null, next = null;
    for (const e of list) {
      if (e.start <= now) current = e;
      else { next = e; break; }
    }
    // A slot older than 3 h without a successor is the end of the day, not "now".
    if (current && !next && now - current.start > 3 * 3600_000) current = null;
    return { current, next };
  }
}
