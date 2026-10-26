// The page language and the language and theme buttons of page headers. Kept apart from i18n.js (the operator
// dictionary, ~40 KB) so the audience's phones and the pages without a dictionary don't download it.
import { store, qs, setTheme } from '/common.js';
import { menu, popMenu } from '/menu.js';

export const LANG = (() => {
  const q = qs.get('ui');
  if (q) { store.set('ui', q); return q; }
  const saved = store.get('ui', null);
  if (saved) return saved;
  const b = (navigator.language || 'es').toLowerCase();
  return b.startsWith('es') ? 'es' : b.startsWith('pt') ? 'pt' : 'en';
})();

const NAMES = { es: 'Español', en: 'English', pt: 'Português' }; // in their own language: findable by someone who can't read this one
const PREFS_LABELS = {
  es: { lang: 'Idioma de la página', theme: 'Tema', auto: 'Como el sistema', light: 'Claro', dark: 'Oscuro', contrast: 'Alto contraste' },
  en: { lang: 'Page language', theme: 'Theme', auto: 'Like the system', light: 'Light', dark: 'Dark', contrast: 'High contrast' },
  pt: { lang: 'Idioma da página', theme: 'Tema', auto: 'Como o sistema', light: 'Claro', dark: 'Escuro', contrast: 'Alto contraste' },
};

const GLOBE = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.4 2.6 3.6 5.6 3.6 9s-1.2 6.4-3.6 9c-2.4-2.6-3.6-5.6-3.6-9S9.6 5.6 12 3z"/></svg>';
const CHECK = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
let n = 0;

const THEME_ICON = {
  auto: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
  light: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
  dark: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  contrast: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5" fill="currentColor"/>',
};
const themeSvg = (k) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${THEME_ICON[k]}</svg>`;

/**
 * The page's language and theme in the header, on every page: a globe button (the code, e.g. EN) whose menu lists
 * the languages by name, and next to it a theme button (its icon is the current theme) with Like the system / Light /
 * Dark / High contrast. One tap opens, one chooses.
 * @param {{ langs?: string[] }} [o]  languages to offer (audience pages add 'pt'); default: Spanish and English
 * (a language that gets a dictionary in i18n.js goes in the default too).
 */
export function prefsControls({ langs = ['es', 'en'] } = {}) {
  const wrap = document.createElement('span');
  wrap.className = 'prefs';
  wrap.setAttribute('data-no-i18n', '');
  const cur = langs.includes(LANG) ? LANG : 'es';
  const L = PREFS_LABELS[cur] || PREFS_LABELS.en;
  const id = ++n;
  const th = () => document.documentElement.dataset.theme || 'auto';
  wrap.innerHTML = `<button type="button" class="prefs-btn" data-p="lang" aria-haspopup="true" aria-expanded="false" aria-controls="prefs-lang-${id}" aria-label="${L.lang}: ${cur.toUpperCase()}" title="${L.lang}">${GLOBE}<span>${cur.toUpperCase()}</span></button>
    <button type="button" class="prefs-btn prefs-theme" data-p="theme" aria-haspopup="true" aria-expanded="false" aria-controls="prefs-theme-${id}"></button>
    <div class="ctx" popover id="prefs-lang-${id}" role="menu" aria-label="${L.lang}"></div>
    <div class="ctx" popover id="prefs-theme-${id}" role="menu" aria-label="${L.theme}"></div>`;
  const [lb, tb] = wrap.querySelectorAll('button'), [lp, tp] = wrap.querySelectorAll('[popover]');
  const showTheme = () => { tb.innerHTML = themeSvg(th()); tb.setAttribute('aria-label', `${L.theme}: ${L[th()]}`); tb.title = L.theme; };
  showTheme();
  const item = (k, label, on, ic = '') => `<button type="button" role="menuitemradio" aria-checked="${on}" data-k="${k}">${ic}<span>${label}</span>${on ? CHECK : ''}</button>`;
  const lm = menu(lp), tm = menu(tp);
  lb.onclick = (e) => popMenu(lm, lb, [...new Set(langs)].map((k) => item(k, NAMES[k] || k, k === cur)).join(''), e);
  tb.onclick = (e) => popMenu(tm, tb, Object.keys(THEME_ICON).map((k) => item(k, L[k], k === th(), themeSvg(k))).join(''), e);
  tm.onclick = (e) => {
    const v = e.target.closest('[data-k]')?.dataset.k;
    if (!v) return;
    tp.hidePopover();
    setTheme(v);
    showTheme();
  };
  lm.onclick = (e) => {
    const v = e.target.closest('[data-k]')?.dataset.k;
    if (!v) return;
    lp.hidePopover();
    if (v === cur) return;
    store.set('ui', v);
    const u = new URL(location.href);
    u.searchParams.delete('ui');
    dispatchEvent(new Event('oc:reload')); // a page sending sound picks it up again after the reload (capture.js keepAlive)
    // Same address (e.g. only a #hash): assigning it wouldn't reload the page.
    if (u.href === location.href || u.href.split('#')[0] === location.href.split('#')[0]) location.reload(); else location.href = u.href;
  };
  return wrap;
}

/** Basic or Advanced (everything marked data-advanced): this browser's choice, Basic until changed. */
export const advanced = { get: () => !!store.get('advanced', false), set: (on) => { store.set('advanced', !!on); document.body.classList.toggle('advanced', !!on); } };
if (document.body) document.body.classList.toggle('advanced', advanced.get()); else addEventListener('DOMContentLoaded', () => document.body.classList.toggle('advanced', advanced.get()));
