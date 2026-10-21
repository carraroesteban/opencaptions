// The page language and the language + theme switcher of page headers. Kept apart from i18n.js (the operator
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
  es: { lang: 'Idioma de la página', theme: 'Tema', auto: 'Como el sistema', light: 'Claro', dark: 'Oscuro' },
  en: { lang: 'Page language', theme: 'Theme', auto: 'Like the system', light: 'Light', dark: 'Dark' },
  pt: { lang: 'Idioma da página', theme: 'Tema', auto: 'Como o sistema', light: 'Claro', dark: 'Escuro' },
};

const GLOBE = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.4 2.6 3.6 5.6 3.6 9s-1.2 6.4-3.6 9c-2.4-2.6-3.6-5.6-3.6-9S9.6 5.6 12 3z"/></svg>';
const CHECK = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
let n = 0;

/**
 * The page's language and theme: one globe button in the header, its menu lists the languages by name and Auto /
 * Light / Dark.
 * @param {{ langs?: string[], theme?: boolean }} [o]  languages to offer (audience pages add 'pt'); default: Spanish and English
 * (a language that gets a dictionary in i18n.js goes in the default too). theme: false where the page has its own theme choice.
 */
export function prefsControls({ langs = ['es', 'en'], theme = true } = {}) {
  const wrap = document.createElement('span');
  wrap.className = 'prefs';
  wrap.setAttribute('data-no-i18n', '');
  const cur = langs.includes(LANG) ? LANG : 'es';
  const L = PREFS_LABELS[cur] || PREFS_LABELS.en;
  const id = `prefs-menu-${++n}`;
  wrap.innerHTML = `<button type="button" class="prefs-btn" aria-haspopup="true" aria-expanded="false" aria-controls="${id}" aria-label="${theme ? `${L.lang} · ${L.theme}` : L.lang}" title="${L.lang}">${GLOBE}<span>${cur.toUpperCase()}</span></button>
    <div class="ctx" popover id="${id}" role="menu" aria-label="${L.lang}"></div>`;
  const b = wrap.querySelector('button'), m = menu(wrap.querySelector('[popover]'));
  const item = (k, label, on) => `<button type="button" role="menuitemradio" aria-checked="${on}" data-k="${k}">${label}${on ? CHECK : ''}</button>`;
  b.onclick = (e) => {
    const th = document.documentElement.dataset.theme || 'auto';
    popMenu(m, b, [...new Set(langs)].map((k) => item(`l:${k}`, NAMES[k] || k, k === cur)).join('')
      + (theme ? `<span class="ctx-sep" role="separator"></span>${['auto', 'light', 'dark'].map((k) => item(`t:${k}`, L[k], k === th)).join('')}` : ''), e);
  };
  m.onclick = (e) => {
    const [what, v] = e.target.closest('[data-k]')?.dataset.k.split(':') || [];
    if (!what) return;
    m.hidePopover();
    if (what === 't') return setTheme(v);
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
