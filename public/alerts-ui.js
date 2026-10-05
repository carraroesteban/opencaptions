// Settings → Alerts: where the server sends a message when something goes wrong and nobody is watching the
// dashboard (src/alerts.js). ntfy is the easy one: a free app, no account, a topic name generated here.
import { LANG } from '/i18n.js';
import { esc } from '/common.js';
import { icon } from '/illustrations.js';

const T = {
  es: {
    what: 'Te avisamos cuando una sala se queda sin sonido, la IA falla más de un minuto, una charla se pasa 5 minutos, se corta internet o la dirección pública deja de funcionar. Y otra vez cuando se resuelve.',
    ntfy: 'App ntfy (recomendado)', ntfyD: 'Gratis, sin cuenta, en iPhone, Android y computadora.',
    n1: 'Instalá la app ntfy:', n2: 'Tocá “+” y suscribite a este tema:', n3: 'Guardá y mandá una prueba.',
    ntfyWarn: 'Quien conozca el nombre del tema puede leer las alertas: no lo publiques.',
    server: 'Servidor de ntfy propio (opcional)',
    telegram: 'Telegram', telegramD: 'Un bot de Telegram: creálo con @BotFather y escribile una vez.',
    token: 'Token del bot', chat: 'ID del chat',
    chatHelp: 'Para saber el ID: escribile al bot y abrí api.telegram.org/bot<token>/getUpdates.',
    slack: 'Slack', discord: 'Discord', webhook: 'Otro servicio (webhook)',
    urlD: 'La dirección del webhook entrante.', webhookD: 'Recibe un POST con JSON: sirve para Zapier, Make, n8n o un script propio.',
    lang: 'Idioma de los mensajes',
    save: 'Guardar', test: 'Mandar una prueba', saved: 'Guardado.',
    testOk: (t) => `Prueba enviada a ${t}.`, testBad: (t, e) => `No se pudo enviar a ${t}: ${e}`,
    pause: 'Pausar 1 hora', pauseDay: 'Pausar hasta mañana', resume: 'Reanudar',
    paused: (h) => `Pausadas hasta las ${h}.`,
    kept: 'guardado',
    none: 'Elegí al menos un destino.',
  },
  en: {
    what: 'You get a message when a room loses its sound, the AI fails for over a minute, a talk runs 5 minutes over, the internet drops or the public address stops working. And another one when it’s fixed.',
    ntfy: 'ntfy app (recommended)', ntfyD: 'Free, no account, on iPhone, Android and desktop.',
    n1: 'Install the ntfy app:', n2: 'Tap “+” and subscribe to this topic:', n3: 'Save, and send a test.',
    ntfyWarn: 'Anyone who knows the topic name can read the alerts: don’t publish it.',
    server: 'Your own ntfy server (optional)',
    telegram: 'Telegram', telegramD: 'A Telegram bot: create one with @BotFather and message it once.',
    token: 'Bot token', chat: 'Chat ID',
    chatHelp: 'To find the ID: message the bot, then open api.telegram.org/bot<token>/getUpdates.',
    slack: 'Slack', discord: 'Discord', webhook: 'Another service (webhook)',
    urlD: 'The incoming webhook’s address.', webhookD: 'Gets a JSON POST: works with Zapier, Make, n8n or your own script.',
    lang: 'Language of the messages',
    save: 'Save', test: 'Send a test', saved: 'Saved.',
    testOk: (t) => `Test sent to ${t}.`, testBad: (t, e) => `Couldn’t send to ${t}: ${e}`,
    pause: 'Pause for 1 hour', pauseDay: 'Pause until tomorrow', resume: 'Resume',
    paused: (h) => `Paused until ${h}.`,
    kept: 'saved',
    none: 'Pick at least one destination.',
  },
};
const t = T[LANG] || T.en;
const newTopic = () => `opencaptions-${[...crypto.getRandomValues(new Uint8Array(10))].map((b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('')}`;

/**
 * @param {HTMLElement} el
 * @param {{ api: (m: string, u: string, b?: any) => Promise<any>, toast: (msg: string, o?: any) => void }} ctx
 */
