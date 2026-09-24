// Durable transcript storage (one JSONL per talk) + SRT/VTT/TXT export.
import fs from 'node:fs';
import path from 'node:path';

const safe = (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, '_');

export class Store {
  constructor(dir) {
    this.dir = path.join(dir, 'transcripts');
    fs.mkdirSync(this.dir, { recursive: true });
  }

  #talkDir(stage, talk) {
    return path.join(this.dir, safe(stage), safe(talk));
  }

  openTalk(stage, talk, languages) {
    const d = this.#talkDir(stage, talk.id);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'meta.json'), JSON.stringify({ stage, ...talk, languages }, null, 2));
  }

  append(stage, talkId, seg) {
    try {
      fs.appendFileSync(path.join(this.#talkDir(stage, talkId), 'captions.jsonl'), JSON.stringify(seg) + '\n');
    } catch (e) {
      console.warn('[store] append failed', e.message);
    }
  }

  listTalks(stage) {
    const d = path.join(this.dir, safe(stage));
    if (!fs.existsSync(d)) return [];
    return fs.readdirSync(d)
      .map((id) => {
        try {
          const meta = JSON.parse(fs.readFileSync(path.join(d, id, 'meta.json'), 'utf8'));
          const f = path.join(d, id, 'captions.jsonl');
          const segments = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).length : 0;
          return { ...meta, segments };
        } catch { return null; }
      })
      .filter((t) => t && t.segments > 0)
      .sort((a, b) => b.startedAt - a.startedAt);
  }

  readTalk(stage, talkId) {
    const f = path.join(this.#talkDir(stage, talkId), 'captions.jsonl');
    if (!fs.existsSync(f)) return [];
    return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  }
}

const pad = (n, w = 2) => String(n).padStart(w, '0');
function ts(ms, sep) {
  ms = Math.max(0, Math.round(ms));
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(ms % 1000, 3)}`;
}

/** Make cues non-overlapping and readable. */
function cues(segs) {
  const out = segs.map((s) => ({ ...s }));
  for (let i = 0; i < out.length; i++) {
    const next = out[i + 1];
    if (next && out[i].end > next.start) out[i].end = Math.max(out[i].start + 500, next.start - 1);
    if (!next) out[i].end = Math.max(out[i].end, out[i].start + 2500);
  }
  return out;
}

export function toSRT(segs) {
  return cues(segs).map((s, i) => `${i + 1}\n${ts(s.start, ',')} --> ${ts(s.end, ',')}\n${s.text}\n`).join('\n');
}

export function toVTT(segs) {
  return 'WEBVTT\n\n' + cues(segs).map((s) => `${ts(s.start, '.')} --> ${ts(s.end, '.')}\n${s.text}\n`).join('\n');
}

export function toTXT(segs) {
  // Paragraphs: break when there is a pause > 4 s.
  let out = '', last = null;
  for (const s of segs) {
    if (last != null && s.start - last > 4000) out += '\n\n';
    else if (out) out += ' ';
    out += s.text;
    last = s.end;
  }
  return out + '\n';
}
