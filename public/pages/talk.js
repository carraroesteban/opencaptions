// talk.html: page script (kept out of the HTML so the Content-Security-Policy can forbid inline scripts).
import { qs, t, UI, esc, store, wsUrl, Socket, langLabel, getEvent, applyReadingPrefs, setReadingPref, setTheme, fmtClock, liveHtml } from '/common.js';
import { mountAssistant } from '/assist-ui.js';
import { icon, mountIcons } from '/illustrations.js';
import { prefsControls } from '/i18n.js';
const $ = (id) => document.getElementById(id);
const stageId = qs.get('stage');
if (!stageId) location.href = '/talks.html';
const talkParam = qs.get('talk');
// Icons, the page-language switch and translated labels for the icon-only buttons.
mountIcons();
$('prefs-slot').append(prefsControls({ langs: ['es', 'en', 'pt'] }));
$('set-close').setAttribute('aria-label', t('close'));
const ev = await getEvent();
let prefs = applyReadingPrefs();
let size = store.get('docSize', 19);
document.documentElement.style.setProperty('--size', size + 'px');

// ---- load talk ----
const infoRes = await fetch(`/api/stages/${encodeURIComponent(stageId)}/talks/${encodeURIComponent(talkParam || 'current')}`);
if (!infoRes.ok) { $('doc').innerHTML = `<div class="empty">${esc(t('noTalks'))}</div>`; throw new Error('talk not available'); }
const info = await infoRes.json();
const talkId = info.id;
const all = await (await fetch(`/api/stages/${encodeURIComponent(stageId)}/export.json?talk=${encodeURIComponent(talkId)}`)).json();

const title = info.title || `${t('untitled')}`;
document.title = `${title} · ${info.stageName} · ${ev.name}`;
$('title').textContent = title;
$('back').textContent = `‹ ${t('allTalks')}`;
const started = new Date(info.startedAt);
$('meta').innerHTML = `${info.speaker ? `<b>${esc(info.speaker)}</b> · ` : ''}<span>${esc(info.stageName)}</span> · <span>${started.toLocaleDateString(UI, { weekday: 'short', day: 'numeric', month: 'short' })} ${started.toLocaleTimeString(UI, { hour: '2-digit', minute: '2-digit' })}</span> · <span>${Math.max(1, Math.round(info.durationMs / 60000))} min</span>${info.current ? ` · <span class="chip bad"><span class="dot live"></span> ${esc(t('liveNow'))}</span>` : ''}`;

// languages present in this transcript
const chans = [...new Set(all.map((s) => s.channel))];
const langs = ['orig', ...chans.filter((c) => c !== 'orig')];
let lang = qs.get('lang');
if (!lang || !langs.includes(lang)) lang = langs.includes(store.get('lang')) ? store.get('lang') : (langs.includes((navigator.language || 'es').slice(0, 2)) ? (navigator.language || 'es').slice(0, 2) : 'orig');
let segs = [];
let partial = null;

function renderLangs() {
  $('langs').innerHTML = langs.map((l) => `<button class="pill" data-lang="${l}" aria-pressed="${l === lang}">${esc(langLabel(l, ev.languages))}</button>`).join('');
  for (const f of ['txt', 'srt', 'vtt']) {
    $(`dl-${f}`).href = `/api/stages/${encodeURIComponent(stageId)}/export.${f}?talk=${encodeURIComponent(talkId)}&lang=${lang}`;
    $(`dl-${f}`).setAttribute('download', '');
  }
}
$('langs').onclick = (e) => {
  const b = e.target.closest('[data-lang]');
  if (!b) return;
  lang = b.dataset.lang;
  store.set('lang', lang);
  const u = new URL(location.href); u.searchParams.set('lang', lang); history.replaceState(null, '', u);
  select(); renderLangs(); render(); live?.reconnect();
};
const select = () => { segs = all.filter((s) => s.channel === lang).sort((a, b) => a.start - b.start); partial = null; };

