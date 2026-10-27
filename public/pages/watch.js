// watch.html: page script (kept out of the HTML so the Content-Security-Policy can forbid inline scripts).
import { creditLink, qs, t, esc, store, wsUrl, Socket, CaptionState, PcmPlayer, langLabel, wakeLock, getEvent, applyReadingPrefs, setReadingPref, pauseView, CaptionFlow, segment, pressSegment, readingItems, previewFonts } from '/common.js';
import { mountAssistant, client } from '/assist-ui.js';
import { icon, mountIcons } from '/illustrations.js';
import { prefsControls } from '/prefs.js';
import { floatingCaptions } from '/floating.js';
import { Pacer } from '/smooth.js';
import { Speaker, canSpeak } from '/speak.js';
const $ = (id) => document.getElementById(id);
const stageId = qs.get('stage');
if (!stageId) location.href = '/';
const calm = matchMedia('(prefers-reduced-motion: reduce)'); // no glide, no crossfade (style.css stops the CSS ones)

// Icons, the page language and theme (the globe) and translated labels for the icon-only buttons.
mountIcons();
$('prefs-slot').append(prefsControls({ langs: ['es', 'en', 'pt'] }));
for (const id of ['ai-close', 'set-close', 'slide-close', 'term-close', 'listen-note-close']) $(id).setAttribute('aria-label', t('close'));
$('back-link').setAttribute('aria-label', t('stages'));
$('doc').title = t('transcript');
$('doc').setAttribute('aria-label', t('transcript')); // an icon-only link: screen readers need its name
$('settings').setAttribute('aria-label', t('settings'));
const ev = await getEvent();
for (const d of ['dlg-ai', 'dlg-set']) { const c = creditLink(ev, 'phone'); if (c) $(d).append(c); }
// The event's own logo (Settings › General) in the header; OpenCaptions keeps a line under the waiting screen.
if (ev.logo) Object.assign($('ev-logo'), { src: ev.logo, alt: ev.name }).classList.remove('hidden');
// The room's colour (the same as on the dashboard and the list of rooms) washes the header; the captions stay plain.
const hue = ev.stages.find((s) => s.id === stageId)?.hue;
if (hue) document.querySelector('.w-head').classList.add(`rc-${hue}`);
let lang = qs.get('lang') || store.get(`lang.${stageId}`) || store.get('lang') || null;
let dual = store.get('dual', false);
let size = store.get('size', 24);
let listening = false;
let hello = null;
const states = {}; // channel → what's on screen (CaptionState), fed word by word by its pacer
const pacers = {}; // channel → Pacer (smooth.js): the server's bursts come out at the speaker's pace
const pacer = (ch) => (pacers[ch] ??= new Pacer((seg) => onShown(seg)));
const player = new PcmPlayer(); // the AI's translated voice
// The room's own sound (assistive listening): after a network stall, what's late is skipped (over 0.4 s queued, back to
// 0.15 s), so the sound stays with the speaker's lips.
const roomPlayer = new PcmPlayer(16000, { format: 'mulaw', maxAhead: 0.4, catchUp: 0.15 });

$('empty').textContent = t('connecting');
$('tolive').innerHTML = `${icon('arrowdown')} ${esc(t('backToLive'))}`;
$('dual').textContent = t('dual');
$('orig').querySelector('b').textContent = t('original');
document.documentElement.style.setProperty('--size', size + 'px');
let prefs = applyReadingPrefs();

// The bottom bar floats over the captions: the last line always sits above it (and toasts too).
new ResizeObserver(([e]) => document.body.style.setProperty('--bottom-h', `${Math.round(e.borderBoxSize?.[0]?.blockSize ?? e.target.offsetHeight)}px`)).observe($('bottom'));

// ---- ✨ assistant sheet: "what did I miss?" + ask the talk ----
$('ai').querySelector('.lbl').textContent = t('catchUp');
$('ai-title').innerHTML = `<span class="as-badge">${icon('sparkle')}</span>${esc(t('catchUp'))}`;
$('ai-doc').append(t('readTranscript'));
const assistant = mountAssistant($('assistant'), { stage: stageId, lang: () => (lang && lang !== 'orig' ? lang : hello?.stage?.source && hello.stage.source !== 'auto' ? hello.stage.source : (navigator.language || 'es').slice(0, 2)) });
$('ai').onclick = () => { $('dlg-ai').showModal(); assistant.load(); };
$('ai-close').onclick = () => $('dlg-ai').close();
const docUrl = () => `/talk.html?stage=${encodeURIComponent(stageId)}${lang ? `&lang=${encodeURIComponent(lang)}` : ''}`;

