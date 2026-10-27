// index.html: page script (kept out of the HTML so the Content-Security-Policy can forbid inline scripts).
import { getEvent, t, UI, esc, langLabel, store } from '/common.js';
import { prefsControls } from '/prefs.js';
import { library, icon } from '/illustrations.js';
const $ = (id) => document.getElementById(id);
$('prefs-slot').append(prefsControls({ langs: ['es', 'en', 'pt'] }));
$('lib-illo').innerHTML = library;
$('subtitle').textContent = t('homeHint');
$('powered').textContent = t('poweredBy');
$('prod').textContent = t('production');
// The organizers' way in, for the organizers: attendees don't see a "Production" link.
fetch('/api/auth/me').then((r) => r.json()).then((w) => $('prod').classList.toggle('hidden', !w.role)).catch(() => {});
$('lib-h').textContent = t('library');
$('lib-p').textContent = t('libraryAsk');

const hm = (ms) => new Date(ms).toLocaleTimeString(UI, { hour: '2-digit', minute: '2-digit' });
const go = `<span class="ix-arrow">${icon('chevron')}</span>`;
// The language this phone reads in (last chosen, or the phone's own): one tap from the home into that room in it.
const mine = () => store.get('lang') || (navigator.language || 'es').slice(0, 2);

function card(s, ev) {
  const my = s.languages.includes(mine()) ? mine() : null;
  const url = (l) => `/watch.html?stage=${encodeURIComponent(s.id)}${l ? `&lang=${encodeURIComponent(l)}` : ''}`;
  return `<article class="ix-room rc-${esc(s.hue)}${s.live ? ' live' : ''}">
    <div class="ix-top">
      <h3><a class="ix-go" href="${url(my)}">${esc(s.name)}</a></h3>
      <span class="chip${s.live ? ' live' : ''}">${s.live ? `<span class="dot live"></span> ${esc(t('live'))}` : esc(t('offline'))}</span>
    </div>
    ${s.title ? `<p class="ix-talk">${esc(s.title)}</p>${s.speaker ? `<p class="ix-spk">${esc(s.speaker)}</p>` : ''}` : ''}
    ${s.next ? `<p class="ix-next">${icon('clock')}<span>${esc(t('next'))} · ${esc(hm(s.next.start))} · <b>${esc(s.next.title)}</b></span></p>` : ''}
    <div class="ix-langs" role="group" aria-label="${esc(`${s.name}: ${t('readIn')}`)}">${s.languages.map((l) => `<a class="ix-lang${l === my ? ' mine' : ''}" href="${url(l)}">${esc(langLabel(l, ev.languages))}${l === my ? go : ''}</a>`).join('')}</div>
  </article>`;
}

let first = true;
async function render() {
  const ev = await getEvent();
  $('event').textContent = ev.name;
  // The event's own logo (Settings › General): in the hero, over its name, instead of OpenCaptions' up in the bar.
  if (ev.logo && $('ev-logo').getAttribute('src') !== ev.logo) $('ev-logo').src = ev.logo;
  $('ev-logo').classList.toggle('hidden', !ev.logo);
  document.querySelector('.au-bar > .brand').classList.toggle('hidden', !!ev.logo);
  $('powered').textContent = ev.logo ? `${t('poweredBy')} · ${t('captionsBy')}` : t('poweredBy');
  document.title = `${ev.name} · ${t('liveCaptions')}`;
  // Live rooms first, the others after, in the organizers' order.
  const live = ev.stages.filter((s) => s.live), rest = ev.stages.filter((s) => !s.live);
  const html = (live.length ? `<h2 class="ix-h">${esc(t('liveNow'))}</h2><div class="ix-rooms">${live.map((s) => card(s, ev)).join('')}</div>` : '')
    + (rest.length ? `<h2 class="ix-h">${esc(t(live.length ? 'otherRooms' : 'stages'))}</h2><div class="ix-rooms">${rest.map((s) => card(s, ev)).join('')}</div>` : '');
  $('live-count').classList.toggle('hidden', !live.length);
  $('live-count').lastElementChild.textContent = live.length === 1 ? t('roomsLive1') : t('roomsLiveN').replace('{n}', live.length);
  // Only when something changed: rebuilding the cards every 10 s would also drop the keyboard focus from them.
  const el = $('stages');
  if (el._html === html) return;
  el._html = html;
  el.innerHTML = html;
  // The first time, the cards arrive one after another; later updates just change in place.
  if (!first) return;
  first = false;
  const groups = el.querySelectorAll('.ix-rooms');
  for (const g of groups) g.classList.add('stagger');
  setTimeout(() => { for (const g of groups) g.classList.remove('stagger'); }, 1000); // then hover lifts can move them
}
render();
setInterval(() => document.hidden || render(), 10000);
