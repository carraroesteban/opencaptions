// Agenda import: read the program from where organizers already keep it, instead of pasting CSV.
//   • Sessionize: the event's public API (Sessionize → API / Embed → an endpoint with the "All" data). Read-only.
//   • A calendar link (.ics): Google Calendar's "secret address in iCal format", Outlook's published calendar, etc.
// Both become the same rows the CSV import produces ({ stage, start, title, speaker }); src/schedule.js matches the
// room names to the event's rooms and validates them.
import { checkPullUrl } from './security.js';

const MAX_BYTES = 3 * 1024 * 1024;

async function getText(url, accept) {
  await checkPullUrl(url, { httpOnly: true });
  const r = await fetch(url, { headers: { accept }, redirect: 'error', signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`the server answered ${r.status}${r.status === 404 ? ' (check the link)' : ''}`);
  const text = await r.text();
  if (text.length > MAX_BYTES) throw new Error('that agenda is too big (over 3 MB)');
  return text;
}

/** "https://sessionize.com/api/v2/abcd1234/view/All" or just "abcd1234" → "abcd1234". */
export function sessionizeId(s) {
  const v = String(s || '').trim();
  const id = /sessionize\.com\/api\/v2\/([a-z0-9]+)/i.exec(v)?.[1] || v;
  if (!/^[a-z0-9]{4,24}$/i.test(id)) throw new Error('paste the Sessionize API link (Sessionize → API / Embed) or its id');
  return id;
}

/**
 * Sessionize "All" JSON → agenda rows. Service sessions (breaks, lunch, registration) become breaks: captions pause
 * and screens say so; a plenum one (every room) counts in every room. Other plenum sessions are left out.
 */
export function fromSessionizeData(data) {
  const rooms = new Map((data.rooms || []).map((r) => [String(r.id), r.name]));
  const people = new Map((data.speakers || []).map((p) => [String(p.id), p.fullName || [p.firstName, p.lastName].filter(Boolean).join(' ')]));
  return (data.sessions || [])
    .filter((s) => s.startsAt && (s.isServiceSession || !s.isPlenumSession))
    .map((s) => ({
      stage: s.isServiceSession && s.isPlenumSession ? '*' : rooms.get(String(s.roomId)) || s.room || '',
      start: s.startsAt, // local event time, "2026-10-05T09:30:00"
      title: s.title,
      speaker: s.isServiceSession ? '' : (s.speakers || []).map((x) => (typeof x === 'object' ? x.name || people.get(String(x.id)) : people.get(String(x)))).filter(Boolean).join(', '),
      ...(s.isServiceSession ? { break: true } : {}),
    }));
}

export async function fromSessionize(idOrUrl) {
  const id = sessionizeId(idOrUrl);
  let data;
  try { data = JSON.parse(await getText(`https://sessionize.com/api/v2/${id}/view/All`, 'application/json')); } catch (e) {
    throw new Error(e instanceof SyntaxError ? 'Sessionize didn’t send an agenda: make sure the API endpoint includes "All" data' : e.message);
  }
  return fromSessionizeData(data);
}

// ---------- iCalendar (RFC 5545), just what agendas need ----------
/** Offset (ms) of a time zone at a moment, e.g. Europe/Madrid in summer → +2 h. */
function zoneOffset(ms, tz) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(new Date(ms)).find((p) => p.type === 'timeZoneName')?.value || 'GMT';
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0)) * 60_000 : 0;
}

/** DTSTART value + parameters → epoch ms, or NaN (all-day events have no time: skipped). */
export function icsTime(value, params = {}) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(String(value).trim());
  if (!m || params.VALUE === 'DATE') return NaN;
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map((x) => Number(x || 0));
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  if (m[7]) return wall; // UTC
  if (params.TZID) {
    try { let t = wall - zoneOffset(wall, params.TZID); t = wall - zoneOffset(t, params.TZID); return t; } catch { /* unknown zone: floating */ }
  }
  return new Date(y, mo - 1, d, h, mi, s).getTime(); // "floating": the server's (the event's) time zone
}

const unescape = (s) => s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();

/** .ics text → agenda rows: LOCATION is the room, SUMMARY the title, "Speaker: …" in the description the speaker. */
export function fromIcsText(text) {
  const lines = String(text).replace(/\r?\n[ \t]/g, '').split(/\r?\n/); // unfold continuation lines
  const rows = [];
  let ev = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { ev = {}; continue; }
    if (line === 'END:VEVENT') {
      if (ev?.start && Number.isFinite(ev.start) && ev.title && !ev.cancelled) rows.push({ stage: ev.room || '', start: ev.start, title: ev.title, speaker: ev.speaker || '' });
      ev = null;
      continue;
    }
    if (!ev) continue;
    const i = line.indexOf(':');
    if (i < 0) continue;
    const [name, ...paramParts] = line.slice(0, i).split(';');
    const params = Object.fromEntries(paramParts.map((p) => p.split('=')).map(([k, v]) => [k.toUpperCase(), (v || '').replace(/^"|"$/g, '')]));
    const value = line.slice(i + 1);
    const key = name.toUpperCase();
    if (key === 'DTSTART') ev.start = icsTime(value, params);
    else if (key === 'SUMMARY') ev.title = unescape(value);
    else if (key === 'LOCATION') ev.room = unescape(value).split(/[,;]/)[0].trim();
    else if (key === 'STATUS') ev.cancelled = /CANCELLED/i.test(value);
    else if (key === 'DESCRIPTION') ev.speaker ||= /(?:speakers?|ponentes?|orador(?:es|a)?|presenters?)\s*:\s*([^\\\n]+)/i.exec(value)?.[1]?.replace(/\\,/g, ',').trim() || '';
  }
  return rows;
}

export async function fromIcs(url) {
  const u = String(url || '').trim().replace(/^webcal:\/\//i, 'https://');
  const text = await getText(u, 'text/calendar');
  if (!/BEGIN:VCALENDAR/.test(text)) throw new Error('that link isn’t a calendar (.ics)');
  return fromIcsText(text);
}
