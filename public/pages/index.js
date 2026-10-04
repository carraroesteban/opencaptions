// index.html: page script (kept out of the HTML so the Content-Security-Policy can forbid inline scripts).
import { getEvent, t, UI, esc, langLabel } from '/common.js';
import { prefsControls } from '/i18n.js';
import { library } from '/illustrations.js';
document.querySelector('footer').append(prefsControls({ langs: ['es', 'en', 'pt'] }));
document.getElementById('lib-illo').innerHTML = library;
document.getElementById('subtitle').textContent = t('chooseStage');
document.getElementById('powered').textContent = t('poweredBy');
document.getElementById('prod').textContent = t('production');
document.getElementById('lib-h').textContent = t('library');
document.getElementById('lib-p').textContent = t('libraryHint');
async function render() {
  const ev = await getEvent();
  document.getElementById('event').textContent = ev.name;
  document.title = `${ev.name} · ${t('liveCaptions')}`;
  document.getElementById('stages').innerHTML = ev.stages.map((s) => `
    <a class="card stage" href="/watch.html?stage=${encodeURIComponent(s.id)}">
      <h2>${esc(s.name)}</h2>
      <span class="chip ${s.live ? 'bad' : ''}">${s.live ? `<span class="dot live"></span> ${t('live')}` : t('offline')}</span>
      ${s.title ? `<div class="title">${esc(s.title)}${s.speaker ? ` · <span class="muted">${esc(s.speaker)}</span>` : ''}</div>` : ''}
      ${s.next ? `<div class="title next">${esc(t('next'))}: ${esc(s.next.title)} · ${new Date(s.next.start).toLocaleTimeString(UI, { hour: '2-digit', minute: '2-digit' })}</div>` : ''}
      <div class="langs row">${s.languages.map((l) => `<span class="chip">${esc(langLabel(l, ev.languages))}</span>`).join('')}</div>
    </a>`).join('');
}
render();
setInterval(render, 10000);
