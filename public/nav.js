// How organizers move around (docs/adr/0012), the same on every organizer page: a sidebar with icons and labels
// that collapses to icons only (remembered; on a phone it's a menu behind ☰), the rooms listed like channels with a
// live dot, a back button and a breadcrumb, a ⌘K / Ctrl+K quick switcher, and "?" buttons that hold the explanations.
// A page adds <div class="crumbbar" id="crumbbar"></div> where its header goes and calls mountNav().
import { esc, store } from '/common.js';
import { LANG } from '/i18n.js';
import { icon } from '/illustrations.js';

const T = {
  es: {
    views: { live: 'En vivo', rooms: 'Salas', agenda: 'Agenda', glossary: 'Glosario', integrations: 'Integraciones', transcripts: 'Transcripciones', history: 'Historial', settings: 'Ajustes' },
    panes: { general: 'General', ai: 'IA', address: 'Dirección pública', security: 'Seguridad', alerts: 'Alertas' },
    pages: [['dashboard', 'Informe del evento', '/report.html'], ['wand', 'Configurar el evento', '/welcome.html'], ['book', 'Biblioteca de transcripciones', '/talks.html'], ['qr', 'Kit de QR', '/kit.html'], ['palette', 'Estilo de subtítulos', '/style.html'], ['mic', 'Prueba de sonido', '/demo.html?mode=mic']],
    state: { live: 'en vivo', pause: 'en pausa', off: 'sin sonido', bad: 'necesita atención' },
    home: 'Panel', sections: 'Secciones', rooms: 'Salas', menu: 'Menú', back: 'Atrás', here: 'Estás en', help: 'Ayuda',
    search: 'Buscar', jump: 'Ir a', jumpPh: 'Una sala, una página o un ajuste', page: 'Página', roomSet: 'Ajustes de la sala', roomTabs: { live: 'En vivo', screens: 'Pantallas y QR', sound: 'Sonido', settings: 'Ajustes' }, room: 'Abrir la sala', recent: 'Recientes',
    sound: 'Página de sonido', screen: 'Pantalla del escenario', audience: 'Subtítulos en el celular', qr: 'Cartel con QR', newRoom: 'Nueva sala',
    keys: 'Atajos de teclado', toggle: 'Mostrar u ocultar el menú', collapse: 'Contraer el menú', menuKey: 'Menú de una sala (o clic derecho)', closeMenu: 'Cerrar el menú', move: 'moverse', open: 'abrir', close: 'Cerrar',
    found: (n) => (n ? `${n} ${n === 1 ? 'resultado' : 'resultados'}` : 'Nada coincide'),
  },
  en: {
    views: { live: 'Live', rooms: 'Rooms', agenda: 'Agenda', glossary: 'Glossary', integrations: 'Integrations', transcripts: 'Transcripts', history: 'History', settings: 'Settings' },
    panes: { general: 'General', ai: 'AI', address: 'Public address', security: 'Security', alerts: 'Alerts' },
    pages: [['dashboard', 'Event report', '/report.html'], ['wand', 'Set up the event', '/welcome.html'], ['book', 'Transcript library', '/talks.html'], ['qr', 'QR kit', '/kit.html'], ['palette', 'Caption style', '/style.html'], ['mic', 'Sound check', '/demo.html?mode=mic']],
    state: { live: 'live', pause: 'paused', off: 'no sound', bad: 'needs attention' },
    home: 'Dashboard', sections: 'Sections', rooms: 'Rooms', menu: 'Menu', back: 'Back', here: 'You are here', help: 'Help',
    search: 'Search', jump: 'Go to', jumpPh: 'A room, a page or a setting', page: 'Page', roomSet: 'Room settings', roomTabs: { live: 'Live', screens: 'Screens & QR', sound: 'Sound', settings: 'Settings' }, room: 'Open the room', recent: 'Recent',
    sound: 'Sound page', screen: 'Stage screen', audience: 'Captions on phones', qr: 'QR poster', newRoom: 'New room',
    keys: 'Keyboard shortcuts', toggle: 'Show or hide the menu', collapse: 'Collapse the menu', menuKey: 'A room’s menu (or right-click)', closeMenu: 'Close the menu', move: 'move', open: 'open', close: 'Close',
    found: (n) => (n ? `${n} ${n === 1 ? 'result' : 'results'}` : 'Nothing matches'),
  },
};
const L = T[LANG] || T.en;
// [view, icon, admin only]; null is a divider
// Settings isn't in the list: it's always the sidebar's last item, at the bottom.
const VIEWS = [['live', 'play'], ['rooms', 'dashboard', 1], ['agenda', 'calendar', 1], ['glossary', 'book', 1], ['integrations', 'link', 1], ['transcripts', 'doc'], ['history', 'refresh']];
const SETTINGS = ['settings', 'gear', 1];
const onAdmin = location.pathname === '/admin.html';
const to = (hash) => (onAdmin ? hash : `/admin.html${hash}`); // on the dashboard itself, only the #hash changes
const MAC = /Mac|iP(hone|ad|od)/.test(navigator.platform);
const phone = matchMedia('(max-width: 900px)');
const fold = (x) => x.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const $ = (id) => document.getElementById(id);
const crew = () => document.body.classList.contains('role-crew');

