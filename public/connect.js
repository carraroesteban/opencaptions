// The two things a new install needs from the organizer, as browser controls instead of terminal steps. Used by
// the welcome wizard and the dashboard's Settings.
//   keyPanel    → paste a Gemini API key; the server checks it with Google and saves it (POST/PUT /api/ai/key)
//   tunnelPanel → a public HTTPS address through Cloudflare, with one click (POST /api/tunnel)
import { LANG } from '/i18n.js';
import { esc } from '/common.js';
import { icon } from '/illustrations.js';

const T = {
  es: {
    // key
    keyNone: 'Sin API key: los subtítulos son simulados.',
    keyOn: (l4, src) => `Conectado a Gemini con la key ••••${l4}${src === 'env' ? ' (del archivo .env)' : ''}.`,
    vertex: 'Conectado a Gemini por Google Cloud Vertex AI (configurado en .env).',
    s1: 'Abrí Google AI Studio, entrá con una cuenta de Google y tocá «Create API key».',
    s1Link: 'Abrir AI Studio',
    s2: 'Copiá la key y pegala acá:',
    keyPh: 'AQ.…',
    check: 'Comprobar y conectar',
    checking: 'Comprobando con Google…',
    replace: 'Cambiar la key',
    remove: 'Quitar la key',
    removeAsk: '¿Quitar la API key guardada? Si no hay otra en .env, los subtítulos pasan a ser simulados.',
    saved: 'Listo: los subtítulos ahora vienen de Gemini.',
    savedLocal: 'Key guardada. Las salas siguen con la IA de esta computadora; se usa cuando pasen a Gemini.',
    quota: 'Conectado, pero esta key no tiene cuota gratis ahora: los subtítulos empiezan cuando se renueve (o activá la facturación en AI Studio).',
    format: 'Eso no parece una API key de Gemini: copiala entera desde AI Studio, sin espacios (empieza con «AQ.», o con «AIza» si es más vieja).',
    invalid: 'Google dice que la key no es válida. Copiala de nuevo desde AI Studio, completa.',
    forbidden: 'La key existe pero no puede usar Gemini. En AI Studio, creala en un proyecto nuevo.',
    offline: 'No se pudo contactar a Google. ¿Esta computadora tiene internet?',
    saveAnyway: 'Guardarla igual',
    error: 'Google respondió con un error. Probá de nuevo en un minuto.',
    cost: 'Gemini cobra por uso: unos US$ 2 por hora por sala (la cuota gratis alcanza para probar).',
    // tunnel
    tIntro: 'Para que los celulares lleguen a los subtítulos desde cualquier red, con HTTPS. Gratis, a través de Cloudflare: no hay que tocar el router ni comprar nada.',
    tStart: 'Crear una dirección pública',
    tNote: 'La dirección cambia cada vez que se reinicia OpenCaptions: imprimí los QR después de crearla y no reinicies durante el evento. Alcanza para unas 200 personas conectadas a la vez; para eventos más grandes usá tu propio dominio.',
    tOwn: 'Usar mi propio dominio (dirección fija)',
    tOwnHelp: 'En Cloudflare: Zero Trust → Networks → Tunnels → Create a tunnel. Agregá un «public hostname» que apunte a',
    tToken: 'Token del túnel',
    tTokenKept: 'Token guardado (dejalo vacío para usar el mismo)',
    tHost: 'Dirección pública',
    tHostPh: 'subtitulos.tuevento.com',
    tConnect: 'Conectar',
    installing: 'Descargando el conector de Cloudflare (una sola vez, unos 40 MB)…',
    starting: 'Iniciando…',
    waiting: 'Preparando la dirección… suele tardar uno o dos minutos.',
    notYet: 'La dirección todavía no responde. Si sigue así, revisá que la red del lugar permita conexiones salientes.',
    ready: 'Dirección pública lista',
    restarted: 'La dirección cambió desde que se imprimieron los QR (se reinició OpenCaptions o la conexión): volvé a imprimirlos.', kit: 'Abrir el kit de QR',
    copy: 'Copiar',
    copied: 'Copiado',
    stop: 'Apagar',
    stopAsk: '¿Apagar la dirección pública? Los celulares que la usan dejan de ver los subtítulos.',
    retry: 'Probar de nuevo',
    failed: 'No se pudo crear la dirección:',
    lan: (u) => `Sin dirección pública, los celulares conectados al mismo Wi-Fi que esta computadora usan ${u}`,
    fixed: (u) => `Los QR apuntan a ${u} (configurado en el servidor).`,
  },
  en: {
    keyNone: 'No API key: captions are simulated.',
    keyOn: (l4, src) => `Connected to Gemini with the key ••••${l4}${src === 'env' ? ' (from the .env file)' : ''}.`,
    vertex: 'Connected to Gemini through Google Cloud Vertex AI (set in .env).',
    s1: 'Open Google AI Studio, sign in with a Google account and click “Create API key”.',
    s1Link: 'Open AI Studio',
    s2: 'Copy the key and paste it here:',
    keyPh: 'AQ.…',
    check: 'Check and connect',
    checking: 'Checking with Google…',
    replace: 'Change the key',
    remove: 'Remove the key',
    removeAsk: 'Remove the saved API key? If there’s no other key in .env, captions become simulated.',
    saved: 'Done: captions now come from Gemini.',
    savedLocal: 'Key saved. Rooms keep using this computer’s AI; the key is used when they move to Gemini.',
    quota: 'Connected, but this key has no free quota left right now: captions start when it resets (or turn on billing in AI Studio).',
    format: 'That doesn’t look like a Gemini API key: copy the whole key from AI Studio, with no spaces (it starts with “AQ.”, or “AIza” if it’s older).',
    invalid: 'Google says the key isn’t valid. Copy all of it again from AI Studio.',
    forbidden: 'The key exists but can’t use Gemini. In AI Studio, create it in a new project.',
    offline: 'Couldn’t reach Google. Does this computer have internet?',
    saveAnyway: 'Save it anyway',
    error: 'Google answered with an error. Try again in a minute.',
    cost: 'Gemini is paid by use: about US$ 2 per room per hour (the free quota is enough to try it).',
    tIntro: 'So phones can reach the captions from any network, over HTTPS. Free, through Cloudflare: no router settings, nothing to buy.',
    tStart: 'Create a public address',
    tNote: 'The address changes every time OpenCaptions restarts: print the QR codes after creating it, and don’t restart during the event. Good for about 200 people connected at once; for bigger events use your own domain.',
    tOwn: 'Use my own domain (fixed address)',
    tOwnHelp: 'In Cloudflare: Zero Trust → Networks → Tunnels → Create a tunnel. Add a “public hostname” pointing to',
    tToken: 'Tunnel token',
    tTokenKept: 'Token saved (leave empty to keep it)',
    tHost: 'Public address',
    tHostPh: 'captions.yourevent.com',
    tConnect: 'Connect',
    installing: 'Downloading Cloudflare’s connector (once, about 40 MB)…',
    starting: 'Starting…',
    waiting: 'Getting the address ready… this usually takes a minute or two.',
    notYet: 'The address isn’t answering yet. If it stays like this, check that the venue’s network allows outgoing connections.',
    ready: 'Public address ready',
    restarted: 'The address changed since the QR codes were printed (OpenCaptions or the connection restarted): print them again.', kit: 'Open the QR kit',
    copy: 'Copy',
    copied: 'Copied',
    stop: 'Turn off',
    stopAsk: 'Turn off the public address? Phones using it stop getting captions.',
    retry: 'Try again',
    failed: 'Couldn’t create the address:',
    lan: (u) => `Without a public address, phones on the same Wi-Fi as this computer use ${u}`,
    fixed: (u) => `QR codes point to ${u} (set on the server).`,
  },
};
const t = T[LANG] || T.en;

