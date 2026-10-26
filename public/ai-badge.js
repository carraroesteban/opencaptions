// The AI badge: which AI makes the captions right now, the same words on every organizer page (the dashboard's top
// bar, Just for me), and for an admin the one switch between Gemini in the cloud, this computer, and Gemini with this
// computer as a backup when the internet drops (POST /api/ai/use; the server's aiNow()).
import { esc } from '/common.js';
import { LANG } from '/prefs.js';
import { icon } from '/illustrations.js';
import { menu, popMenu } from '/menu.js';

const T = {
  es: {
    cloud: 'Gemini', cloudWhere: 'en la nube', local: (n) => (n === 'Apple' ? 'Voz de Apple' : 'Whisper'), localWhere: (apple) => (apple ? 'en esta Mac' : 'en esta compu'),
    simulated: 'Subtítulos simulados', simulatedWhy: (forced) => (forced ? 'modo de prueba' : 'conectá una IA'),
    preparing: 'Preparando esta compu…', backupOn: 'sin internet: esta compu cubre',
    title: '¿Quién hace los subtítulos?',
    optCloud: 'Gemini, en la nube', optCloudD: 'La mejor calidad, en cualquier idioma, y detecta solo el idioma que se habla. Usa tu key de Gemini (se paga por uso).',
    optLocal: (apple) => (apple ? 'Esta Mac (voz de Apple)' : 'Esta computadora (Whisper)'),
    optLocalD: 'Gratis y sin internet: no sale nada de esta computadora. Si sabés el idioma que se habla, elegilo en la sala: es más preciso.',
    optAuto: 'Gemini, con esta computadora de respaldo', optAutoD: 'Gemini mientras haya internet; si se corta, sigue en esta computadora y vuelve sola.',
    needKey: 'Primero conectá una key de Gemini', forcedNote: 'OpenCaptions se inició en modo de prueba (--mock): los subtítulos son simulados aunque haya una key. Inicialo normalmente para usar la IA.',
    more: 'Más en Ajustes → IA', failed: 'No se pudo cambiar',
  },
  en: {
    cloud: 'Gemini', cloudWhere: 'in the cloud', local: (n) => (n === 'Apple' ? 'Apple speech' : 'Whisper'), localWhere: (apple) => (apple ? 'on this Mac' : 'on this computer'),
    simulated: 'Simulated captions', simulatedWhy: (forced) => (forced ? 'test mode' : 'connect an AI'),
    preparing: 'Preparing this computer…', backupOn: 'no internet: this computer covers',
    title: 'Who makes the captions?',
    optCloud: 'Gemini, in the cloud', optCloudD: 'The best quality, in any language, and it tells by itself which language is spoken. Uses your Gemini key (paid by use).',
    optLocal: (apple) => (apple ? 'This Mac (Apple speech)' : 'This computer (Whisper)'),
    optLocalD: 'Free and offline: nothing leaves this computer. If you know the language spoken, set it in the room: it’s more accurate.',
    optAuto: 'Gemini, with this computer as backup', optAutoD: 'Gemini while there’s internet; if it drops, captions carry on on this computer and come back by themselves.',
    needKey: 'Connect a Gemini key first', forcedNote: 'OpenCaptions was started in test mode (--mock): captions are simulated even with a key. Start it normally to use the AI.',
    more: 'More in Settings → AI', failed: 'Couldn’t switch',
  },
};
const t = T[LANG] || T.en;
let n = 0;

/** What the badge says for the server's aiNow(): [icon, name, where, tone]. */
function label(ai) {
  if (ai.now === 'local' && ai.backup === 'on') return ['offline', t.local(ai.name), t.backupOn, 'warn'];
  if (ai.preparing) return ['refresh', t.preparing, '', ''];
  if (ai.now === 'cloud') return ['cloud', t.cloud, t.cloudWhere, 'ok'];
  if (ai.now === 'local') return ['monitor', t.local(ai.name), t.localWhere(ai.apple), 'ok'];
  return ['alert', t.simulated, t.simulatedWhy(ai.forced), 'warn'];
}

/**
 * @param {HTMLElement} el  where the badge goes (its content is replaced)
 * @param {{ api?: (method: string, url: string, body?: any) => Promise<any>, settings?: string, onChange?: (ai: any) => void }} o
 *   api: given for an admin, the badge is also the switch; settings: a link to the AI settings
 */
export function aiBadge(el, { api, settings = '', onChange = () => {} } = {}) {
  const id = `ai-pop-${++n}`;
  let ai = null, busy = false;
  el.classList.add('ai-badge');
  el.innerHTML = `<button type="button" class="ai-chip" ${api ? `aria-haspopup="true" aria-expanded="false" aria-controls="${id}"` : 'disabled'}></button>
    ${api ? `<div class="ai-pop" popover id="${id}" role="dialog" aria-label="${esc(t.title)}"></div>` : ''}`;
  const chip = el.querySelector('.ai-chip'), pop = el.querySelector('.ai-pop');
  if (pop) { menu(pop); chip.onclick = (e) => popMenu(pop, chip, null, e); }
  function render() {
    if (!ai) return;
    const [ic, name, where, tone] = label(ai);
    chip.className = `ai-chip ${tone}`;
    chip.innerHTML = `${icon(ic)}<b>${esc(name)}</b>${where ? `<span>${esc(where)}</span>` : ''}${api ? icon('chevron') : ''}`;
    chip.title = [name, where].filter(Boolean).join(' · ');
    if (!pop) return;
    const opt = (key, title, desc, ok, why = '') => `<button type="button" class="ai-opt${ai.use === key ? ' on' : ''}" data-use="${key}" ${ok && !busy ? '' : 'disabled'} aria-pressed="${ai.use === key}">
        <span class="ai-opt-t">${esc(title)}${ai.use === key ? icon('check') : ''}</span><span class="ai-opt-d">${esc(ok ? desc : why)}</span></button>`;
    pop.innerHTML = `<p class="ai-pop-h">${esc(t.title)}</p>
      ${ai.forced ? `<p class="ai-pop-note">${esc(t.forcedNote)}</p>` : ''}
      ${opt('cloud', t.optCloud, t.optCloudD, ai.hasKey, t.needKey)}
      ${ai.canLocal === false ? '' : opt('local', t.optLocal(ai.apple), t.optLocalD, true)}
      ${ai.canBackup ? opt('auto', t.optAuto, ai.backupPreparing === 'working' ? t.preparing : t.optAutoD, ai.hasKey, t.needKey) : ''}
      ${settings ? `<a class="ai-pop-more" href="${esc(settings)}">${esc(t.more)} →</a>` : ''}`;
  }
  pop?.addEventListener('click', async (e) => {
    if (e.target.closest('a')) return pop.hidePopover();
    const b = e.target.closest('[data-use]');
    if (!b || busy || b.dataset.use === ai.use) return;
    busy = true;
    render();
    try { ai = await api('POST', '/api/ai/use', { use: b.dataset.use }); onChange(ai); } catch { chip.title = t.failed; }
    busy = false;
    render();
  });
  return {
    /** @param {any} next  the server's aiNow() (in /api/status and /api/setup) */
    update(next) {
      if (!next || JSON.stringify(next) === JSON.stringify(ai)) return;
      ai = next;
      render();
    },
  };
}
