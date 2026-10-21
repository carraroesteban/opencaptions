// kit.html: page script (kept out of the HTML so the Content-Security-Policy can forbid inline scripts).
import { getEvent, esc, langLabel, qs } from '/common.js';
import { prefsControls, LANG } from '/prefs.js';
import { icon } from '/illustrations.js';
import { mountNav, home } from '/nav.js';
import { ensureSignedIn } from '/signin.js';

await ensureSignedIn(); // an organizer page: without the password, the sign-in screen instead of the controls
const $ = (id) => document.getElementById(id);
$('prefs-slot').append(prefsControls());
document.documentElement.lang = LANG;

// The page follows the interface language; each poster is in that language, with the other one as an
// optional second line for international audiences.
const UI = {
  es: {
    title: 'Kit de QR', h: 'Kit de QR para las salas',
    intro: 'Un cartel A4 por sala: pegalo en la entrada y junto al escenario. El público escanea, elige idioma y sigue los subtítulos en el celular (y puede pedir un resumen de lo que se perdió).',
    warn: (u) => `⚠ Estos QR apuntan a <b>${u}</b>, que el público no puede abrir. Creá una dirección pública en <a href="/admin.html#settings/address">Ajustes</a> del panel (o abrí el panel desde la IP de esta computadora en el Wi-Fi del lugar) y recargá esta página.`,
    rooms: 'Salas', all: 'Todas', bi: 'Agregar inglés debajo', print: 'Imprimir o guardar PDF',
    count: (n) => `${n} ${n === 1 ? 'cartel A4' : 'carteles A4'}`, open: 'Abrir lo que ve el público',
  },
  en: {
    title: 'QR kit', h: 'QR kit for your rooms',
    intro: 'One A4 poster per room: put it at the door and next to the stage. People scan it, pick a language and follow the captions on their phone (and can ask for a summary of what they missed).',
    warn: (u) => `⚠ These QR codes point to <b>${u}</b>, which the audience can’t open. Create a public address in the dashboard’s <a href="/admin.html#settings/address">Settings</a> (or open the dashboard from this computer’s IP on the venue Wi-Fi) and reload this page.`,
    rooms: 'Rooms', all: 'All', bi: 'Add Spanish underneath', print: 'Print or save as PDF',
    count: (n) => `${n} A4 ${n === 1 ? 'poster' : 'posters'}`, open: 'Open what the audience sees',
  },
};
const POSTER = {
  es: { lead: 'Subtítulos en vivo', sub: 'y traducción', extra: 'Escaneá con la cámara, elegí tu idioma y seguí la charla desde el celular. ¿Llegaste tarde? Tocá <b>“¿Qué me perdí?”</b>.', foot: 'Subtítulos generados con IA · pueden contener errores · hecho con OpenCaptions' },
  en: { lead: 'Live captions', sub: 'and translation', extra: 'Scan with your camera, pick your language and follow the talk on your phone. Arrived late? Tap <b>“What did I miss?”</b>.', foot: 'AI-generated captions · may contain mistakes · made with OpenCaptions' },
};
const main = UI[LANG] ? LANG : 'en';
const other = main === 'es' ? 'en' : 'es';
const t = UI[main];
document.title = `${t.title} · OpenCaptions`;
mountNav({ crumbs: [home(), { label: t.title }] });
$('h').textContent = t.h;
$('intro').textContent = t.intro;
$('l-rooms').textContent = t.rooms;
$('o-all').textContent = t.all;
$('l-bi').textContent = t.bi;
$('print').innerHTML = `${icon('print')}<span>${esc(t.print)}</span>`;

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
    return `<figure class="sheet"><a href="${esc(url)}" target="_blank" rel="noopener" title="${esc(t.open)}"><section class="poster">
      ${ev.logo ? `<img class="ev-logo" src="${esc(ev.logo)}" alt="" />` : ''}
      <div class="ev">${esc(ev.name)}</div>
      <h2>${esc(s.name)}</h2>
      <p class="lead"><span class="hl">${P.lead}</span>${bi ? `<span class="tr">${Q.lead} ${Q.sub}</span>` : `<span class="tr">${P.sub}</span>`}</p>
      <img src="/api/qr.svg?text=${encodeURIComponent(url)}" alt="QR ${esc(url)}" />
      <div class="url">${esc(url.replace(/^https?:\/\//, ''))}</div>
      <div class="langs">${langs}</div>
      <div class="how"><img class="pict" src="/art/scan.webp" alt="" /><p class="extra">${P.extra}${bi ? `<br><span class="tr">${Q.extra.replace(/<\/?b>/g, '')}</span>` : ''}</p></div>
      <div class="foot"><img src="/brand/mark-ink.svg" alt="" />${P.foot}</div>
    </section></a><figcaption><b>${esc(s.name)}</b>· ${esc(url.replace(/^https?:\/\//, ''))}</figcaption></figure>`;
  }).join('');
  $('count').textContent = t.count(list.length);
}
$('which').onchange = render;
$('bilingual').onchange = render;
$('print').onclick = () => window.print();
render();
