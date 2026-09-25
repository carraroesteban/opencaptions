// Event agenda: names talks automatically, so nobody has to press "New talk" between sessions.
//
// config/schedule.json holds [{ stage, start, title, speaker? }]. Organizers can also paste the agenda in the
// dashboard: a Swapcard/Sessionize export copied from Excel or Sheets (columns found by their header, room
// names matched to rooms), or plain CSV without a header:   stage,start,title,speaker
//   main,10:00,Observabilidad en Kubernetes,Ana Pérez          ← HH:MM = today, server's local time
//   sala-a,2026-09-26 14:30,Rust para gente de Go,John Doe     ← or a full date/time (ISO also works)
//
// A room switches to the next talk when that talk's slot has started AND the room is quiet (silence gate),
// so a speaker running late is never cut in half. See Stage#applySchedule.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './config.js';

const FILE = path.resolve(ROOT, process.env.SCHEDULE || 'config/schedule.json');

/** HH:MM (today), YYYY-MM-DD HH:MM, ISO, or DD/MM/YYYY HH:MM (MM/DD when the day can't be first), with optional AM/PM. */
function parseTime(s, now = new Date()) {
  s = String(s || '').trim();
  const ampm = (h, ap) => (ap ? (Number(h) % 12) + (/p/i.test(ap) ? 12 : 0) : Number(h));
  const hm = s.match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?$/i);
  if (hm) {
    const h = ampm(hm[1], hm[3]), m = Number(hm[2]);
    if (h > 23 || m > 59) return NaN;
    const d = new Date(now);
    d.setHours(h, m, 0, 0);
    return d.getTime();
  }
  const dm = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})[ T,]+(\d{1,2})[:.](\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?$/i);
  if (dm) {
    let [a, b] = [Number(dm[1]), Number(dm[2])];
    if (a <= 12 && b > 12) [a, b] = [b, a]; // 09/25/2026 → US order
    const y = Number(dm[3]) < 100 ? 2000 + Number(dm[3]) : Number(dm[3]);
    const h = ampm(dm[4], dm[6]), m = Number(dm[5]);
    if (b > 12 || a > 31 || h > 23 || m > 59) return NaN;
    return new Date(y, b - 1, a, h, m).getTime();
  }
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T]+(\d{1,2})[:.](\d{2})(?::\d{2})?\s*([ap]\.?m\.?)$/i);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), ampm(iso[4], iso[6]), Number(iso[5])).getTime();
  const t = Date.parse(s.replace(/^(\d{4}-\d{2}-\d{2}) (\d)/, '$1T$2').replace(/\s+(Z|[+-]\d{2}:?\d{2})$/i, '$1'));
  return Number.isFinite(t) ? t : NaN;
}

/** Full CSV/TSV parser: quoted fields may contain the delimiter, quotes ("") and line breaks (Excel copy/paste). */
function parseTable(text) {
  const first = text.split(/\r?\n/, 1)[0];
  const delim = first.includes('\t') ? '\t' : (first.split(';').length > first.split(',').length ? ';' : ',');
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"' && cur.trim() === '') { q = true; cur = ''; }
    else if (c === delim) { row.push(cur.trim()); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur.trim()); rows.push(row); row = []; cur = '';
    } else cur += c;
  }
  row.push(cur.trim());
  rows.push(row);
  return rows.filter((r) => r.some((x) => x) && !r[0].startsWith('#'));
}

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Column names used by agenda tools (Swapcard, Sessionize, Google Sheets…), in English and Spanish.
const HEADERS = {
  stage: ['stage', 'room', 'rooms', 'sala', 'salas', 'location', 'place', 'lugar', 'ubicacion', 'track', 'venue', 'escenario', 'auditorio', 'salon', 'espacio', 'room name', 'location name', 'place name'],
  start: ['start', 'starts', 'starts at', 'start at', 'begins', 'begins at', 'begin', 'start date', 'start date and time', 'start datetime', 'start time', 'from', 'inicio', 'comienza', 'hora', 'hora de inicio', 'hora inicio', 'fecha de inicio', 'fecha y hora de inicio', 'fecha inicio', 'time', 'when'],
  date: ['date', 'fecha', 'day', 'dia'],
  title: ['title', 'titulo', 'session', 'session title', 'session name', 'name', 'nombre', 'charla', 'talk', 'talk title', 'actividad'],
  speaker: ['speaker', 'speakers', 'orador', 'oradores', 'oradora', 'ponente', 'ponentes', 'disertante', 'disertantes', 'presenter', 'presenters', 'speaker name', 'speakers names', 'speaker names'],
};