/**
 * @typedef {{ api: (method: string, url: string, body?: any) => Promise<any>, confirm?: (msg: string) => Promise<boolean>, onChange?: (s: any) => void }} Ctx
 */

/**
 * Gemini API key: status, and a form to paste one (checked before saving).
 * @param {HTMLElement} el
 * @param {Ctx} ctx
 * @returns {{ update: (setup: any) => void }}
 */
export function keyPanel(el, { api, confirm = async (m) => window.confirm(m), onChange = () => {} }) {
  let setup = null;
  let open = false;
  let msg = { text: '', cls: '' };
  let pending = '';
  let draft = ''; // what was pasted, kept when the check fails so it can be fixed instead of pasted again
  el.classList.add('connect');
  function render() {
    const ai = setup?.ai || {};
    let html = '';
    if (ai.vertex) html = `<p class="cx-status ok">${icon('check')}<span>${esc(t.vertex)}</span></p>`;
    else if (ai.set) {
      html = `<p class="cx-status ok">${icon('check')}<span>${esc(t.keyOn(ai.last4, ai.source))}</span></p>`;
      if (!open) html += `<div class="cx-row"><button type="button" data-cx="open">${esc(t.replace)}</button>${ai.source === 'dashboard' ? `<button type="button" class="cx-link" data-cx="remove">${esc(t.remove)}</button>` : ''}</div>`;
    } else html = `<p class="cx-status warn">${icon('alert')}<span>${esc(t.keyNone)}</span></p>`;
    if (!ai.vertex && (open || !ai.set)) {
      html += `<ol class="cx-steps">
        <li>${esc(t.s1)} <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">${esc(t.s1Link)} ↗</a></li>
        <li>${esc(t.s2)}
          <form class="cx-row" data-cx="form"><input name="key" type="password" autocomplete="off" spellcheck="false" placeholder="${esc(t.keyPh)}" aria-label="API key" required /><button class="primary" type="submit">${esc(t.check)}</button></form>
        </li>
      </ol>
      <p class="cx-fine">${esc(t.cost)}</p>`;
    }
    if (msg.text) html += `<p class="cx-msg ${msg.cls}" role="status">${esc(msg.text)}${pending ? ` <button type="button" class="cx-link" data-cx="force">${esc(t.saveAnyway)}</button>` : ''}</p>`;
    el.innerHTML = html;
    const input = /** @type {HTMLInputElement | null} */ (el.querySelector('input[name=key]'));
    if (input && draft) input.value = draft;
  }
  async function save(key, force = false) {
    msg = { text: t.checking, cls: '' };
    pending = '';
    render();
    try {
      const r = await api('PUT', '/api/ai/key', { key, force });
      setup = { ...setup, ai: r.key, engine: r.engine };
      open = false;
      draft = '';
      msg = r.check === 'quota' ? { text: t.quota, cls: 'warn' } : { text: r.engine === 'gemini' ? t.saved : t.savedLocal, cls: 'ok' };
      onChange(setup);
    } catch (e) {
      const code = e.body?.code || '';
      msg = { text: t[code] || e.message || t.error, cls: 'bad' };
      if (code === 'offline') pending = key;
    }
    render();
  }
  el.addEventListener('submit', (e) => {
    e.preventDefault();
    const key = /** @type {HTMLFormElement} */ (e.target).key.value.trim();
    draft = key;
    // Only copy-paste slips here (same rule as src/aikey.js): new keys start with AQ., older ones with AIza; Google decides.
    if (!/^[\w.-]{30,300}$/.test(key)) { msg = { text: t.format, cls: 'bad' }; pending = ''; return render(); }
    save(key);
  });
  // The panel is redrawn with the server's status every few seconds (not while you're in it): keep what was typed.
  el.addEventListener('input', (e) => { const i = /** @type {HTMLInputElement} */ (e.target); if (i.name === 'key') draft = i.value; });
  el.addEventListener('click', async (e) => {
    const a = /** @type {HTMLElement} */ (e.target).closest('[data-cx]')?.getAttribute('data-cx');
    if (a === 'open') { open = true; msg = { text: '', cls: '' }; render(); el.querySelector('input')?.focus(); }
    if (a === 'force' && pending) save(pending, true);
    if (a === 'remove' && (await confirm(t.removeAsk))) {
      try { const r = await api('DELETE', '/api/ai/key'); setup = { ...setup, ai: r.key, engine: r.engine }; msg = { text: '', cls: '' }; onChange(setup); } catch (err) { msg = { text: err.message, cls: 'bad' }; }
      render();
    }
  });
  return { update(s) { setup = s; if (!el.contains(document.activeElement)) render(); } };
}

