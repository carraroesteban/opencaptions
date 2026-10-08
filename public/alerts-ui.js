// Settings → Alerts: where the server sends a message when something goes wrong and nobody is watching the
// dashboard (src/alerts.js). The card shows what triggers an alert and the destinations as tiles (connected or
// not); a destination is set up in its own dialog, with room for its steps, and tested right after it's saved.
// ntfy is the easy one: a free app, no account, a topic name generated here.
import { LANG } from '/i18n.js';
import { esc } from '/common.js';
import { icon } from '/illustrations.js';

const T = {
  es: {
    whenH: 'Te avisamos cuando',
    when: [['mic', 'Una sala se queda sin sonido'], ['sparkle', 'La IA falla más de un minuto'], ['clock', 'Una charla se pasa 5 minutos'], ['offline', 'Se corta internet'], ['link', 'La dirección pública deja de funcionar']],
    fixed: 'Y otra vez cuando se resuelve.',
    whereH: 'Adónde',
    names: { ntfy: 'App ntfy', telegram: 'Telegram', slack: 'Slack', discord: 'Discord', webhook: 'Otro servicio (webhook)' },
    descs: {
      ntfy: 'Recomendado: gratis, sin cuenta, en iPhone, Android y computadora.',
      telegram: 'Un bot que le escribe a vos o al grupo del equipo.',
      slack: 'Un mensaje en el canal del equipo.',
      discord: 'Un mensaje en un canal del servidor.',
      webhook: 'Un POST con JSON, para Zapier, Make, n8n o un script propio.',
    },
    on: 'Conectado', setUp: 'Configurar',
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
    saveTest: 'Guardar y probar', save: 'Guardar', cancel: 'Cancelar', remove: 'Desconectar', testAll: 'Probar todos',
    tested: (t) => `Listo: le mandamos una prueba a ${t}. Fijate en el celular.`,
    savedBad: (t, e) => `Quedó guardado, pero la prueba a ${t} no llegó: ${e}`,
    testBad: (t, e) => `No se pudo enviar a ${t}: ${e}`,
    removed: (t) => `${t}: desconectado.`,
    pause: 'Pausar 1 hora', pauseDay: 'Pausar hasta mañana', resume: 'Reanudar',
    paused: (h) => `Pausadas hasta las ${h}`,
  },
  en: {
    whenH: 'You get a message when',
    when: [['mic', 'A room loses its sound'], ['sparkle', 'The AI fails for over a minute'], ['clock', 'A talk runs 5 minutes over'], ['offline', 'The internet drops'], ['link', 'The public address stops working']],
    fixed: 'And another one when it’s fixed.',
    whereH: 'Where they go',
    names: { ntfy: 'ntfy app', telegram: 'Telegram', slack: 'Slack', discord: 'Discord', webhook: 'Another service (webhook)' },
    descs: {
      ntfy: 'Recommended: free, no account, on iPhone, Android and desktop.',
      telegram: 'A bot that messages you or the team’s group.',
      slack: 'A message in the team’s channel.',
      discord: 'A message in a channel of your server.',
      webhook: 'A JSON POST, for Zapier, Make, n8n or your own script.',
    },
    on: 'Connected', setUp: 'Set up',
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
    saveTest: 'Save and send a test', save: 'Save', cancel: 'Cancel', remove: 'Disconnect', testAll: 'Test all',
    tested: (t) => `Done: a test went to ${t}. Check your phone.`,
    savedBad: (t, e) => `Saved, but the test to ${t} didn’t arrive: ${e}`,
    testBad: (t, e) => `Couldn’t send to ${t}: ${e}`,
    removed: (t) => `${t}: disconnected.`,
    pause: 'Pause for 1 hour', pauseDay: 'Pause until tomorrow', resume: 'Resume',
    paused: (h) => `Paused until ${h}`,
  },
};
const t = T[LANG] || T.en;
const KINDS = ['ntfy', 'telegram', 'slack', 'discord', 'webhook'];
const ICON = { ntfy: 'phone', telegram: 'chat', slack: 'chat', discord: 'chat', webhook: 'link' };
const newTopic = () => `opencaptions-${[...crypto.getRandomValues(new Uint8Array(10))].map((b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('')}`;

