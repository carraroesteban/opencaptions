// The app's small menus (a room's right-click, ⋯ and Download on a row, the AI badge, the page language), one way:
// a [popover] by the button (or the pointer) that opened it, kept inside the window; the arrows move, Esc closes and
// focus goes back to the button. Dropdown lists are select.js (a listbox, not a menu).

/** Keyboard and closing for a [popover] menu: once per menu. */
export function menu(m) {
  m.addEventListener('keydown', (e) => {
    const all = [...m.querySelectorAll('a, button:not(:disabled)')], i = all.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); all[(i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length]?.focus(); }
    else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); all.at(e.key === 'Home' ? 0 : -1)?.focus(); }
    else if (e.key === 'Tab') m.hidePopover();
  });
  m.addEventListener('toggle', (e) => {
    if (e.newState !== 'closed') return;
    m._closedAt = performance.now();
    if (m._for?.hasAttribute('aria-expanded')) m._for.setAttribute('aria-expanded', 'false');
    if (m.contains(document.activeElement) || document.activeElement === document.body) m._for?.focus();
  });
  addEventListener('scroll', () => { if (m.matches(':popover-open')) m.hidePopover(); }, { passive: true }); // it would float away from its button
  return m;
}

/** Puts an open menu at x, y (a pointer, or under a button) inside the window; at `above` minus its height when it doesn't fit below. */
export function menuAt(m, x, y, above = y) {
  const w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = `${Math.max(8, Math.min(x, innerWidth - w - 8))}px`;
  m.style.top = `${y + h > innerHeight - 8 ? Math.max(8, above - h) : y}px`;
}

/**
 * Opens m under button b (above it near the bottom of the window), its right edge on the button's ('start': its left
 * edge); the same button again closes it. html: new content. Opened from the keyboard (e.detail 0), focus goes in.
 * @param {HTMLElement & { _for?: HTMLElement, _closedAt?: number }} m
 * @param {HTMLElement} b
 * @param {string | null} [html]
 * @param {{ detail?: number } | null} [e]
 */
export function popMenu(m, b, html = null, e = null, align = 'end') {
  if (m._for === b && (m.matches(':popover-open') || performance.now() - (m._closedAt || 0) < 300)) return m.hidePopover(); // a press outside already closed it
  if (m.matches(':popover-open')) m.hidePopover();
  m._for = b;
  if (html != null) m.innerHTML = html;
  m.showPopover();
  const r = b.getBoundingClientRect();
  menuAt(m, align === 'start' ? r.left : r.right - m.offsetWidth, r.bottom + 6, r.top - 6);
  b.setAttribute('aria-expanded', 'true');
  if (!e?.detail) m.querySelector('a, button:not(:disabled)')?.focus();
}