/**
 * Public address: start a quick tunnel (or one on your own domain), see when it's reachable, turn it off.
 * @param {HTMLElement} el
 * @param {Ctx} ctx
 * @returns {{ update: (setup: any) => void }}
 */
export function tunnelPanel(el, { api, confirm = async (m) => window.confirm(m), onChange = () => {} }) {
  let setup = null;
  let err = '';
  let lastUrl = '';
  let changed = false;
  el.classList.add('connect');
  function render() {
    const tu = setup?.tunnel || { state: 'off' };
    const pub = setup?.publicUrl || location.origin;
    let html = '';
    if (tu.state === 'off') {
      html += `<p class="cx-fine u-mt0">${esc(t.tIntro)}</p>
        <div class="cx-row"><button type="button" class="primary" data-cx="quick">${icon('cloud')}${esc(t.tStart)}</button></div>
        <p class="cx-fine">${esc(t.tNote)}</p>
        <details class="cx-own"><summary>${esc(t.tOwn)}</summary>
          <p class="cx-fine">${esc(t.tOwnHelp)} <code>http://localhost:${esc(setup?.port || location.port || '8080')}</code></p>
          <form data-cx="own" class="cx-grid">
            <label class="field">${esc(t.tToken)}<input name="token" type="password" autocomplete="off" spellcheck="false" placeholder="${esc(setup?.tunnelTokenSaved ? t.tTokenKept : 'eyJ…')}" /></label>
            <label class="field">${esc(t.tHost)}<input name="host" autocomplete="off" spellcheck="false" placeholder="${esc(t.tHostPh)}" value="${esc(tu.host || '')}" /></label>
            <div class="cx-row"><button type="submit">${esc(t.tConnect)}</button></div>
          </form>
        </details>`;
      if (setup?.publicUrlSource === 'config') html = `<p class="cx-status ok">${icon('check')}<span>${esc(t.fixed(pub))}</span></p>` + html;
      else if (setup?.lanUrl) html += `<p class="cx-fine">${esc(t.lan(setup.lanUrl))}</p>`;
    } else if (tu.state === 'installing' || tu.state === 'starting') {
      html = `<p class="cx-status">${icon('cloud')}<span>${esc(tu.state === 'installing' ? t.installing : t.starting)}</span></p>`;
    } else if (tu.state === 'on' && tu.reachable !== true) {
      html = `<p class="cx-status">${icon('cloud')}<span>${esc(tu.reachable === false ? t.notYet : t.waiting)}</span></p>`;
    } else if (tu.state === 'on') {
      html = `<p class="cx-status ok">${icon('check')}<span>${esc(t.ready)}</span></p>
        <div class="cx-url"><a href="${esc(tu.url)}" target="_blank" rel="noopener">${esc(tu.url)}</a></div>
        ${changed || setup?.tunnelMoved ? `<p class="cx-msg warn">${esc(t.restarted)} <a href="/kit.html" target="_blank">${esc(t.kit)}</a></p>` : ''}
        <div class="cx-row"><button type="button" data-cx="copy">${esc(t.copy)}</button><button type="button" class="cx-link" data-cx="stop">${esc(t.stop)}</button></div>
        ${tu.mode === 'quick' ? `<p class="cx-fine">${esc(t.tNote)}</p>` : ''}`;
    } else if (tu.state === 'error') {
      html = `<p class="cx-msg bad">${esc(t.failed)} ${esc(tu.error)}</p><div class="cx-row"><button type="button" class="primary" data-cx="retry">${esc(t.retry)}</button><button type="button" class="cx-link" data-cx="stop">${esc(t.stop)}</button></div>`;
    }
    if (err) html += `<p class="cx-msg bad" role="alert">${esc(err)}</p>`;
    el.innerHTML = html;
  }
  async function start(body) {
    err = '';
    try { const st = await api('POST', '/api/tunnel', body); setup = { ...setup, tunnel: st }; onChange(setup); } catch (e) { err = e.message; }
    render();
  }
  el.addEventListener('click', async (e) => {
    const a = /** @type {HTMLElement} */ (e.target).closest('[data-cx]')?.getAttribute('data-cx');
    const tu = setup?.tunnel || {};
    if (a === 'quick') start({ mode: 'quick' });
    if (a === 'retry') start({ mode: tu.mode === 'token' ? 'token' : 'quick', host: tu.host });
    if (a === 'stop' && (tu.state !== 'on' || (await confirm(t.stopAsk)))) start({ mode: 'off' });
    if (a === 'copy') {
      try { await navigator.clipboard.writeText(tu.url); /** @type {HTMLElement} */ (e.target).closest('button').textContent = t.copied; } catch { /* the link is selectable */ }
    }
  });
  el.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = /** @type {HTMLFormElement} */ (e.target);
    start({ mode: 'token', token: f.token.value.trim(), host: f.host.value.trim() });
  });
  return {
    update(s) {
      const url = s?.tunnel?.state === 'on' ? s.tunnel.url : '';
      if (url && lastUrl && url !== lastUrl && s.tunnel.mode === 'quick') changed = true;
      if (url) lastUrl = url;
      if (s?.tunnel?.state === 'off') { changed = false; lastUrl = ''; }
      const same = JSON.stringify(s?.tunnel) === JSON.stringify(setup?.tunnel) && s?.publicUrl === setup?.publicUrl;
      setup = s;
      if (!same && !el.contains(document.activeElement)) render();
      else if (!el.innerHTML) render();
    },
  };
}
