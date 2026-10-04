// kit.html: page script (kept out of the HTML so the Content-Security-Policy can forbid inline scripts).
import { getEvent, esc, langLabel, qs } from '/common.js';
import { prefsControls, LANG } from '/i18n.js';
const $ = (id) => document.getElementById(id);
document.querySelector('.bar .row').append(prefsControls());
document.documentElement.lang = LANG;

// The page follows the interface language; each poster is in that language, with the other one as an
// optional second line for international audiences.
const UI = {
  es: {
    title: 'Kit de QR', home: 'Panel de producción', h: 'Kit de QR para las salas',
    intro: 'Un cartel A4 por sala: pegalo en la entrada y junto al escenario. El público escanea, elige idioma y sigue los subtítulos en el celular (y puede pedir un resumen de lo que se perdió).',
    warn: (u) => `⚠ Estos QR apuntan a <b>${u}</b>, que el público no puede abrir. Configurá <code>PUBLIC_URL</code> con la dirección del evento (HTTPS, o la IP de esta computadora en la red del lugar) y recargá esta página.`,
    rooms: 'Salas:', all: 'Todas', bi: 'Agregar inglés debajo', print: 'Imprimir / guardar PDF',
  },
  en: {
    title: 'QR kit', home: 'Production dashboard', h: 'QR kit for your rooms',
    intro: 'One A4 poster per room: put it at the door and next to the stage. People scan it, pick a language and follow the captions on their phone (and can ask for a summary of what they missed).',
    warn: (u) => `⚠ These QR codes point to <b>${u}</b>, which the audience can’t open. Set <code>PUBLIC_URL</code> to the event’s address (HTTPS, or this computer’s IP on the venue network) and reload this page.`,
    rooms: 'Rooms:', all: 'All', bi: 'Add Spanish underneath', print: 'Print / save as PDF',
  },
};
const POSTER = {
  es: { lead: 'Subtítulos en vivo', sub: 'y traducción', extra: '📱 Escaneá con la cámara, elegí tu idioma y seguí la charla desde el celular. ✨ ¿Llegaste tarde? Tocá <b>“¿Qué me perdí?”</b>.', foot: 'Subtítulos generados con IA · pueden contener errores · hecho con OpenCaptions' },
  en: { lead: 'Live captions', sub: 'and translation', extra: '📱 Scan with your camera, pick your language and follow the talk on your phone. ✨ Arrived late? Tap <b>“What did I miss?”</b>.', foot: 'AI-generated captions · may contain mistakes · made with OpenCaptions' },
};
const main = UI[LANG] ? LANG : 'en';
const other = main === 'es' ? 'en' : 'es';
const t = UI[main];
document.title = t.title;
$('home').title = t.home;
$('h').textContent = t.h;
$('intro').textContent = t.intro;
$('l-rooms').textContent = t.rooms;
$('o-all').textContent = t.all;
$('l-bi').textContent = t.bi;
$('print').textContent = t.print;

const ev = await getEvent();
const base = ev.publicUrl.replace(/\/$/, '');
if (/localhost|127\.0\.0\.1|\[::1\]/.test(base)) { $('localwarn').classList.remove('hidden'); $('localwarn').innerHTML = t.warn(esc(base)); }
for (const s of ev.stages) $('which').append(new Option(s.name, s.id));
if (qs.get('stage')) $('which').value = qs.get('stage');
const P = POSTER[main], Q = POSTER[other];
function render() {
  const bi = $('bilingual').checked;
  const list = ev.stages.filter((s) => !$('which').value || s.id === $('which').value);
  $('sheets').innerHTML = list.map((s) => {
    const url = `${base}/s/${s.id}`;
    const langs = s.languages.filter((l) => l !== 'orig').map((l) => `<b>${esc(langLabel(l, ev.languages))}</b>`).join('');
    return `<section class="poster">
      <div class="ev">${esc(ev.name)}</div>
      <h2>${esc(s.name)}</h2>
      <p class="lead"><span class="hl">${P.lead}</span>${bi ? `<span class="tr">${Q.lead} ${Q.sub}</span>` : `<span class="tr">${P.sub}</span>`}</p>
      <img src="/api/qr.svg?text=${encodeURIComponent(url)}" alt="QR ${esc(url)}" />
      <div class="url">${esc(url.replace(/^https?:\/\//, ''))}</div>
      <div class="langs">${langs}</div>
      <p class="extra">${P.extra}${bi ? `<br><span class="tr">${Q.extra.replace(/^📱 /, '').replace(/ ✨ /, ' ').replace(/<\/?b>/g, '')}</span>` : ''}</p>
      <div class="foot"><img src="/brand/mark-ink.svg" alt="" />${P.foot}</div>
    </section>`;
  }).join('');
}
$('which').onchange = render;
$('bilingual').onchange = render;
$('print').onclick = () => window.print();
render();
