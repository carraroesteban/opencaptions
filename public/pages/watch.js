// watch.html: page script (kept out of the HTML so the Content-Security-Policy can forbid inline scripts).
import { qs, t, esc, store, wsUrl, Socket, CaptionState, PcmPlayer, langLabel, wakeLock, getEvent, applyReadingPrefs, setReadingPref, setTheme, liveText } from '/common.js';
import { mountAssistant } from '/assist-ui.js';
import { icon, mountIcons } from '/illustrations.js';
import { prefsControls } from '/i18n.js';
import { floatingCaptions } from '/floating.js';
const $ = (id) => document.getElementById(id);
const stageId = qs.get('stage');
if (!stageId) location.href = '/';

// Icons, the page-language switch (in Settings) and translated labels for the icon-only buttons.
mountIcons();
$('ui-slot').append(prefsControls({ langs: ['es', 'en', 'pt'] }));
$('l-ui').textContent = t('uiLang');
for (const id of ['ai-close', 'set-close']) $(id).setAttribute('aria-label', t('close'));
$('back-link').setAttribute('aria-label', t('stages'));
$('doc').title = t('transcript');
$('doc').setAttribute('aria-label', t('transcript')); // an icon-only link: screen readers need its name
const ev = await getEvent();
let lang = qs.get('lang') || store.get(`lang.${stageId}`) || store.get('lang') || null;
let dual = store.get('dual', false);
let size = store.get('size', 24);
let listening = false;
let hello = null;
const states = {};
const player = new PcmPlayer();

$('empty').textContent = t('connecting');
$('tolive').innerHTML = `${icon('arrowdown')} ${esc(t('backToLive'))}`;
$('dual').textContent = t('dual');
$('listen').innerHTML = `${icon('headphones')} <span class="lbl">${esc(t('listen'))}</span>`;
$('orig').querySelector('b').textContent = t('original');
document.documentElement.style.setProperty('--size', size + 'px');
let prefs = applyReadingPrefs();

// ---- ✨ assistant sheet: "what did I miss?" + ask the talk ----
$('ai').querySelector('.lbl').textContent = t('catchUp');
$('ai-title').innerHTML = `${icon('sparkle')} ${esc(t('catchUp'))}`;
$('ai-doc').textContent = t('readTranscript') + ' →';
const assistant = mountAssistant($('assistant'), { stage: stageId, lang: () => (lang && lang !== 'orig' ? lang : hello?.stage?.source && hello.stage.source !== 'auto' ? hello.stage.source : (navigator.language || 'es').slice(0, 2)) });
$('ai').onclick = () => { $('dlg-ai').showModal(); assistant.load(); };
$('ai-close').onclick = () => $('dlg-ai').close();
const docUrl = () => `/talk.html?stage=${encodeURIComponent(stageId)}${lang ? `&lang=${encodeURIComponent(lang)}` : ''}`;
$('doc').title = t('transcript');

// ---- Aa reading settings sheet ----
$('set-title').textContent = t('settings');
$('l-size').textContent = t('textSize');
$('l-font').textContent = t('font');
$('l-lh').textContent = t('lineSpacing');
$('l-theme').textContent = t('theme');
const opts = (el, items, cur, onPick) => {
  el.innerHTML = items.map(([v, label]) => `<button class="pill" data-v="${v}" aria-pressed="${String(v) === String(cur)}">${esc(label)}</button>`).join('');
  el.onclick = (e) => { const b = e.target.closest('[data-v]'); if (!b) return; el.querySelectorAll('[data-v]').forEach((x) => x.setAttribute('aria-pressed', x === b)); onPick(b.dataset.v); };
};
opts($('font-opts'), [['default', t('fontDefault')], ['legible', t('fontLegible')], ['easy', t('fontEasy')]], prefs.font || 'default', (v) => { prefs = setReadingPref('font', v); scrollEnd(); });
opts($('lh-opts'), [['1.3', '1'], ['1.5', '1.5'], ['1.8', '2']], prefs.lh || 1.5, (v) => { prefs = setReadingPref('lh', Number(v)); scrollEnd(); });
opts($('theme-opts'), [['auto', t('themeAuto')], ['light', t('themeLight')], ['dark', t('themeDark')]], store.get('theme', null) || 'auto', setTheme);
$('settings').onclick = () => $('dlg-set').showModal();
$('set-close').onclick = () => $('dlg-set').close();
for (const d of ['dlg-ai', 'dlg-set']) $(d).addEventListener('click', (e) => { if (e.target === $(d)) $(d).close(); }); // tap outside closes

