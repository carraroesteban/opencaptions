// App-drawn dropdowns. Every <select> gets a button and a list drawn by OpenCaptions (public/controls.css) instead
// of the operating system's menu. The <select> stays in the page, hidden, as the source of truth: forms, 'change'
// listeners, `select.value = …` and `select.innerHTML = …` keep working unchanged. Left native: <select multiple>,
// <select size="4">, and anything inside [data-native]. Long lists (more than 10) get a search box; phones get a sheet.

const WORDS = { es: ['Buscar', 'Sin resultados'], en: ['Search', 'No matches'], pt: ['Buscar', 'Nenhum resultado'] };
const words = () => WORDS[document.documentElement.lang.slice(0, 2)] || WORDS.en;
const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase(); // "Español" matches "espanol"
const MIRROR = ['aria-label', 'aria-labelledby', 'aria-describedby', 'title', 'data-setup', 'data-admin', 'data-advanced'];
const ui = new Map(); // select → its button
let cur = null, rows = [], active = -1, up = false, sheet = false, downOpen = null, back = null, buf = '', bufAt = 0, ids = 0;

// One floating list for the whole page, in the top layer (no overflow clips it).
const pop = document.createElement('div');
pop.className = 'oc-pop';
pop.setAttribute('popover', 'auto');
pop.setAttribute('data-no-i18n', '');
pop.innerHTML = '<div class="oc-card"><input class="oc-find" type="text" role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="oc-list" autocomplete="off" spellcheck="false" enterkeyhint="done"><div class="oc-list" id="oc-list" role="listbox" tabindex="-1"></div></div>';
const card = pop.firstElementChild, find = card.firstElementChild, list = card.lastElementChild;

function labelText(sel) {
  const refs = sel.getAttribute('aria-labelledby');
  if (refs) return refs.split(/\s+/).map((id) => document.getElementById(id)?.textContent.trim()).join(' ');
  // a label's own words, not the options of the select inside it
  return sel.getAttribute('aria-label') || [...sel.labels].map((l) => [...l.childNodes].filter((n) => !n.matches?.('select, button')).map((n) => n.textContent).join('').trim()).join(' ');
}

function enhance(sel) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.innerHTML = '<span class="oc-val"><span class="oc-txt"></span><span class="oc-sz" aria-hidden="true"></span></span>';
  for (const [k, v] of [['role', 'combobox'], ['aria-haspopup', 'listbox'], ['aria-expanded', 'false'], ['aria-controls', 'oc-list']]) btn.setAttribute(k, v);
  btn.fit = getComputedStyle(sel).fieldSizing === 'content'; // the page sizes it to the chosen option, not the longest
  ui.set(sel, btn);
  sel.before(btn); // first in a wrapping <label>, so the label names (and clicks) the button
  sel.setAttribute('data-oc-select', '');
  // Code that sets .value or .selectedIndex fires no event: redraw the button anyway.
  for (const k of ['value', 'selectedIndex']) {
    const d = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, k);
    Object.defineProperty(sel, k, { configurable: true, get() { return d.get.call(this); }, set(v) { d.set.call(this, v); sync(sel); } });
  }
  sel.focus = (o) => btn.focus(o);
  new MutationObserver(() => sync(sel, true)).observe(sel, { childList: true, subtree: true, characterData: true, attributes: true });
  sel.addEventListener('invalid', (e) => { e.preventDefault(); open(sel); }); // a required pick left empty: show the list
  btn.addEventListener('click', () => { const was = downOpen === sel; downOpen = null; if (was) close(true); else open(sel); });
  btn.addEventListener('keydown', (e) => key(e, sel));
  sync(sel, true);
  return btn;
}

function sync(sel, all) {
  const btn = ui.get(sel);
  btn.firstChild.firstChild.textContent = sel.selectedOptions[0]?.label || ' ';
  btn.className = `oc-select ${sel.className}${btn.fit ? ' oc-fit' : ''}`;
  btn.disabled = sel.disabled;
  btn.hidden = sel.hidden;
  for (const a of MIRROR) if (sel.hasAttribute(a)) btn.setAttribute(a, sel.getAttribute(a)); else btn.removeAttribute(a);
  // <label for="id"> points at the hidden select: let it name the button
  const named = [...sel.labels].filter((l) => !l.contains(btn));
  if (named.length && !sel.hasAttribute('aria-labelledby')) btn.setAttribute('aria-labelledby', named.map((l) => (l.id ||= `oc-l${++ids}`)).join(' '));
  if (!all) return;
  // the button is as wide as the longest option, like a native select (see .oc-sz in controls.css)
  if (!btn.fit) btn.firstChild.lastChild.replaceChildren(...[...sel.options].map((o) => Object.assign(document.createElement('span'), { textContent: o.label })));
  if (cur === sel) { build(); place(); }
}

