// Settings → Access (admins only): signed-in devices, the three passwords, two-factor sign-in and company sign-in.
// Server side: src/auth.js and the /api/auth/* endpoints. Passwords are never shown, except a new one, once.
import { LANG } from '/i18n.js';
import { esc } from '/common.js';
import { icon } from '/illustrations.js';

const T = {
  es: {
    devices: 'Dispositivos con sesión iniciada',
    devicesHint: 'Cada sesión dura 24 horas. Si alguien perdió un dispositivo o dejó el equipo, cerrale la sesión.',
    thisOne: 'Este dispositivo',
    viaSso: 'cuenta de la organización', viaPw: 'contraseña', viaLink: 'enlace de la sala',
    active: (a) => `activo ${a}`,
    signOut: 'Cerrar sesión', signOutOthers: 'Cerrar todas las demás sesiones',
    signOutAsk: (d) => `¿Cerrar la sesión de “${d}”? Tendrá que volver a ingresar.`,
    othersAsk: '¿Cerrar todas las demás sesiones? Este dispositivo sigue conectado.',
    none: 'Nadie más tiene sesión iniciada.',
    local: 'Estás en la computadora del servidor: acá no hace falta ingresar.',
    passwords: 'Contraseñas',
    pwAdmin: 'Administración', pwAdminD: 'Todo el panel, incluida la configuración.',
    pwCrew: 'Equipo', pwCrewD: 'Solo los controles en vivo: siguiente charla, renombrar, reconectar. Dásela a voluntarios y técnicos.',
    pwIngest: 'Computadoras de las salas', pwIngestD: 'Para enviar el sonido de cada sala. No abre el panel. Más fácil: un enlace para cada computadora, desde Pantallas y QR.',
    change: 'Cambiar', fromEnv: 'definida en .env',
    changeAsk: (w) => `¿Cambiar la contraseña de ${w}? La actual deja de funcionar y se cierran las sesiones que la usaron.`,
    newPw: 'Nueva contraseña. Copiala ahora: no se vuelve a mostrar.', copy: 'Copiar', copied: 'Copiada',
    ingestNote: 'Actualizala en cada computadora de sala (agente o página de sonido). Las que entraron con un enlace de la sala siguen funcionando.',
    tfa: 'Verificación en dos pasos',
    tfaOn: 'Activada: la contraseña de administración también pide un código de la app de autenticación.',
    tfaOff: 'Desactivada. Activala para que una contraseña filtrada no alcance para entrar.',
    tfaStart: 'Activar', tfaStop: 'Desactivar',
    tfaScan: 'Escaneá este QR con la app de autenticación (Google Authenticator, 1Password, Authy…) y escribí el código que muestra.',
    tfaManual: 'O cargá esta clave a mano:',
    tfaCode: 'Código de 6 dígitos', tfaConfirm: 'Confirmar', cancel: 'Cancelar',
    tfaStopAsk: 'Para desactivarla, escribí un código actual de la app.',
    tfaStopLocal: 'Estás en la computadora del servidor: podés desactivarla sin código (por ejemplo, si perdiste el celular).',
    tfaDone: 'Listo: desde ahora la contraseña de administración pide un código.',
    tfaScripts: 'Los scripts con la contraseña de administración solo funcionan en la computadora del servidor.',
    badCode: 'Ese código no es correcto o ya se usó. Esperá el siguiente y probá de nuevo.',
    sso: 'Ingreso con la cuenta de la organización',
    ssoOn: (n) => `Activado: se puede ingresar con ${n}. Quién entra y con qué rol se define en .env (OIDC_ADMINS, OIDC_CREW).`,
    ssoOff: 'Desactivado. Con Google Workspace, Microsoft o cualquier proveedor OpenID Connect, cada persona entra con su propia cuenta.',
    ssoHow: 'Cómo configurarlo',
  },
  en: {
    devices: 'Signed-in devices',
    devicesHint: 'Each session lasts 24 hours. If someone lost a device or left the crew, sign it out.',
    thisOne: 'This device',
    viaSso: 'company account', viaPw: 'password', viaLink: 'room link',
    active: (a) => `active ${a}`,
    signOut: 'Sign out', signOutOthers: 'Sign out every other device',
    signOutAsk: (d) => `Sign out “${d}”? It will have to sign in again.`,
    othersAsk: 'Sign out every other device? This one stays signed in.',
    none: 'Nobody else is signed in.',
    local: 'You’re on the server computer: no sign-in needed here.',
    passwords: 'Passwords',
    pwAdmin: 'Admin', pwAdminD: 'The whole dashboard, setup included.',
    pwCrew: 'Crew', pwCrewD: 'Live controls only: next talk, rename, reconnect. Give it to volunteers and technicians.',
    pwIngest: 'Room computers', pwIngestD: 'For sending each room’s sound. It doesn’t open the dashboard. Easier: a link for each computer, from Screens and QR.',
    change: 'Change', fromEnv: 'set in .env',
    changeAsk: (w) => `Change the ${w} password? The current one stops working, and devices signed in with it are signed out.`,
    newPw: 'New password. Copy it now: it won’t be shown again.', copy: 'Copy', copied: 'Copied',
    ingestNote: 'Update it on every room computer (agent or sound page). Those that opened a room link keep working.',
    tfa: 'Two-factor sign-in',
    tfaOn: 'On: the admin password also needs a code from an authenticator app.',
    tfaOff: 'Off. Turn it on so a leaked password isn’t enough to get in.',
    tfaStart: 'Turn on', tfaStop: 'Turn off',
    tfaScan: 'Scan this QR code with an authenticator app (Google Authenticator, 1Password, Authy…) and type the code it shows.',
    tfaManual: 'Or enter this key by hand:',
    tfaCode: '6-digit code', tfaConfirm: 'Confirm', cancel: 'Cancel',
    tfaStopAsk: 'To turn it off, type a current code from the app.',
    tfaStopLocal: 'You’re on the server computer: you can turn it off without a code (for example, if you lost the phone).',
    tfaDone: 'Done: from now on the admin password asks for a code.',
    tfaScripts: 'Scripts using the admin password only work on the server computer.',
    badCode: 'That code isn’t right or was already used. Wait for the next one and try again.',
    sso: 'Company sign-in',
    ssoOn: (n) => `On: people can sign in with ${n}. Who gets in, and as what, is set in .env (OIDC_ADMINS, OIDC_CREW).`,
    ssoOff: 'Off. With Google Workspace, Microsoft or any OpenID Connect provider, everyone signs in with their own account.',
    ssoHow: 'How to set it up',
  },
};
const t = T[LANG] || T.en;
const ago = (ms) => {
  const s = Math.round((Date.now() - ms) / 1000);
  const n = s < 90 ? 0 : s < 3600 ? Math.round(s / 60) : Math.round(s / 3600);
  if (LANG === 'es') return n === 0 ? 'ahora' : s < 3600 ? `hace ${n} min` : `hace ${n} h`;
  return n === 0 ? 'now' : s < 3600 ? `${n} min ago` : `${n} h ago`;
};

