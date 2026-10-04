// style.html: page script (kept out of the HTML so the Content-Security-Policy can forbid inline scripts).
import { esc, store, getEvent, FONTS, langLabel } from '/common.js';
import { localize, prefsControls, tr } from '/i18n.js';
document.querySelector('header').append(prefsControls());
const $ = (id) => document.getElementById(id);
const ev = await getEvent();
let target = store.get('style.target', 'overlay');

const DEFAULTS = {
  overlay: { font: 'atkinsonnext', size: 46, weight: 700, lines: 2, align: 'center', color: '#ffffff', style: 'box', box: '#000000', alpha: 78, upper: false, pos: 'bottom', width: 78, bgmode: 'transparent', also: '' },
  screen: { font: 'atkinsonnext', size: 6.4, weight: 700, lines: 0, align: 'left', color: '#ffffff', style: 'none', box: '#000000', alpha: 0, upper: false, sbg: '#111014', accent: (ev.accent || '#d4ff3a').toLowerCase(), orig: true, qr: true },
};
const PRESETS = {
  'OpenCaptions': { font: 'atkinsonnext', weight: 700, color: '#faf8f3', style: 'box', box: '#111014', alpha: 88, upper: false, align: 'center', accent: '#d4ff3a', sbg: '#111014' },
  'TV clásico': { font: 'roboto', weight: 500, color: '#ffffff', style: 'box', box: '#000000', alpha: 80, upper: false, align: 'center' },
  'Alto contraste': { font: 'atkinson', weight: 700, color: '#ffe600', style: 'box', box: '#000000', alpha: 100, sbg: '#000000' },
  'Minimal': { font: 'inter', weight: 700, color: '#ffffff', style: 'outline', box: '#000000', alpha: 0 },
  'Lower third': { font: 'montserrat', weight: 800, color: '#111014', style: 'box', box: '#d4ff3a', alpha: 100, align: 'left', upper: true, lines: 1 },
};

$('stage').innerHTML = ev.stages.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
$('font').innerHTML = Object.entries(FONTS).map(([k, f]) => `<option value="${k}">${esc(f.label)}</option>`).join('');
$('presets').innerHTML = Object.keys(PRESETS).map((n) => `<button data-preset="${esc(n)}">${esc(n)}</button>`).join('');
function fillLangs() {
  const st = ev.stages.find((s) => s.id === $('stage').value) || ev.stages[0];
  const langs = (st?.languages || ['orig', 'es', 'en']).filter((l) => l !== 'orig');
  $('lang').innerHTML = [...langs, 'orig'].map((l) => `<option value="${l}">${esc(langLabel(l, ev.languages))}</option>`).join('');
  $('also').innerHTML = `<option value="">${esc(tr('Ninguna'))}</option>` + [...langs, 'orig'].map((l) => `<option value="${l}">${esc(langLabel(l, ev.languages))}</option>`).join('');
}
fillLangs();