const link = (v) => `<a href="${to(`#${v[0]}`)}" data-view="${v[0]}"${v[2] ? ' data-admin' : ''}>${icon(v[1])}<span class="lbl">${L.views[v[0]]}</span></a>`;
let crumbs = [];
let rooms = [];
let currentRoom = '';

/** Builds the sidebar (or fills the page's own #side), the back button and breadcrumb in #crumbbar, and the quick switcher. */
export function mountNav({ current = '', crumbs: c = [] } = {}) {
  let side = $('side');
  if (!side) {
    side = document.createElement('aside');
    side.id = 'side';
    side.className = 'side';
    side.innerHTML = `<a class="brand" href="${to('#live')}">OpenCaptions</a>`;
    document.body.prepend(side);
  }
  document.body.classList.add('has-side');
  // The top row: the logo and the button that collapses the sidebar to icons (on a phone, closes the menu).
  const top = document.createElement('div');
  top.className = 'side-top';
  side.querySelector('.brand').before(top);
  top.append(side.querySelector('.brand'));
  top.insertAdjacentHTML('beforeend', `<button type="button" class="nav-btn" id="side-toggle" aria-controls="side">${icon('menu')}</button>`);
  const block = document.createElement('div');
  block.className = 'side-main';
  block.dataset.noI18n = '';
  block.innerHTML = `<button type="button" class="side-jump" id="side-jump" aria-keyshortcuts="${MAC ? 'Meta+K' : 'Control+K'}">${icon('search')}<span class="lbl">${L.search}</span><kbd aria-hidden="true">${MAC ? '⌘K' : 'Ctrl K'}</kbd></button>
    <nav id="nav" aria-label="${L.sections}"><h2 class="side-h hidden" id="side-rooms-h">${L.rooms}</h2><ul class="side-rooms" id="side-rooms" aria-labelledby="side-rooms-h"></ul>
      <span class="sep"></span>${VIEWS.map(link).join('')}</nav>`;
  side.querySelector('.foot') ? side.querySelector('.foot').before(block) : side.append(block);
  side.insertAdjacentHTML('beforeend', `<nav class="side-last" aria-label="${L.views.settings}">${link(SETTINGS)}</nav>`);
  setCurrent(current);

  const bar = $('crumbbar');
  bar?.insertAdjacentHTML('afterbegin', `<button type="button" class="nav-btn" id="nav-menu" aria-controls="side" aria-label="${L.menu}" title="${L.menu}">${icon('menu')}</button>
    <button type="button" class="nav-btn hidden" id="nav-back" aria-label="${L.back}" title="${L.back}">${icon('back')}</button>
    <nav aria-label="${L.here}" data-no-i18n><ol class="crumbs" id="crumbs"></ol></nav><span class="spacer"></span>`);
  $('nav-menu')?.addEventListener('click', toggleMenu);
  $('nav-back')?.addEventListener('click', goBack);
  $('side-toggle').onclick = () => { if (!phone.matches) return toggleMenu(); openMenu(false); $('nav-menu')?.focus(); };
  side.addEventListener('click', (e) => { if (phone.matches && e.target.closest('a')) openMenu(false); });
  side.addEventListener('keydown', (e) => { if (e.key === 'Escape' && phone.matches && document.body.classList.contains('nav-open')) { openMenu(false); $('nav-menu')?.focus(); } });
  phone.addEventListener('change', syncMenu);
  document.body.classList.toggle('rail', !!store.get('nav.rail', false));
  syncMenu();
  setCrumbs(c);

  mountJump();
  $('side-jump').onclick = openJump;
  addEventListener('keydown', onKey);
  mountRoomMenu();
  side.addEventListener('click', (e) => remember(e.target.closest('#side nav a')?.getAttribute('href')));
  // Other pages ask for the rooms once; the dashboard passes them in on every update (setRooms).
  if (!onAdmin) fetch('/api/status').then((r) => (r.ok ? r.json() : null)).then((s) => s && setRooms(s.stages)).catch(() => {});
  mountHelp();
}

