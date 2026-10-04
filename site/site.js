// Landing page: theme toggle, live-caption demo in the phone, reveal on scroll. No dependencies.
const root = document.documentElement;
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };

// Theme: follows the OS unless the visitor picked one (stored like the app does: oc.theme, JSON).
document.getElementById('theme')?.addEventListener('click', () => {
  const cur = root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  root.dataset.theme = cur === 'dark' ? 'light' : 'dark';
  store.set('oc.theme', JSON.stringify(root.dataset.theme));
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
