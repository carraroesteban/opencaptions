// talks.html: page script (kept out of the HTML so the Content-Security-Policy can forbid inline scripts).
import { t, UI, esc, getEvent, creditLink, langLabel, segment } from '/common.js';
import { prefsControls } from '/prefs.js';
import { client } from '/assist-ui.js';
import { icon, mountIcons } from '/illustrations.js';
const $ = (id) => document.getElementById(id);
mountIcons();
$('prefs-slot').append(prefsControls({ langs: ['es', 'en', 'pt'] }));
const ev = await getEvent();
const hues = new Map(ev.stages.map((s) => [s.id, s.hue])); // each talk in its room's colour, as everywhere else
// Just for me: your own transcripts, one room, and back to your captions (not to an event's rooms).
const mine = !!ev.personal;
document.title = `${t(mine ? 'myTranscripts' : 'library')} · ${ev.name}`;
$('h').textContent = t(mine ? 'myTranscripts' : 'library');
$('hint').textContent = t(mine ? 'myTranscriptsHint' : 'libraryHint');
$('back').append(t(mine ? 'backCaptions' : 'stages'));
if (mine) { $('back').href = '/me.html'; $('room').classList.add('hidden'); }
$('q').placeholder = t('searchTalks');
$('q').setAttribute('aria-label', t('searchTalks'));
$('foot').textContent = t('poweredBy');
// The event's own logo (Settings › General) where OpenCaptions' was; OpenCaptions keeps a line at the bottom.
if (ev.logo) {
  document.querySelector('.au-bar > .brand').replaceChildren(Object.assign(new Image(), { src: ev.logo, alt: ev.name, className: 'ev-logo' }));
  if (ev.credit === false) $('foot').textContent += ` · ${t('captionsBy')}`;
}
{ const c = creditLink(ev, 'transcripts'); if (c) $('foot').append(document.createElement('br'), c); }
// The search bar stays at the top while scrolling; a hairline appears once it's floating over the list.
new IntersectionObserver(([e]) => $('tools').classList.toggle('stuck', e.intersectionRatio < 1), { rootMargin: '-1px 0px 0px 0px', threshold: 1 }).observe($('tools'));

let talks = [];
let closed = false;
let room = '';
let roomsKey = null;
let first = true;
async function load() {
  const r = await fetch('/api/talks').catch(() => null);
  closed = r?.status === 401; // the organizers keep transcripts to the team: say so, not "no transcripts yet"
  const d = r?.ok ? await r.json() : { talks: closed ? [] : talks }; // a network blip keeps the list it had
  talks = d.talks;
  const rooms = [...new Map(talks.map((x) => [x.stage, x.stageName])).entries()];
  // Rooms as a segmented filter; rebuilt only when the rooms change, so the chosen one stays put.
  if (JSON.stringify(rooms) !== roomsKey) {
    roomsKey = JSON.stringify(rooms);
    if (room && !rooms.some(([id]) => id === room)) room = '';
    segment($('room'), [['', esc(t('allStages'))], ...rooms.map(([id, n]) => [id, esc(n)])], room, (v) => { room = v; render(); });
    $('room').classList.toggle('hidden', mine || rooms.length < 2);
  }
  render();
}
const hm = (d) => d.toLocaleTimeString(UI, { hour: '2-digit', minute: '2-digit' });
function render() {
  const q = $('q').value.trim().toLowerCase();
  const list = talks.filter((x) => (!room || x.stage === room) && (!q || `${x.title} ${x.speaker} ${x.stageName}`.toLowerCase().includes(q)));
  if (!list.length) {
    $('list').innerHTML = q || room
      ? `<div class="empty-state tl-none"><p>${esc(t('noResults'))}</p></div>`
      : `<div class="empty-state tl-none"><img src="/art/empty-library.webp" alt="" width="1200" height="900" /><p>${esc(t(closed ? 'libPrivate' : 'noTalks'))}</p></div>`;
    return;
  }
  // The search, highlighted in the titles and names (matched on the raw text, each piece escaped).
  const re = q ? new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi') : null;
  const hl = (s) => (re ? String(s).split(re).map((p, i) => (i % 2 ? `<mark>${esc(p)}</mark>` : esc(p))).join('') : esc(s));
  let day = '';
  $('list').innerHTML = list.map((x) => {
    const d = new Date(x.startedAt);
    const dl = d.toLocaleDateString(UI, { weekday: 'long', day: 'numeric', month: 'long' });
    const head = dl !== day ? `<h2 class="tl-day">${esc((day = dl))}</h2>` : '';
    const langs = x.channels.filter((c) => c !== 'orig').map((c) => `<span class="chip">${esc(langLabel(c, ev.languages))}</span>`).join('');
    return `${head}<a class="tl-talk${hues.has(x.stage) ? ` rc-${esc(hues.get(x.stage))}` : ''}" href="/talk.html?stage=${encodeURIComponent(x.stage)}&talk=${encodeURIComponent(x.id)}">
      <span class="tl-when"><b>${esc(hm(d))}</b><span>${Math.max(1, Math.round(x.durationMs / 60000))} min</span></span>
      <span class="tl-body">
        <h3 class="tl-title">${hl(x.title || t('untitled'))}</h3>
        <span class="tl-meta">${x.speaker ? `<b>${hl(x.speaker)}</b> · ` : ''}<span class="tl-room">${hl(x.stageName)}</span></span>
        <span class="tl-chips">${x.live ? `<span class="chip live"><span class="dot live"></span> ${esc(t('live'))}</span>` : ''}${langs}</span>
      </span>
      <span class="tl-go">${icon('chevron')}</span>
    </a>`;
  }).join('');
  if (first) { first = false; $('list').classList.add('stagger'); setTimeout(() => $('list').classList.remove('stagger'), 1000); }
}
$('q').oninput = render;
await load();
setInterval(() => document.hidden || load(), 30000); // a library left open in a background tab stops asking