function build() {
  const q = fold(find.value.trim()), frag = document.createDocumentFragment();
  rows = [];
  const add = (o, to) => {
    if (o.hidden || (q && !fold(o.label).includes(q))) return;
    const r = document.createElement('div');
    r.className = 'oc-opt';
    r.id = `oc-o${rows.length}`;
    r.textContent = o.label || ' ';
    r.opt = o;
    r.setAttribute('role', 'option');
    r.setAttribute('aria-selected', o.selected);
    if (o.disabled || o.parentElement.disabled) r.setAttribute('aria-disabled', 'true');
    rows.push(r);
    to.append(r);
  };
  for (const el of cur.children) {
    if (el.tagName === 'OPTION') add(el, frag);
    else if (el.tagName === 'OPTGROUP') {
      const g = document.createElement('div'), h = document.createElement('div');
      g.setAttribute('role', 'group');
      g.setAttribute('aria-labelledby', (h.id = `oc-g${++ids}`));
      h.className = 'oc-group';
      h.textContent = el.label;
      g.append(h);
      for (const o of el.children) if (o.tagName === 'OPTION') add(o, g);
      if (g.children.length > 1) frag.append(g);
    }
  }
  if (!rows.length) frag.append(Object.assign(document.createElement('div'), { className: 'oc-empty', textContent: words()[1] }));
  list.replaceChildren(frag);
  active = -1;
  go(q ? 0 : Math.max(0, rows.findIndex((r) => r.opt.selected)), false);
}

function go(i, scroll = true) {
  rows[active]?.classList.remove('oc-on');
  active = Math.max(0, Math.min(i, rows.length - 1));
  const r = rows[active];
  for (const el of [find, ui.get(cur)]) if (r) el.setAttribute('aria-activedescendant', r.id); else el.removeAttribute('aria-activedescendant');
  if (!r) return;
  r.classList.add('oc-on');
  if (!scroll) return;
  const top = r.offsetTop, bottom = top + r.offsetHeight;
  if (top < list.scrollTop) list.scrollTop = top - 6;
  else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight + 6;
}

function open(sel) {
  const btn = ui.get(sel);
  if (btn.disabled) return;
  close();
  cur = sel;
  (sel.closest('dialog, [popover]') || document.body).append(pop); // outside a modal dialog it would be inert
  sheet = matchMedia('(pointer: coarse) and (max-width: 640px)').matches;
  pop.classList.toggle('oc-sheet', sheet);
  pop.removeAttribute('style');
  card.removeAttribute('style');
  const [search] = words();
  find.hidden = sel.options.length <= 10;
  find.value = '';
  find.placeholder = search;
  find.setAttribute('aria-label', search);
  list.setAttribute('aria-label', labelText(sel));
  build();
  btn.setAttribute('aria-expanded', 'true');
  pop.showPopover();
  place(true);
  (find.hidden || sheet ? btn : find).focus({ preventScroll: true }); // no keyboard popping up over a phone's sheet
  const r = rows[active];
  if (r) list.scrollTop = r.offsetTop - (list.clientHeight - r.offsetHeight) / 2; // the chosen one, in the middle
}

// Under the button, or above it when there's more room there; never off-screen.
function place(fresh) {
  if (!cur || sheet) return;
  const r = ui.get(cur).getBoundingClientRect(), vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  const below = vh - r.bottom - 14, above = r.top - 14, s = pop.style;
  if (fresh) {
    card.style.minWidth = `${r.width}px`;
    up = below < Math.min(card.offsetHeight, 240) && above > below; // below unless that leaves it cramped
    card.style.width = `${card.offsetWidth}px`; // filtering doesn't make it jump narrower
  }
  card.style.maxHeight = `${Math.min(380, up ? above : below)}px`;
  s.top = up ? 'auto' : `${r.bottom + 6}px`;
  s.bottom = up ? `${vh - r.top + 6}px` : 'auto';
  s.left = `${Math.max(8, Math.min(r.left, vw - card.offsetWidth - 8))}px`;
  s.transformOrigin = up ? 'bottom left' : 'top left';
}

