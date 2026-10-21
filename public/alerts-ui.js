// Settings → Alerts: where the server sends a message when something goes wrong and nobody is watching the
// dashboard (src/alerts.js). Top to bottom: what triggers an alert; the channels already added, each with Send a test
// and Remove; then "Add a channel": pick a service from its card, and only that service's steps and fields open below.
// One channel per service (the server keeps one of each), so picking one already added edits it.
// ntfy is the easy one: a free app, no account, a topic name generated here.
import { LANG } from '/prefs.js';
import { esc, copyText } from '/common.js';
import { icon } from '/illustrations.js';

const T = {
  es: {
    whenH: 'Te avisamos cuando',
    when: [['mic', 'Una sala se queda sin sonido'], ['sparkle', 'La IA falla más de un minuto'], ['clock', 'Una charla se pasa 5 minutos'], ['offline', 'Se corta internet'], ['link', 'La dirección pública deja de funcionar']],
    fixed: 'Y otra vez cuando se resuelve.',
    mineH: 'Adónde llegan', addH: 'Agregar un canal', addMoreH: 'Agregar otro canal',
    none: 'Todavía no llegan a ningún lado: elegí un servicio abajo.',
    names: { ntfy: 'App ntfy', telegram: 'Telegram', slack: 'Slack', discord: 'Discord', webhook: 'Webhook' },
    descs: {
      ntfy: 'Gratis, sin cuenta, en iPhone, Android y computadora.',
      telegram: 'Un bot que te escribe a vos o al grupo del equipo.',
      slack: 'Un mensaje en el canal del equipo.',
      discord: 'Un mensaje en un canal de tu servidor.',
      webhook: 'Un POST con JSON, para Zapier, Make, n8n o un script propio.',
    },
    recommended: 'Recomendado', added: 'Agregado',
    steps: {
      ntfy: ['Instalá la app ntfy:', 'Tocá «+» y suscribite a este tema:', 'Guardá: te llega una prueba.'],
      telegram: ['En Telegram, abrí @BotFather, mandá /newbot y copiá el token que te da.', 'Escribile algo a tu bot nuevo (o sumalo al grupo del equipo).', 'Pegá el token y el ID del chat:'],
      slack: ['En api.slack.com/apps creá una app, activá «Incoming Webhooks» y agregá uno para el canal del equipo.', 'Copiá la dirección (empieza con https://hooks.slack.com/) y pegala acá:'],
      discord: ['En el canal: ⚙ Editar canal → Integraciones → Webhooks → Nuevo webhook.', 'Tocá «Copiar URL del webhook» y pegala acá:'],
      webhook: ['Cada alerta llega como un POST con JSON: qué pasó, en qué sala, si es urgente y si ya se resolvió.', 'Pegá la dirección que lo recibe:'],
    },
    help: { slack: 'https://api.slack.com/messaging/webhooks', discord: 'https://support.discord.com/hc/articles/228383668' },
    helpLink: 'Cómo se hace ↗',
    ntfyWarn: 'Quien conozca el nombre del tema puede leer las alertas: no lo publiques.',
    server: 'Servidor de ntfy propio (opcional)',
    token: 'Token del bot', chat: 'ID del chat',
    chatHelp: 'Para saber el ID: escribile al bot y abrí api.telegram.org/bot<token>/getUpdates; es el número de «chat».',
    url: 'Dirección', keep: (v) => `Guardada: ${v}. Dejala vacía para no cambiarla.`, copy: 'Copiar', copied: 'Copiado',
    lang: 'Idioma de los mensajes',
    saveTest: 'Guardar y probar', cancel: 'Cancelar', test: 'Enviar una prueba', sending: 'Enviando…', remove: 'Quitar',
    removeAsk: (t) => `¿Quitar ${t}?`, removeBody: 'Las alertas dejan de llegar ahí. Podés volver a agregarlo cuando quieras.',
    sent: 'Prueba enviada: fijate en el celular.', failed: (e) => `No llegó: ${e}`,
    pause: 'Pausar 1 hora', pauseDay: 'Pausar hasta mañana', resume: 'Reanudar',
    paused: (h) => `Pausadas hasta las ${h}`,
  },
  en: {
    whenH: 'You get a message when',
    when: [['mic', 'A room loses its sound'], ['sparkle', 'The AI fails for over a minute'], ['clock', 'A talk runs 5 minutes over'], ['offline', 'The internet drops'], ['link', 'The public address stops working']],
    fixed: 'And another one when it’s fixed.',
    mineH: 'Where they go', addH: 'Add a channel', addMoreH: 'Add another channel',
    none: 'They don’t go anywhere yet: pick a service below.',
    names: { ntfy: 'ntfy app', telegram: 'Telegram', slack: 'Slack', discord: 'Discord', webhook: 'Webhook' },
    descs: {
      ntfy: 'Free, no account, on iPhone, Android and desktop.',
      telegram: 'A bot that messages you or the team’s group.',
      slack: 'A message in the team’s channel.',
      discord: 'A message in a channel of your server.',
      webhook: 'A JSON POST, for Zapier, Make, n8n or your own script.',
    },
    recommended: 'Recommended', added: 'Added',
    steps: {
      ntfy: ['Install the ntfy app:', 'Tap “+” and subscribe to this topic:', 'Save: a test message arrives.'],
      telegram: ['In Telegram, open @BotFather, send /newbot and copy the token it gives you.', 'Send your new bot any message (or add it to the team’s group).', 'Paste the token and the chat ID:'],
      slack: ['At api.slack.com/apps, create an app, turn on “Incoming Webhooks” and add one for the team’s channel.', 'Copy the address (it starts with https://hooks.slack.com/) and paste it here:'],
      discord: ['In the channel: ⚙ Edit Channel → Integrations → Webhooks → New Webhook.', 'Click “Copy Webhook URL” and paste it here:'],
      webhook: ['Each alert arrives as a JSON POST: what happened, in which room, whether it’s urgent and whether it’s fixed.', 'Paste the address that receives it:'],
    },
    help: { slack: 'https://api.slack.com/messaging/webhooks', discord: 'https://support.discord.com/hc/articles/228383668' },
    helpLink: 'How to ↗',
    ntfyWarn: 'Anyone who knows the topic name can read the alerts: don’t publish it.',
    server: 'Your own ntfy server (optional)',
    token: 'Bot token', chat: 'Chat ID',
    chatHelp: 'To find the ID: message the bot, then open api.telegram.org/bot<token>/getUpdates; it’s the “chat” number.',
    url: 'Address', keep: (v) => `Saved: ${v}. Leave it empty to keep it.`, copy: 'Copy', copied: 'Copied',
    lang: 'Language of the messages',
    saveTest: 'Save and send a test', cancel: 'Cancel', test: 'Send a test', sending: 'Sending…', remove: 'Remove',
    removeAsk: (t) => `Remove ${t}?`, removeBody: 'Alerts stop going there. You can add it again any time.',
    sent: 'Test sent: check your phone.', failed: (e) => `It didn’t arrive: ${e}`,
    pause: 'Pause for 1 hour', pauseDay: 'Pause until tomorrow', resume: 'Resume',
    paused: (h) => `Paused until ${h}`,
  },
};
const t = T[LANG] || T.en;
const KINDS = ['ntfy', 'telegram', 'slack', 'discord', 'webhook'];
// Each service its own mark (the same chat bubble on three of them read as one choice).
const MARK = { ntfy: icon('phone'), telegram: 'T', slack: 'S', discord: 'D', webhook: icon('link') };
const mark = (k) => `<span class="logo al-logo ${k}" aria-hidden="true">${MARK[k]}</span>`;
const newTopic = () => `opencaptions-${[...crypto.getRandomValues(new Uint8Array(10))].map((b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('')}`;