const channel = () => hello?.map?.[lang] || 'orig';
const hasAudio = () => channel() !== 'orig' && (hello?.stage?.audioLangs || []).includes(lang);

const sock = new Socket(() => wsUrl('/ws/view', {
  stage: stageId,
  langs: [lang || 'orig', dual ? 'orig' : null].filter(Boolean).join(','),
  audio: listening ? lang : '0',
}), {
  message(m) {
    if (m.type === 'hello') onHello(m);
    else if (m.type === 'caption') onCaption(m);
    else if (m.type === 'title') $('talk').textContent = [m.title, m.speaker].filter(Boolean).join(' · ');
    else if (m.type === 'talk') {
      $('talk').textContent = [m.title, m.speaker].filter(Boolean).join(' · ');
      if (m.talk !== hello?.talk) { if (hello) hello.talk = m.talk; for (const s of Object.values(states)) s.clear(); renderAll(); toast(t('talkChanged')); }
    }
  },
  binary(ab) { if (listening) player.push(ab); },
  close(e) { if (e.code === 4004) location.href = '/'; },
});
// A phone waking from sleep can hold a dead socket for minutes: after a long absence, reconnect (history comes back).
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') hiddenAt = Date.now();
  else if (hiddenAt && Date.now() - hiddenAt > 20000) sock.reconnect();
});

function onHello(m) {
  hello = m;
  document.title = `${m.stage.name} · ${ev.name}`;
  $('stage').textContent = m.stage.name;
  $('talk').textContent = [m.stage.title, m.stage.speaker].filter(Boolean).join(' · ');
  const langs = m.stage.languages;
  if (!lang || !langs.includes(lang)) {
    const pref = (navigator.language || 'es').slice(0, 2);
    const next = langs.includes(pref) ? pref : 'orig';
    if (next !== lang) { lang = next; return sock.reconnect(); }
  }
  $('langs').innerHTML = langs.map((l) => `<button class="pill" data-lang="${l}" aria-pressed="${l === lang}">${esc(l === 'orig' ? t('original') : langLabel(l, ev.languages))}</button>`).join('');
  for (const [ch, hist] of Object.entries(m.history)) (states[ch] ??= new CaptionState()).load(hist, m.partial[ch]);
  $('listen').classList.toggle('hidden', !hasAudio());
  $('orig').classList.toggle('hidden', !dual || channel() === 'orig');
  $('doc').href = docUrl();
  $('ai-doc').href = docUrl();
  renderAll();
}

function onCaption(seg) {
  const s = (states[seg.channel] ??= new CaptionState());
  s.apply(seg);
  if (seg.channel === channel()) renderMain(seg);
  if (dual && seg.channel === 'orig' && channel() !== 'orig') renderOrig();
  if (seg.channel === channel()) renderPip();
  pulse();
}

// ---- rendering ----
const nearBottom = () => $('scroll').scrollHeight - $('scroll').scrollTop - $('scroll').clientHeight < 120;
let follow = true;
$('scroll').addEventListener('scroll', () => { follow = nearBottom(); $('tolive').classList.toggle('hidden', follow); });
$('tolive').onclick = () => { follow = true; $('scroll').scrollTop = $('scroll').scrollHeight; };

function renderAll() {
  const s = states[channel()] || new CaptionState();
  const box = $('text');
  box.innerHTML = '';
  s.finals.forEach((f, i) => box.append(para(f, i < s.finals.length - 6, box.lastElementChild)));
  if (s.partial) box.append(para(s.partial, false, box.lastElementChild));
  if (!s.finals.length && !s.partial) box.innerHTML = `<div class="empty empty-state">${LOGO}<span>${esc(t('waiting'))}</span></div>`;
  renderOrig();
  renderPip();
  scrollEnd();
}

