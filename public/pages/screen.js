// screen.html: page script (kept out of the HTML so the Content-Security-Policy can forbid inline scripts).
import { qs, t, esc, wsUrl, Socket, CaptionState, getEvent, langLabel, applyCaptionStyle, previewStream, toColor, wakeLock, liveText } from '/common.js';
wakeLock(); // projector PCs must not blank mid-talk
const $ = (id) => document.getElementById(id);
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
  document.body.append(hint);
  setTimeout(() => { hint.style.opacity = 0; setTimeout(() => hint.remove(), 700); }, 5000);
}
if (qs.get('size')) document.documentElement.style.setProperty('--main', qs.get('size') + 'vh');
applyCaptionStyle(qs, { style: 'none', align: 'left' });
if (qs.get('bg')) document.documentElement.style.setProperty('--screen-bg', toColor(qs.get('bg')));
if (qs.get('clock') === '0') $('clock').classList.add('hidden');
$('powered').textContent = t('poweredBy');
$('follow').textContent = t('followOnPhone');
const viewUrl = `${ev.publicUrl}/s/${stageId}`;
$('url').textContent = viewUrl.replace(/^https?:\/\//, '');
$('qr').src = `/api/qr.svg?text=${encodeURIComponent(viewUrl)}`;
if (qs.get('qr') === '0') $('qrbox').classList.add('hidden');

let talkId = null, bands = [];
const fixed = document.body.classList.contains('fixed-lines');
const states = {};
if (qs.get('preview') === '1') {
  // Style preview: fake captions, no server needed. Shows exactly the bands the URL asks for (langs=es or es,orig).
  bands = [...new Set(want)].slice(0, 2);
  $('stage').textContent = ev.stages.find((s) => s.id === stageId)?.name || ev.stages[0]?.name || '';
  $('bands').innerHTML = bands.map((l, i) => `<div class="band ${i ? 'sub' : 'main'}" id="b-${esc(l)}"><div class="lbl">${esc(langLabel(l, ev.languages))}</div><div class="clip"><div class="txt"></div></div></div>`).join('');
  const fake = (l) => (l === 'en' ? 'en' : l === 'orig' && bands[0] !== 'en' ? 'en' : 'es');
  bands.forEach((l, i) => {
    states[l] = { updatedAt: Date.now(), tail: () => '' };
    previewStream((x) => { states[l].updatedAt = Date.now(); document.querySelector(`#b-${CSS.escape(l)} .txt`).textContent = x.slice(i ? -200 : -600); }, fake(l));
  });
} else new Socket(() => wsUrl('/ws/view', { stage: stageId, langs: want.join(',') }), {
  message(m) {
    if (m.type === 'hello') {
      talkId = m.talk;
      $('stage').textContent = m.stage.name;
      $('talk').textContent = m.stage.title ? `· ${m.stage.title}` : '';
      // Distinct channels in the requested order (e.g. es→orig when the talk is already in Spanish).
      bands = [...new Set(want.map((l) => m.map[l]))];
      for (const ch of bands) (states[ch] ??= new CaptionState()).load(m.history[ch], m.partial[ch]);
      $('bands').innerHTML = bands.map((ch, i) => {
        const label = want.find((l) => m.map[l] === ch);
        return `<div class="band ${i ? 'sub' : 'main'}" id="b-${ch}"><div class="lbl">${esc(langLabel(label === 'orig' ? 'orig' : label, ev.languages))}</div><div class="clip"><div class="txt"></div></div></div>`;
      }).join('');
      render();
    } else if (m.type === 'caption') { (states[m.channel] ??= new CaptionState()).apply(m); render(m.channel); }
    else if (m.type === 'talk' || m.type === 'title') {
      $('talk').textContent = m.title ? `· ${m.title}` : '';
      if (m.type === 'talk' && m.talk !== talkId) { talkId = m.talk; for (const s of Object.values(states)) s.clear(); render(); }
    }
  },
});

function render(only) {
  bands.forEach((ch, i) => {
    if (only && only !== ch) return;
    const el = document.querySelector(`#b-${CSS.escape(ch)} .txt`);
    if (el) liveText(el, states[ch]?.tail(i ? 200 : fixed ? 260 : 900) || '', i > 0 || !states[ch]?.partial?.text); // highlighter on the live word of the main band
    document.getElementById(`b-${ch}`)?.classList.remove('fade');
  });
}
setInterval(() => {
  for (const ch of bands) {
    const idle = Date.now() - (states[ch]?.updatedAt || 0) > 12000;
    document.getElementById(`b-${ch}`)?.classList.toggle('fade', idle);
  }
  $('clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}, 1000);
