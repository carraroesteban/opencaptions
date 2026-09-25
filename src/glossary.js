// Technical glossary: biases recognition (vocabulary) and fixes captions deterministically (replacements).
import fs from 'node:fs';
import { config, loadGlossary } from './config.js';

const esc = (s) => s.replace(/[.*+?^${}()[\]\\]/g, '\\$&');

export class Glossary {
  constructor() {
    this.load();
    // Hot-reload: editing config/glossary.json during the event applies instantly (no restart).
    try {
      fs.watchFile(config.glossaryPath, { interval: 2000 }, () => {
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
    this.rules = this.data.replacements.map((r) => {
      const alts = String(r.from).split('|').map((a) => esc(a.trim())).filter(Boolean);
      // Whole-word match that also works with accented chars (unicode-aware boundaries).
      const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts.join('|')})(?![\\p{L}\\p{N}])`, 'giu');
      return { re, to: r.to, lang: r.lang || null };
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
