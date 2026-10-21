// "What did I miss?" + "Ask the talk" widget, shared by the audience page (watch.html) and the transcript
// page (talk.html). Talks to GET /api/stages/:id/summary and POST /api/stages/:id/ask. Styles: audience.css (.as-*).
import { t, esc, store, segment } from '/common.js';
import { icon } from '/illustrations.js';

// A random id for this browser: phones at a venue share one IP, so the question limit is per browser.
// (getRandomValues, not randomUUID: venue Wi-Fi is plain HTTP, where randomUUID doesn't exist.)
const client = store.get('client', null) || (() => {
  const id = [...crypto.getRandomValues(new Uint8Array(12))].map((x) => x.toString(16).padStart(2, '0')).join('');
  store.set('client', id);
  return id;
})();

/**
 * @param {HTMLElement} root
 * @param {{ stage: string, talk?: string, lang: () => string, scopes?: string[], onQuote?: (at: string) => void }} o
 */
export function mountAssistant(root, o) {
  const scopes = o.scopes || ['recent', 'full'];
  let scope = scopes[0];
  root.innerHTML = `
    <div class="as-scope ${scopes.length < 2 ? 'hidden' : ''}" role="group"></div>
    <div class="as-card" aria-live="polite"></div>
    <section class="as-chat">
      <h3 class="as-h">${icon('chat')} ${esc(t('askTalk'))}</h3>
      <div class="as-thread" aria-live="polite"></div>
      <div class="as-sugs">${['askSuggest1', 'askSuggest2'].map((k) => `<button type="button">${esc(t(k))}</button>`).join('')}</div>
      <form class="as-form">
        <input id="as-q-${esc(o.stage)}" maxlength="300" autocomplete="off" enterkeyhint="send" aria-label="${esc(t('askTalk'))}" placeholder="${esc(t('askPlaceholder'))}" />
        <button class="as-send" type="submit" aria-label="${esc(t('askBtn'))}" disabled>${icon('arrowup')}</button>
      </form>
    </section>`;
  const sum = root.querySelector('.as-card');
  const thread = root.querySelector('.as-thread');
  const form = root.querySelector('form');
  const input = form.querySelector('input');
  const send = form.querySelector('button');

  segment(root.querySelector('.as-scope'), scopes.map((s) => [s, esc(s === 'recent' ? t('lastMinutes') : t('wholeTalk'))]), scope, (v) => { scope = v; load(); });
  input.oninput = () => { send.disabled = input.value.trim().length < 3; };
  root.querySelector('.as-sugs').onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    input.value = b.textContent;
    input.oninput();
    form.requestSubmit();
  };

  const q = (params) => new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  const quote = (x) => `<blockquote>${x.at ? `<b data-at="${esc(x.at)}">${esc(x.at)}</b>` : ''}${esc(x.text)}</blockquote>`;

  async function load() {
    sum.innerHTML = '<div class="skeleton u-w70"></div><div class="skeleton"></div><div class="skeleton u-w85"></div>';
    try {
      const r = await fetch(`/api/stages/${encodeURIComponent(o.stage)}/summary?${q({ lang: o.lang(), scope, talk: o.talk })}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (!d.bullets?.length) { sum.innerHTML = `<p class="muted">${esc(t('nothingYet'))}</p>`; return; }
      sum.innerHTML = `
        ${d.headline ? `<h3 class="rise">${esc(d.headline)}</h3>` : ''}
        <ul class="stagger">${d.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
        ${d.terms?.length ? `<div class="as-terms stagger">${d.terms.map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div>` : ''}
        <div class="as-note">${d.ai ? icon('sparkle') + ' ' + esc(t('aiNote')) : esc(t('noAiNote'))}</div>`;
    } catch {
      sum.innerHTML = `<p class="muted">${esc(t('error'))}</p>`;
    }
  }

  // A conversation: each question as a bubble, the answer under it (dots while it thinks).
  form.onsubmit = async (e) => {
    e.preventDefault();
    const question = input.value.trim();
    if (question.length < 3) return;
    send.disabled = true;
    input.value = '';
    root.querySelector('.as-sugs').classList.add('hidden'); // starters: once something was asked, the thread takes over
    const qEl = Object.assign(document.createElement('div'), { className: 'as-q', textContent: question });
    const ans = Object.assign(document.createElement('div'), { className: 'as-a', innerHTML: `<span class="as-dots" role="status" aria-label="${esc(t('thinking'))}"><i></i><i></i><i></i></span>` });
    thread.append(qEl, ans);
    ans.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    try {
      const r = await fetch(`/api/stages/${encodeURIComponent(o.stage)}/ask`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question, lang: o.lang(), talk: o.talk, client }) });
      const d = await r.json();
      if (r.status === 429) { ans.innerHTML = `<p class="muted">${esc(t('tooMany'))}</p>`; return; }
      if (!r.ok) throw new Error(d.error);
      if (d.ai && d.found && d.answer) {
        ans.innerHTML = `<p>${esc(d.answer)}</p>${(d.quotes || []).map(quote).join('')}<div class="as-note">${icon('sparkle')} ${esc(t('aiNote'))}</div>`;
      } else if (d.quotes?.length) {
        ans.innerHTML = `<p class="muted">${esc(t('quotesFrom'))}:</p>${d.quotes.map(quote).join('')}`;
      } else {
        ans.innerHTML = `<p>${esc(d.answer || t('notFound'))}</p>`;
      }
      ans.querySelectorAll('[data-at]').forEach((el) => { if (o.onQuote) el.onclick = () => o.onQuote(el.dataset.at); else el.removeAttribute('data-at'); });
    } catch {
      ans.innerHTML = `<p class="muted">${esc(t('error'))}</p>`;
    } finally {
      ans.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); // above the phone's keyboard, not under it
      input.oninput();
    }
  };

  return { load, setTalk(id) { o.talk = id; } };
}
