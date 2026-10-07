// watch.html: page script (kept out of the HTML so the Content-Security-Policy can forbid inline scripts).
import { qs, t, esc, store, wsUrl, Socket, CaptionState, PcmPlayer, langLabel, wakeLock, getEvent, applyReadingPrefs, setReadingPref, setTheme, pauseView, CaptionFlow } from '/common.js';
import { mountAssistant } from '/assist-ui.js';
import { icon, mountIcons } from '/illustrations.js';
import { prefsControls } from '/i18n.js';
import { floatingCaptions } from '/floating.js';
import { Pacer } from '/smooth.js';
import { Speaker, canSpeak } from '/speak.js';
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
const states = {}; // channel → what's on screen (CaptionState), fed word by word by its pacer
const pacers = {}; // channel → Pacer (smooth.js): the server's bursts come out at the speaker's pace
const pacer = (ch) => (pacers[ch] ??= new Pacer((seg) => onShown(seg)));
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
// 🎧 Listen: the AI's natural voice where the room has one, otherwise the phone reads the captions aloud (speak.js).
const listenMode = () => (hasAudio() ? 'ai' : channel() !== 'orig' && canSpeak(lang) ? 'device' : null);
const speaker = new Speaker();
let listenWith = null;
if (typeof speechSynthesis !== 'undefined') speechSynthesis.addEventListener?.('voiceschanged', () => $('listen').classList.toggle('hidden', !listenMode()));

const sock = new Socket(() => wsUrl('/ws/view', {
  stage: stageId,
  langs: [lang || 'orig', dual ? 'orig' : null].filter(Boolean).join(','),
  audio: listening && listenWith === 'ai' ? lang : '0',
}), {
  message(m) {
    if (m.type === 'hello') onHello(m);
    else if (m.type === 'caption') onCaption(m);
    else if (m.type === 'pause') showPause(m);
    else if (m.type === 'title') $('talk').textContent = [m.title, m.speaker].filter(Boolean).join(' · ');
    else if (m.type === 'talk') {
      $('talk').textContent = [m.title, m.speaker].filter(Boolean).join(' · ');
      if (m.talk !== hello?.talk) { if (hello) hello.talk = m.talk; for (const s of Object.values(states)) s.clear(); for (const p of Object.values(pacers)) p.clear(); renderAll(); toast(t('talkChanged')); }
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
  for (const [ch, hist] of Object.entries(m.history)) {
    (states[ch] ??= new CaptionState()).load(hist, m.partial[ch]);
    pacer(ch).load([...hist, m.partial[ch]].filter(Boolean)); // already said: shown at once
  }
  $('listen').classList.toggle('hidden', !listenMode());
  $('orig').classList.toggle('hidden', !dual || channel() === 'orig');
  $('doc').href = docUrl();
  $('ai-doc').href = docUrl();
  showPause(m.pause);
  renderAll();
}

/** A break or music in the room: say so above the captions (they stop on purpose, nothing is broken). */
let pauseNow = null;
function showPause(p) {
  pauseNow = p;
  const v = pauseView(p);
  const el = $('pause');
  el.classList.toggle('hidden', !v);
  if (!v) return;
  el.className = `pause ${v.kind}`;
  el.innerHTML = `<b>${esc(v.title)}</b>${v.back ? `<span>${esc(v.back)}</span>` : ''}${v.next ? `<span>${esc(v.next)}</span>` : ''}`;
}

function onCaption(seg) {
  pacer(seg.channel).push(seg);
  if (listening && listenWith === 'device' && seg.final && seg.channel === channel()) speaker.say(seg.text);
}

/** A caption as it's shown now (some of its words, or all of them). */
function onShown(seg) {
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

const flow = new CaptionFlow($('text'));
function renderAll() {
  const s = states[channel()] || new CaptionState();
  flow.render([...s.finals, s.partial]);
  if (!s.finals.length && !s.partial) $('text').innerHTML = `<div class="empty empty-state">${LOGO}<span>${esc(t('waiting'))}</span></div>`;
  renderOrig();
  renderPip();
  scrollEnd();
}

const LOGO = '<svg class="oc-logo typing" viewBox="0 0 878 664" aria-hidden="true"><use class="o" href="/brand/sprite.svg#oc-o"/><use class="ln" href="/brand/sprite.svg#oc-line"/></svg>';

function renderMain(seg) {
  flow.update(seg);
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
  const brk = !!pauseNow?.brk;
  const live = sock.ready && !brk && Date.now() - last < 15000;
  const el = $('status');
  el.className = 'chip' + (live ? ' bad' : brk ? ' warn' : '');
  el.querySelector('.dot').className = 'dot' + (live ? ' live' : '');
  el.querySelector('span:last-child').textContent = !sock.ready ? t('connecting') : brk ? t('brk') : live ? t('live') : t('paused');
}, 1000);

// ---- controls ----
$('langs').onclick = (e) => {
  const b = e.target.closest('[data-lang]');
  if (!b || b.dataset.lang === lang) return;
  lang = b.dataset.lang;
  store.set(`lang.${stageId}`, lang);
  store.set('lang', lang);
  if (listening) toggleListen(); // another language: another voice (tap Listen again)
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
  const was = listenWith;
  listenWith = listening ? listenMode() : null;
  if (listenWith === 'device') { speaker.start(lang); toast(t('listenHint')); }
  else if (listenWith === 'ai') { await player.start(); toast(t('listenHint')); }
  else { player.stop(); speaker.stop(); }
  if (listenWith === 'ai' || was === 'ai') sock.reconnect(); // the AI's voice comes over the socket
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
  caps: () => pacers[channel()]?.shown() || [], // TV-style lines that never re-wrap
  onError: () => toast(t('error')),
});
function renderPip() { pip.render(); }

wakeLock();
