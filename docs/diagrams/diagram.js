// Tiny diagram helper for the docs: icons for nodes, and orthogonal connectors between them.
//   <div class="n" id="a" data-icon="mic"><b>Title</b><span>detail</span></div>
//   edges([{ from: 'a', to: 'b', label: 'audio', fs: 'r', ts: 'l', dash: true, both: true }])
// Sides: t r b l (auto when omitted). `off` / `toff` shift the port along the side, in px.
// Theme from the URL (?theme=dark), set before anything reads it.
document.documentElement.dataset.theme = new URLSearchParams(location.search).get('theme') || 'light';

const ICONS = {
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  desk: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10v4M11 9v6M15 11v2M19 10v4"/>',
  browser: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01"/>',
  stream: '<rect x="3" y="5" width="18" height="13" rx="2"/><path d="M10 9l5 2.5-5 2.5z"/><path d="M8 21h8"/>',
  phone: '<rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M10.5 18.5h3"/>',
  screen: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M7 12h7M8 20h8M12 16v4"/>',
  overlay: '<rect x="3" y="5" width="18" height="13" rx="2"/><rect x="6" y="12" width="9" height="3" rx="1"/>',
  dashboard: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 13v4M12 12v5M16 14v3"/>',
  speech: '<path d="M4 12h2M8 8v8M12 5v14M16 8v8M20 11v2"/>',
  translate: '<path d="M4 5h8M8 3v2M6 5c0 4 2.5 7 5.5 8.5M10 5c-.5 4-3 7-6 8.5"/><path d="M13 21l4-9 4 9M14.5 18h5"/>',
  cloud: '<path d="M7 18a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 8.5a4.8 4.8 0 0 1-.5 9.5z"/>',
  laptop: '<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/>',
  server: '<rect x="4" y="3" width="16" height="7" rx="1.5"/><rect x="4" y="14" width="16" height="7" rx="1.5"/><path d="M8 6.5h.01M8 17.5h.01"/>',
  disk: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3.2 3 3.2 15 0 18M12 3c-3.2 3-3.2 15 0 18"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1.2-3.4 3.6-5 6.5-5s5.3 1.6 6.5 5"/><circle cx="17" cy="9" r="2.8"/><path d="M16 14.5c2.5 0 4.4 1.3 5.5 4"/>',
  alert: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17h.01"/>',
  wave: '<path d="M3 12c2-6 4-6 6 0s4 6 6 0 4-6 6 0"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  tunnel: '<path d="M3 20V11a9 9 0 0 1 18 0v9"/><path d="M7 20v-8a5 5 0 0 1 10 0v8"/>',
  pause: '<circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>',
  offline: '<path d="M7 18a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 2-3.4M12.3 3.1A6 6 0 0 1 18 8.5a4.8 4.8 0 0 1 2.2 8.6M17.5 18H7"/><path d="M3 3l18 18"/>',
  doc: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>',
};

for (const n of document.querySelectorAll('.n[data-icon], .n[data-screen], .n.hero')) {
  if (n.querySelector('.ic')) continue;
  const ic = document.createElement('div');
  ic.className = 'ic';
  if (n.classList.contains('hero')) ic.innerHTML = `<img src="/public/brand/${document.documentElement.dataset.theme === 'dark' ? 'mark-ink' : 'mark-dark'}.svg" alt="">`;
  else if (n.hasAttribute('data-screen')) { ic.className = 'screen'; ic.innerHTML = '<i></i><i></i>'; }
  else ic.innerHTML = `<svg viewBox="0 0 24 24">${ICONS[n.dataset.icon] || ''}</svg>`;
  n.prepend(ic);
  const body = document.createElement('div');
  for (const c of [...n.childNodes].slice(1)) body.append(c);
  n.append(body);
  if (n.classList.contains('hero')) { const bar = document.createElement('i'); bar.className = 'bar'; n.append(bar); }
}

