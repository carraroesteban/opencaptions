// Durable transcript storage (one JSONL per talk) + SRT/VTT/TXT export.
import fs from 'node:fs';
import path from 'node:path';

const safe = (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, '_');

export class Store {
  constructor(dir, { enabled = true, retentionDays = 0 } = {}) {
    this.dir = path.join(dir, 'transcripts');
    this.enabled = enabled;
    this.retentionDays = retentionDays;
    fs.mkdirSync(this.dir, { recursive: true });
    if (retentionDays > 0) {
      this.purge();
      setInterval(() => this.purge(), 6 * 3600 * 1000).unref();
    }
  }

  /** Delete talks older than the retention period. */
  purge() {
    const cutoff = Date.now() - this.retentionDays * 86400000;
    let n = 0;
    // Only folders: a stray file (Finder's .DS_Store) must not crash the server at startup.
    const dirs = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : []);
    for (const stage of dirs(this.dir)) {
      const sd = path.join(this.dir, stage);
      for (const talk of dirs(sd)) {
        const td = path.join(sd, talk);
        try {
          if (fs.statSync(td).mtimeMs < cutoff) { fs.rmSync(td, { recursive: true, force: true }); n++; }
        } catch { /* ignore */ }
      }
    }
    if (n) console.log(`[store] retention: deleted ${n} talk(s) older than ${this.retentionDays} days`);
  }

  #summaries = new Map(); // meta.json path → { key, value }
  #parsed = new Map(); // captions.jsonl path → { key, segs }, least recently used first

  #talkDir(stage, talk) {
    return path.join(this.dir, safe(stage), safe(talk));
  }

  openTalk(stage, talk, languages) {
    if (!this.enabled) return;
    const d = this.#talkDir(stage, talk.id);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'meta.json'), JSON.stringify({ stage, ...talk, languages }, null, 2));
  }

  append(stage, talkId, seg) {
    if (!this.enabled) return;
    try {
      fs.appendFileSync(path.join(this.#talkDir(stage, talkId), 'captions.jsonl'), JSON.stringify(seg) + '\n');
    } catch (e) {
      console.warn('[store] append failed', e.message);
    }
  }

  /** Saved talks of a room, newest first, with their size. Cached per talk until its files change: the
   * transcript library is public and must not re-read every recording on each visit. */
  listTalks(stage) {
    const d = path.join(this.dir, safe(stage));
    if (!fs.existsSync(d)) return [];
    return fs.readdirSync(d)
      .map((id) => {
        try {
          const mf = path.join(d, id, 'meta.json');
          const f = path.join(d, id, 'captions.jsonl');
          const ms = fs.statSync(mf), cs = fs.existsSync(f) ? fs.statSync(f) : null;
          const key = `${ms.mtimeMs}/${cs?.mtimeMs}/${cs?.size}`;
          const hit = this.#summaries.get(mf);
          if (hit?.key === key) return hit.value;
          const meta = JSON.parse(fs.readFileSync(mf, 'utf8'));
          const segs = cs ? this.readTalk(stage, id) : [];
          const value = {
            ...meta,
            segments: segs.length, // every channel, as stored (docs/reference/api.md)
            origSegments: segs.filter((x) => x.channel === 'orig').length,
            durationMs: segs.reduce((m, x) => Math.max(m, x.end || 0), 0),
            channels: [...new Set(segs.map((x) => x.channel))],
          };
          this.#summaries.set(mf, { key, value });
          return value;
        } catch { return null; }
      })
      .filter((t) => t && t.segments > 0)
      .sort((a, b) => b.startedAt - a.startedAt);
  }

  /** Every saved line of a talk. The last few talks read are kept parsed until their file changes (callers must
   * not modify the array). */
  hasTalk(stage, talkId) { return fs.existsSync(this.#talkDir(stage, talkId)); }

  /** Delete a saved talk for good (its captions and metadata). Returns false if there was none. */
  removeTalk(stage, talkId) {
    const d = this.#talkDir(stage, talkId);
    if (!fs.existsSync(d)) return false;
    fs.rmSync(d, { recursive: true, force: true });
    this.#parsed.delete(path.join(d, 'captions.jsonl'));
    this.#summaries.delete(path.join(d, 'meta.json'));
    return true;
  }

  /** Correct a saved caption: the new text is appended (the file only grows) and wins when the talk is read. */
  correct(stage, talkId, segId, text) {
    const seg = this.readTalk(stage, talkId).find((x) => x.id === segId);
    if (!seg) return null;
    const fixed = { ...seg, text, edited: true };
    this.append(stage, talkId, fixed);
    return fixed;
  }

  readTalk(stage, talkId) {
    const f = path.join(this.#talkDir(stage, talkId), 'captions.jsonl');
    let st;
    try { st = fs.statSync(f); } catch { return []; }
    const key = `${st.mtimeMs}/${st.size}`;
    const hit = this.#parsed.get(f);
    if (hit?.key === key) { this.#parsed.delete(f); this.#parsed.set(f, hit); return hit.segs; } // most recent last
    const lines = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    // A caption saved again with the same id is a correction (or a translation finished late): the newest text
    // wins, in the place where the caption was first said.
    const at = new Map();
    const segs = [];
    for (const seg of lines) {
      if (seg.id == null) { segs.push(seg); continue; } // older or hand-made lines without an id: kept as they are
      const k = `${seg.channel}|${seg.id}`;
      const i = at.get(k);
      if (i === undefined) { at.set(k, segs.length); segs.push(seg); } else segs[i] = seg;
    }
    this.#parsed.set(f, { key, segs });
    if (this.#parsed.size > 20) this.#parsed.delete(this.#parsed.keys().next().value);
    return segs;
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

// Speaker labels (`spk`, set on the dashboard): SRT and TXT name the speaker when it changes; VTT uses its
// standard voice tag on every cue, so players can style or announce it.
export function toSRT(segs) {
  let prev = '';
  return cues(segs).map((s, i) => {
    const who = s.spk && s.spk !== prev ? `${s.spk}: ` : '';
    prev = s.spk || '';
    return `${i + 1}\n${ts(s.start, ',')} --> ${ts(s.end, ',')}\n${who}${s.text}\n`;
  }).join('\n');
}

export function toVTT(segs) {
  // WebVTT cue text is markup: & < > must be escaped ("Q&A" would otherwise make the file invalid).
  const text = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const voice = (n) => text(n.replace(/\n/g, ' '));
  return 'WEBVTT\n\n' + cues(segs).map((s) => `${ts(s.start, '.')} --> ${ts(s.end, '.')}\n${s.spk ? `<v ${voice(s.spk)}>` : ''}${text(s.text)}\n`).join('\n');
}

const endsSentence = (t) => /[.?!…。？！]["'”’»)\]]*\s*$/.test(String(t || ''));

export function toTXT(segs) {
  // Paragraphs: a new one after a sentence, once the paragraph is long enough or the speaker paused (> 4 s); never in
  // the middle of a sentence (the local engine cuts captions at every pause), unless the room was quiet for a long
  // while. Another person speaking starts one too, with their name.
  let out = '', last = null, prev = '', len = 0, prevText = '';
  for (const s of segs) {
    const who = s.spk || '';
    const pause = last == null ? 0 : s.start - last;
    if (who && who !== prev) { out += `${out ? '\n\n' : ''}${who}: `; len = 0; }
    else if (out && ((endsSentence(prevText) && (pause > 4000 || len >= 400)) || pause > 20000)) { out += '\n\n'; len = 0; }
    else if (out) out += ' ';
    out += s.text;
    len += s.text.length + 1;
    last = s.end;
    prev = who || prev;
    prevText = s.text;
  }
  return out + '\n';
}