const ids = ['font', 'size', 'weight', 'lines', 'align', 'color', 'style', 'box', 'alpha', 'upper', 'pos', 'width', 'bgmode', 'also', 'sbg', 'accent', 'orig', 'qr'];
const read = () => Object.fromEntries(ids.map((k) => [k, $(k).type === 'checkbox' ? $(k).checked : $(k).value]));
function write(v) { for (const [k, x] of Object.entries(v)) if ($(k)) { if ($(k).type === 'checkbox') $(k).checked = !!x; else $(k).value = x; } }
function setTarget(t) {
  target = t;
  store.set('style.target', t);
  document.body.className = 't-' + t;
  document.querySelectorAll('[data-target]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.target === t));
  const size = $('size');
  if (t === 'overlay') { size.min = 24; size.max = 90; size.step = 1; } else { size.min = 3; size.max = 12; size.step = 0.2; }
  $('lines').min = t === 'screen' ? 0 : 1; $('lines').max = t === 'screen' ? 8 : 4; // screen: 0 = fill the screen
  const saved = store.get(`style.${t}`, {});
  if (t === 'screen' && !saved.v2) { delete saved.lines; saved.v2 = true; } // older versions saved a fixed 3 lines
  write({ ...DEFAULTS[t], ...saved });
  update();
}

const hex = (c) => c.replace('#', '').toLowerCase();
function params(v, preview) {
  const d = DEFAULTS[target];
  const p = new URLSearchParams();
  p.set('stage', $('stage').value);
  if (target === 'overlay') p.set('lang', $('lang').value);
  else p.set('langs', v.orig && $('lang').value !== 'orig' ? `${$('lang').value},orig` : $('lang').value);
  const add = (k, val, def) => { if (String(val) !== String(def)) p.set(k, val); };
  add('font', v.font, 'atkinsonnext'); add('size', v.size, d.size); add('weight', v.weight, 700); add('lines', v.lines, d.lines);
  add('align', v.align, target === 'overlay' ? 'center' : 'left');
  add('color', hex(v.color), 'ffffff'); add('style', v.style, target === 'overlay' ? 'box' : 'none');
  add('box', hex(v.box), '000000'); add('alpha', v.alpha, 78); if (v.upper) p.set('upper', '1');
  if (target === 'overlay') {
    add('pos', v.pos, 'bottom'); add('width', v.width, 78);
    if (v.bgmode !== 'transparent') p.set('bg', v.bgmode);
    if (v.also && v.also !== $('lang').value) p.set('also', v.also);
  } else {
    add('bg', hex(v.sbg), '111014'); add('accent', hex(v.accent), hex(ev.accent || '#d4ff3a'));
    if (!v.qr) p.set('qr', '0');
  }
  if (preview) p.set('preview', '1');
  return p;
}

let t;
function update() {
  const v = read();
  store.set(`style.${target}`, target === 'screen' ? { ...v, v2: true } : v);
  $('v-size').textContent = target === 'overlay' ? `${v.size}px` : `${v.size}vh`;
  $('v-weight').textContent = v.weight; $('v-lines').textContent = Number(v.lines) === 0 ? tr('Auto (llenar pantalla)') : v.lines; $('v-alpha').textContent = v.alpha + '%'; $('v-width').textContent = v.width + '%';
  const page = target === 'overlay' ? 'overlay.html' : 'screen.html';
  const url = `${ev.publicUrl}/${page}?${params(v, false)}`;
  $('url').value = url; $('open').href = url;
  $('hint').textContent = target === 'overlay'
    ? 'vMix: Add Input → Web Browser → 1920×1080 → pegá la URL. OBS: Fuente → Navegador → 1920×1080.'
    : 'Abrila en el navegador de la PC conectada al proyector y tocá F (o doble clic) para pantalla completa.';
  $('bgimg').style.display = target === 'overlay' && v.bgmode === 'transparent' ? '' : 'none';
  clearTimeout(t);
  t = setTimeout(() => { $('frame').src = `/${page}?${params(v, true)}`; }, 250);
}
function fit() { $('frame').style.transform = `scale(${$('stagebox').clientWidth / 1920})`; }
new ResizeObserver(fit).observe($('stagebox'));

document.querySelector('.controls').addEventListener('input', update);
$('stage').onchange = () => { fillLangs(); update(); };
$('presets').onclick = (e) => { const b = e.target.closest('[data-preset]'); if (!b) return; write({ ...DEFAULTS[target], ...PRESETS[b.dataset.preset] }); update(); };
document.querySelectorAll('[data-target]').forEach((b) => (b.onclick = () => setTarget(b.dataset.target)));
$('copy').onclick = () => { navigator.clipboard.writeText($('url').value); $('copy').textContent = tr('✓ Copiada'); setTimeout(() => ($('copy').textContent = tr('Copiar')), 1500); };
setTarget(target);
fit();
localize();