/**
 * @param {HTMLElement} el
 * @param {{ api: (m: string, u: string, b?: any) => Promise<any>, toast: (msg: string, o?: any) => void }} ctx
 */
export function alertsPanel(el, { api, toast }) {
  el.classList.add('connect', 'alerts');
  let cfg = { lang: LANG === 'es' ? 'es' : 'en', channels: [], snoozeUntil: 0 };
  const has = (type) => cfg.channels.find((c) => c.type === type);
  let picked = ''; // a language chosen before any destination exists
  const lang = () => picked || (cfg.channels.length ? cfg.lang : LANG === 'es' ? 'es' : 'en'); // not set up yet: the dashboard's
  // One dialog, filled with the destination being set up.
  const dlg = Object.assign(document.createElement('dialog'), { className: 'al-dlg connect' });
  dlg.setAttribute('aria-labelledby', 'al-dlg-title');
  document.body.append(dlg);

  async function load() {
    try { cfg = await api('GET', '/api/alerts'); } catch { return; }
    render();
  }

  function render() {
    const tile = (k) => {
      const c = has(k);
      const detail = c ? (c.topic || c.chat || c.url || '') : '';
      return `<button type="button" class="card tool al-tile${c ? ' on' : ''}" data-open="${k}">
        <b>${icon(ICON[k])}<span>${esc(t.names[k])}</span></b>
        <span>${esc(t.descs[k])}</span>
        ${c ? `<span class="al-state ok">${icon('check')}${esc(t.on)}${detail ? ` <code>${esc(detail)}</code>` : ''}</span>` : `<span class="al-state">${esc(t.setUp)} →</span>`}
      </button>`;
    };
    const on = cfg.channels.length > 0;
    el.innerHTML = `
      <div class="al-when"><p>${esc(t.whenH)}</p><ul>${t.when.map(([i, s]) => `<li>${icon(i)}<span>${esc(s)}</span></li>`).join('')}</ul><p class="cx-fine">${esc(t.fixed)}</p></div>
      <h4 class="al-h">${esc(t.whereH)}</h4>
      <div class="tools al-grid">${KINDS.map(tile).join('')}</div>
      <div class="al-foot">
        <label class="field">${esc(t.lang)}<select data-f="lang"><option value="es" ${lang() === 'es' ? 'selected' : ''}>Español</option><option value="en" ${lang() === 'en' ? 'selected' : ''}>English</option></select></label>
        <div class="cx-row">${on ? `<button type="button" data-a="test">${esc(t.testAll)}</button>` : ''}${on ? (cfg.snoozeUntil
          ? `<span class="chip warn">${esc(t.paused(new Date(cfg.snoozeUntil).toLocaleString(LANG, { weekday: 'short', hour: '2-digit', minute: '2-digit' })))}</span><button type="button" class="cx-link" data-a="resume">${esc(t.resume)}</button>`
          : `<button type="button" class="cx-link" data-a="pause">${esc(t.pause)}</button><button type="button" class="cx-link" data-a="pauseDay">${esc(t.pauseDay)}</button>`) : ''}</div>
      </div>`;
  }

  // ---------- one destination, in its dialog ----------
  let editing = '';
  function open(type) {
    editing = type;
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
    dlg.innerHTML = `<form method="dialog" class="u-stack12">
      <h3 class="al-title" id="al-dlg-title">${icon(ICON[type])}<span>${esc(t.names[type])}</span></h3>
      <p class="muted-note u-m0">${esc(t.descs[type])}</p>
      ${body}
      <p class="al-err hidden" role="alert"></p>
      <div class="dlg-actions">${has(type) ? `<button type="button" class="cx-link al-remove" data-a="remove">${esc(t.remove)}</button>` : ''}<button value="cancel" formnovalidate>${esc(t.cancel)}</button><button type="submit" class="primary" data-a="save">${esc(t.saveTest)}</button></div>
    </form>`;
    dlg.showModal();
    /** @type {HTMLElement | null} */ (dlg.querySelector('input:not([type=hidden])'))?.focus();
  }
  const val = (k) => /** @type {HTMLInputElement | null} */ (dlg.querySelector(`[data-f="${k}"]`))?.value.trim() || '';
  const others = () => cfg.channels.filter((c) => c.type !== editing); // as the server shows them: saved secrets stay
  const showErr = (msg) => { const p = dlg.querySelector('.al-err'); p.textContent = msg; p.classList.toggle('hidden', !msg); };

  dlg.addEventListener('submit', async (e) => {
    if (/** @type {SubmitEvent} */ (e).submitter?.getAttribute('value') === 'cancel') return;
    e.preventDefault();
    const btn = /** @type {HTMLButtonElement} */ (dlg.querySelector('[data-a="save"]'));
    btn.disabled = true;
    showErr('');
    const type = editing, name = t.names[type];
    const ch = type === 'ntfy' ? { type, topic: val('topic'), server: val('server') }
      : type === 'telegram' ? { type, token: val('token'), chat: val('chat') }
        : { type, url: val('url') };
    try {
      cfg = await api('PUT', '/api/alerts', { channels: [...others(), ch], lang: lang() });
    } catch (err) { showErr(err.message); btn.disabled = false; return; }
    render();
    try {
      const r = (await api('POST', '/api/alerts/test', { type })).results?.[0];
      if (r && !r.ok) { showErr(t.savedBad(name, r.error)); btn.disabled = false; return; } // saved; fix and try again
    } catch (err) { showErr(t.savedBad(name, err.message)); btn.disabled = false; return; }
    dlg.close();
    toast(t.tested(name), { ms: 7000 });
  });
  dlg.addEventListener('click', async (e) => {
    if (e.target === dlg) return dlg.close(); // a click on the backdrop
    const a = /** @type {HTMLElement} */ (e.target).closest('[data-a]')?.getAttribute('data-a');
    if (a === 'copy') {
      await navigator.clipboard.writeText(dlg.querySelector('[data-topic]').textContent).catch(() => {});
      const s = dlg.querySelector('[data-a="copy"] span'); s.textContent = t.copied; setTimeout(() => (s.textContent = t.copy), 1500);
    }
    if (a === 'remove') {
      try { cfg = await api('PUT', '/api/alerts', { channels: others(), lang: lang() }); } catch (err) { return showErr(err.message); }
      dlg.close();
      render();
      toast(t.removed(t.names[editing]));
    }
  });

  // ---------- the card: open a destination, language, test, pause ----------
  el.addEventListener('click', async (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    const k = target.closest('[data-open]')?.getAttribute('data-open');
    if (k) return open(k);
    const a = target.closest('[data-a]')?.getAttribute('data-a');
    if (!a) return;
    try {
      if (a === 'test') {
        const { results } = await api('POST', '/api/alerts/test', {});
        for (const r of results) toast(r.ok ? t.tested(t.names[r.type] || r.type) : t.testBad(t.names[r.type] || r.type, r.error), { error: !r.ok, ms: 9000 });
      }
      if (a === 'pause' || a === 'pauseDay' || a === 'resume') {
        const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(8, 0, 0, 0);
        const minutes = a === 'pause' ? 60 : a === 'pauseDay' ? Math.ceil((+tomorrow - Date.now()) / 60_000) : 0;
        cfg = await api('POST', '/api/alerts/snooze', { minutes });
        render();
      }
    } catch (err) { toast(err.message, { error: true }); }
  });
  // The messages' language: saved as soon as it's picked (with no destination yet, it's sent with the first one).
  el.addEventListener('change', async (e) => {
    const s = /** @type {HTMLSelectElement} */ (e.target);
    if (s.getAttribute('data-f') !== 'lang') return;
    picked = s.value;
    if (!cfg.channels.length) return;
    try { cfg = await api('PUT', '/api/alerts', { channels: cfg.channels, lang: s.value }); } catch (err) { toast(err.message, { error: true }); }
  });
  return { load };
}
