// Signing in to the dashboard and the welcome wizard (server side: src/auth.js, src/oidc.js). The password goes to
// the server once; the browser then holds only an HttpOnly session cookie, which scripts on the page can't read.
// Nothing is kept in localStorage and no password stays in a link: an old ?token= link, or a password a previous
// version stored in this browser, is swapped for a session and forgotten.
import { LANG } from '/i18n.js';
import { store } from '/common.js';

const T = {
  es: {
    title: 'Ingresá al panel',
    lead: 'Este panel controla el evento. Ingresá con la contraseña de administración o la del equipo.',
    password: 'Contraseña',
    device: 'Nombre de este dispositivo',
    deviceHint: 'Aparece en Ajustes → Acceso y en el Historial, para saber quién hizo cada cambio.',
    go: 'Ingresar',
    or: 'o',
    sso: (n) => `Ingresar con ${n}`,
    codeTitle: 'Código de verificación',
    codeLead: 'Abrí la app de autenticación (Google Authenticator, 1Password, Authy…) y escribí el código de 6 dígitos de OpenCaptions.',
    codeLabel: 'Código',
    verify: 'Verificar',
    back: 'Usar otra contraseña',
    bad: 'Esa contraseña no es correcta. Copiala completa, sin espacios.',
    badCode: 'Ese código no es correcto o ya se usó. Esperá el siguiente y probá de nuevo.',
    slow: 'Demasiados intentos fallidos. Esperá 10 minutos.',
    offline: 'No se pudo contactar al servidor. ¿Sigue encendido?',
    where: 'Dónde encontrar la contraseña',
    w1: 'En la ventana donde arrancaste OpenCaptions: las líneas <b>Admin token</b> (todo) y <b>Crew token</b> (solo los controles en vivo).',
    w2: 'Con Docker, en una terminal dentro de la carpeta de OpenCaptions:',
    w3: 'En la computadora del servidor no hace falta: abrí <b>http://localhost:8080/admin.html</b> ahí (sin Docker).',
    w4: 'Un administrador puede cambiar las contraseñas en Ajustes → Acceso.',
  },
  en: {
    title: 'Sign in to the dashboard',
    lead: 'This dashboard runs the event. Sign in with the admin password or the crew password.',
    password: 'Password',
    device: 'Name this device',
    deviceHint: 'Shown in Settings → Access and in the History, so everyone knows who changed what.',
    go: 'Sign in',
    or: 'or',
    sso: (n) => `Sign in with ${n}`,
    codeTitle: 'Verification code',
    codeLead: 'Open your authenticator app (Google Authenticator, 1Password, Authy…) and type the 6-digit OpenCaptions code.',
    codeLabel: 'Code',
    verify: 'Verify',
    back: 'Use another password',
    bad: 'That password isn’t right. Copy all of it, with no spaces.',
    badCode: 'That code isn’t right or was already used. Wait for the next one and try again.',
    slow: 'Too many failed attempts. Wait 10 minutes.',
    offline: 'Couldn’t reach the server. Is it still running?',
    where: 'Where to find the password',
    w1: 'In the window where you started OpenCaptions: the <b>Admin token</b> line (everything) and the <b>Crew token</b> line (live controls only).',
    w2: 'With Docker, in a terminal inside the OpenCaptions folder:',
    w3: 'On the server computer itself you don’t need it: open <b>http://localhost:8080/admin.html</b> there (without Docker).',
    w4: 'An admin can change the passwords in Settings → Access.',
  },
};
const t = T[LANG] || T.en;

