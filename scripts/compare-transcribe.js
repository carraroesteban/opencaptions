#!/usr/bin/env node
// Live Translate vs Transcribe Live for a room's original-language captions (TRANSCRIBE_MODEL, docs/latency.md).
// Plays each sample in real time through both models at once, exactly like a room in `text` mode, and reports
// words wrong against the sample's script, delay from speech to first caption, and cost per hour from the usage
// Google reports. Needs GEMINI_API_KEY. Takes about as long as the samples (~5 min), costs about US$ 0.25.
//
//   npm run compare-transcribe
//   npm run compare-transcribe -- --files samples/talk-es.wav --transcribe gemini-3.5-transcribe-live
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { config } from '../src/config.js';
import { GeminiEngine } from '../src/engines/gemini.js';
import { Chunker, rms } from '../src/audio.js';
import { openAudio } from '../src/pull.js';
import { words, bestPrefixWer } from './wer.js';

// Both models: $3.50 per million input (audio) tokens, $21 per million output tokens (pricing page, 2026-10-09).
const USD_PER_M = { in: 3.5, out: 21 };
const VOCAB = ['Horizon Summit', 'María José Fernández', 'Hiroshi Tanaka', 'telehealth'];

/** Billed tokens from a session's usageMetadata messages. Counts grow during a session and start over after a reconnect. */
export function billedTokens(usages) {
  let bank = { in: 0, out: 0 }, last = { in: 0, out: 0 };
  for (const u of usages) {
    const cur = { in: u.promptTokenCount || 0, out: u.responseTokenCount || 0 };
    if (cur.in < last.in) bank = { in: bank.in + last.in, out: bank.out + last.out };
    last = cur;
  }
  return { in: bank.in + last.in, out: bank.out + last.out };
}

/** Median and 90th percentile of a list of numbers. */
export function pct(a) {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? { p50: s[Math.floor((s.length - 1) / 2)], p90: s[Math.min(s.length - 1, Math.ceil(s.length * 0.9) - 1)] } : null;
}

/** Plays one file through every model at once; resolves with one result per model. */
async function run(file, models) {
  const guess = /-es\b/.test(file) ? 'es' : 'en';
  const engines = models.map(({ id, transcribeOnly }) => {
    const e = new GeminiEngine({ label: id, target: guess === 'es' ? 'en' : 'es', echo: true, vocabulary: VOCAB, transcribeOnly });
    const r = { model: id, text: '', firstWords: [], firstFinal: [], langs: {}, usages: [], errors: [], interims: [], finals: 0, wordsAt: 0, finalAt: 0 };
    e.on('interim', ({ text }) => {
      if (r.interims.length < 8) r.interims.push(text); // do they repeat the sentence so far, or add new words?
      if (text.trim() && r.wordsAt) { r.firstWords.push(Date.now() - r.wordsAt); r.wordsAt = 0; }
    });
    e.on('input', ({ text, lang }) => {
      if (!text.trim()) return;
      r.text += text;
      r.finals++;
      r.langs[lang || '(none)'] = (r.langs[lang || '(none)'] || 0) + 1;
      if (r.wordsAt) { r.firstWords.push(Date.now() - r.wordsAt); r.wordsAt = 0; }
      if (r.finalAt) { r.firstFinal.push(Date.now() - r.finalAt); r.finalAt = 0; }
    });
    e.on('usage', (u) => r.usages.push(u));
    e.on('error', (m) => r.errors.push(m));
    e.on('log', (m) => console.log(`  ${id}: ${m}`));
    e.start();
    return { e, r };
  });
  // Speech onset like the dashboard measures it: the first loud chunk after 0.8 s of quiet.
  let lastSpeech = 0, sec = 0;
  const chunker = new Chunker((c) => {
    sec += c.length / 32000;
    const now = Date.now();
    if (rms(c) >= config.speechRms) {
      if (now - lastSpeech > 800) for (const { r } of engines) { r.wordsAt = now; r.finalAt = now; }
      lastSpeech = now;
    }
    for (const { e } of engines) e.sendAudio(c);
  });
  const audio = openAudio(file, { realtime: true });
  audio.on('data', (b) => chunker.push(b));
  await new Promise((resolve, reject) => { audio.on('end', resolve); audio.on('error', reject); });
  for (const { e } of engines) e.endAudio();
  await new Promise((r) => setTimeout(r, 6000)); // the last words arrive a few seconds after the audio
  return engines.map(({ e, r }) => { r.status = e.status(); e.stop(); return { ...r, sec }; });
}

