// talks.html: page script (kept out of the HTML so the Content-Security-Policy can forbid inline scripts).
import { t, UI, esc, getEvent, langLabel } from '/common.js';
import { prefsControls } from '/i18n.js';
const $ = (id) => document.getElementById(id);
$('prefs-slot').append(prefsControls({ langs: ['es', 'en', 'pt'] }));
const ev = await getEvent();
document.title = `${t('library')} · ${ev.name}`;
$('h').textContent = t('library');
$('hint').textContent = t('libraryHint');
$('back').textContent = `‹ ${t('stages')}`;
$('q').placeholder = t('searchTalks');
$('foot').textContent = t('poweredBy');
let talks = [];
async function load() {
  const r = await fetch('/api/talks');
  const d = r.ok ? await r.json() : { talks: [] };
  talks = d.talks;
  const rooms = [...new Map(talks.map((x) => [x.stage, x.stageName])).entries()];
  const cur = $('room').value;
  $('room').innerHTML = `<option value="">${esc(t('allStages'))}</option>` + rooms.map(([id, n]) => `<option value="${esc(id)}">${esc(n)}</option>`).join('');
  $('room').value = cur;
  render();
}
function render() {
  const q = $('q').value.trim().toLowerCase();
  const room = $('room').value;
  const list = talks.filter((x) => (!room || x.stage === room) && (!q || `${x.title} ${x.speaker} ${x.stageName}`.toLowerCase().includes(q)));
  if (!list.length) { $('list').innerHTML = `<div class="empty-state none"><img class="none-art" src="/art/empty-library.webp" alt="" width="1200" height="900" /><p>${esc(t('noTalks'))}</p></div>`; return; }
  let day = '';
  $('list').innerHTML = list.map((x) => {
    const d = new Date(x.startedAt);
    const dl = d.toLocaleDateString(UI, { weekday: 'long', day: 'numeric', month: 'long' });
    const head = dl !== day ? `<div class="day">${esc((day = dl))}</div>` : '';
    const langs = x.channels.filter((c) => c !== 'orig').map((c) => `<span class="chip">${esc(langLabel(c, ev.languages))}</span>`).join('');
    return `${head}<a class="card talk" href="/talk.html?stage=${encodeURIComponent(x.stage)}&talk=${encodeURIComponent(x.id)}">
      <h2>${esc(x.title || t('untitled'))}</h2>
      ${x.live ? `<span class="chip bad"><span class="dot live"></span> ${esc(t('live'))}</span>` : '<span></span>'}
      <div class="m">${x.speaker ? `<b>${esc(x.speaker)}</b>·` : ''}<span>${esc(x.stageName)}</span>·<span>${d.toLocaleTimeString(UI, { hour: '2-digit', minute: '2-digit' })}</span>·<span>${Math.max(1, Math.round(x.durationMs / 60000))} min</span> ${langs}</div>
    </a>`;
  }).join('');
}
$('q').oninput = render;
$('room').onchange = render;
await load();
setInterval(load, 30000);
