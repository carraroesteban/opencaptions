// Glossary (names and specialist terms): biases recognition (vocabulary) and fixes captions deterministically (replacements).
import fs from 'node:fs';
import { config, loadGlossary } from './config.js';

const esc = (s) => s.replace(/[.*+?^${}()[\]\\]/g, '\\$&');
/** "tele health | telehealth" → the spellings to look for (empty ones dropped). */
const alternatives = (from) => String(from).split('|').map((a) => a.trim()).filter(Boolean);

export class Glossary {
  constructor() {
    this.load();
    // Hot-reload: editing config/glossary.json during the event applies instantly (no restart).
    try {
      fs.watchFile(config.glossaryPath, { interval: 2000 }, (curr) => {
        // No file (yet): nothing to reload. The desktop apps start without one, and Windows still fires once.
        if (!curr.mtimeMs) return;
        try {
          // Read strictly: a JSON typo must keep the previous rules, not silently load an empty glossary.
          const data = JSON.parse(fs.readFileSync(config.glossaryPath, 'utf8'));
          this.load(data);
          console.log(`[glossary] reloaded (${this.data.vocabulary.length} terms, ${this.rules.length} replacements)`);
        } catch (e) { console.warn('[glossary] reload failed — keeping the previous glossary:', e.message); }
      });
    } catch { /* ignore */ }
  }

  load(data = loadGlossary()) {
    this.data = { vocabulary: data.vocabulary || [], replacements: data.replacements || [] };
    this.rules = this.data.replacements.flatMap((r) => {
      const alts = alternatives(r.from).map(esc);
      if (!alts.length) return []; // "|" alone would match the empty string and write `to` all over the captions
      // Whole-word match that also works with accented chars (unicode-aware boundaries).
      const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts.join('|')})(?![\\p{L}\\p{N}])`, 'giu');
      return [{ re, to: r.to, lang: r.lang || null }];
    });
  }

  set(data) {
    const str = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;
    if (!data || !Array.isArray(data.vocabulary) || !Array.isArray(data.replacements ?? [])) throw new Error('expected { vocabulary: [], replacements: [] }');
    if (data.vocabulary.length > 500 || !data.vocabulary.every((v) => str(v, 100))) throw new Error('vocabulary: up to 500 strings of ≤100 chars');
    const reps = data.replacements || [];
    if (reps.length > 500 || !reps.every((r) => r && str(r.from, 300) && typeof r.to === 'string' && r.to.length <= 300 && (r.lang == null || str(r.lang, 12)))) {
      throw new Error('replacements: up to 500 { from, to, lang? } with strings ≤300 chars');
    }
    const empty = reps.find((r) => !alternatives(r.from).length);
    if (empty) throw new Error(`replacements: "${empty.from}" has no words to look for`);
    data = { vocabulary: data.vocabulary, replacements: reps.map(({ from, to, lang }) => (lang ? { from, to, lang } : { from, to })) };
    fs.writeFileSync(config.glossaryPath, JSON.stringify(data, null, 2));
    this.load(data);
  }

  vocabulary(extra = []) {
    return [...new Set([...this.data.vocabulary, ...extra])].slice(0, 500);
  }

  apply(text, channel, lang = channel) {
    if (!text) return text;
    let out = text;
    for (const r of this.rules) {
      if (r.lang && r.lang !== channel && r.lang !== lang) continue;
      out = out.replace(r.re, r.to);
    }
    return out;
  }
}