/** Marks the current section in the sidebar (a view name, '' for none) and, with a room, that room. */
export function setCurrent(view, room = '') {
  for (const a of document.querySelectorAll('#side a[data-view]')) a.toggleAttribute('aria-current', !room && a.dataset.view === view);
  for (const a of document.querySelectorAll('#side a[data-view][aria-current]')) a.setAttribute('aria-current', 'page');
  for (const a of document.querySelectorAll('#side-rooms a')) a.toggleAttribute('aria-current', a.dataset.room === room);
  for (const a of document.querySelectorAll('#side-rooms a[aria-current]')) a.setAttribute('aria-current', 'page');
  currentRoom = room;
}

// ---------- sidebar: collapse (desktop) or open (phone) ----------
function toggleMenu() {
  if (phone.matches) return openMenu(!document.body.classList.contains('nav-open'));
  const rail = !document.body.classList.contains('rail');
  document.body.classList.toggle('rail', rail);
  store.set('nav.rail', rail);
  syncMenu();
}
function openMenu(on) {
  document.body.classList.toggle('nav-open', on);
  syncMenu();
  if (on) $('side').querySelector('a, button')?.focus();
}
function syncMenu() {
  const open = phone.matches ? document.body.classList.contains('nav-open') : !document.body.classList.contains('rail');
  $('nav-menu')?.setAttribute('aria-expanded', String(open));
  const tl = phone.matches ? L.closeMenu : open ? L.collapse : L.toggle;
  $('side-toggle').setAttribute('aria-label', tl);
  $('side-toggle').title = tl;
  $('side-toggle').setAttribute('aria-expanded', String(open));
  // Icons only: a tooltip with each label (screen readers still read the label itself).
  for (const a of $('side').querySelectorAll('a, .side-jump')) {
    const lbl = a.querySelector('.lbl')?.textContent.trim();
    if (lbl && !phone.matches && !open) a.title = lbl; else a.removeAttribute('title');
  }
}