function headerMap(row) {
  const map = {};
  row.forEach((cell, i) => {
    const n = norm(cell);
    for (const [key, names] of Object.entries(HEADERS)) if (map[key] == null && names.includes(n)) { map[key] = i; break; }
  });
  return map.title != null && map.start != null ? map : null;
}

/** Maps an agenda's room label ("Sala A", "sala-a", "Sala A - Planta baja") to a room id, or null. */
function roomMatcher(rooms) {
  if (!rooms) return null;
  const list = rooms.map((r) => ({ id: r.id, keys: [norm(r.id), norm(r.name)].filter(Boolean) }));
  return (label) => {
    const n = norm(label);
    if (!n) return null;
    const exact = list.find((r) => r.keys.includes(n));
    if (exact) return exact.id;
    const partial = list.filter((r) => r.keys.some((k) => k.length >= 3 && ` ${n} `.includes(` ${k} `)));
    return partial.length === 1 ? partial[0].id : null;
  };
}

/**
 * Accepts an array of entries, or CSV/TSV text (with or without a header row). Returns normalized entries
 * sorted by start; throws on invalid input.
 * With `rooms` ([{ id, name }]), room labels are matched by id or name and rows for other rooms (workshops,
 * breaks without a room…) are skipped and listed in `entries.skipped` instead of failing the import.
 */
export function parseSchedule(input, now = new Date(), { rooms } = {}) {
  let rows = input;
  if (typeof input === 'string') {
    const table = parseTable(input);
    const hdr = table.length ? headerMap(table[0]) : null;
    if (hdr) {
      const at = (r, k) => (hdr[k] != null ? r[hdr[k]] || '' : '');
      rows = table.slice(1).map((r) => {
        let start = at(r, 'start');
        const date = at(r, 'date');
        if (date && /^\d{1,2}[:.]\d{2}/.test(start.trim())) start = `${date} ${start}`;
        return { stage: at(r, 'stage'), start, title: at(r, 'title'), speaker: at(r, 'speaker') };
      });
    } else {
      rows = table.filter((c) => !/^(stage|sala|room)$/i.test(c[0])).map(([stage, start, title, speaker]) => ({ stage, start, title, speaker }));
    }
  }
  if (!Array.isArray(rows)) throw new Error('schedule must be a list or CSV text');
  if (rows.length > 2000) throw new Error('schedule: at most 2000 entries');
  const match = roomMatcher(rooms);
  const skipped = [];
  const out = [];
  rows.forEach((r, i) => {
    let stage = String(r.stage || '').toLowerCase().trim();
    if (match) {
      const id = match(r.stage);
      if (!id) { skipped.push({ line: i + 1, room: String(r.stage || '').trim() || '—', title: String(r.title || '').trim() }); return; }
      stage = id;
    }
    const start = typeof r.start === 'number' ? r.start : parseTime(r.start, now);
    const title = String(r.title || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    const speaker = String(r.speaker || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(stage)) throw new Error(`line ${i + 1}: invalid room id "${r.stage}"`);
    if (!Number.isFinite(start)) throw new Error(`line ${i + 1}: invalid start "${r.start}" (use HH:MM, YYYY-MM-DD HH:MM or DD/MM/YYYY HH:MM)`);
    if (!title) throw new Error(`line ${i + 1}: missing title`);
    out.push({ stage, start, title, speaker });
  });
  out.sort((a, b) => a.start - b.start);
  Object.defineProperty(out, 'skipped', { value: skipped, enumerable: false });
  return out;
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

  set(input, opts = {}) {
    const entries = parseSchedule(input, new Date(), opts);
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
