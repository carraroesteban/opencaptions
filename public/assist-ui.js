// "What did I miss?" + "Ask the talk" widget, shared by the audience page (watch.html) and the transcript
// page (talk.html). Talks to GET /api/stages/:id/summary and POST /api/stages/:id/ask.
import { t, esc } from '/common.js';

/**
 * @param {HTMLElement} root
 * @param {{ stage: string, talk?: string, lang: () => string, scopes?: string[], onQuote?: (at: string) => void }} o
 */
export function mountAssistant(root, o) {
  const scopes = o.scopes || ['recent', 'full'];
  let scope = scopes[0];
  root.innerHTML = `
    <div class="seg ${scopes.length < 2 ? 'hidden' : ''}" role="group">
      ${scopes.map((s) => `<button type="button" data-scope="${s}" aria-pressed="${s === scope}">${s === 'recent' ? t('lastMinutes') : t('wholeTalk')}</button>`).join('')}
    </div>
    <div class="as-sum" aria-live="polite"></div>
    <form class="as-ask">
      <label for="as-q-${o.stage}">💬 ${esc(t('askTalk'))}</label>
      <div class="row"><input id="as-q-${o.stage}" maxlength="300" autocomplete="off" enterkeyhint="send" placeholder="${esc(t('askPlaceholder'))}" /><button class="primary" type="submit">${esc(t('askBtn'))}</button></div>
    </form>
    <div class="as-ans" aria-live="polite"></div>`;
  const sum = root.querySelector('.as-sum');
  const ans = root.querySelector('.as-ans');
  const form = root.querySelector('form');
  const input = form.querySelector('input');

  root.querySelector('.seg').onclick = (e) => {
    const b = e.target.closest('[data-scope]');
    if (!b) return;
    scope = b.dataset.scope;
    root.querySelectorAll('[data-scope]').forEach((x) => x.setAttribute('aria-pressed', x === b));
    load();
  };

  const q = (params) => new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  const quote = (x) => `<blockquote>${x.at ? `<b data-at="${esc(x.at)}">${esc(x.at)}</b>` : ''}${esc(x.text)}</blockquote>`;

  async function load() {
    sum.innerHTML = '<div class="skeleton" style="width:70%"></div><div class="skeleton"></div><div class="skeleton" style="width:85%"></div>';
    try {
      const r = await fetch(`/api/stages/${encodeURIComponent(o.stage)}/summary?${q({ lang: o.lang(), scope, talk: o.talk })}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (!d.bullets?.length) { sum.innerHTML = `<p class="muted">${esc(t('nothingYet'))}</p>`; return; }
      sum.innerHTML = `
        ${d.headline ? `<h3>${esc(d.headline)}</h3>` : ''}
        <ul>${d.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
        ${d.terms?.length ? `<div class="as-terms">${d.terms.map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div>` : ''}
        <div class="as-note">${d.ai ? '✨ ' + esc(t('aiNote')) : esc(t('noAiNote'))}</div>`;
    } catch {
      sum.innerHTML = `<p class="muted">${esc(t('error'))}</p>`;
    }
  }

  form.onsubmit = async (e) => {
    e.preventDefault();
    const question = input.value.trim();
    if (question.length < 3) return;
    const btn = form.querySelector('button');
    btn.disabled = true;
    ans.innerHTML = `<p class="muted">${esc(t('thinking'))}</p>`;
    try {
      const r = await fetch(`/api/stages/${encodeURIComponent(o.stage)}/ask`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question, lang: o.lang(), talk: o.talk }) });
      const d = await r.json();
      if (r.status === 429) { ans.innerHTML = `<p class="muted">${esc(t('tooMany'))}</p>`; return; }
      if (!r.ok) throw new Error(d.error);
      if (d.ai && d.found && d.answer) {
        ans.innerHTML = `<p>${esc(d.answer)}</p>${(d.quotes || []).map(quote).join('')}<div class="as-note">✨ ${esc(t('aiNote'))}</div>`;
      } else if (d.quotes?.length) {
        ans.innerHTML = `<p class="muted">${esc(t('quotesFrom'))}:</p>${d.quotes.map(quote).join('')}`;
      } else {
        ans.innerHTML = `<p>${esc(d.answer || t('notFound'))}</p>`;
      }
      ans.querySelectorAll('[data-at]').forEach((el) => { if (o.onQuote) { el.style.cursor = 'pointer'; el.onclick = () => o.onQuote(el.dataset.at); } });
    } catch {
      ans.innerHTML = `<p class="muted">${esc(t('error'))}</p>`;
    } finally {
      btn.disabled = false;
    }
  };

  return { load, setTalk(id) { o.talk = id; } };
}
