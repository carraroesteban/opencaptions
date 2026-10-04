// Change history: every change to the event's setup (rooms, agenda, glossary, event name, AI mode) is recorded
// with what it replaced, so the dashboard can undo any of them and bring deleted rooms back from the trash.
// One JSON object per line in data/history.jsonl; an undo is itself a new line that points at the change it
// reverted (`undoes`), so the file is only ever appended to.
import fs from 'node:fs';
import path from 'node:path';

/**
 * @typedef {{ id: number, at: number, kind: string, target?: string, summary: string, before?: any, after?: any, undoes?: number, undone?: boolean }} Change
 */

export class History {
  /**
   * @param {string} file
   * @param {{ max?: number }} [o]  how many changes to keep in memory (and to serve)
   */
  constructor(file, { max = 2000 } = {}) {
    this.file = file;
    this.max = max;
    /** @type {Change[]} */
    this.list = [];
    this.undone = new Set();
    try {
      for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try { this.#add(JSON.parse(line)); } catch { /* skip a damaged line */ }
      }
    } catch { /* no history yet */ }
    this.seq = this.list.reduce((m, c) => Math.max(m, c.id), 0);
  }

  #add(c) {
    this.list.push(c);
    if (c.undoes) this.undone.add(c.undoes);
    if (this.list.length > this.max) this.list.shift();
  }

  /**
   * Record a change. `before` is what an undo puts back.
   * @param {{ kind: string, target?: string, summary: string, before?: any, after?: any, undoes?: number }} c
   * @returns {Change}
   */
  record(c) {
    const entry = { id: ++this.seq, at: Date.now(), ...c };
    this.#add(entry);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.appendFileSync(this.file, JSON.stringify(entry) + '\n');
    return entry;
  }

  /** @param {number} id */
  get(id) { return this.list.find((c) => c.id === id) || null; }

  /**
   * Newest first, with `undone` filled in. Large snapshots are left out unless `full`.
   * @param {{ limit?: number, full?: boolean }} [o]
   */
  recent({ limit = 200, full = false } = {}) {
    return this.list.slice(-limit).reverse().map((c) => {
      const out = { ...c, undone: this.undone.has(c.id) };
      if (!full && (c.kind === 'agenda.set' || c.kind === 'glossary.set')) {
        out.before = summarize(c.before);
        out.after = summarize(c.after);
      }
      return out;
    });
  }

  /**
   * Rooms deleted and not restored since (the trash), newest first.
   * @param {(id: string) => boolean} exists  is a room with this id there now?
   */
  trash(exists) {
    const seen = new Set();
    const out = [];
    for (const c of [...this.list].reverse()) {
      if (c.kind !== 'room.delete' || this.undone.has(c.id) || seen.has(c.target) || exists(c.target)) continue;
      seen.add(c.target);
      out.push({ id: c.id, at: c.at, room: c.before });
    }
    return out;
  }
}

/** Short description of a big snapshot for the list view (the full one is only needed to undo). */
function summarize(v) {
  if (Array.isArray(v)) return { count: v.length };
  if (v && typeof v === 'object' && Array.isArray(v.vocabulary)) return { terms: v.vocabulary.length, corrections: (v.replacements || []).length };
  return v;
}
