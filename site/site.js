// Landing page: theme toggle, reveal on scroll, the section dock, the phone story, card glow, a pause for motion. No dependencies.
const root = document.documentElement;
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };

// Theme: dark by default, like the app (set in <head> before paint); the visitor's choice is stored like the app does (oc.theme, JSON).
document.getElementById('theme')?.addEventListener('click', () => {
  root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
  store.set('oc.theme', JSON.stringify(root.dataset.theme));
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', root.dataset.theme === 'dark' ? '#111014' : '#FAF8F3');
});

// The language links (header and footer): the home page stops sending a Spanish browser to /es/ once someone picks.
for (const a of document.querySelectorAll('a[hreflang]')) a.addEventListener('click', () => store.set('oc.siteLang', a.hreflang));

const nav = document.querySelector('.nav');
addEventListener('scroll', () => nav?.classList.toggle('scrolled', scrollY > 8), { passive: true });

const io = 'IntersectionObserver' in window && new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -10% 0px' });
document.querySelectorAll('.reveal').forEach((el) => (io ? io.observe(el) : el.classList.add('in')));

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

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

// For the audience: the picture beside the steps follows the step in the middle of the screen.
const story = document.querySelector('.story');
if (story && 'IntersectionObserver' in window) {
  const steps = [...story.querySelectorAll('.story-step')];
  const lists = [steps, [...story.querySelectorAll('.story-frame img')], [...story.querySelectorAll('.story-bar i')]];
  const show = (i) => lists.forEach((l) => l.forEach((el, j) => el.classList.toggle('on', j === i)));
  const mid = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) show(steps.indexOf(e.target)); }), { rootMargin: '-50% 0px -50% 0px' });
  steps.forEach((el) => mid.observe(el));
  story.classList.add('live');
}

// Cards light up where the pointer is.
if (!reduceMotion && matchMedia('(hover: hover)').matches) {
  for (const c of document.querySelectorAll('.tile, .plan')) c.addEventListener('pointermove', (e) => {
    const r = c.getBoundingClientRect();
    c.style.setProperty('--mx', `${e.clientX - r.left}px`);
    c.style.setProperty('--my', `${e.clientY - r.top}px`);
  });
}

// The pause button stops the drifting languages and the hero's slow zoom, and remembers it (WCAG 2.2.2).
const motion = document.getElementById('motion');
const still = (on) => { root.classList.toggle('still', on); motion?.setAttribute('aria-pressed', String(on)); };
if (store.get('oc.still') === '1') still(true);
motion?.addEventListener('click', () => { const on = !root.classList.contains('still'); still(on); store.set('oc.still', on ? '1' : '0'); });
