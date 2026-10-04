// Sign-in for the dashboard and the welcome wizard, shown when the server asks for the admin token (any device
// other than the server itself, and Docker, where even localhost counts as another device). Explains where the
// password is instead of a bare browser prompt, and checks it before saving.
import { LANG } from '/i18n.js';
import { store } from '/common.js';

const T = {
  es: {
    title: 'Ingresá la contraseña del panel',
    lead: 'Este panel controla el evento, así que pide la contraseña del servidor (el “admin token”).',
    where: 'Dónde encontrarla',
    w1: 'En la ventana donde arrancaste OpenCaptions: la línea que empieza con <b>Admin token</b>.',
    w2: 'Con Docker, en una terminal dentro de la carpeta de OpenCaptions:',
    w3: 'En la computadora del servidor no hace falta: abrí <b>http://localhost:8080/admin.html</b> ahí (sin Docker).',
    label: 'Contraseña',
    go: 'Entrar',
    bad: 'Esa contraseña no es correcta. Copiala completa, sin espacios.',
    offline: 'No se pudo contactar al servidor. ¿Sigue encendido?',
  },
  en: {
    title: 'Enter the dashboard password',
    lead: 'This dashboard controls the event, so it needs the server’s password (the “admin token”).',
    where: 'Where to find it',
    w1: 'In the window where you started OpenCaptions: the line that starts with <b>Admin token</b>.',
    w2: 'With Docker, in a terminal inside the OpenCaptions folder:',
    w3: 'On the server computer itself you don’t need it: open <b>http://localhost:8080/admin.html</b> there (without Docker).',
    label: 'Password',
    go: 'Sign in',
    bad: 'That password isn’t right. Copy all of it, with no spaces.',
    offline: 'Couldn’t reach the server. Is it still running?',
  },
};

/**
 * Ask for the admin token until the server accepts it, then save it and resolve with it.
 * @returns {Promise<string>}
 */
export function adminSignIn() {
  const t = T[LANG] || T.en;
  const dlg = document.createElement('dialog');
  dlg.className = 'signin';
  dlg.innerHTML = `<form method="dialog" style="display:grid;gap:14px">
    <h3 style="margin:0">${t.title}</h3>
    <p class="muted-note" style="margin:0">${t.lead}</p>
    <label class="field">${t.label}<input name="tk" autocomplete="current-password" type="password" required spellcheck="false" /></label>
    <p class="err" role="alert" style="margin:0;color:var(--bad)"></p>
    <details><summary>${t.where}</summary>
      <ul style="margin:8px 0 0;padding-left:18px;display:grid;gap:6px">
        <li>${t.w1}</li>
        <li>${t.w2}<pre style="margin:6px 0 0"><code>docker compose logs opencaptions | grep "Admin token"</code></pre></li>
        <li>${t.w3}</li>
      </ul>
    </details>
    <div class="dlg-actions"><button class="primary" type="submit">${t.go}</button></div>
  </form>`;
  document.body.append(dlg);
  const form = dlg.querySelector('form');
  const input = /** @type {HTMLInputElement} */ (dlg.querySelector('input'));
  const err = dlg.querySelector('.err');
  dlg.addEventListener('cancel', (e) => e.preventDefault()); // Esc would leave an empty dashboard behind
  dlg.showModal();
  return new Promise((resolve) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const tk = input.value.trim();
      if (!tk) return;
      err.textContent = '';
      try {
        const r = await fetch('/api/setup', { headers: { 'x-admin-token': tk } });
        if (r.status === 401) { err.textContent = t.bad; input.select(); return; }
      } catch { err.textContent = t.offline; return; }
      store.set('admin.token', tk);
      dlg.close();
      dlg.remove();
      resolve(tk);
    });
  });
}