/**
 * @param {HTMLElement} el
 * @param {{ api: (m: string, u: string, b?: any) => Promise<any>, confirm: (msg: string) => Promise<boolean>, toast: (msg: string, o?: any) => void, me: any }} ctx
 */
export function accessPanel(el, { api, confirm, toast, me }) {
  el.classList.add('connect', 'access');
  let state = { sessions: [], passwords: [], me };
  let reveal = null; // { which, value }
  let tfa = null; // { secret, qr } while turning it on; 'off' while turning it off
  const names = { admin: t.pwAdmin, crew: t.pwCrew, ingest: t.pwIngest };
  const descs = { admin: t.pwAdminD, crew: t.pwCrewD, ingest: t.pwIngestD };

  async function load() {
    try {
      const [sessions, passwords, who] = await Promise.all([api('GET', '/api/auth/sessions'), api('GET', '/api/auth/passwords'), api('GET', '/api/auth/me')]);
      state = { sessions, passwords, me: who };
      render();
    } catch { /* the dashboard shows the error */ }
  }
  function render() {
    const { sessions, passwords, me: who } = state;
    const others = sessions.filter((x) => !x.current);
    el.innerHTML = `
      <h4>${esc(t.devices)}</h4>
      <p class="cx-fine">${esc(who.via === 'local' ? t.local : t.devicesHint)}</p>
      <div class="ax-list">${sessions.length ? sessions.map((x) => `<div class="ax-row">
          ${icon(x.role === 'ingest' ? 'mic' : x.role === 'crew' ? 'headphones' : 'shield')}
          <span><b>${esc(x.device)}</b><small>${esc(names[x.role] || t.pwAdmin)} · ${esc(x.via === 'sso' ? t.viaSso : x.via === 'link' ? t.viaLink : t.viaPw)} · ${esc(t.active(ago(x.lastSeen)))}</small></span>
          ${x.current ? `<span class="chip ok">${esc(t.thisOne)}</span>` : `<button type="button" data-ax="out" data-id="${esc(x.id)}" data-name="${esc(x.device)}">${esc(t.signOut)}</button>`}
        </div>`).join('') : `<p class="cx-fine">${esc(t.none)}</p>`}</div>
      ${others.length ? `<div class="cx-row"><button type="button" class="cx-link" data-ax="others">${esc(t.signOutOthers)}</button></div>` : ''}

      <h4>${esc(t.passwords)}</h4>
      <div class="ax-list">${passwords.map((p) => `<div class="ax-row">
          ${icon(p.which === 'ingest' ? 'mic' : p.which === 'crew' ? 'headphones' : 'shield')}
          <span><b>${esc(names[p.which])}</b><small>${esc(descs[p.which])}</small></span>
          ${p.fromEnv ? `<span class="chip">${esc(t.fromEnv)}</span>` : `<button type="button" data-ax="change" data-which="${p.which}">${esc(t.change)}</button>`}
        </div>${reveal?.which === p.which ? `<div class="cx-msg ok" role="status">${esc(t.newPw)}${p.which === 'ingest' ? ` ${esc(t.ingestNote)}` : ''}
          <div class="cx-row u-mt8"><code class="ax-secret">${esc(reveal.value)}</code><button type="button" data-ax="copy">${esc(t.copy)}</button></div></div>` : ''}`).join('')}</div>

      <h4>${esc(t.tfa)}</h4>
      <p class="cx-status ${who.twoFactor ? 'ok' : 'warn'}">${icon(who.twoFactor ? 'check' : 'alert')}<span>${esc(who.twoFactor ? t.tfaOn : t.tfaOff)}</span></p>
      ${tfa && tfa !== 'off' ? `<div class="ax-tfa"><div class="ax-qr">${tfa.qr}</div><div>
          <p class="cx-fine u-mt0">${esc(t.tfaScan)}</p>
          <p class="cx-fine">${esc(t.tfaManual)} <code>${esc(tfa.secret.replace(/(.{4})/g, '$1 ').trim())}</code></p>
          <form class="cx-row" data-ax="confirm"><input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="${esc(t.tfaCode)}" required /><button class="primary">${esc(t.tfaConfirm)}</button><button type="button" class="cx-link" data-ax="cancel">${esc(t.cancel)}</button></form>
          <p class="cx-fine">${esc(t.tfaScripts)}</p></div></div>`
        : tfa === 'off' ? `<p class="cx-fine">${esc(who.via === 'local' ? t.tfaStopLocal : t.tfaStopAsk)}</p><form class="cx-row" data-ax="disable">${who.via === 'local' ? '' : `<input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="${esc(t.tfaCode)}" required />`}<button class="danger">${esc(t.tfaStop)}</button><button type="button" class="cx-link" data-ax="cancel">${esc(t.cancel)}</button></form>`
        : `<div class="cx-row"><button type="button" data-ax="${who.twoFactor ? 'tfa-off' : 'tfa-on'}"${who.twoFactor ? '' : ' class="primary"'}>${esc(who.twoFactor ? t.tfaStop : t.tfaStart)}</button></div>`}

      <h4>${esc(t.sso)}</h4>
      <p class="cx-status ${who.sso ? 'ok' : ''}">${icon(who.sso ? 'check' : 'shield')}<span>${esc(who.sso ? t.ssoOn(who.sso) : t.ssoOff)}</span></p>
      <p class="cx-fine"><a href="https://github.com/carraroesteban/opencaptions/blob/main/docs/security-guide.md#company-sign-in" target="_blank" rel="noopener">${esc(t.ssoHow)} ↗</a></p>`;
  }
  el.addEventListener('click', async (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest('[data-ax]');
    const a = b?.getAttribute('data-ax');
    if (!a || b.tagName === 'FORM') return;
    try {
      if (a === 'out' && (await confirm(t.signOutAsk(b.dataset.name)))) { await api('DELETE', `/api/auth/sessions/${b.dataset.id}`); await load(); }
      if (a === 'others' && (await confirm(t.othersAsk))) { await api('POST', '/api/auth/sessions/sign-out-others'); await load(); }
      if (a === 'change' && (await confirm(t.changeAsk(names[b.dataset.which].toLowerCase())))) {
        const r = await api('POST', `/api/auth/passwords/${b.dataset.which}`);
        reveal = { which: b.dataset.which, value: r.password };
        await load();
      }
      if (a === 'copy') { await navigator.clipboard.writeText(reveal.value).catch(() => {}); b.textContent = t.copied; }
      if (a === 'tfa-on') { tfa = await api('POST', '/api/auth/2fa/start'); render(); el.querySelector('[data-ax=confirm] input')?.focus(); }
      if (a === 'tfa-off') { tfa = 'off'; render(); el.querySelector('[data-ax=disable] input')?.focus(); }
      if (a === 'cancel') { tfa = null; render(); }
    } catch (err) { toast(err.message, { error: true }); }
  });
  el.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = /** @type {HTMLFormElement} */ (e.target);
    const code = (f.code?.value || '').replace(/\s/g, '');
    try {
      if (f.dataset.ax === 'confirm') { await api('POST', '/api/auth/2fa/confirm', { code }); toast(t.tfaDone); }
      if (f.dataset.ax === 'disable') await api('POST', '/api/auth/2fa/disable', { code });
      tfa = null;
      await load();
    } catch (err) { toast(/code|setup expired/.test(err.message) ? t.badCode : err.message, { error: true }); f.code?.select(); }
  });
  return { load };
}
