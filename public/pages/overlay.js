// overlay.html: page script (kept out of the HTML so the Content-Security-Policy can forbid inline scripts).
import { qs, wsUrl, Socket, CaptionState, applyCaptionStyle, previewStream, toColor } from '/common.js';
import { Pacer, RollUp } from '/smooth.js';
const root = document.documentElement.style;
const p = (k, d) => qs.get(k) ?? d;
root.setProperty('--size', p('size', 46) + 'px');
root.setProperty('--lines', p('lines', 2));
root.setProperty('--width', p('width', 78) + '%');
root.setProperty('--margin', p('margin', 64) + 'px');
root.setProperty('--ov-bg', toColor(p('bg', 'transparent')));
const style = applyCaptionStyle(qs);
const capRgb = (toColor(p('color', 'ffffff')).match(/\d+/g) || [255, 255, 255]).slice(0, 3).map(Number);
root.setProperty('--cap-color2', (capRgb[0] * 299 + capRgb[1] * 587 + capRgb[2] * 114) / 1000 > 140 ? 'var(--fog)' : 'var(--graphite)');
const box = document.getElementById('box');
box.classList.toggle('boxed', style === 'box');
document.getElementById('wrap').className = 'wrap ' + p('pos', 'bottom');

const lang = p('lang', 'es');
const hideMs = Number(p('hide', 6)) * 1000;
const chars = Number(p('chars', 150));
const txt = document.getElementById('txt');
const txt2 = document.getElementById('txt2');
const also = p('also', '') !== lang ? p('also', '') : '';
box.classList.toggle('bi', !!also);
// Don't print the same words twice (e.g. the speaker is using the second line's language right now).
const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().slice(-40);
const second = (a, b) => (b && norm(a) !== norm(b) ? b : '');

if (qs.get('preview') === '1') {
  // Style preview: fake streaming captions, no server connection.
  previewStream((t) => { txt.textContent = t.slice(-chars); box.classList.remove('idle'); }, lang === 'en' ? 'en' : 'es');
  if (also) previewStream((t) => { txt2.textContent = t.slice(-chars); }, lang === 'en' ? 'es' : 'en');
} else {
  // Words at the speaker's pace, TV-style lines that never re-wrap (smooth.js). The second language keeps its own lines.
  let ch = null, ch2 = null, talkId = null, at = 0;
  let pause = null; // a break hides the captions (the stream shows its own break screen); music shows ♪
  const st = new CaptionState(), st2 = new CaptionState(); // for "is the second line saying the same thing?"
  const roll = new RollUp(txt.parentElement, { live: false }), roll2 = new RollUp(txt2.parentElement, { live: false });
  const pace = new Pacer(() => draw()), pace2 = new Pacer(() => draw());
  new Socket(() => wsUrl('/ws/view', { stage: p('stage', 'main'), langs: [lang, also].filter(Boolean).join(',') }), {
    message(m) {
      if (m.type === 'pause') pause = m;
      if (m.type === 'hello') {
        pause = m.pause;
        ch = m.map[lang]; talkId = m.talk;
        const h = [...(m.history[ch] || []), m.partial[ch]].filter(Boolean);
        st.load(h); pace.load(h);
        if (also) { ch2 = m.map[also] ?? also; const h2 = [...(m.history[ch2] || []), m.partial[ch2]].filter(Boolean); st2.load(h2); pace2.load(h2); }
        draw(); at = 0; // history isn't news: stay hidden until someone speaks
      }
      else if (m.type === 'caption' && m.channel === ch) { st.apply(m); pace.push(m); at = Date.now(); }
      else if (m.type === 'caption' && ch2 && m.channel === ch2) { st2.apply(m); pace2.push(m); at = Date.now(); }
      else if (m.type === 'talk' && m.talk !== talkId) { talkId = m.talk; st.clear(); st2.clear(); pace.clear(); pace2.clear(); roll.clear(); roll2.clear(); }
    },
  });
  function draw() {
    roll.render(pace.shown());
    if (also) {
      roll2.render(pace2.shown());
      roll2.clip.classList.toggle('hidden', !second(st.tail(chars), st2.tail(chars)));
    }
    show();
  }
  function show() {
    box.classList.toggle('music', !!pause?.music && !pause?.brk);
    box.classList.toggle('idle', !!pause?.brk || (!pause?.music && (!at || Date.now() - at > hideMs || !(st.tail(10) || (also && st2.tail(10))))));
  }
  setInterval(show, 500);
}