/** "Chrome on Mac": a starting point for the device's name. */
export function guessDevice() {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} ${LANG === 'es' ? 'en' : 'on'} ${os}` : browser;
}
const savedDevice = () => store.get('device.name', '') || guessDevice();

async function login(body) {
  const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

/** Who this browser is signed in as: { role: 'admin' | 'crew' | null, label, via, twoFactor, sso }. */
export const whoAmI = () => fetch('/api/auth/me').then((r) => r.json());

export async function signOut() {
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  location.reload();
}

/**
 * Make sure this browser is signed in, asking if needed. Resolves with whoAmI().
 * @returns {Promise<any>}
 */
export async function ensureSignedIn() {
  // A password handed over in a link (?token=, the Docker link) or kept by an older version: use it once, forget it.
  const qs = new URLSearchParams(location.search);
  const handed = qs.get('token') || store.get('admin.token', '');
  const message = qs.get('signin') || '';
  if (qs.has('token') || qs.has('signin')) {
    qs.delete('token');
    qs.delete('signin');
    history.replaceState(null, '', location.pathname + (qs.toString() ? `?${qs}` : '') + location.hash);
  }
  store.set('admin.token', '');
  let me = await whoAmI().catch(() => ({ role: null }));
  if (me.role) return me;
  let prefill = '';
  if (handed) {
    const r = await login({ password: handed, device: savedDevice() });
    if (r.status === 200) return whoAmI();
    if (r.body.need === 'code') prefill = handed;
  }
  await signInScreen({ message, password: prefill });
  me = await whoAmI();
  return me;
}

/**
 * The sign-in screen. Resolves once the server has set the session cookie.
 * @param {{ message?: string, password?: string }} [o]
 */
export async function signInScreen({ message = '', password = '' } = {}) {
  const cfg = await fetch('/api/auth/config').then((r) => r.json()).catch(() => ({ password: true, sso: null }));
  const dlg = document.createElement('dialog');
  dlg.className = 'signin';
  document.body.append(dlg);
  dlg.addEventListener('cancel', (e) => e.preventDefault()); // Esc would leave an empty dashboard behind
  let pw = password;
  const ssoButton = cfg.sso ? `<button type="button" class="sso">${t.sso(cfg.sso)}</button>` : '';
  const help = `<details><summary>${t.where}</summary>
      <ul style="margin:8px 0 0;padding-left:18px;display:grid;gap:6px">
        <li>${t.w1}</li>
        <li>${t.w2}<pre style="margin:6px 0 0"><code>docker compose logs opencaptions | grep "token"</code></pre></li>
        <li>${t.w3}</li>
        <li>${t.w4}</li>
      </ul>
    </details>`;
  const passwordStep = () => {
    dlg.innerHTML = `<form method="dialog" style="display:grid;gap:14px">
      <h3 style="margin:0">${t.title}</h3>
      <p class="muted-note" style="margin:0">${t.lead}</p>
      <p class="err" role="alert" style="margin:0;color:var(--bad)"></p>
      ${cfg.password ? `<label class="field">${t.password}<input name="pw" type="password" autocomplete="current-password" required spellcheck="false" /></label>
      <label class="field">${t.device}<input name="device" maxlength="60" autocomplete="off" /><small style="color:var(--fg2)">${t.deviceHint}</small></label>
      <div class="dlg-actions"><button class="primary" type="submit">${t.go}</button></div>` : ''}
      ${cfg.sso && cfg.password ? `<p class="muted-note" style="margin:0;text-align:center">${t.or}</p>` : ''}
      ${ssoButton}
      ${cfg.password ? help : ''}
    </form>`;
    const f = dlg.querySelector('form');
    const sso = f.querySelector('.sso');
    if (sso) sso.onclick = () => { location.href = `/auth/oidc/start?device=${encodeURIComponent(f.device?.value.trim() || savedDevice())}`; };
    if (f.device) f.device.value = savedDevice();
    if (f.pw) { f.pw.value = pw; f.pw.focus(); }
    return f;
  };
  const codeStep = () => {
    dlg.innerHTML = `<form method="dialog" style="display:grid;gap:14px">
      <h3 style="margin:0">${t.codeTitle}</h3>
      <p class="muted-note" style="margin:0">${t.codeLead}</p>
      <p class="err" role="alert" style="margin:0;color:var(--bad)"></p>
      <label class="field">${t.codeLabel}<input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" required style="font-size:24px;letter-spacing:.2em" /></label>
      <div class="dlg-actions"><button type="button" class="back">${t.back}</button><button class="primary" type="submit">${t.verify}</button></div>
    </form>`;
    const f = dlg.querySelector('form');
    f.code.focus();
    f.querySelector('.back').onclick = () => { pw = ''; wire(passwordStep()); };
    return f;
  };
  dlg.showModal();
  let device = savedDevice();
  let finish;
  const done = new Promise((resolve) => { finish = resolve; });
  const wire = (f) => {
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = f.querySelector('.err');
      err.textContent = '';
      if (f.pw) { pw = f.pw.value.trim(); device = f.device.value.trim() || guessDevice(); store.set('device.name', device); }
      let r;
      try { r = await login({ password: pw, device, code: f.code?.value }); } catch { err.textContent = t.offline; return; }
      if (r.status === 200) { dlg.close(); dlg.remove(); return finish(r.body); }
      if (r.status === 429) { err.textContent = t.slow; return; }
      if (r.body.need === 'code' && !f.code) return wire(codeStep());
      err.textContent = f.code ? t.badCode : r.body.error === 'wrong password' ? t.bad : r.body.error || t.bad;
      (f.code || f.pw)?.select?.();
    });
  };
  const first = pw ? codeStep() : passwordStep();
  if (message) first.querySelector('.err').textContent = message;
  wire(first);
  return done;
}