// ---------- rooms as channels ----------
/** A room's state for its dot: live, pause, off (no sound) or bad (needs attention), and how to say it. */
export const stateOf = (st) => (st.alerts?.some((a) => a !== 'no-ingest') || st.dueTalk ? 'bad' : !st.ingest ? 'off' : st.engines?.length && !st.gated ? 'live' : 'pause');
export const stateLabel = (state) => L.state[state];
const initials = (name) => name.split(/\s+/).filter((w) => /\p{L}|\d/u.test(w[0] || '')).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '·';
let roomsKey = '';
/** The rooms in the sidebar, each with its status dot: [{ id, name, alerts, ingest, engines, gated, dueTalk }] as /api/status gives them. */
export function setRooms(stages = []) {
  rooms = stages.map((st) => ({ id: st.id, name: st.name || st.id, state: stateOf(st) }));
  const key = JSON.stringify(rooms);
  if (key === roomsKey) return; // the dashboard calls this on every update: redraw only when something changed
  roomsKey = key;
  const ul = $('side-rooms');
  if (!ul) return;
  const had = document.activeElement?.closest('#side-rooms a')?.dataset.room;
  $('side-rooms-h').classList.toggle('hidden', !rooms.length);
  ul.innerHTML = rooms.map((r) => `<li><a href="${to(`#room/${encodeURIComponent(r.id)}`)}" data-room="${esc(r.id)}"><span class="ini" aria-hidden="true">${esc(initials(r.name))}<i class="dot ${r.state}"></i></span><span class="lbl">${esc(r.name)}<span class="sr-only">, ${L.state[r.state]}</span></span>${r.state === 'bad' ? '<span class="n" aria-hidden="true">!</span>' : ''}</a></li>`).join('');
  setCurrent(document.querySelector('#side a[data-view][aria-current]')?.dataset.view || '', currentRoom);
  syncMenu();
  if (had) ul.querySelector(`a[data-room="${CSS.escape(had)}"]`)?.focus();
}

// ---------- back button and breadcrumb ----------
// Back goes to the previous page when it was one of ours, otherwise one level up the breadcrumb. Each history entry
// remembers how deep into OpenCaptions it is, so Back never leaves the app by surprise.
let depth = history.state?.ocDepth ?? (document.referrer.startsWith(location.origin) && history.length > 1 ? 1 : 0);
history.replaceState({ ...history.state, ocDepth: depth }, '');
addEventListener('hashchange', () => {
  if (history.state?.ocDepth != null) depth = history.state.ocDepth;
  else history.replaceState({ ...history.state, ocDepth: ++depth }, '');
  setCrumbs(crumbs);
});
const up = () => crumbs.at(-2)?.href;
function goBack() {
  if (depth > 0) history.back();
  else if (up()) location.href = up();
}
/** The breadcrumb, from the top down: [{ label, href }]; the last one is this page. */
export function setCrumbs(list) {
  crumbs = list;
  const ol = $('crumbs');
  if (!ol) return;
  ol.innerHTML = list.map((c, i) => `<li>${i === list.length - 1 ? `<span aria-current="page">${esc(c.label)}</span>` : `<a href="${esc(c.href)}">${esc(c.label)}</a>`}</li>`).join('');
  $('nav-back').classList.toggle('hidden', !(depth > 0 || up()));
}
/** The breadcrumb's first step: the dashboard. */
export const home = () => ({ label: L.home, href: to('#live') });
export const viewCrumb = (view) => ({ label: L.views[view], href: to(`#${view}`) });

// ---------- what a room can do: its right-click menu, and ⌘K ----------
function roomActions(r) {
  const id = encodeURIComponent(r.id);
  return [
    { ic: 'play', label: L.room, href: to(`#room/${id}`) },
    { ic: 'qr', label: L.roomTabs.screens, href: to(`#room/${id}/screens`) },
    { ic: 'gear', label: L.roomSet, href: to(`#room/${id}/settings`), admin: 1 },
    { ic: 'mic', label: L.sound, href: `/ingest.html?stage=${id}`, blank: 1 },
    { ic: 'monitor', label: L.screen, href: `/screen.html?stage=${id}`, blank: 1 },
    { ic: 'phone', label: L.audience, href: `/watch.html?stage=${id}`, blank: 1 },
    { ic: 'qr', label: L.qr, href: `/kit.html?stage=${id}`, blank: 1 },
    { ic: 'doc', label: L.views.transcripts, href: to(`#transcripts/${id}`) },
  ].filter((x) => !x.admin || !crew());
}
function roomMenu(a, x, y) {
  const r = rooms.find((x) => x.id === a.dataset.room);
  if (!r) return;
  const m = $('room-menu');
  m.setAttribute('aria-label', r.name);
  m.innerHTML = roomActions(r).map((it) => `<a role="menuitem" href="${esc(it.href)}"${it.blank ? ' target="_blank"' : ''}>${icon(it.ic)}${esc(it.label)}</a>`).join('');
  m.showPopover();
  const w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = `${Math.min(x, innerWidth - w - 8)}px`;
  m.style.top = `${Math.min(y, innerHeight - h - 8)}px`;
  menuFrom = a;
  m.querySelector('a').focus();
}
let menuFrom = null;
function mountRoomMenu() {
  const m = document.createElement('div');
  m.id = 'room-menu';
  m.className = 'ctx';
  m.setAttribute('popover', '');
  m.setAttribute('role', 'menu');
  m.dataset.noI18n = '';
  $('side').append(m); // inside a landmark; as a popover it still shows on top of everything
  m.addEventListener('keydown', (e) => {
    const all = [...m.querySelectorAll('a')], i = all.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); all[(i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length].focus(); }
    else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); all.at(e.key === 'Home' ? 0 : -1).focus(); }
    else if (e.key === 'Tab') m.hidePopover();
  });
  m.addEventListener('click', (e) => { if (e.target.closest('a')) { remember(e.target.closest('a').getAttribute('href')); m.hidePopover(); } });
  m.addEventListener('toggle', (e) => { if (e.newState === 'closed' && m.contains(document.activeElement)) menuFrom?.focus(); });
  // Right-click on a room, or the keyboard's menu key / Shift+F10 on it
  $('side-rooms').addEventListener('contextmenu', (e) => {
    const a = e.target.closest('a[data-room]');
    if (!a) return;
    e.preventDefault();
    const box = a.getBoundingClientRect();
    roomMenu(a, e.clientX || box.left + 24, e.clientY || box.bottom);
  });
}