// ---- rendering: paragraphs split on pauses, timestamps, search highlight ----
let query = '';
const hl = (text) => {
  if (!query) return esc(text);
  // Match on the raw text, then escape each piece: searching "amp" must not land inside "&amp;".
  const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return String(text).split(re).map((part, i) => (i % 2 ? `<mark>${esc(part)}</mark>` : esc(part))).join('');
};
function paragraphs() {
  const out = [];
  let cur = null;
  for (const s of segs) {
    const who = s.spk || '';
    if (!cur || s.start - cur.end > 4000 || cur.texts.length >= 5 || who !== cur.who) {
      cur = { start: s.start, end: s.end, texts: [], who, named: !!who && who !== (out[out.length - 1]?.who || '') };
      out.push(cur);
    }
    cur.texts.push(s.text);
    cur.end = Math.max(cur.end, s.end);
  }
  return out;
}
// Only the blocks whose HTML changed are replaced: during a live talk that's the last paragraph and the line being
// written, so the rest of a long transcript isn't rebuilt several times a second, and a reader's selection and
// screen-reader position stay where they are.
const tpl = document.createElement('template');
function patchDoc(blocks) {
  const box = $('doc');
  blocks.forEach((html, i) => {
    const cur = box.children[i];
    if (cur?._html === html) return;
    tpl.innerHTML = html;
    const el = /** @type {HTMLElement & { _html?: string }} */ (tpl.content.firstElementChild);
    el._html = html;
    if (cur) cur.replaceWith(el); else box.append(el);
  });
  while (box.children.length > blocks.length) box.lastElementChild.remove();
}
function render() {
  const ps = paragraphs();
  if (!ps.length && !partial) { patchDoc([`<div class="empty">${esc(info.current ? t('waiting') : t('noTalks'))}</div>`]); $('count').textContent = ''; return; }
  let matches = 0;
  const blocks = ps.map((p) => {
    const text = p.texts.join(' ');
    if (query) matches += (text.toLowerCase().split(query.toLowerCase()).length - 1);
    const id = `t${Math.floor(p.start / 1000)}`;
    return `<div class="para" id="${id}"><a class="ts" href="#${id}">${fmtClock(p.start)}</a><p>${p.named ? `<b class="spk">${esc(p.who)}</b> ` : ''}${hl(text)}</p></div>`;
  });
  if (partial?.text) blocks.push(`<div class="para" aria-hidden="true"><span class="ts"></span><p class="partial">${liveHtml(partial.text)}</p></div>`);
  patchDoc(blocks);
  $('count').textContent = query ? `${matches} ${t(matches === 1 ? 'match' : 'matches')}` : '';
  if (following) scrollEnd();
}
let qTimer;
$('q').placeholder = t('search');
$('q').oninput = () => { clearTimeout(qTimer); qTimer = setTimeout(() => { query = $('q').value.trim(); following = false; render(); document.querySelector('mark')?.scrollIntoView({ block: 'center' }); }, 180); };
$('q').onkeydown = (e) => {
  if (e.key !== 'Enter') return;
  const marks = [...document.querySelectorAll('mark')];
  if (!marks.length) return;
  const y = window.scrollY + window.innerHeight / 2;
  const next = marks.find((m) => m.getBoundingClientRect().top + window.scrollY > y + 5) || marks[0];
  next.scrollIntoView({ block: 'center', behavior: 'smooth' });
};

// ---- live talk: append captions as they come ----
let following = info.current && !location.hash;
let live = null;
const scrollEnd = () => requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight }));
if (info.current) {
  $('live').classList.remove('hidden');
  $('live').href = `/watch.html?stage=${encodeURIComponent(stageId)}&lang=${encodeURIComponent(lang)}`;
  $('live').querySelector('.live-lbl').textContent = t('seeLive');
  $('follow').innerHTML = `${icon('arrowdown')} ${esc(t('followLive'))}`;
  $('follow').onclick = () => { following = true; $('follow').classList.add('hidden'); scrollEnd(); };
  window.addEventListener('scroll', () => {
    const atEnd = window.innerHeight + window.scrollY >= document.body.scrollHeight - 80;
    if (atEnd) following = true; else if (following && !query) following = false;
    $('follow').classList.toggle('hidden', following || !info.current);
  }, { passive: true });
  live = new Socket(() => wsUrl('/ws/view', { stage: stageId, langs: lang }), {
    message(m) {
      if (m.type === 'caption' && m.channel === lang) {
        if (m.final) { if (!segs.some((s) => s.id === m.id)) { segs.push(m); all.push(m); } partial = null; } else partial = m;
        render();
      } else if (m.type === 'talk' && m.talk !== talkId) {
        // The talk ended and a new one started: this page keeps the finished transcript.
        $('live').classList.add('hidden');
        live.close();
      } else if (m.type === 'title') { $('title').textContent = m.title || t('untitled'); }
    },
  });
}

