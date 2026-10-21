// "No key? Run it on this computer": free captions with Whisper (and translations with Ollama) on the computer
// running OpenCaptions, with one click instead of `npm run local`. The server prepares everything and this shows
// its progress (GET /api/local, src/local/mode.js). Used by the welcome wizard, the "Just for me" page and the
// dashboard's banner when a free Gemini key runs out.
import { LANG } from '/prefs.js';
import { esc } from '/common.js';
import { icon } from '/illustrations.js';

const T = {
  es: {
    quota: 'Tu key gratis de Gemini llegó a su límite. ¿Seguir gratis en esta computadora?',
    go: 'Usar esta computadora (gratis, más lento)',
    noKey: '¿No tenés key? Usá esta computadora (gratis, más lento)',
    fine: 'La primera vez descarga unos 650 MB. Nada sale de esta computadora.',
    fineMac: 'Usa el reconocimiento de voz y la traducción que trae esta Mac, así que normalmente no hay que descargar nada grande. Nada sale de esta computadora.',
    working: 'Preparando…',
    failed: 'No se pudo preparar:',
    retry: 'Reintentar',
    ready: 'Los subtítulos se hacen en esta computadora.',
    textWorking: 'Preparando las traducciones:',
    textReady: 'Las traducciones también.',
    textFailed: 'Las traducciones no se pudieron preparar:',
    missing: 'Por ahora, solo subtítulos en el idioma hablado. Para traducirlos hace falta Ollama, una app gratis:',
    m1: 'Descargá Ollama e instalalo.',
    m1Link: 'Descargar Ollama',
    m2: 'Abrilo una vez.',
    m3: 'OpenCaptions lo detecta solo y descarga el modelo de traducción (unos 3 GB, una vez).',
    check: 'Buscar de nuevo',
    back: 'Volver a Gemini',
  },
  en: {
    quota: 'Your free Gemini key reached its limit. Continue for free on this computer?',
    go: 'Use this computer (free, slower)',
    noKey: 'No key? Run it on this computer (free, slower)',
    fine: 'The first time it downloads about 650 MB. Nothing leaves this computer.',
    fineMac: 'Uses the speech recognition and translation built into this Mac, so there’s usually nothing big to download. Nothing leaves this computer.',
    working: 'Getting ready…',
    failed: 'Couldn’t get it ready:',
    retry: 'Try again',
    ready: 'Captions are made on this computer.',
    textWorking: 'Getting translations ready:',
    textReady: 'Translations too.',
    textFailed: 'Translations couldn’t be set up:',
    missing: 'For now, captions in the spoken language only. Translating them needs Ollama, a free app:',
    m1: 'Download Ollama and install it.',
    m1Link: 'Download Ollama',
    m2: 'Open it once.',
    m3: 'OpenCaptions notices it by itself and downloads the translation model (about 3 GB, once).',
    check: 'Check again',
    back: 'Back to Gemini',
  },
};
const t = T[LANG] || T.en;
const mb = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.round(n / 1e6)} MB`);
const bar = (s) => `<p class="cx-fine">${esc(s.step || t.working)}${s.total ? ` · ${mb(s.done)} / ${mb(s.total)}` : ''}</p>
  <progress max="${s.total || 1}" ${s.total ? `value="${s.done}"` : ''} class="cx-progress"></progress>`;

/**
 * @param {HTMLElement} el
 * @param {{ api: (method: string, url: string, body?: any) => Promise<any>, quota?: boolean, onChange?: (s: any) => void }} o
 *   quota: the dashboard's banner wording ("your free key reached its limit") instead of "no key?"
 * @returns {{ status: () => any }}
 */
export function localPanel(el, { api, quota = false, onChange = () => {} }) {
  let s = null;
  let timer = null;
  el.classList.add('connect');
  function render() {
    if (!s) { el.innerHTML = ''; return; }
    let html = '';
    if (s.state === 'idle' || s.state === 'error') {
      if (quota) html += `<p class="cx-status warn">${icon('alert')}<span>${esc(t.quota)}</span></p>`;
      html += `<div class="cx-row"><button type="button" class="${quota ? 'primary' : ''}" data-lm="start">${esc(quota ? t.go : t.noKey)}</button></div><p class="cx-fine">${esc(s.apple ? t.fineMac : t.fine)}</p>`;
      if (s.state === 'error') html += `<p class="cx-msg bad" role="status">${esc(t.failed)} ${esc(s.error)}</p>`;
    } else if (s.state === 'working') html += bar(s);
    else {
      html += `<p class="cx-status ok">${icon('check')}<span>${esc(t.ready)}${s.text === 'ready' ? ` ${esc(t.textReady)}` : ''}</span></p>`;
      if (s.text === 'working') html += `<p class="cx-fine">${esc(t.textWorking)}</p>${bar(s)}`;
      if (s.text === 'error') html += `<p class="cx-msg bad" role="status">${esc(t.textFailed)} ${esc(s.error)} <button type="button" class="cx-link" data-lm="retry">${esc(t.retry)}</button></p>`;
      if (s.text === 'missing') {
        html += `<p>${esc(t.missing)}</p><ol class="cx-steps">
          <li>${esc(t.m1)} <a href="https://ollama.com/download" target="_blank" rel="noopener">${esc(t.m1Link)} ↗</a></li>
          <li>${esc(t.m2)}</li><li>${esc(t.m3)}</li></ol>
          <div class="cx-row"><button type="button" class="cx-link" data-lm="retry">${esc(t.check)}</button></div>`;
      }
      if (s.hasKey) html += `<div class="cx-row"><button type="button" class="cx-link" data-lm="stop">${esc(t.back)}</button></div>`;
    }
    el.innerHTML = html;
  }
  function set(next) {
    s = next;
    render();
    onChange(s);
    clearTimeout(timer);
    // Follow the server while it works (and while it waits for Ollama, which it looks for by itself).
    if (s.state === 'working' || (s.state === 'ready' && ['working', 'missing'].includes(s.text))) timer = setTimeout(load, s.text === 'missing' ? 4000 : 1000);
  }
  const load = () => api('GET', '/api/local').then(set, () => { timer = setTimeout(load, 5000); });
  el.addEventListener('click', async (e) => {
    const a = /** @type {HTMLElement} */ (e.target).closest('[data-lm]')?.getAttribute('data-lm');
    if (a) set(await api('POST', `/api/local/${a}`).catch((err) => ({ ...s, state: 'error', error: err.message })));
  });
  load();
  return { status: () => s };
}