// ---------- ⌘K quick switcher ----------
const commands = [];
/** Adds things the page can do to ⌘K: a function returning [{ ic, label, sub?, run }] (asked each time ⌘K opens). */
export const addCommands = (fn) => commands.push(fn);
const recent = () => store.get('nav.recent', []);
const remember = (href) => { if (href) store.set('nav.recent', [href, ...recent().filter((h) => h !== href)].slice(0, 6)); };
function items() {
  const admin = !crew();
  const out = [...VIEWS, SETTINGS].filter((v) => admin || !v[2]).map(([v, ic]) => ({ ic, label: L.views[v], href: to(`#${v}`) }));
  if (admin) out.push({ ic: 'plus', label: L.newRoom, sub: L.views.rooms, href: to('#rooms/new') });
  for (const r of rooms) for (const it of roomActions(r)) out.push({ ...it, label: r.name, sub: it.label, dot: r.state });
  if (admin) {
    for (const [p, label] of Object.entries(L.panes)) out.push({ ic: 'gear', label, sub: L.views.settings, href: to(`#settings/${p}`) });
    // On the dashboard, each setting by its own name too
    for (const pane of document.querySelectorAll('#dlg-settings .set-pane')) {
      for (const h of pane.querySelectorAll(':scope > .card h3')) {
        const label = [...h.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
        if (label && !h.closest('.hidden')) out.push({ ic: 'gear', label, sub: `${L.views.settings} · ${L.panes[pane.dataset.pane] || ''}`, href: `#settings/${pane.dataset.pane}` });
      }
    }
  }
  for (const [ic, label, href] of L.pages) out.push({ ic, label, sub: L.page, href });
  for (const fn of commands) out.push(...fn());
  out.push({ ic: 'sliders', label: L.keys, run: openKeys });
  return out;
}
// Best first: a name that starts with what you typed, then a word that does, then anywhere; recent ones break ties.
// Nothing typed: what you opened lately, then everything.
function rank(list, query) {
  const words = fold(query.trim()).split(/\s+/).filter(Boolean);
  const rec = recent();
  const boost = (it) => { const i = rec.indexOf(it.href); return i < 0 ? 0 : (6 - i) / 10; };
  if (!words.length) {
    const seen = rec.map((h) => list.find((it) => it.href === h)).filter(Boolean).map((it) => ({ ...it, recent: 1 }));
    return [...seen, ...list.filter((it) => !rec.includes(it.href))];
  }
  return list.map((it) => {
    const name = fold(it.label), all = `${name} ${fold(it.sub || '')}`;
    if (!words.every((w) => all.includes(w))) return null;
    const w = words[0];
    return { it, score: (name.startsWith(w) ? 3 : new RegExp(`(^|\\s)${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(all) ? 2 : 1) + boost(it) };
  }).filter(Boolean).sort((a, b) => b.score - a.score).map((x) => x.it);
}
let found = [];
let active = 0;
function mountJump() {
  const d = document.createElement('dialog');
  d.id = 'jump';
  d.className = 'jump';
  d.dataset.noI18n = '';
  d.setAttribute('aria-label', L.jump);
  d.innerHTML = `<label class="has-icon"><span class="sr-only">${L.jump}</span><input id="jump-q" type="text" role="combobox" aria-expanded="true" aria-controls="jump-list" aria-autocomplete="list" autocomplete="off" spellcheck="false" placeholder="${L.jumpPh}" /></label>
    <ul id="jump-list" role="listbox" aria-label="${L.jump}"></ul><p class="sr-only" role="status" id="jump-n"></p>
    <p class="jump-foot" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd> ${L.move}</span><span><kbd>↵</kbd> ${L.open}</span><span><kbd>esc</kbd> ${L.close}</span><span><kbd>?</kbd> ${L.keys}</span></p>`;
  document.body.append(d);
  const q = $('jump-q');
  q.oninput = () => { active = 0; renderJump(); };
  q.onkeydown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); active = (active + (e.key === 'ArrowDown' ? 1 : -1) + found.length) % (found.length || 1); renderJump(); }
    else if (e.key === 'Enter' && found[active]) { e.preventDefault(); pick(found[active]); }
    else if (e.key === '?' && !q.value) { e.preventDefault(); d.close(); openKeys(); }
  };
  $('jump-list').onclick = (e) => { const li = e.target.closest('li[data-i]'); if (li) pick(found[+li.dataset.i]); };
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); }); // a click on the backdrop
}
function openJump() {
  $('jump-q').value = '';
  active = 0;
  renderJump();
  $('jump').showModal();
}
function renderJump() {
  found = rank(items(), $('jump-q').value).slice(0, 40);
  const recentN = found.filter((it) => it.recent).length;
  $('jump-list').innerHTML = found.map((it, i) => `${i === 0 && recentN ? `<li class="jump-h" role="presentation">${L.recent}</li>` : ''}${i === recentN && recentN ? '<li class="jump-sep" role="presentation"></li>' : ''}<li role="option" id="jump-${i}" data-i="${i}" aria-selected="${i === active}">${icon(it.ic)}<span>${esc(it.label)}</span>${it.dot ? `<i class="dot ${it.dot}" aria-hidden="true"></i>` : ''}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</li>`).join('');
  const q = $('jump-q');
  if (found.length) q.setAttribute('aria-activedescendant', `jump-${active}`); else q.removeAttribute('aria-activedescendant');
  $(`jump-${active}`)?.scrollIntoView({ block: 'nearest' });
  $('jump-n').textContent = L.found(found.length);
}
function pick(it) {
  $('jump').close();
  if (phone.matches) openMenu(false);
  if (it.run) return it.run();
  remember(it.href);
  if (it.blank) open(it.href, '_blank'); else location.href = it.href;
}

// ---------- keyboard: shortcuts and their cheat sheet ("?") ----------
// G then a letter, as in Gmail and Linear
const GO = { l: 'live', r: 'rooms', a: 'agenda', g: 'glossary', i: 'integrations', t: 'transcripts', h: 'history', ',': 'settings' };
const typing = (el) => el?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
let gAt = 0;
function onKey(e) {
  const mod = (MAC ? e.metaKey : e.ctrlKey) && !e.altKey && !e.shiftKey;
  if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); return $('jump').open ? $('jump').close() : openJump(); }
  if (mod && e.key === '\\') { e.preventDefault(); return toggleMenu(); }
  if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target) || document.querySelector('dialog[open]')) return;
  if (e.key === '?') { e.preventDefault(); return openKeys(); }
  if (e.key === '/') { e.preventDefault(); return openJump(); }
  if (Date.now() - gAt < 1200 && GO[e.key.toLowerCase()]) {
    const v = [...VIEWS, SETTINGS].find((x) => x[0] === GO[e.key.toLowerCase()]);
    gAt = 0;
    if (v && (!v[2] || !crew())) location.href = to(`#${v[0]}`);
    return;
  }
  gAt = e.key.toLowerCase() === 'g' ? Date.now() : 0;
}
function openKeys() {
  let d = $('keys');
  if (!d) {
    d = document.createElement('dialog');
    d.id = 'keys';
    d.className = 'keys';
    d.dataset.noI18n = '';
    d.setAttribute('aria-labelledby', 'keys-h');
    const k = (...ks) => ks.map((x) => `<kbd>${x}</kbd>`).join(' ');
    const cmd = MAC ? '⌘' : 'Ctrl';
    const rows = [[k(cmd, 'K'), L.jump], [k('/'), L.jump], [k(cmd, '\\'), L.toggle], [k('?'), L.keys], [MAC ? k('⌘', '[') : k('Alt', '←'), L.back],
      ...Object.entries(GO).filter(([, v]) => !crew() || ![...VIEWS, SETTINGS].find((x) => x[0] === v)[2]).map(([key, v]) => [k('G', key === ',' ? ',' : key.toUpperCase()), L.views[v]]),
      [k(MAC ? '⇧ F10' : 'Shift F10'), L.menuKey]];
    d.innerHTML = `<div class="keys-head"><h2 id="keys-h">${L.keys}</h2><button type="button" class="nav-btn" aria-label="${L.close}">${icon('x')}</button></div>
      <dl>${rows.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('')}</dl>`;
    d.querySelector('button').onclick = () => d.close();
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    document.body.append(d);
  }
  d.showModal();
}

// ---------- "?" help ----------
let helpN = 0;
/** A small "?" button that opens the given element as a popover (the browser's Popover API: Esc and a click outside close it). */
export function helpButton(pop) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'help-q';
  b.textContent = '?';
  b.dataset.noI18n = '';
  b.setAttribute('aria-label', L.help);
  b.title = L.help;
  if (pop) b.setAttribute('popovertarget', pop.id);
  return b;
}
/** Turns each [data-help] paragraph into a popover behind a "?" at the end of the heading just before it (or in its place). */
export function mountHelp(root = document) {
  for (const p of root.querySelectorAll('[data-help]:not([popover])')) {
    p.id ||= `help-${++helpN}`;
    p.className = 'help-pop';
    p.setAttribute('popover', '');
    const b = helpButton(p);
    const h = p.previousElementSibling;
    if (h?.matches('h1, h2, h3, h4, legend')) h.append(b); else p.before(b);
  }
}