// ---- summary + ask ----
$('sum-title').innerHTML = `${icon('sparkle')} ${esc(info.current ? t('catchUp') : t('summary'))}`;
const assistant = mountAssistant($('assistant'), {
  stage: stageId, talk: talkId,
  lang: () => (lang !== 'orig' ? lang : (UIlang())),
  scopes: info.current ? ['recent', 'full'] : ['full'],
  onQuote: (at) => jump(at),
});
function UIlang() { const l = (navigator.language || 'es').slice(0, 2); return ev.languages[l] ? l : 'es'; }
function jump(at) {
  const [m, s] = at.split(':').map(Number);
  const sec = (m || 0) * 60 + (s || 0);
  const paras = [...document.querySelectorAll('#doc .para[id]')];
  const target = paras.filter((p) => Number(p.id.slice(1)) <= sec).pop() || paras[0];
  if (!target) return;
  following = false;
  target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  target.classList.remove('flash'); void target.offsetWidth; target.classList.add('flash');
}
assistant.load();

// ---- actions ----
$('copy').querySelector('span').textContent = t('copyLink');
$('copy').title = t('copyLink');
$('dl-lbl').textContent = t('download');
for (const [f, k] of [['txt', 'fmtText'], ['srt', 'fmtSubs'], ['vtt', 'fmtWeb']]) $(`dl-${f}`).textContent = `${f.toUpperCase()} · ${t(k)}`;
$('copy').onclick = async () => {
  const u = new URL(location.href); u.searchParams.set('talk', talkId);
  try { await navigator.clipboard.writeText(u.toString()); $('copy').querySelector('span').textContent = t('copied'); setTimeout(() => ($('copy').querySelector('span').textContent = t('copyLink')), 1800); } catch { prompt('', u.toString()); }
};
$('print').querySelector('span').textContent = t('print');
$('print').title = t('print');
$('print').onclick = () => window.print();

// ---- reading settings ----
$('set-title').textContent = t('settings');
$('l-size').textContent = t('textSize'); $('l-font').textContent = t('font'); $('l-lh').textContent = t('lineSpacing'); $('l-theme').textContent = t('theme');
const opts = (el, items, cur, onPick) => {
  el.innerHTML = items.map(([v, label]) => `<button class="pill" data-v="${v}" aria-pressed="${String(v) === String(cur)}">${esc(label)}</button>`).join('');
  el.onclick = (e) => { const b = e.target.closest('[data-v]'); if (!b) return; el.querySelectorAll('[data-v]').forEach((x) => x.setAttribute('aria-pressed', x === b)); onPick(b.dataset.v); };
};
opts($('font-opts'), [['default', t('fontDefault')], ['legible', t('fontLegible')], ['easy', t('fontEasy')]], prefs.font || 'default', (v) => { prefs = setReadingPref('font', v); });
opts($('lh-opts'), [['1.3', '1'], ['1.5', '1.5'], ['1.8', '2']], prefs.lh || 1.5, (v) => { prefs = setReadingPref('lh', Number(v)); });
opts($('theme-opts'), [['auto', t('themeAuto')], ['light', t('themeLight')], ['dark', t('themeDark')]], store.get('theme', null) || 'auto', setTheme);
const setSize = (d) => { size = Math.min(40, Math.max(14, size + d)); store.set('docSize', size); document.documentElement.style.setProperty('--size', size + 'px'); $('size-val').textContent = size; };
$('size-val').textContent = size;
$('smaller').onclick = () => setSize(-1);
$('bigger').onclick = () => setSize(1);
$('settings').onclick = () => $('dlg-set').showModal();
$('set-close').onclick = () => $('dlg-set').close();
$('dlg-set').addEventListener('click', (e) => { if (e.target === $('dlg-set')) $('dlg-set').close(); });

select(); renderLangs(); render();
if (location.hash) document.querySelector(location.hash)?.scrollIntoView({ block: 'center' });

// Delete for good: only for the admin (on this computer no password is asked, so "Just for me" users can).
$('del').querySelector('.lbl').textContent = t('deleteTalk');
fetch('/api/auth/me').then((r) => r.json()).then((me) => { if (me.role === 'admin') $('del').classList.remove('hidden'); }).catch(() => {});
$('del').onclick = async () => {
  if (!confirm(t('deleteTalkQ'))) return;
  const r = await fetch(`/api/stages/${encodeURIComponent(stageId)}/talks/${encodeURIComponent(talkId)}`, { method: 'DELETE' });
  if (r.ok) location.href = '/talks.html';
};
