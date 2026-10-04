// overlay.html: page script (kept out of the HTML so the Content-Security-Policy can forbid inline scripts).
import { qs, wsUrl, Socket, CaptionState, applyCaptionStyle, previewStream, toColor } from '/common.js';
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
  let ch = null, ch2 = null, talkId = null;
  const st = new CaptionState(), st2 = new CaptionState();
  new Socket(() => wsUrl('/ws/view', { stage: p('stage', 'main'), langs: [lang, also].filter(Boolean).join(',') }), {
    message(m) {
      if (m.type === 'hello') {
        ch = m.map[lang]; talkId = m.talk; st.load(m.history[ch] || [], m.partial[ch]); st.updatedAt = 0;
        if (also) { ch2 = m.map[also] ?? also; st2.load(m.history[ch2] || [], m.partial[ch2]); st2.updatedAt = 0; }
      }
      else if (m.type === 'caption' && m.channel === ch) { st.apply(m); draw(); }
      else if (m.type === 'caption' && ch2 && m.channel === ch2) { st2.apply(m); draw(); }
      else if (m.type === 'talk' && m.talk !== talkId) { talkId = m.talk; st.clear(); st2.clear(); draw(); }
    },
  });
  function draw() {
    const main = st.tail(chars);
    txt.textContent = main;
    if (also) txt2.textContent = second(main, st2.tail(chars));
    box.classList.remove('idle');
  }
  setInterval(() => box.classList.toggle('idle', Date.now() - Math.max(st.updatedAt, also ? st2.updatedAt : 0) > hideMs || !(st.tail(10) || (also && st2.tail(10)))), 500);
}
