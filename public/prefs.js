// The page language and the language + theme switcher of page headers. Kept apart from i18n.js (the operator
// dictionary, ~40 KB) so the audience's phones and the pages without a dictionary don't download it.
import { store, qs } from '/common.js';

export const LANG = (() => {
  const q = qs.get('ui');
  if (q) { store.set('ui', q); return q; }
  const saved = store.get('ui', null);
  if (saved) return saved;
  const b = (navigator.language || 'es').toLowerCase();
  return b.startsWith('es') ? 'es' : b.startsWith('pt') ? 'pt' : 'en';
})();

const PREFS_LABELS = {
  es: { lang: 'Idioma de la página', theme: 'Claro / oscuro' },
  en: { lang: 'Page language', theme: 'Light / dark' },
  pt: { lang: 'Idioma da página', theme: 'Claro / escuro' },
};

/**
 * Language + theme switcher for page headers.
 * @param {{ langs?: string[], theme?: boolean }} [o]  languages to offer (audience pages add 'pt'); default: Spanish and English
 * (a language that gets a dictionary in i18n.js goes in the default too). theme: false where the page has its own theme choice.
 */
export function prefsControls({ langs = ['es', 'en'], theme = true } = {}) {
  const wrap = document.createElement('span');
  wrap.className = 'row prefs';
  wrap.setAttribute('data-no-i18n', '');
  const cur = langs.includes(LANG) ? LANG : 'es';
  const L = PREFS_LABELS[cur] || PREFS_LABELS.en;
  wrap.innerHTML = `<select aria-label="${L.lang}" title="${L.lang}">${[...new Set(langs)].map((k) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${k.toUpperCase()}</option>`).join('')}</select>
    ${theme ? `<button type="button" aria-label="${L.theme}" title="${L.theme}">◐</button>` : ''}`;
  wrap.querySelector('select').onchange = (e) => {
    store.set('ui', e.target.value);
    const u = new URL(location.href);
    u.searchParams.delete('ui');
    dispatchEvent(new Event('oc:reload')); // a page sending sound picks it up again after the reload (capture.js keepAlive)
    // Same address (e.g. only a #hash): assigning it wouldn't reload the page.
    if (u.href === location.href || u.href.split('#')[0] === location.href.split('#')[0]) location.reload(); else location.href = u.href;
  };
  if (theme) wrap.querySelector('button').onclick = () => {
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    const next = cur === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    store.set('theme', next);
  };
  return wrap;
}

/** Basic or Advanced (everything marked data-advanced): this browser's choice, Basic until changed. */
export const advanced = { get: () => !!store.get('advanced', false), set: (on) => { store.set('advanced', !!on); document.body.classList.toggle('advanced', !!on); } };
if (document.body) document.body.classList.toggle('advanced', advanced.get()); else addEventListener('DOMContentLoaded', () => document.body.classList.toggle('advanced', advanced.get()));
