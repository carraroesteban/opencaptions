// screen.html: page script (kept out of the HTML so the Content-Security-Policy can forbid inline scripts).
import { qs, t, esc, wsUrl, Socket, getEvent, langLabel, applyCaptionStyle, previewStream, toColor, wakeLock, pauseView } from '/common.js';
import { Pacer, RollUp } from '/smooth.js';
wakeLock(); // projector PCs must not blank mid-talk
const $ = (id) => document.getElementById(id);
document.title = `${t('screenTitle')} · ${t('liveCaptions')}`;
const stageId = qs.get('stage') || 'main';
const ev = await getEvent();
const want = (qs.get('langs') || 'es,orig').split(',');
if (Number(qs.get('lines')) > 0) { document.documentElement.style.setProperty('--lines', qs.get('lines')); document.body.classList.add('fixed-lines'); }
// Full screen: double-click or F (projector PCs often open the page in a normal window).
const toggleFs = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())?.catch?.(() => {});
document.addEventListener('dblclick', toggleFs);
document.addEventListener('keydown', (e) => { if (e.key === 'f' || e.key === 'F') toggleFs(); });
if (qs.get('preview') !== '1' && !document.fullscreenElement) {
  const hint = Object.assign(document.createElement('div'), { className: 'fs-hint' });
  hint.innerHTML = `<kbd>F</kbd> ${t('fullscreen')}`;
  (document.querySelector('main') || document.body).append(hint);
  setTimeout(() => { hint.style.opacity = 0; setTimeout(() => hint.remove(), 700); }, 5000);
}
if (qs.get('size')) document.documentElement.style.setProperty('--main', qs.get('size') + 'vh');
applyCaptionStyle(qs, { style: 'none', align: 'left' });
if (qs.get('bg')) document.documentElement.style.setProperty('--screen-bg', toColor(qs.get('bg')));
if (qs.get('clock') === '0') $('clock').classList.add('hidden');
$('powered').textContent = ev.credit === false ? t('poweredBy') : `${t('poweredBy')} · opencaptions.kvza.ar`;
if (ev.logo) Object.assign($('ev-logo'), { src: ev.logo, alt: ev.name }).classList.remove('hidden'); // OpenCaptions stays as the credit at the bottom
$('follow').textContent = t('followOnPhone');
const viewUrl = `${ev.publicUrl}/s/${stageId}`;
$('url').textContent = viewUrl.replace(/^https?:\/\//, '');
$('qr').src = `/api/qr.svg?text=${encodeURIComponent(viewUrl)}`;
if (qs.get('qr') === '0') $('qrbox').classList.add('hidden');

let talkId = null, bands = [];
const states = {}; // channel → { pacer, roll, at }: words at the speaker's pace, TV-style lines (smooth.js)
if (qs.get('preview') === '1') {
  // Style preview: fake captions, no server needed. Shows exactly the bands the URL asks for (langs=es or es,orig).
  bands = [...new Set(want)].slice(0, 2);
  const st = ev.stages.find((s) => s.id === stageId) || ev.stages[0];
  $('stage').textContent = st?.name || '';
  qrLangs(st?.languages || []);
  $('bands').innerHTML = bands.map((l, i) => `<div class="band ${i ? 'sub' : 'main'}" id="b-${esc(l)}"><div class="lbl">${esc(langLabel(l, ev.languages))}</div><div class="clip"><div class="txt"></div></div></div>`).join('');
  const fake = (l) => (l === 'en' ? 'en' : l === 'orig' && bands[0] !== 'en' ? 'en' : 'es');
  bands.forEach((l, i) => {
    states[l] = { at: Date.now() };
    previewStream((x) => { states[l].at = Date.now(); document.querySelector(`#b-${CSS.escape(l)} .txt`).textContent = x.slice(i ? -200 : -600); }, fake(l));
  });
} else new Socket(() => wsUrl('/ws/view', { stage: stageId, langs: want.join(',') }), {
  message(m) {
    if (m.type === 'hello') {
      talkId = m.talk;
      $('stage').textContent = m.stage.name;
      $('talk').textContent = m.stage.title || '';
      qrLangs(m.stage.languages);
      // Distinct channels in the requested order (e.g. es→orig when the talk is already in Spanish).
      bands = [...new Set(want.map((l) => m.map[l]))];
      $('bands').innerHTML = bands.map((ch, i) => {
        const label = want.find((l) => m.map[l] === ch);
        return `<div class="band ${i ? 'sub' : 'main'}" id="b-${ch}"><div class="lbl">${esc(langLabel(label === 'orig' ? 'orig' : label, ev.languages))}</div><div class="clip"></div></div>`;
      }).join('');
      bands.forEach((ch, i) => {
        const st = (states[ch] = { at: Date.now(), roll: new RollUp(document.querySelector(`#b-${CSS.escape(ch)} .clip`), { live: i === 0 }) });
        st.pacer = new Pacer(() => draw(ch));
        st.pacer.load([...(m.history[ch] || []), m.partial[ch]].filter(Boolean));
        draw(ch);
      });
      showPause(m.pause);
      origBand([...(m.history.orig || []), m.partial.orig].filter(Boolean).at(-1));
      wholeLines();
    } else if (m.type === 'pause') showPause(m);
    else if (m.type === 'caption') {
      const st = states[m.channel];
      if (st?.pacer) { st.at = Date.now(); st.pacer.push(m); }
      if (m.channel === 'orig') origBand(m);
    } else if (m.type === 'talk' || m.type === 'title') {
      $('talk').textContent = m.title || '';
      if (m.type === 'talk' && m.talk !== talkId) { talkId = m.talk; for (const ch of bands) { states[ch]?.pacer?.clear(); states[ch]?.roll?.clear(); } }
    }
  },
});

/** The Original band repeats the main one while the speaker talks its language (a Spanish talk on a Spanish screen): hidden until they switch. */
function origBand(seg) {
  const band = document.getElementById('b-orig');
  if (!band || !seg?.lang || bands[0] === 'orig') return;
  const was = band.classList.contains('hidden');
  if (band.classList.toggle('hidden', seg.lang === bands[0]) !== was) wholeLines();
}

/** The languages a phone can read this room in, on the QR card: why scanning it is worth it. */
function qrLangs(langs) {
  $('qr-langs').innerHTML = langs.filter((l) => l !== 'orig').map((l) => `<i>${esc(langLabel(l, ev.languages))}</i>`).join('');
}

/** A break: "Break · Back at 11:30 · Next talk: …" over the captions. Music: a quiet note. */
let pauseNow = null;
function showPause(p) {
  pauseNow = p;
  const v = pauseView(p);
  $('pause').classList.toggle('hidden', !v);
  $('bands').classList.toggle('paused', !!v); // nothing peeks out from under the card
  if (!v) return;
  $('pause').className = `pause ${v.kind}`;
  $('pause').innerHTML = `<b>${esc(v.title)}</b>${v.back ? `<span>${esc(v.back)}</span>` : ''}${v.next ? `<span class="next">${esc(v.next)}</span>` : ''}`;
}
setInterval(() => { if (pauseNow?.brk) showPause(pauseNow); }, 30_000); // "back at" disappears once the time has passed

function draw(ch) {
  const st = states[ch];
  st.roll.render(st.pacer.shown());
  document.getElementById(`b-${ch}`)?.classList.remove('fade');
}
setInterval(() => {
  for (const ch of bands) {
    const idle = Date.now() - (states[ch]?.at || 0) > 12000;
    document.getElementById(`b-${ch}`)?.classList.toggle('fade', idle);
  }
  $('onair').classList.toggle('on', !!bands[0] && Date.now() - (states[bands[0]]?.at || 0) < 12000 && !pauseView(pauseNow));
  $('clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}, 1000);

/**
 * The main band holds whole lines, as on TV: its height rounded down to a number of lines, so the top line is never
 * sliced (the fade at the top then covers one whole line). Fixed ?lines= screens set their own height.
 */
function wholeLines() {
  const clip = document.querySelector('.band.main .clip');
  if (!clip || document.body.classList.contains('fixed-lines')) return;
  clip.style.height = '';
  clip.style.flex = '';
  const lh = parseFloat(getComputedStyle(clip).fontSize) * 1.22;
  const h = clip.clientHeight;
  if (!lh || h < lh) return;
  clip.style.flex = 'none';
  clip.style.height = `${Math.floor(h / lh) * lh}px`;
}
addEventListener('resize', wholeLines);