// ---- a question to the whole event: every room and talk this person may read (POST /api/ask-event) ----
const readLang = () => { const l = UI.slice(0, 2); return ev.languages?.[l] ? l : 'orig'; };
if (!mine) { // without the AI it still finds the moments (keyword search)
  $('evask').classList.remove('hidden');
  $('evask-h').textContent = t('askEvent');
  $('evask-hint').textContent = t('askEventHint');
  $('evask-q').placeholder = t('askEventPh');
  $('evask-q').setAttribute('aria-label', t('askEvent'));
  $('evask-go').setAttribute('aria-label', t('askBtn'));
  $('evask-q').oninput = () => { $('evask-go').disabled = $('evask-q').value.trim().length < 3; };
  $('evask-form').onsubmit = async (e) => {
    e.preventDefault();
    const question = $('evask-q').value.trim();
    if (question.length < 3) return;
    $('evask-out').innerHTML = `<p class="muted">${esc(t('thinking'))}</p>`;
    let j;
    try {
      const r = await fetch('/api/ask-event', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question, lang: readLang(), client }) });
      j = r.ok ? await r.json() : { error: r.status === 429 ? t('tooMany') : t('error') };
    } catch { j = { error: t('error') }; }
    if (j.error && !j.sources) { $('evask-out').innerHTML = `<p class="muted">${esc(j.error)}</p>`; return; }
    if (!j.sources.length) { $('evask-out').innerHTML = `<p class="muted">${esc(t('askEventNone'))}</p>`; return; }
    const link = (x) => `/talk.html?stage=${encodeURIComponent(x.roomId)}&talk=${encodeURIComponent(x.talkId)}&lang=${encodeURIComponent(readLang())}&at=${encodeURIComponent(x.at)}`;
    $('evask-out').innerHTML = (j.answer ? `<p class="ev-answer">${esc(j.answer)}</p>` : '')
      + `<h3 class="as-h">${esc(t('quotesFrom'))}</h3>`
      + j.sources.map((x) => `<a class="ev-src" href="${esc(link(x))}"><span class="ev-where"><b>${esc(x.talk || t('untitled'))}</b> · ${esc(x.room)} · ${esc(x.at)}</span><span class="ev-quote">${esc(x.text)}</span></a>`).join('')
      + (j.ai ? `<p class="muted tm-note">${esc(t('aiNote'))}</p>` : '');
  };
}
