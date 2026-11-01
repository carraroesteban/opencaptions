// Website (2.0): theme toggle, language memory, the menu bar's line, the lines wallpaper, captions that type
// themselves in the drawn screens, sound sparklines and drawn QR codes, and a pause for all motion (WCAG 2.2.2).
import { lines } from '/lines.js';

const root = document.documentElement;
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };
const dark = () => (root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';

// Theme: the device's own until the visitor picks (stored like the app does: oc.theme, JSON).
document.getElementById('theme')?.addEventListener('click', () => {
  root.dataset.theme = dark() ? 'light' : 'dark';
  store.set('oc.theme', JSON.stringify(root.dataset.theme));
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark() ? '#050506' : '#FAFAF8');
});

// The language links (header and footer): the home page stops sending a Spanish browser to /es/ once someone picks.
for (const a of document.querySelectorAll('a[hreflang]')) a.addEventListener('click', () => store.set('oc.siteLang', a.hreflang));

const nav = document.querySelector('.nav');
if (nav) addEventListener('scroll', () => nav.classList.toggle('scrolled', scrollY > 8), { passive: true });

// Motion: the pause button stops the lines and the typing captions, and remembers it.
const motion = document.getElementById('motion');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (store.get('oc.still') === '1') root.dataset.still = '';
const moving = () => !reduce && !('still' in root.dataset);
if (motion) {
  motion.setAttribute('aria-pressed', String(!moving()));
  motion.addEventListener('click', () => {
    if (moving()) { root.dataset.still = ''; store.set('oc.still', '1'); } else { delete root.dataset.still; store.set('oc.still', '0'); }
    motion.setAttribute('aria-pressed', String(!moving()));
  });
}

for (const cv of document.querySelectorAll('canvas.lines')) lines(cv);

// A speech-like rhythm for the sparklines (the same as the lines).
const voice = (t) => (Math.abs(Math.sin(t * 9.3)) * .6 + Math.abs(Math.sin(t * 4.1 + 1)) * .4) * ((Math.sin(t * 1.7) + 1) / 2) * (Math.sin(t * .45) > -.55 ? 1 : .15);

// Captions in the drawn screens: data-say holds the words; they arrive one by one, the next three faint.
for (const el of document.querySelectorAll('[data-say]')) {
  const w = el.dataset.say.split(' '), keep = Number(el.dataset.keep || 14);
  const tr = el.dataset.trFor ? null : document.querySelector(`[data-tr-for="${el.id}"]`);
  const t2 = tr ? tr.dataset.tr.split(' ') : [];
  let k = Math.min(9, w.length);
  const show = () => {
    const n = Math.min(k, w.length);
    el.innerHTML = '';
    el.append(w.slice(Math.max(0, n - keep), n).join(' ') + ' ');
    const next = document.createElement('i'); next.className = 'next'; next.textContent = w.slice(n, n + 3).join(' '); el.append(next);
    if (tr) { const m = Math.max(0, Math.round((n * t2.length) / w.length) - 2); tr.textContent = t2.slice(Math.max(0, m - keep), m).join(' '); }
  };
  show();
  setInterval(() => { if (moving()) { k = (k + 1) % (w.length + 6); show(); } }, Number(el.dataset.every || 390));
}

// Sound of the last seconds, as fine bars (data-l: 1 speaking, 0 silence).
for (const cv of document.querySelectorAll('canvas[data-l]')) {
  const g = cv.getContext('2d'), level = Number(cv.dataset.l), d = Math.min(2, devicePixelRatio || 1);
  const w = cv.clientWidth || 110, h = cv.clientHeight || 24, bars = 40, step = w / bars;
  cv.width = w * d; cv.height = h * d; g.scale(d, d);
  let drawn = false;
  const draw = (ms) => {
    requestAnimationFrame(draw);
    if (drawn && !moving()) return; // paused: keep the last frame, ready to move again
    drawn = true;
    const rgb = (getComputedStyle(cv).color.match(/\d+/g) || [128, 128, 128]).slice(0, 3).join(',');
    g.clearRect(0, 0, w, h);
    for (let x = 0; x < bars; x++) {
      const v = level ? Math.max(.06, voice(ms / 1000 - x * .12) * level) : .04;
      g.fillStyle = `rgba(${rgb},${level >= 1 ? .8 : .3})`;
      g.fillRect(w - (x + 1) * step, h / 2 - (v * h) / 2, Math.max(1, step * .45), Math.max(1, v * h));
    }
  };
  requestAnimationFrame(draw);
}

// A QR-looking square in the drawn projector screen (decorative, not scannable).
for (const el of document.querySelectorAll('.qr[data-seed]')) {
  let s = Number(el.dataset.seed); const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const corner = [[0, 0], [0, 18], [18, 0]];
  const inF = (r, c) => corner.some(([a, b]) => r >= a && r < a + 8 && c >= b && c < b + 8);
  const onF = (r, c) => corner.some(([a, b]) => r >= a && r < a + 7 && c >= b && c < b + 7 && (r === a || r === a + 6 || c === b || c === b + 6 || (r >= a + 2 && r <= a + 4 && c >= b + 2 && c <= b + 4)));
  el.innerHTML = Array.from({ length: 625 }, (_, i) => { const r = Math.floor(i / 25), c = i % 25; return (inF(r, c) ? onF(r, c) : rnd() < .48) ? '<i></i>' : '<b></b>'; }).join('');
}