const LOGO = '<svg class="oc-logo typing" viewBox="0 0 878 664" aria-hidden="true"><use class="o" href="/brand/sprite.svg#oc-o"/><use class="ln" href="/brand/sprite.svg#oc-line"/></svg>';
function para(seg, old = false, before = null) {
  const p = document.createElement('p');
  p.dataset.id = seg.id;
  // Who is speaking, shown when it changes (the crew sets it on the dashboard).
  p.dataset.who = seg.spk || '';
  if (seg.spk && seg.spk !== (before?.dataset.who || '')) p.dataset.spk = seg.spk;
  liveText(p, seg.text, seg.final);
  if (!seg.final) p.className = 'partial'; else if (old) p.className = 'old';
  // Screen readers read each sentence once, when it's final, not every word as the line is being rewritten.
  if (!seg.final) p.setAttribute('aria-hidden', 'true');
  return p;
}

function renderMain(seg) {
  const box = $('text');
  box.querySelector('.empty')?.remove();
  const p = box.querySelector(`p[data-id="${CSS.escape(seg.id)}"]`);
  if (p) { liveText(p, seg.text, seg.final); p.className = seg.final ? '' : 'partial'; if (seg.final) p.removeAttribute('aria-hidden'); else p.setAttribute('aria-hidden', 'true'); }
  else box.append(para(seg, false, box.querySelector('p:last-of-type')));
  // keep the partial last and dim older paragraphs
  const ps = box.querySelectorAll('p');
  ps.forEach((el, i) => { if (!el.classList.contains('partial')) el.classList.toggle('old', i < ps.length - 6); });
  while (box.children.length > 220) box.firstChild.remove();
  scrollEnd();
}

function renderOrig() {
  if (!dual || channel() === 'orig') return;
  $('orig').querySelector('span').textContent = (states.orig?.tail(150)) || '…';
}

function scrollEnd() { if (follow) requestAnimationFrame(() => { $('scroll').scrollTop = $('scroll').scrollHeight; }); }

// ---- status ----
let last = 0;
function pulse() { last = Date.now(); }
setInterval(() => {
  const live = sock.ready && Date.now() - last < 15000;
  const el = $('status');
  el.className = 'chip' + (live ? ' bad' : '');
  el.querySelector('.dot').className = 'dot' + (live ? ' live' : '');
  el.querySelector('span:last-child').textContent = !sock.ready ? t('connecting') : live ? t('live') : t('paused');
}, 1000);

// ---- controls ----
$('langs').onclick = (e) => {
  const b = e.target.closest('[data-lang]');
  if (!b || b.dataset.lang === lang) return;
  lang = b.dataset.lang;
  store.set(`lang.${stageId}`, lang);
  store.set('lang', lang);
  if (listening && lang === 'orig') toggleListen();
  sock.reconnect();
};
const setSize = (d) => { size = Math.min(56, Math.max(14, size + d)); store.set('size', size); document.documentElement.style.setProperty('--size', size + 'px'); $('size-val').textContent = size; scrollEnd(); };
$('size-val').textContent = size;
$('smaller').onclick = () => setSize(-2);
$('bigger').onclick = () => setSize(2);
$('dual').setAttribute('aria-pressed', dual);
const setDual = (on) => {
  dual = on; store.set('dual', dual); $('dual').setAttribute('aria-pressed', dual);
  $('dual-opts').querySelectorAll('[data-v]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.v === String(dual))));
  sock.reconnect();
};
$('dual').onclick = () => setDual(!dual);
$('l-dual').textContent = t('dual');
opts($('dual-opts'), [['false', t('no')], ['true', t('yes')]], String(dual), (v) => setDual(v === 'true'));
async function toggleListen() {
  listening = !listening;
  $('listen').setAttribute('aria-pressed', listening);
  $('listen').innerHTML = `${icon('headphones')} <span class="lbl">${esc(listening ? t('stopListen') : t('listen'))}</span>`;
  if (listening) { await player.start(); toast(t('listenHint')); } else player.stop();
  sock.reconnect();
}
$('listen').onclick = toggleListen;

function toast(msg) {
  const d = document.createElement('div');
  d.className = 'toast';
  d.textContent = msg;
  document.body.append(d);
  setTimeout(() => d.remove(), 2500);
}
// ---- ⧉ floating captions: an always-on-top window over the livestream, the slides or a video call (floating.js) ----
$('pip').title = t('floating');
$('pip').setAttribute('aria-label', t('floating'));
const pip = floatingCaptions({
  button: $('pip'),
  text: () => states[channel()]?.tail(220) || t('waiting'),
  live: () => !!states[channel()]?.partial?.text, // still being spoken → highlight the last word
  onError: () => toast(t('error')),
});
function renderPip() { pip.render(); }

wakeLock();