// ---- a word tapped in the captions: what it means, in plain words (POST /api/stages/:id/explain) ----
const readerLang = () => (lang && lang !== 'orig' ? lang : hello?.stage?.source && hello.stage.source !== 'auto' ? hello.stage.source : (navigator.language || 'es').slice(0, 2));
$('term-title').textContent = t('explainWord');
$('term-hint').textContent = t('explainHint');
$('term-q').placeholder = t('termPlaceholder');
$('term-q').setAttribute('aria-label', t('termPlaceholder'));
$('term-go').setAttribute('aria-label', t('explainWord'));
$('ai-term').append(t('explainWord'));
let termAsk = 0;
async function explainTerm(term) {
  term = term.trim();
  if (term.length < 2) return;
  const n = ++termAsk;
  $('term-out').innerHTML = `<p class="muted">${esc(t('thinking'))}</p>`;
  let j;
  try {
    const r = await fetch(`/api/stages/${encodeURIComponent(stageId)}/explain`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ term, lang: readerLang(), talk: hello?.talk, client }) });
    j = r.ok ? await r.json() : { error: r.status === 429 ? t('tooMany') : t('error') };
  } catch { j = { error: t('error') }; }
  if (n !== termAsk) return; // another word was tapped meanwhile
  if (j.error && !j.term) { $('term-out').innerHTML = `<p class="muted">${esc(j.error)}</p>`; return; }
  const quotes = j.quotes.map((q) => `<blockquote><b>${esc(q.at)}</b> ${esc(q.text)}</blockquote>`).join('');
  $('term-out').innerHTML = `<h3 class="tm-term">${esc(j.term)}${j.translation ? ` <span class="muted">· ${esc(j.translation)}</span>` : ''}</h3>`
    + (j.meaning ? `<p class="tm-meaning">${esc(j.meaning)}</p>${j.general ? `<p class="muted tm-note">${esc(t('generalMeaning'))}</p>` : ''}` : '')
    + (quotes ? `<h4 class="as-h">${esc(t('quotesFrom'))}</h4>${quotes}` : `<p class="muted">${esc(t('notSaidYet'))}</p>`)
    + (j.ai ? `<p class="muted tm-note">${esc(t('aiNote'))}</p>` : '');
}
function openTerm(term = '') {
  $('term-q').value = term;
  $('term-out').innerHTML = '';
  if (!$('dlg-term').open) $('dlg-term').showModal();
  if (term) explainTerm(term); else $('term-q').focus();
}
$('term-form').onsubmit = (e) => { e.preventDefault(); explainTerm($('term-q').value); };
$('term-close').onclick = () => $('dlg-term').close();
$('ai-term').onclick = () => { $('dlg-ai').close(); openTerm(); };
/** The word under a tap (or the text selected), from the captions only. */
function wordAt(e) {
  const sel = getSelection();
  if (sel && !sel.isCollapsed && $('text').contains(sel.anchorNode)) return sel.toString().slice(0, 60);
  const pos = document.caretPositionFromPoint?.(e.clientX, e.clientY);
  const range = pos ? null : document.caretRangeFromPoint?.(e.clientX, e.clientY);
  const node = pos?.offsetNode || range?.startContainer;
  const at = pos?.offset ?? range?.startOffset ?? 0;
  if (!node || node.nodeType !== 3 || !$('text').contains(node)) return '';
  const s = node.textContent;
  const isW = (c) => /[\p{L}\p{N}'’-]/u.test(c || '');
  let a = at, b = at;
  while (a > 0 && isW(s[a - 1])) a--;
  while (b < s.length && isW(s[b])) b++;
  return s.slice(a, b);
}
$('text').addEventListener('click', (e) => {
  if (e.target.closest('a, button')) return;
  const w = wordAt(e);
  if (w.replace(/[^\p{L}\p{N}]/gu, '').length >= 2) openTerm(w);
});

// ---- the slide on screen, from the room's computer, in this phone's language (src/slides.js) ----
const slides = []; // this talk's, newest last
let slideAt = -1; // the one shown in the sheet; -1 follows the newest
$('slide').setAttribute('aria-label', t('slide'));
$('slide').title = t('slide');
$('slide-title').textContent = t('slide');
$('slide-prev').setAttribute('aria-label', t('prevSlide'));
$('slide-next').setAttribute('aria-label', t('nextSlide'));
function onSlide(s) {
  if (!s) return;
  const i = slides.findIndex((x) => x.id === s.id);
  if (i >= 0) slides[i] = s;
  else {
    slides.push(s);
    if (slides.length > 12) slides.shift();
    if (!$('dlg-slide').open) { $('slide').classList.add('new'); $('slide').setAttribute('aria-label', `${t('slide')} · ${t('newSlide')}`); }
  }
  $('slide').classList.remove('hidden');
  renderSlide();
}
function clearSlides() { slides.length = 0; slideAt = -1; $('slide').classList.add('hidden', 'new'); if ($('dlg-slide').open) $('dlg-slide').close(); }
function renderSlide() {
  if (!slides.length) return;
  const i = slideAt < 0 ? slides.length - 1 : Math.min(slideAt, slides.length - 1);
  const s = slides[i];
  const txt = s.text?.[channel()] || s.text?.orig || null;
  const src = `/api/stages/${encodeURIComponent(stageId)}/slides/${encodeURIComponent(s.id)}`;
  if ($('slide-img').getAttribute('src') !== src) $('slide-img').src = src;
  $('slide-img').alt = txt?.title || t('slide');
  $('slide-text').innerHTML = s.reading ? `<p class="muted">${esc(t('slideReading'))}</p>`
    : txt ? `${txt.title ? `<h3>${esc(txt.title)}</h3>` : ''}${txt.lines?.length ? `<ul>${txt.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}` : '';
  $('slide-nav').classList.toggle('hidden', slides.length < 2);
  $('slide-pos').textContent = `${i + 1} ${t('slideOf')} ${slides.length}`;
  $('slide-prev').disabled = i === 0;
  $('slide-next').disabled = i === slides.length - 1;
}
$('slide').onclick = () => { slideAt = -1; $('slide').classList.remove('new'); $('slide').setAttribute('aria-label', t('slide')); renderSlide(); $('dlg-slide').showModal(); };
$('slide-close').onclick = () => $('dlg-slide').close();
$('slide-prev').onclick = () => { slideAt = Math.max(0, (slideAt < 0 ? slides.length - 1 : slideAt) - 1); renderSlide(); };
$('slide-next').onclick = () => { const i = (slideAt < 0 ? slides.length - 1 : slideAt) + 1; slideAt = i >= slides.length - 1 ? -1 : i; renderSlide(); };

// ---- Aa reading settings sheet ----
$('set-title').textContent = t('settings');
$('l-size').textContent = t('textSize');
$('l-font').textContent = t('font');
$('l-lh').textContent = t('lineSpacing');
$('l-flow').textContent = t('flow');
$('l-dual').textContent = t('dual');
$('smaller').setAttribute('aria-label', t('smaller'));
$('bigger').setAttribute('aria-label', t('bigger'));
segment($('font-opts'), readingItems.font(), prefs.font || 'default', (v) => { prefs = setReadingPref('font', v); scrollEnd(); });
segment($('lh-opts'), readingItems.lh(), prefs.lh || 1.5, (v) => { prefs = setReadingPref('lh', Number(v)); scrollEnd(); });
// Whole sentences: a caption appears once its sentence is finished and never changes after that. Calmer to read for
// some people (and what some captioning services offer as "complete phrases only"), a few seconds later.
const whole = () => !!prefs.whole;
segment($('flow-opts'), [['word', esc(t('wordByWord'))], ['whole', esc(t('wholeSentences'))]], whole() ? 'whole' : 'word', (v) => { prefs = setReadingPref('whole', v === 'whole'); renderAll(); });
$('settings').onclick = () => { previewFonts($('font-opts')); $('dlg-set').showModal(); };
$('set-close').onclick = () => $('dlg-set').close();
for (const d of ['dlg-ai', 'dlg-set', 'dlg-slide', 'dlg-term']) $(d).addEventListener('click', (e) => { if (e.target === $(d)) $(d).close(); }); // tap outside closes

// Before the room's answer to a new language arrives, the language is its own channel.
const channel = () => hello?.map?.[lang] || (hello?.stage?.languages?.includes(lang) ? lang : 'orig');
const hasAudio = () => channel() !== 'orig' && (hello?.stage?.audioLangs || []).includes(lang);
// 🎧 Listen: on Original, the room's own sound where the room allows it (hearing aids, earbuds). In a translation, the
// AI's natural voice where the room has one, otherwise the phone reads the captions aloud (speak.js).
const listenMode = () => (channel() === 'orig' ? (hello?.stage?.roomSound ? 'room' : null) : hasAudio() ? 'ai' : canSpeak(lang) ? 'device' : null);
const speaker = new Speaker();
let listenWith = null;
if (typeof speechSynthesis !== 'undefined') speechSynthesis.addEventListener?.('voiceschanged', () => $('listen').classList.toggle('hidden', !listenMode()));

// What this phone asks the room for: its caption languages, and the sound it listens to.
const wants = () => ({
  langs: [lang || 'orig', dual ? 'orig' : null].filter(Boolean),
  audio: !listening ? '0' : listenWith === 'ai' ? lang : listenWith === 'room' ? 'orig' : '0',
});
/** New languages or sound, on the same connection: no gap, no reconnecting. */
const resubscribe = () => { const w = wants(); sock.subscribe(w.langs, w.audio); };
const setTalk = (title, speaker) => { $('talk').textContent = [title, speaker].filter(Boolean).join(' · '); };
const sock = new Socket(() => wsUrl('/ws/view', { stage: stageId, langs: wants().langs.join(','), audio: wants().audio }), {
  message(m) {
    if (m.type === 'hello') onHello(m);
    else if (m.type === 'caption') onCaption(m);
    else if (m.type === 'pause') showPause(m);
    else if (m.type === 'listen') onListen(m);
    else if (m.type === 'title') setTalk(m.title, m.speaker);
    else if (m.type === 'slide') onSlide(m.slide);
    else if (m.type === 'talk') {
      setTalk(m.title, m.speaker);
      if (m.talk !== hello?.talk) { clearSlides(); if (hello) hello.talk = m.talk; for (const s of Object.values(states)) s.clear(); for (const p of Object.values(pacers)) p.clear(); renderAll(); toast(t('talkChanged')); }
    }
  },
  binary(ab) { if (listening) (listenWith === 'room' ? roomPlayer : player).push(ab); },
  close(e) { if (e.code === 4004) location.href = '/'; },
});
// Back from the background, however briefly: a phone suspends the page and its socket can be dead while it still
// looks open (iOS), so reconnect at once and get the history, instead of showing the old text as if it were live.
// Until the new hello, the status says Reconnecting and the text is dimmed. Same on a restore from the back/forward cache.
let hiddenAt = 0;
let backAt = 0;
const comeBack = () => {
  if (Date.now() - backAt < 1000) return; // a bfcache restore fires both events: one reconnect
  backAt = Date.now();
  // The old socket may still count as a listener of the room's sound on the server until it times out (≈ 50 s):
  // a "full" answer in that minute is that ghost, not a full room (onListen tries again).
  if (listening && listenWith === 'room') soundRetryUntil = Date.now() + 60000;
  sock.reconnect();
  showStatus();
};
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') hiddenAt = Date.now();
  else if (hiddenAt && Date.now() - hiddenAt > 1000) comeBack();
});
addEventListener('pageshow', (e) => { if (e.persisted) comeBack(); });

let langsKey = '';
function onHello(m) {
  const sameTalk = !!hello && hello.talk === m.talk; // a reconnect in the same talk: keep the scrollback (CaptionState.load)
  if (hello && !sameTalk) { for (const s of Object.values(states)) s.clear(); for (const p of Object.values(pacers)) p.clear(); toast(t('talkChanged')); } // a new talk while away
  if (!sameTalk) clearSlides();
  if (m.slide) onSlide(m.slide);
  const place = sameTalk && !follow ? $('scroll').scrollTop : null; // reading further up: stay there
  hello = m;
  document.title = `${m.stage.name} · ${ev.name}`;
  $('stage').textContent = m.stage.name;
  setTalk(m.stage.title, m.stage.speaker);
  const langs = m.stage.languages;
  if (!lang || !langs.includes(lang)) {
    const pref = (navigator.language || 'es').slice(0, 2);
    const next = langs.includes(pref) ? pref : 'orig';
    if (next !== lang) { lang = next; return resubscribe(); }
  }
  // The same languages as before (every language switch answers with a hello): leave the control alone, its thumb is gliding.
  if (langs.join() !== langsKey) {
    langsKey = langs.join();
    segment($('langs'), langs.map((l) => [l, esc(l === 'orig' ? t('original') : langLabel(l, ev.languages))]), lang, pickLang);
  } else pressSegment($('langs'), lang);
  fitLangs();
  $('text').classList.remove('stale');
  for (const [ch, hist] of Object.entries(m.history)) {
    const s = (states[ch] ??= new CaptionState());
    s.load(hist, m.partial[ch], sameTalk);
    pacer(ch).load([...s.finals, m.partial[ch]].filter(Boolean)); // already said: shown at once
  }
  $('listen').classList.toggle('hidden', !listenMode());
  if (m.listen) onListen(m.listen);
  $('orig').classList.toggle('hidden', !dual || channel() === 'orig');
  $('doc').href = docUrl();
  $('ai-doc').href = docUrl();
  showPause(m.pause);
  renderAll();
  if (place != null) { follow = false; $('scroll').scrollTop = place; $('tolive').classList.remove('hidden'); }
  showStatus(); // connected now: say so at once, not at the next tick
}

/** A break or music in the room: say so above the captions (they stop on purpose, nothing is broken). */
let pauseNow = null;
function showPause(p) {
  pauseNow = p;
  const v = pauseView(p);
  const el = $('pause');
  el.classList.toggle('hidden', !v);
  if (!v) return;
  el.className = `w-pause ${v.kind}`;
  el.innerHTML = v.kind === 'music'
    ? `<span class="w-pause-ic">${icon('music')}</span><span>${esc(v.back)}</span>`
    : `<span class="w-pause-ic">${icon('pause')}</span><div><b>${esc(v.title)}</b>${v.back ? `<span>${esc(v.back)}</span>` : ''}${v.next ? `<span class="next">${esc(v.next)}</span>` : ''}</div>`;
}

// More languages than fit on a phone: the tabs scroll sideways, the cut edge fades (there are more), the chosen one shows.
function fitLangs() {
  const el = $('langs');
  const mark = () => el.classList.toggle('more', el.scrollWidth - el.scrollLeft - el.clientWidth > 2);
  el.onscroll ??= mark;
  el.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  mark();
}
addEventListener('resize', () => fitLangs());

function onCaption(seg) {
  pacer(seg.channel).push(seg);
  if (listening && listenWith === 'device' && seg.final && seg.channel === channel()) speaker.say(seg.text);
  // Screen readers hear each caption once, when it's final, not every word while it's being written.
  if (seg.final && seg.channel === channel() && seg.text) {
    const live = document.getElementById('sr-live');
    live.append(Object.assign(document.createElement('p'), { textContent: seg.text }));
    while (live.childElementCount > 3) live.firstElementChild.remove();
  }
}

/** A caption as it's shown now (some of its words, or all of them). */
function onShown(seg) {
  const s = (states[seg.channel] ??= new CaptionState());
  const first = !s.finals.length && !s.partial;
  s.apply(seg);
  if (first && seg.channel === channel()) renderAll(); // the first words: the empty state goes
  else if (seg.channel === channel()) renderMain(seg);
  if (dual && seg.channel === 'orig' && channel() !== 'orig') renderOrig();
  if (seg.channel === channel()) renderPip();
  pulse();
}

// ---- rendering ----
const nearBottom = () => $('scroll').scrollHeight - $('scroll').scrollTop - $('scroll').clientHeight < 120;
let follow = true;
let scrollQueued = 0; // one scroll per frame, however many words landed in it
$('scroll').addEventListener('scroll', () => { follow = nearBottom(); $('tolive').classList.toggle('hidden', follow); }, { passive: true });
$('tolive').onclick = () => { follow = true; $('tolive').classList.add('hidden'); $('scroll').scrollTo({ top: $('scroll').scrollHeight, behavior: calm.matches ? 'instant' : 'smooth' }); };

const flow = new CaptionFlow($('text'));
let shownChannel = null;
function renderAll() {
  const s = states[channel()] || new CaptionState();
  flow.render([...s.finals, whole() ? null : s.partial]);
  const empty = !s.finals.length && !s.partial;
  // Before the talk: what's next and where the captions will be, not just "waiting".
  const next = hello?.stage?.next;
  if (empty) {
    $('text').innerHTML = `<div class="empty w-empty">${LOGO}${next
      ? `<span class="k">${esc(t('nextUp'))}</span><span class="tt">${esc(next.title)}</span><span class="when">${icon('clock')} ${esc(hhmm(next.start))}${next.speaker ? ` · ${esc(next.speaker)}` : ''}</span><span class="s">${esc(t('startsHere'))}</span>`
      : `<span class="s">${esc(t('waiting'))}</span>`}${ev.logo ? `<span class="w-credit">${esc(t('captionsBy'))}</span>` : ''}</div>`;
  }
  $('text').lang = channel() !== 'orig' ? channel() : hello?.stage?.source && hello.stage.source !== 'auto' ? hello.stage.source : ''; // screen readers read captions in their language
  $('ai').classList.toggle('hidden', empty && !states.orig?.finals.length); // "what did I miss?" once there's something to miss
  renderOrig();
  renderPip();
  // A whole new screen of text: straight to the end (scrolling through it would take a second and look like a replay).
  follow = true;
  $('tolive').classList.add('hidden');
  glideAnim?.cancel();
  glideAnim = null;
  $('scroll').scrollTo({ top: $('scroll').scrollHeight, behavior: 'instant' });
  // Another language: the new text fades up into place.
  if (shownChannel && shownChannel !== channel() && !calm.matches) $('text').animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.16, 1, .3, 1)' });
  shownChannel = channel();
}
const hhmm = (ms) => new Date(ms).toLocaleTimeString(document.documentElement.lang, { hour: '2-digit', minute: '2-digit' });

const LOGO = '<svg class="oc-logo typing" viewBox="0 0 878 664" aria-hidden="true"><use class="o" href="/brand/sprite.svg#oc-o"/><use class="ln" href="/brand/sprite.svg#oc-line"/></svg>';

function renderMain(seg) {
  if (whole() && !seg.final) return; // whole sentences: the one being spoken isn't shown yet
  flow.update(seg);
  scrollEnd();
}

function renderOrig() {
  if (!dual || channel() === 'orig') return;
  $('orig').querySelector('span').textContent = (states.orig?.tail(150)) || '…';
}

// Following live: a new line doesn't jump the text up, it glides (Apple Music lyrics). Only when a line is added, never
// per word; the glide picks up from wherever the previous one was.
let glideAnim = null;
function scrollEnd() {
  if (!follow) return;
  // A background tab gets no frames: keep it pinned now, or old lines leaving the top would read as scrolling away.
  if (document.hidden) { $('scroll').scrollTop = $('scroll').scrollHeight; return; }
  if (scrollQueued) return;
  scrollQueued = requestAnimationFrame(() => {
    scrollQueued = 0;
    const sc = $('scroll');
    const d = sc.scrollHeight - sc.clientHeight - sc.scrollTop;
    sc.scrollTop = sc.scrollHeight;
    if (d < 1 || d > sc.clientHeight || calm.matches || document.hidden) return;
    const from = glideAnim ? new DOMMatrixReadOnly(getComputedStyle($('text')).transform).m42 : 0;
    glideAnim?.cancel();
    glideAnim = $('text').animate([{ transform: `translateY(${d + from}px)` }, { transform: 'none' }], { duration: 560, easing: 'cubic-bezier(.16, 1, .3, 1)' });
    glideAnim.onfinish = () => { glideAnim = null; };
  });
}

// ---- status ----
let last = 0;
function pulse() { last = Date.now(); }
let connected = false; // has been connected once: a drop now is "reconnecting", not "connecting"
function showStatus() {
  const brk = !!pauseNow?.brk;
  const down = !navigator.onLine || !sock.ready;
  if (sock.ready) connected = true;
  const live = !down && !brk && Date.now() - last < 15000;
  const said = Object.values(states).some((x) => x.finals.length);
  const el = $('status');
  const cls = 'chip w-status' + (live ? ' live' : brk || (down && connected) ? ' warn' : '');
  if (el.className !== cls) el.className = cls;
  el.querySelector('.dot').className = 'dot' + (live ? ' live' : '');
  const txt = !navigator.onLine ? t('noNet') : !sock.ready ? t(connected ? 'reconnecting' : 'connecting')
    : brk ? t('brk') : live ? t('live') : said ? t('paused') : t('noSound'); // short: it shares the bar with the room's name
  const span = el.querySelector('span:last-child');
  if (span.textContent !== txt) span.textContent = txt;
  $('text').classList.toggle('down', down && connected);
}
showStatus();
setInterval(() => document.hidden || showStatus(), 1000); // nothing to show in the background
// The phone's network: say so at once, and come back the moment it's there (not after the retry's wait).
addEventListener('offline', showStatus);
addEventListener('online', () => { sock.reconnect(); showStatus(); });

// ---- controls ----
function pickLang(v) {
  lang = v;
  store.set(`lang.${stageId}`, lang);
  store.set('lang', lang);
  // What this phone already has in that language, at once; otherwise the current text dims until the room answers.
  if (states[channel()]?.finals.length) renderAll(); else $('text').classList.add('stale');
  // Listening goes on in the new language (its voice, or the room's sound on Original): this tap starts it.
  if (listening) setListen(true); else resubscribe();
}
const setSize = (d) => { size = Math.min(56, Math.max(14, size + d)); store.set('size', size); document.documentElement.style.setProperty('--size', size + 'px'); $('size-val').textContent = size; scrollEnd(); };
$('size-val').textContent = size;
$('smaller').onclick = () => setSize(-2);
$('bigger').onclick = () => setSize(2);
const setDual = (on) => {
  dual = on; store.set('dual', dual);
  $('dual').setAttribute('aria-pressed', dual);
  $('dual-sw').checked = dual;
  resubscribe();
};
$('dual').setAttribute('aria-pressed', dual);
$('dual-sw').checked = dual;
$('dual').onclick = () => setDual(!dual);
$('dual-sw').onchange = () => setDual($('dual-sw').checked);
const showListenButton = () => {
  $('listen').setAttribute('aria-pressed', listening);
  $('listen').setAttribute('aria-label', listening ? t('stopListen') : t('listen')); // phones show the icon alone
  $('listen').innerHTML = `${icon('headphones')}<span class="w-eq" aria-hidden="true"><i></i><i></i><i></i></span><span class="lbl">${esc(listening ? t('stopListen') : t('listen'))}</span>`;
};
showListenButton();
/** Listen on or off, or on with what the current language offers (after switching languages). */
async function setListen(on) {
  const was = listenWith;
  listenWith = on ? listenMode() : null;
  listening = !!listenWith;
  showListenButton();
  showListenNote(null);
  if (listenWith !== 'device') speaker.stop();
  if (listenWith !== 'ai') player.stop();
  if (listenWith !== 'room') roomPlayer.stop();
  resubscribe(); // the AI's voice and the room's sound come over the socket
  if (listenWith === 'device') speaker.start(lang); // the phone's voice follows the language
  if (listenWith === was) return;
  if (listenWith === 'ai') await player.start();
  else if (listenWith === 'room') await roomPlayer.start();
  if (listenWith) toast(t(listenWith === 'room' ? 'roomSoundHint' : 'listenHint'));
}
$('listen').onclick = () => setListen(!listening);

/** The server's answer about the room's sound: refused (full, or turned off) → stop and say why. */
let soundRetryUntil = 0;
function onListen(l) {
  if (l.channel !== 'orig' || listenWith !== 'room' || !listening) return;
  if (l.ok) { soundRetryUntil = 0; return showListenNote(null); }
  if (l.why === 'full' && Date.now() < soundRetryUntil) { setTimeout(() => listening && resubscribe(), 5000); return; } // our own old connection, still counted (comeBack)
  listening = false;
  listenWith = null;
  roomPlayer.stop();
  showListenButton();
  showListenNote(l.why === 'full' ? t('soundFull') : t('soundOff'));
}
/** A note that stays until it's closed or Listen is tapped again (a toast would be gone before it's read). */
function showListenNote(msg) {
  $('listen-note').classList.toggle('hidden', !msg);
  $('listen-note').querySelector('span').textContent = msg || '';
}
$('listen-note-close').onclick = () => showListenNote(null);

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