window.edges = function edges(list, root = document.querySelector('.d')) {
  const box = root.getBoundingClientRect();
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('edges');
  svg.innerHTML = `<defs><marker id="ah" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1.5L8.5 5 1 8.5" fill="none" style="stroke:var(--d-edge);stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"/></marker></defs>`;
  root.prepend(svg);
  const rect = (id) => { const r = document.getElementById(id).getBoundingClientRect(); return { x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height }; };
  const port = (r, side, off = 0) => ({ t: [r.x + r.w / 2 + off, r.y], b: [r.x + r.w / 2 + off, r.y + r.h], l: [r.x, r.y + r.h / 2 + off], r: [r.x + r.w, r.y + r.h / 2 + off] })[side];
  for (const e of list) {
    const a = rect(e.from), b = rect(e.to);
    const dx = (b.x + b.w / 2) - (a.x + a.w / 2), dy = (b.y + b.h / 2) - (a.y + a.h / 2);
    const horiz = Math.abs(dx) - (a.w + b.w) / 2 > Math.abs(dy) - (a.h + b.h) / 2;
    const fs = e.fs || (horiz ? (dx > 0 ? 'r' : 'l') : (dy > 0 ? 'b' : 't'));
    const ts = e.ts || (horiz ? (dx > 0 ? 'l' : 'r') : (dy > 0 ? 't' : 'b'));
    const [x1, y1] = port(a, fs, e.off), [x2, y2] = port(b, ts, e.toff ?? e.off);
    const gap = 4; // keep arrowheads off the card border
    const pull = { t: [0, -gap], b: [0, gap], l: [-gap, 0], r: [gap, 0] };
    const [sx, sy] = [x1 + pull[fs][0], y1 + pull[fs][1]], [ex, ey] = [x2 + pull[ts][0], y2 + pull[ts][1]];
    let d, lx, ly;
    const hSide = (s) => s === 'l' || s === 'r';
    if (hSide(fs) && hSide(ts)) {
      const mx = e.mid ?? (sx + ex) / 2;
      d = Math.abs(sy - ey) < 1 ? `M${sx},${sy} L${ex},${ey}` : `M${sx},${sy} L${mx - 10 * Math.sign(mx - sx)},${sy} Q${mx},${sy} ${mx},${sy + 10 * Math.sign(ey - sy)} L${mx},${ey - 10 * Math.sign(ey - sy)} Q${mx},${ey} ${mx + 10 * Math.sign(ex - mx)},${ey} L${ex},${ey}`;
      lx = Math.abs(sy - ey) < 1 ? (sx + ex) / 2 : mx; ly = Math.abs(sy - ey) < 1 ? sy : (sy + ey) / 2;
    } else if (!hSide(fs) && !hSide(ts)) {
      const my = e.mid ?? (sy + ey) / 2;
      d = Math.abs(sx - ex) < 1 ? `M${sx},${sy} L${ex},${ey}` : `M${sx},${sy} L${sx},${my - 10 * Math.sign(my - sy)} Q${sx},${my} ${sx + 10 * Math.sign(ex - sx)},${my} L${ex - 10 * Math.sign(ex - sx)},${my} Q${ex},${my} ${ex},${my + 10 * Math.sign(ey - my)} L${ex},${ey}`;
      lx = Math.abs(sx - ex) < 1 ? sx : (sx + ex) / 2; ly = Math.abs(sx - ex) < 1 ? (sy + ey) / 2 : my;
    } else if (hSide(fs)) {
      d = `M${sx},${sy} L${ex - 12 * Math.sign(ex - sx)},${sy} Q${ex},${sy} ${ex},${sy + 12 * Math.sign(ey - sy)} L${ex},${ey}`;
      lx = (sx + ex) / 2; ly = sy;
    } else {
      d = `M${sx},${sy} L${sx},${ey - 12 * Math.sign(ey - sy)} Q${sx},${ey} ${sx + 12 * Math.sign(ex - sx)},${ey} L${ex},${ey}`;
      lx = sx; ly = (sy + ey) / 2;
    }
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    if (e.dash) p.classList.add('dash');
    if (e.soft) p.classList.add('soft');
    if (e.arrow !== false) p.setAttribute('marker-end', 'url(#ah)');
    if (e.both) p.setAttribute('marker-start', 'url(#ah)');
    svg.append(p);
    if (e.label) {
      const l = document.createElement('div');
      l.className = `elabel${e.mono ? ' mono' : ''}`;
      l.textContent = e.label;
      l.style.left = `${lx + (e.lx || 0)}px`;
      l.style.top = `${ly + (e.ly || 0)}px`;
      root.append(l);
    }
  }
};

/** Draw once fonts are in (labels are measured), then tell the renderer the diagram is ready. */
window.draw = (list) => document.fonts.ready.then(() => requestAnimationFrame(() => { window.edges(list); window.__done = true; }));