function close(focus) {
  const btn = cur && ui.get(cur);
  if (pop.matches(':popover-open')) pop.hidePopover();
  if (focus && btn) btn.focus({ preventScroll: true });
}

function pick(i) {
  const o = rows[i]?.opt, sel = cur;
  if (!o || rows[i].hasAttribute('aria-disabled')) return;
  close(true);
  if (o.selected) return;
  o.selected = true;
  sync(sel);
  for (const t of ['input', 'change']) sel.dispatchEvent(new Event(t, { bubbles: true }));
}

function typeahead(ch) {
  const now = Date.now();
  buf = now - bufAt > 700 ? ch : buf + ch;
  bufAt = now;
  const q = fold(buf), same = [...q].every((c) => c === q[0]), n = rows.length;
  const from = same ? active + 1 : active; // "a", "a" walks through the A's; "ar" stays on a match
  for (let j = 0; j < n; j++) {
    const i = (from + j) % n;
    if (fold(rows[i].opt.label).startsWith(same ? q[0] : q)) return go(i);
  }
}

function key(e, sel) {
  const k = e.key, inFind = e.target === find, ch = k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
  if (cur !== sel) {
    if (!ch && !['Enter', 'ArrowDown', 'ArrowUp'].includes(k)) return;
    open(sel);
    if (ch && k !== ' ') { if (document.activeElement === find) { find.value = k; build(); } else typeahead(k); }
  } else if (k === 'ArrowDown' || k === 'ArrowUp') go(active + (k === 'ArrowDown' ? 1 : -1));
  else if (k === 'PageDown' || k === 'PageUp') go(active + (k === 'PageDown' ? 10 : -10));
  else if ((k === 'Home' || k === 'End') && !inFind) go(k === 'Home' ? 0 : rows.length - 1);
  else if (k === 'Enter' || (k === ' ' && !inFind && Date.now() - bufAt > 700)) pick(active);
  else if (k === 'Escape') return e.stopPropagation(); // the browser closes the list (and only the list, in a dialog)
  else if (k === 'Tab') { if (inFind) ui.get(sel).focus(); return close(); } // Tab goes on from the button
  else if (ch && !inFind) typeahead(k);
  else return;
  e.preventDefault();
  e.stopPropagation(); // page shortcuts don't also see the keys the list used
}

pop.addEventListener('beforetoggle', (e) => {
  if (e.newState !== 'closed' || !cur) return;
  const btn = ui.get(cur);
  back = pop.contains(document.activeElement) ? btn : null;
  btn.setAttribute('aria-expanded', 'false');
  btn.removeAttribute('aria-activedescendant');
  cur = null;
});
pop.addEventListener('toggle', (e) => { if (e.newState === 'closed' && !cur) back?.focus({ preventScroll: true }); back = null; });
pop.addEventListener('mousedown', (e) => { if (e.target !== find) e.preventDefault(); }); // focus stays on the button
pop.addEventListener('click', (e) => {
  const r = e.target.closest('.oc-opt');
  if (r) pick(rows.indexOf(r));
  else if (e.target === pop) close(true); // the dimmed area around a phone's sheet
});
list.addEventListener('pointermove', (e) => { const r = e.target.closest('.oc-opt'); if (r && e.pointerType === 'mouse') go(rows.indexOf(r), false); });
find.addEventListener('keydown', (e) => cur && key(e, cur));
find.addEventListener('input', () => { build(); place(); });
addEventListener('pointerdown', () => { downOpen = cur; }, true); // a click on the open list's own button closes it
addEventListener('resize', () => place());
addEventListener('scroll', (e) => { if (e.target !== list) place(); }, true);

function scan() {
  for (const [sel, btn] of ui) if (!sel.isConnected) { btn.remove(); ui.delete(sel); }
  for (const sel of document.getElementsByTagName('select')) {
    if (sel.multiple || sel.size > 1 || sel.closest('[data-native]')) continue;
    const btn = ui.get(sel) || enhance(sel);
    if (btn.nextSibling !== sel) sel.before(btn); // the page moved the select: the button follows
  }
}
if (!location.pathname.startsWith('/overlay')) { // the livestream overlay has no controls, and redraws constantly
  scan();
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
}
