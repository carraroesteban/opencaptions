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
        try { this.load(); console.log('[glossary] reloaded'); } catch (e) { console.warn('[glossary] reload failed', e.message); }
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