/**
 * @param {HTMLElement} el
 * @param {{ api: (m: string, u: string, b?: any) => Promise<any>,
 *   confirm: (o: { title: string, body: string, ok: string, danger?: boolean }) => Promise<boolean> }} ctx
 */
export function alertsPanel(el, { api, confirm }) {
  el.classList.add('connect', 'alerts');
  let cfg = { lang: LANG === 'es' ? 'es' : 'en', channels: [], snoozeUntil: 0 };
  const has = (type) => cfg.channels.find((c) => c.type === type);
  let picked = ''; // a language chosen before any channel exists
  const lang = () => picked || (cfg.channels.length ? cfg.lang : LANG === 'es' ? 'es' : 'en'); // not set up yet: the dashboard's
  let editing = ''; // the service whose fields are open
  const results = {}; // the last test of each channel: { ok, text }, shown on its row

  async function load() {
    try { cfg = await api('GET', '/api/alerts'); } catch { return; }
    render();
  }

  function render() {
    const row = (c) => {
      const detail = (c.topic || c.chat || c.url || '').replace(/…+/g, '…'); // the server shows a hidden address as host/……end
      const r = results[c.type];
      return `<li class="al-row" data-type="${c.type}">${mark(c.type)}
        <span class="al-what"><b>${esc(t.names[c.type])}</b>${detail ? `<code>${esc(detail)}</code>` : ''}</span>
        <span class="al-res${r ? ` ${r.ok ? 'ok' : 'bad'}` : ''}" role="status">${r ? `${icon(r.ok ? 'check' : 'alert')}<span>${esc(r.text)}</span>` : ''}</span>
        <span class="al-acts"><button type="button" data-a="test" data-type="${c.type}">${icon('play')}<span>${esc(t.test)}</span></button><button type="button" class="danger" data-a="remove" data-type="${c.type}" aria-label="${esc(`${t.remove}: ${t.names[c.type]}`)}">${esc(t.remove)}</button></span>
      </li>`;
    };
    const card = (k) => `<button type="button" class="al-card" data-open="${k}" aria-pressed="${editing === k}" aria-controls="al-form">
        ${mark(k)}<span class="al-card-t"><b>${esc(t.names[k])}</b><small>${esc(t.descs[k])}</small></span>
        ${has(k) ? `<span class="chip ok">${icon('check')}${esc(t.added)}</span>` : k === 'ntfy' ? `<span class="chip">${esc(t.recommended)}</span>` : ''}
      </button>`;
    const on = cfg.channels.length > 0;
    const typing = el.querySelector(`#al-form[data-type="${editing}"]`); // what's being typed survives a redraw (a test, a pause)
    el.innerHTML = `
      <div class="al-when"><p>${esc(t.whenH)}</p><ul>${t.when.map(([i, s]) => `<li>${icon(i)}<span>${esc(s)}</span></li>`).join('')}</ul><p class="cx-fine">${esc(t.fixed)}</p></div>
      <section class="al-sec" aria-labelledby="al-mine-h">
        <h4 class="al-h" id="al-mine-h">${esc(t.mineH)}</h4>
        ${on ? `<ul class="al-list">${cfg.channels.map(row).join('')}</ul>` : `<p class="al-none">${esc(t.none)}</p>`}
      </section>
      <section class="al-sec" aria-labelledby="al-add-h">
        <h4 class="al-h" id="al-add-h">${esc(on ? t.addMoreH : t.addH)}</h4>
        <div class="al-cards">${KINDS.map(card).join('')}</div>
        <form class="al-form${editing ? '' : ' hidden'}" id="al-form" data-type="${editing}" aria-label="${esc(editing ? t.names[editing] : '')}">${editing && !typing ? form(editing) : ''}</form>
      </section>
      <div class="al-foot">
        <label class="field">${esc(t.lang)}<select data-f="lang"><option value="es" ${lang() === 'es' ? 'selected' : ''}>Español</option><option value="en" ${lang() === 'en' ? 'selected' : ''}>English</option></select></label>
        ${on ? `<div class="cx-row">${cfg.snoozeUntil
          ? `<span class="chip warn">${esc(t.paused(new Date(cfg.snoozeUntil).toLocaleString(LANG, { weekday: 'short', hour: '2-digit', minute: '2-digit' })))}</span><button type="button" data-a="resume">${esc(t.resume)}</button>`
          : `<button type="button" data-a="pause">${esc(t.pause)}</button><button type="button" class="plain" data-a="pauseDay">${esc(t.pauseDay)}</button>`}</div>` : ''}
      </div>
      <p class="al-err al-msg hidden" role="alert"></p>`;
    if (typing) el.querySelector('#al-form').replaceWith(typing);
  }

  // ---------- one service's steps and fields ----------
  function form(type) {
    const c = has(type) || {};
    const steps = t.steps[type];
    const input = (f, label, { value = '', ph = '', note = '' } = {}) => `<label class="field">${esc(label)}<input data-f="${f}" value="${esc(value)}" placeholder="${esc(ph)}" autocomplete="off" spellcheck="false" />${note ? `<small>${esc(note)}</small>` : ''}</label>`;
    let body;
    if (type === 'ntfy') {
      const topic = c.topic || newTopic();
      body = `<ol class="al-steps">
        <li>${esc(steps[0])} <a href="https://apps.apple.com/app/ntfy/id1625396347" target="_blank" rel="noopener">iPhone ↗</a> · <a href="https://play.google.com/store/apps/details?id=io.heckel.ntfy" target="_blank" rel="noopener">Android ↗</a> · <a href="https://ntfy.sh/app" target="_blank" rel="noopener">web ↗</a></li>
        <li>${esc(steps[1])}<div class="al-copy"><code data-topic>${esc(topic)}</code><button type="button" data-a="copy">${icon('doc')}<span>${esc(t.copy)}</span></button></div><p class="cx-fine">${esc(t.ntfyWarn)}</p></li>
        <li>${esc(steps[2])}</li></ol>
        <input type="hidden" data-f="topic" value="${esc(topic)}" />
        ${input('server', t.server, { value: c.server || '', ph: 'https://ntfy.sh' })}`;
    } else if (type === 'telegram') {
      body = `<ol class="al-steps">${steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
        ${input('token', t.token, { ph: '123456:ABC…', note: c.token ? t.keep(c.token) : '' })}
        ${input('chat', t.chat, { value: c.chat || '', ph: '-1001234567890', note: t.chatHelp })}`;
    } else {
      body = `<ol class="al-steps">${steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
        ${input('url', t.url, { ph: 'https://…', note: c.url ? t.keep(c.url) : '' })}
        ${t.help[type] ? `<p class="cx-fine"><a href="${t.help[type]}" target="_blank" rel="noopener">${esc(t.helpLink)}</a></p>` : ''}`;
    }
    return `<h4 class="al-form-h">${mark(type)}<span>${esc(t.names[type])}</span></h4>
      ${body}
      <p class="al-err hidden" role="alert"></p>
      <div class="al-form-acts"><button type="button" data-a="cancel">${esc(t.cancel)}</button><button type="submit" class="primary" data-a="save">${esc(t.saveTest)}</button></div>`;
  }
  const val = (k) => /** @type {HTMLInputElement | null} */ (el.querySelector(`#al-form [data-f="${k}"]`))?.value.trim() || '';
  const others = (type) => cfg.channels.filter((c) => c.type !== type); // as the server shows them: saved secrets stay
  const showErr = (msg) => { const p = el.querySelector('.al-err'); if (!p) return; p.textContent = msg; p.classList.toggle('hidden', !msg); };
  // An error, said under the panel (a toast would sit under the Settings window's backdrop).
  const say = (msg) => { const p = el.querySelector('.al-msg'); p.textContent = msg; p.classList.toggle('hidden', !msg); };
  const focusSoon = (sel) => requestAnimationFrame(() => /** @type {HTMLElement | null} */ (el.querySelector(sel))?.focus());

  /** One channel's test: its row says how it went (and stays saying it). */
  async function test(type) {
    const b = /** @type {HTMLButtonElement | null} */ (el.querySelector(`[data-a="test"][data-type="${type}"]`));
    if (b) { b.disabled = true; b.setAttribute('aria-busy', 'true'); b.querySelector('span').textContent = t.sending; }
    try {
      const r = (await api('POST', '/api/alerts/test', { type })).results?.find((x) => x.type === type);
      results[type] = r && !r.ok ? { ok: false, text: t.failed(r.error) } : { ok: true, text: t.sent };
    } catch (err) { results[type] = { ok: false, text: t.failed(err.message) }; }
    render();
    return results[type];
  }

  el.addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = editing;
    const btn = /** @type {HTMLButtonElement} */ (el.querySelector('[data-a="save"]'));
    btn.disabled = true;
    showErr('');
    const ch = type === 'ntfy' ? { type, topic: val('topic'), server: val('server') }
      : type === 'telegram' ? { type, token: val('token'), chat: val('chat') }
        : { type, url: val('url') };
    try {
      cfg = await api('PUT', '/api/alerts', { channels: [...others(type), ch], lang: lang() });
    } catch (err) { showErr(err.message); btn.disabled = false; return; }
    editing = '';
    await test(type); // renders: the form closes and the new row says whether the test arrived (a toast would sit under this dialog's backdrop)
    focusSoon(`[data-a="test"][data-type="${type}"]`);
  });

  el.addEventListener('click', async (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    const k = target.closest('[data-open]')?.getAttribute('data-open');
    if (k) {
      editing = editing === k ? '' : k; // the same card again folds it away
      render();
      // Its steps from the top (on a phone the form opens below all five cards), and the first field ready to type in
      if (editing) requestAnimationFrame(() => { el.querySelector('#al-form').scrollIntoView({ block: 'start', behavior: 'smooth' }); /** @type {HTMLElement} */ (el.querySelector('#al-form input:not([type=hidden])')).focus({ preventScroll: true }); });
      return;
    }
    const b = target.closest('[data-a]');
    const a = b?.getAttribute('data-a'), type = b?.getAttribute('data-type') || '';
    if (!a) return;
    if (a === 'cancel') { const was = editing; editing = ''; render(); return focusSoon(`[data-open="${was}"]`); }
    if (a === 'copy') {
      await copyText(el.querySelector('[data-topic]').textContent).catch(() => {});
      const s = b.querySelector('span'); s.textContent = t.copied; setTimeout(() => (s.textContent = t.copy), 1500);
      return;
    }
    if (a === 'test') return test(type);
    try {
      if (a === 'remove') {
        if (!(await confirm({ title: t.removeAsk(t.names[type]), body: t.removeBody, ok: t.remove, danger: true }))) return;
        cfg = await api('PUT', '/api/alerts', { channels: others(type), lang: lang() });
        delete results[type];
        render();
        focusSoon(`[data-open="${type}"]`);
      }
      if (a === 'pause' || a === 'pauseDay' || a === 'resume') {
        const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(8, 0, 0, 0);
        const minutes = a === 'pause' ? 60 : a === 'pauseDay' ? Math.ceil((+tomorrow - Date.now()) / 60_000) : 0;
        cfg = await api('POST', '/api/alerts/snooze', { minutes });
        render();
      }
    } catch (err) { say(err.message); }
  });
  // The messages' language: saved as soon as it's picked (with no channel yet, it's sent with the first one).
  el.addEventListener('change', async (e) => {
    const s = /** @type {HTMLSelectElement} */ (e.target);
    if (s.getAttribute('data-f') !== 'lang') return;
    picked = s.value;
    if (!cfg.channels.length) return;
    try { cfg = await api('PUT', '/api/alerts', { channels: cfg.channels, lang: s.value }); } catch (err) { say(err.message); }
  });
  return { load };
}