export function alertsPanel(el, { api, toast }) {
  el.classList.add('connect', 'alerts');
  let cfg = { lang: LANG === 'es' ? 'es' : 'en', channels: [], snoozeUntil: 0 };
  const has = (type) => cfg.channels.find((c) => c.type === type);

  async function load() {
    try { cfg = await api('GET', '/api/alerts'); } catch { return; }
    render();
  }
  function render() {
    const ntfy = has('ntfy') || { topic: newTopic() };
    const tg = has('telegram') || {};
    const lang = cfg.channels.length ? cfg.lang : LANG === 'es' ? 'es' : 'en'; // not set up yet: the dashboard's language
    const box = (type, title, desc, body) => `<details class="al-ch" ${has(type) || (type === 'ntfy' && !cfg.channels.length) ? 'open' : ''}>
      <summary><label><input type="checkbox" data-on="${type}" ${has(type) ? 'checked' : ''} /> <b>${esc(title)}</b></label><small>${esc(desc)}</small></summary>
      <div class="al-body">${body}</div></details>`;
    const url = (type, desc) => box(type, t[type], desc, `<label class="field">URL<input data-f="${type}.url" placeholder="https://…" value="${esc(has(type)?.url || '')}" autocomplete="off" spellcheck="false" /></label>`);
    el.innerHTML = `
      <p class="cx-fine u-mt0">${esc(t.what)}</p>
      ${box('ntfy', t.ntfy, t.ntfyD, `<ol class="cx-steps">
        <li>${esc(t.n1)} <a href="https://apps.apple.com/app/ntfy/id1625396347" target="_blank" rel="noopener">iPhone ↗</a> · <a href="https://play.google.com/store/apps/details?id=io.heckel.ntfy" target="_blank" rel="noopener">Android ↗</a> · <a href="https://ntfy.sh/app" target="_blank" rel="noopener">web ↗</a></li>
        <li>${esc(t.n2)} <div class="cx-row u-mt6"><code class="ax-secret" data-topic>${esc(ntfy.topic)}</code><button type="button" data-a="copy">${icon('doc')}</button></div><input type="hidden" data-f="ntfy.topic" value="${esc(ntfy.topic)}" /></li>
        <li>${esc(t.n3)}</li></ol>
        <p class="cx-fine">${esc(t.ntfyWarn)}</p>
        <label class="field">${esc(t.server)}<input data-f="ntfy.server" placeholder="https://ntfy.sh" value="${esc(ntfy.server || '')}" autocomplete="off" /></label>`)}
      ${box('telegram', t.telegram, t.telegramD, `<label class="field">${esc(t.token)}<input data-f="telegram.token" placeholder="${esc(tg.token ? `${t.kept} ${tg.token}` : '123456:ABC…')}" autocomplete="off" spellcheck="false" /></label>
        <label class="field">${esc(t.chat)}<input data-f="telegram.chat" value="${esc(tg.chat || '')}" placeholder="-1001234567890" autocomplete="off" /></label>
        <p class="cx-fine">${esc(t.chatHelp)}</p>`)}
      ${url('slack', t.urlD)}
      ${url('discord', t.urlD)}
      ${url('webhook', t.webhookD)}
      <label class="field">${esc(t.lang)}<select data-f="lang"><option value="es" ${lang === 'es' ? 'selected' : ''}>Español</option><option value="en" ${lang === 'en' ? 'selected' : ''}>English</option></select></label>
      <div class="cx-row"><button type="button" class="primary" data-a="save">${esc(t.save)}</button><button type="button" data-a="test" ${cfg.channels.length ? '' : 'disabled'}>${esc(t.test)}</button></div>
      <div class="cx-row">${cfg.snoozeUntil
        ? `<span class="chip warn">${esc(t.paused(new Date(cfg.snoozeUntil).toLocaleString(LANG, { weekday: 'short', hour: '2-digit', minute: '2-digit' })))}</span><button type="button" class="cx-link" data-a="resume">${esc(t.resume)}</button>`
        : `<button type="button" class="cx-link" data-a="pause" ${cfg.channels.length ? '' : 'disabled'}>${esc(t.pause)}</button><button type="button" class="cx-link" data-a="pauseDay" ${cfg.channels.length ? '' : 'disabled'}>${esc(t.pauseDay)}</button>`}</div>`;
  }
  const field = (k) => /** @type {HTMLInputElement | null} */ (el.querySelector(`[data-f="${k}"]`))?.value.trim() || '';
  el.addEventListener('click', async (e) => {
    const a = /** @type {HTMLElement} */ (e.target).closest('[data-a]')?.getAttribute('data-a');
    if (!a) return;
    try {
      if (a === 'copy') await navigator.clipboard.writeText(el.querySelector('[data-topic]').textContent).catch(() => {});
      if (a === 'save') {
        const on = (type) => /** @type {HTMLInputElement} */ (el.querySelector(`[data-on="${type}"]`)).checked;
        const channels = [];
        if (on('ntfy')) channels.push({ type: 'ntfy', topic: field('ntfy.topic'), server: field('ntfy.server') });
        if (on('telegram')) channels.push({ type: 'telegram', token: field('telegram.token') || has('telegram')?.token || '', chat: field('telegram.chat') });
        for (const type of ['slack', 'discord', 'webhook']) if (on(type)) channels.push({ type, url: field(`${type}.url`) });
        cfg = await api('PUT', '/api/alerts', { channels, lang: field('lang') });
        render();
        toast(t.saved);
      }
      if (a === 'test') {
        const { results } = await api('POST', '/api/alerts/test');
        for (const r of results) toast(r.ok ? t.testOk(t[r.type] || r.type) : t.testBad(t[r.type] || r.type, r.error), { error: !r.ok, ms: 9000 });
      }
      if (a === 'pause' || a === 'pauseDay' || a === 'resume') {
        const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(8, 0, 0, 0);
        const minutes = a === 'pause' ? 60 : a === 'pauseDay' ? Math.ceil((+tomorrow - Date.now()) / 60_000) : 0;
        cfg = await api('POST', '/api/alerts/snooze', { minutes });
        render();
      }
    } catch (err) { toast(err.message, { error: true }); }
  });
  // Ticking a destination opens it; typing in one ticks it.
  el.addEventListener('input', (e) => {
    const f = /** @type {HTMLElement} */ (e.target).getAttribute('data-f');
    if (f && f !== 'lang') { const box = el.querySelector(`[data-on="${f.split('.')[0]}"]`); if (box) /** @type {HTMLInputElement} */ (box).checked = true; }
  });
  return { load };
}
