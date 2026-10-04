// Landing page: theme toggle, live-caption demo in the phone, reveal on scroll. No dependencies.
const root = document.documentElement;
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };

// Theme: light by default (set in <head> before paint); the visitor's choice is stored like the app does (oc.theme, JSON).
document.getElementById('theme')?.addEventListener('click', () => {
  root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
  store.set('oc.theme', JSON.stringify(root.dataset.theme));
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', root.dataset.theme === 'dark' ? '#111014' : '#FAF8F3');
});

const nav = document.querySelector('.nav');
addEventListener('scroll', () => nav?.classList.toggle('scrolled', scrollY > 8), { passive: true });

// Live captions demo: words arrive one by one, the live word gets the highlighter sweep.
const cap = document.getElementById('cap');
const orig = document.getElementById('orig-txt');
if (cap) {
  const lines = JSON.parse(cap.dataset.lines);
  const source = JSON.parse(orig.dataset.lines);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let i = 1, w = 0, cur = null;
  orig.textContent = '';
  cap.append(Object.assign(document.createElement('p'), { className: 'old', textContent: lines[0] }));
  const tick = () => {
    const words = lines[i % lines.length].split(' ');
    if (!cur) { cur = document.createElement('p'); cap.append(cur); }
    w++;
    const head = words.slice(0, w - 1).join(' ');
    cur.textContent = head ? head + ' ' : '';
    const last = words[w - 1];
    if (w < words.length) {
      const s = document.createElement('span');
      s.className = 'live-word';
      s.dataset.w = last;
      s.textContent = last;
      cur.append(s);
    } else cur.append(last);
    orig.textContent = source[i % source.length].split(' ').slice(0, Math.ceil((w / words.length) * source[i % source.length].split(' ').length)).join(' ');
    if (w >= words.length) {
      w = 0; i++; cur = null;
      const ps = cap.querySelectorAll('p');
      ps.forEach((p, k) => p.classList.toggle('old', k < ps.length - 1));
      if (ps.length > 4) ps[0].remove();
      setTimeout(tick, 1100);
    } else setTimeout(tick, reduce ? 600 : 330);
  };
  tick();
}

const io = 'IntersectionObserver' in window && new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -10% 0px' });
document.querySelectorAll('.reveal').forEach((el) => (io ? io.observe(el) : el.classList.add('in')));

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Announcement ticker: types itself out once, the key phrase lands on the highlighter.
const tt = document.querySelector('.ticker .tt');
if (tt) {
  const { pre, hl, post } = tt.dataset;
  const parts = [[pre + ' ', false], [hl, true], [innerWidth < 640 ? '' : ' ' + post, false]]; // phones: the short version
  const render = (n) => {
    let left = n, html = '';
    for (const [txt, mark] of parts) {
      const piece = txt.slice(0, Math.max(0, left));
      left -= txt.length;
      const esc = piece.replace(/&/g, '&amp;').replace(/</g, '&lt;');
      html += mark && piece ? `<mark>${esc}</mark>` : esc;
    }
    tt.innerHTML = html;
  };
  const total = parts.reduce((a, [x]) => a + x.length, 0);
  if (reduceMotion) render(total);
  else { let n = 0; const step = () => { render(++n); if (n < total) setTimeout(step, n < pre.length ? 45 : 28); }; setTimeout(step, 500); }
}

// Objects on the table drift with the pointer and the scroll (depth = how far).
const objs = [...document.querySelectorAll('.obj')];
if (objs.length && !reduceMotion) {
  let mx = 0, my = 0, raf = 0;
  const apply = () => {
    raf = 0;
    const sy = Math.min(scrollY, 900);
    for (const o of objs) {
      const d = +o.dataset.depth || 15;
      o.style.transform = `translate(${mx * d}px, ${my * d - sy * d / 60}px)`;
    }
  };
  const queue = () => { raf ||= requestAnimationFrame(apply); };
  addEventListener('pointermove', (e) => { mx = e.clientX / innerWidth - .5; my = e.clientY / innerHeight - .5; queue(); }, { passive: true });
  addEventListener('scroll', queue, { passive: true });
}

// The statement captions itself as it scrolls through the viewport.
const st = document.getElementById('statement');
if (st && !reduceMotion) {
  const ws = [...st.querySelectorAll('.w')];
  let last = -1;
  const upd = () => {
    const r = st.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (innerHeight * .85 - r.top) / (r.height + innerHeight * .35)));
    const n = Math.round(p * ws.length);
    if (n === last) return;
    last = n;
    ws.forEach((w, i) => { w.classList.toggle('on', i < n); w.classList.toggle('now', i === n - 1 && n < ws.length); });
  };
  addEventListener('scroll', upd, { passive: true });
  upd();
}

// Section dock: highlight where you are, switch to its dark look over the ink bands.
const dock = document.querySelector('.dock');
if (dock) {
  const links = [...dock.querySelectorAll('a')];
  const secs = links.map((a) => document.getElementById(a.dataset.sec)).filter(Boolean);
  const bands = [...document.querySelectorAll('section.band')];
  const upd = () => {
    const y = innerHeight / 2;
    let cur = secs[0];
    for (const s of secs) if (s.getBoundingClientRect().top <= y) cur = s;
    links.forEach((a) => a.classList.toggle('on', a.dataset.sec === cur?.id));
    const dr = dock.getBoundingClientRect();
    const over = (top, bottom) => bands.some((b) => { const r = b.getBoundingClientRect(); return r.top < bottom && r.bottom > top; });
    dock.classList.toggle('on-dark', over(dr.top, dr.bottom));
    nav?.classList.toggle('on-dark', over(0, 64));
  };
  addEventListener('scroll', upd, { passive: true });
  upd();
}

// Screens dock: swap the big screenshot.
const shot = document.getElementById('shot');
document.querySelectorAll('.apps .tile').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.apps .tile').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
  shot.classList.add('fade');
  setTimeout(() => {
    shot.src = b.dataset.img; shot.alt = b.dataset.cap;
    document.getElementById('shot-cap').textContent = b.dataset.cap;
    shot.onload = () => shot.classList.remove('fade');
  }, 180);
}));
// Preload the other screens.
document.querySelectorAll('.apps .tile').forEach((b) => { new Image().src = b.dataset.img; });