function report(file, results) {
  const refFile = file.replace(/\.[a-z0-9]+$/i, '.txt');
  const ref = fs.existsSync(refFile) ? words(fs.readFileSync(refFile, 'utf8')) : null;
  console.log(`\n── ${file} (${Math.round(results[0].sec)} s${ref ? `, script ${path.basename(refFile)}` : ', no script: no word count'}) ──`);
  return results.map((r) => {
    const hyp = words(r.text);
    const wer = ref && hyp.length ? bestPrefixWer(ref, hyp) : null;
    const tok = billedTokens(r.usages);
    // Usage that doesn't add up to the audio played (Google bills 25 tokens per second) isn't the bill: don't price it.
    const perSec = tok.in / r.sec, billable = perSec > 20 && perSec < 30;
    const usdHour = billable ? ((tok.in * USD_PER_M.in + tok.out * USD_PER_M.out) / 1e6) * (3600 / r.sec) : null;
    const fw = pct(r.firstWords), ff = pct(r.firstFinal);
    const s = (ms) => `${(ms / 1000).toFixed(1)} s`;
    console.log(`${r.model}
  words right          ${wer != null ? `${(100 - wer * 100).toFixed(1)} % (${(wer * 100).toFixed(1)} % wrong)` : hyp.length ? '—' : '✗ no transcript'}
  speech → first words ${fw ? `${s(fw.p50)} median, ${s(fw.p90)} p90 (${r.firstWords.length} sentences)` : '—'}
  speech → final text  ${ff ? `${s(ff.p50)} median, ${s(ff.p90)} p90 (${r.finals} pieces)` : '—'}
  language per piece   ${Object.entries(r.langs).map(([l, n]) => `${l} ×${n}`).join(', ') || '—'}
  cost per hour        ${usdHour != null ? `US$ ${usdHour.toFixed(2)} (${tok.in} in / ${tok.out} out tokens)` : tok.in ? `not measurable: usage says ${perSec.toFixed(1)} audio tokens/s, Google bills 25 (check the billing page)` : 'no usage reported (check the billing page)'}
  connection           ${r.status.reconnects} reconnects, ${r.errors.length} errors${r.errors.length ? ` (last: ${r.errors.at(-1).slice(0, 120)})` : ''}, config ${r.status.level}`);
    return { file, model: r.model, sec: Math.round(r.sec), wer, firstWords: fw, firstFinal: ff, langs: r.langs, tokens: tok, usdHour, reconnects: r.status.reconnects, errors: r.errors, finals: r.finals, interims: r.interims, text: r.text.trim() };
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] ?? d : d; };
  if (!config.geminiApiKey && !config.vertex) {
    console.error('✗ GEMINI_API_KEY is not set (.env or data/secrets.json). This compares two Gemini models with your key.');
    process.exit(1);
  }
  const files = arg('files', ['samples/talk-en.wav', 'samples/talk-es.wav', 'samples/tor-talk.wav'].filter((f) => fs.existsSync(f)).join(',')).split(',');
  config.transcribeModel = arg('transcribe', config.transcribeModel || 'gemini-3.5-transcribe-live');
  const models = [{ id: arg('translate', config.model), transcribeOnly: false }, { id: config.transcribeModel, transcribeOnly: true }];
  config.model = models[0].id;
  console.log(`comparing ${models.map((m) => m.id).join(' vs ')} on ${files.join(', ')} (real time, both at once)…`);
  const rows = [];
  for (const f of files) rows.push(...report(f, await run(f, models)));
  const out = path.join(config.dataDir, `transcribe-compare-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(out, JSON.stringify(rows, null, 2));
  console.log(`\nreport: ${out}\nGood enough to switch: words right within ~1 point of Live Translate, a similar delay, and a language on every piece`);
  console.log('(a missing language means bilingual talks lose the automatic same-language captions). See docs/latency.md.');
  process.exit(rows.every((r) => r.text) ? 0 : 2);
}
