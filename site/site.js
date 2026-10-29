// Landing page: theme toggle, the real talk captioned in the hero, reveal on scroll. No dependencies.
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

// The real talk: what OpenCaptions wrote while captioning samples/talk-en.wav (site/media/talk.json, made by
// scripts/site-talk.js), replayed at the moment each word arrived. It runs silently when it comes into view; play
// starts it over with the talk's sound. With reduced motion it shows the end of the talk and waits for play.
const talk = document.getElementById('talk');
if (talk) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const main = talk.querySelector('.talk-main'), sub = talk.querySelector('.talk-sub'), cap = talk.querySelector('.talk-phone .cap');
  const play = talk.querySelector('.talk-play'), bar = talk.querySelector('.talk-progress i'), clock = talk.querySelector('.talk-time');
  const pills = [...talk.querySelectorAll('.pills button')];
  let phone = talk.dataset.main, data = null, audio = null, t0 = 0, raf = 0, visible = false, shown = '', last = 0;
  const mmss = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
  const esc = (x) => x.replace(/[&<>]/g, (c) => `&#${c.charCodeAt(0)};`);
  // The segments of a channel at time t: the latest text of each, in order, and whether it's finished.
  const at = (t, ch) => {
    const segs = new Map();
    for (const c of data.caps) { if (c[0] > t) break; if (c[1] === ch) segs.set(c[2], { text: c[3], done: !!c[4] }); }
    return [...segs.values()];
  };
  // Older lines dimmed; the newest word of a line still being spoken fades in, as in the app.
  const html = (segs, n, cls = '') => segs.slice(-n).map((g, i, all) => {
    const old = i < all.length - 1 ? ' class="old"' : '';
    const w = g.text.split(' ');
    return `<p${old}>${g.done || old ? esc(g.text) : `${esc(w.slice(0, -1).join(' '))} <span class="live-word${cls}">${esc(w.at(-1))}</span>`}</p>`;
  }).join('');
  const render = (t) => {
    last = t;
    const key = `${data.caps.findLastIndex((c) => c[0] <= t)}|${phone}`;
    bar.style.width = `${Math.min(100, (t / data.duration) * 100)}%`;
    clock.textContent = `${mmss(Math.min(t, data.duration))} / ${mmss(data.duration)}`;
    if (key === shown) return;
    shown = key;
    // The stage screen runs on, like a projector: one flow, the earlier sentences dimmed.
    main.innerHTML = `<p>${html(at(t, talk.dataset.main), 3).replace(/<p( class="old")?>/g, (_, o) => `<span${o || ''}>`).replace(/<\/p>/g, '</span> ')}</p>`;
    sub.innerHTML = html(at(t, talk.dataset.sub), 1);
    cap.innerHTML = html(at(t, phone), 4);
  };
  const end = () => (data ? data.duration + 2500 : 0);
  const first = () => data.caps[0][0] - 600; // silently, it starts just before the first words: no empty screen
  const tick = () => {
    raf = 0;
    // The talk's sound ended: hold its last lines, then carry on silently.
    if (audio?.ended) { audio = null; play.classList.remove('on'); play.setAttribute('aria-label', play.dataset.play); t0 = performance.now() - end(); }
    let t = audio ? audio.currentTime * 1000 : performance.now() - t0;
    if (!audio && t > end() + 2500) { t0 = performance.now() - first(); t = first(); } // silent: start over after a pause
    render(t);
    if (audio ? !audio.paused : visible && !reduce) raf = requestAnimationFrame(tick);
  };
  const run = () => { if (!raf && data) raf = requestAnimationFrame(tick); };
  fetch('/media/talk.json').then((r) => r.json()).then((d) => { data = d; last = first(); t0 = performance.now() - last; if (reduce) render(end()); else run(); }).catch(() => {});
  if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !audio) { t0 = performance.now() - last; run(); } }, { threshold: 0.2 }).observe(talk); // back in view: carry on where it was
  pills.forEach((b) => b.addEventListener('click', () => {
    phone = b.dataset.ch;
    pills.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    if (data) { shown = ''; render(last); }
  }));
  play.addEventListener('click', () => {
    if (audio && !audio.paused) { audio.pause(); play.classList.remove('on'); play.setAttribute('aria-label', play.dataset.play); return; }
    if (!audio) { audio = new Audio('/media/talk.m4a'); shown = ''; }
    audio.play().then(() => { play.classList.add('on'); play.setAttribute('aria-label', play.dataset.pause); run(); }).catch(() => {});
  });
}

const io = 'IntersectionObserver' in window && new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -10% 0px' });
document.querySelectorAll('.reveal').forEach((el) => (io ? io.observe(el) : el.classList.add('in')));

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

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
// Preload the other screens once the visitor gets near them, not with the page.
const apps = document.querySelector('.apps');
if (apps) {
  const preload = () => document.querySelectorAll('.apps .tile').forEach((b) => { new Image().src = b.dataset.img; });
  if ('IntersectionObserver' in window) {
    const near = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { near.disconnect(); preload(); } }, { rootMargin: '600px 0px' });
    near.observe(apps);
  } else preload();
}

// The animated illustrations and the demo: still for people who ask for less motion (the demo then waits for its
// play button), and paused while off screen so they cost nothing. They only load when they come into view.
const videos = document.querySelectorAll('video.hero-loop, video.art.loop, .demo video');
// With reduced motion the demo doesn't autoplay, so it gets the browser's play button.
if (reduceMotion) document.querySelector('.demo video')?.setAttribute('controls', '');
for (const v of videos) {
  if (reduceMotion) continue; // no autoplay attribute: they start only from here, when seen
  if (!('IntersectionObserver' in window)) continue;
  // Only the demo has controls: a pause while it's on screen is the visitor's, and sticks. Pauses off screen are ours
  // (or the browser's, saving power).
  let visible = false, userPaused = false, retried = false;
  v.addEventListener('pause', () => { if (visible && v.controls) userPaused = true; });
  v.addEventListener('play', () => { userPaused = false; });
  // A decoder hiccup (many videos at once on a slow device): reload once and carry on.
  v.addEventListener('error', () => { if (!retried) { retried = true; v.load(); } }, true);
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible) { if (!userPaused) v.play().catch(() => {}); }
    else if (!v.paused) v.pause();
  }, { threshold: 0.25 }).observe(v);
}

// By the numbers: count up once when they come into view (the HTML already holds the final values, for search engines
// and for readers without JavaScript or who prefer less motion).
const counters = document.querySelectorAll('.stat .num[data-to]');
if (counters.length && !reduceMotion && 'IntersectionObserver' in window) {
  const run = (el) => {
    const final = el.innerHTML, raw = el.dataset.to, comma = raw.includes(','), to = parseFloat(raw.replace(',', '.'));
    const dec = (raw.split(/[.,]/)[1] || '').length, t0 = performance.now(), dur = 1100;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur), v = (to * (1 - Math.pow(1 - k, 3))).toFixed(dec);
      el.innerHTML = final.replace(raw, comma ? v.replace('.', ',') : v);
      if (k < 1) requestAnimationFrame(step); else el.innerHTML = final;
    };
    requestAnimationFrame(step);
  };
  const seen = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { seen.unobserve(e.target); run(e.target); } }), { threshold: 0.6 });
  counters.forEach((el) => seen.observe(el));
}
