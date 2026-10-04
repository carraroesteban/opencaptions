#!/usr/bin/env node
// End-to-end check of local mode (ENGINE=local) without the server: streams a talk through your speech server in
// real time exactly like a room would, then translates what it heard with your local text model.
// Reports accuracy (for the bundled samples, which come with their script), delay and speed.
//
//   node scripts/check-local.js [--input samples/talk-es.wav] [--seconds 30] [--target en] [--source auto]
//   npm run check           (runs this automatically when ENGINE=local)
import fs from 'node:fs';
process.env.ENGINE = 'local';
const { config } = await import('../src/config.js');
const { LocalEngine } = await import('../src/engines/local.js');
const { asrInfo, asrReachable } = await import('../src/local/asr.js');
const { llmInfo, llmHealth } = await import('../src/local/llm.js');
const { translateText } = await import('../src/translate.js');
const { Chunker } = await import('../src/audio.js');
const { openAudio } = await import('../src/pull.js');

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] ?? d : d; };
const input = arg('input', 'samples/talk-en.wav');
const seconds = Number(arg('seconds', 30));
const source = arg('source', 'auto');
const refFile = input.replace(/\.[a-z0-9]+$/i, '.txt');
const reference = fs.existsSync(refFile) ? fs.readFileSync(refFile, 'utf8') : '';
const guessLang = /-es\b/.test(input) ? 'es' : /-en\b/.test(input) ? 'en' : null;
const target = arg('target', guessLang === 'es' ? 'en' : 'es');
const s = (ms) => `${(ms / 1000).toFixed(1)} s`;

const models = [...new Set([llmInfo().model, llmInfo().mtModel])].join(' + ');
console.log(`speech  ${asrInfo().label} · ${asrInfo().url} (${asrInfo().api})\ntext    ${config.localLlmOff ? 'off' : `${models} · ${llmInfo().url} (${llmInfo().api})`}\ninput   ${input} · first ${seconds} s → ${target}\n`);

// ---- 1. are the servers there? ----
const asrUp = await asrReachable();
const llm = config.localLlmOff ? { ok: false, off: true } : await llmHealth();
console.log(`${asrUp ? '✓' : '✗'} speech server ${asrUp ? 'reachable' : `not reachable — start it with: npm run local`}`);
if (llm.off) console.log('• text model off (LOCAL_LLM=off): transcription only');
else console.log(`${llm.ok ? (llm.hasModel ? '✓' : '⚠') : '✗'} text model ${!llm.ok ? 'server not reachable (Ollama: ollama serve)' : llm.hasModel ? `${models} installed` : llm.missing.map((m) => `"${m}" not installed — ollama pull ${m}`).join(' · ')}`);
if (!asrUp) process.exit(1);

// ---- 2. stream the talk in real time ----
console.log('\nstreaming (committed text in cyan, provisional in grey)…\n');
const engine = new LocalEngine({ label: 'check', target, source, vocabulary: ['Nerdearla', 'Kubernetes', 'OpenTelemetry', 'on-call', 'RAG', 'embeddings'], languages: ['es', 'en', 'pt'] });
let committed = '', firstText = 0, firstCommit = 0, interims = 0, t0 = 0, lang = null;
const lags = [];
const refWords = words(reference);
const wordsPerSec = refWords.length / (fs.statSync(input).size / 32000);
engine.on('log', (m) => console.log(`  log: ${m}`));
engine.on('error', (m) => console.log(`  error: ${m}`));
engine.on('interim', ({ text }) => { interims++; firstText ||= Date.now(); process.stdout.write(`\x1b[90m…${text.slice(-50)}\x1b[0m\n`); });
engine.on('input', ({ text, lang: l }) => {
  if (!text) return;
  firstText ||= Date.now();
  firstCommit ||= Date.now();
  lang = l || lang;
  committed += text;
  process.stdout.write(`\x1b[36m${text}\x1b[0m\n`);
});
engine.start();
await new Promise((r) => { const w = setInterval(() => { if (engine.state === 'live') { clearInterval(w); r(); } }, 50); });

const audio = openAudio(input, { realtime: true });
const chunker = new Chunker((c) => engine.sendAudio(c));
audio.on('data', (b) => { t0 ||= Date.now(); chunker.push(b); });
audio.on('error', (e) => { console.error(`✗ audio: ${e.message}`); process.exit(1); });
// Every second: how far behind the speaker are the committed captions? (the samples are read at an even pace)
const lagTimer = setInterval(() => {
  if (!t0 || !wordsPerSec) return;
  const heard = words(committed).length / wordsPerSec;
  const elapsed = (Date.now() - t0) / 1000;
  if (elapsed > 3) lags.push(elapsed - heard);
}, 1000);
await new Promise((r) => setTimeout(r, seconds * 1000));
audio.stopAudio();
clearInterval(lagTimer);
engine.endAudio();
// wait for the last final pass
const waitStart = Date.now();
while ((engine.busy || engine.finals.length) && Date.now() - waitStart < 60000) await new Promise((r) => setTimeout(r, 200));
const st = engine.status();
engine.stop();

// ---- 3. translate what we heard ----
const sentences = (committed.match(/[^.!?¿¡]+[.!?]+/g) || [committed]).map((x) => x.trim()).filter(Boolean).slice(0, 3);
const translations = [];
if (llm.ok && sentences.length) {
  console.log(`\ntranslating ${sentences.length} sentence(s) → ${target}…`);
  for (const x of sentences) {
    const a = Date.now();
    try {
      const out = await translateText({ text: x, from: lang || guessLang, to: target });
      translations.push({ ms: Date.now() - a, out });
      console.log(`  ${x}\n  → \x1b[33m${out}\x1b[0m (${s(Date.now() - a)})`);
    } catch (e) { console.log(`  ✗ ${e.message}`); }
  }
}

// ---- 4. report ----
const hyp = words(committed);
const wer = reference ? bestPrefixWer(refWords, hyp) : null;
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
console.log('\n──────── summary ────────');
console.log(`detected language     ${lang || '—'}`);
console.log(`transcript            ${hyp.length} words${wer != null ? ` · word error rate ${(wer * 100).toFixed(1)} % vs ${refFile}` : ''}`);
console.log(`first words on screen ${firstText ? s(firstText - t0) : '—'} after the audio started (provisional) · first committed ${firstCommit ? s(firstCommit - t0) : '—'}`);
console.log(`captions behind the speaker ≈ ${avg(lags) != null ? `${avg(lags).toFixed(1)} s on average (committed words)` : '—'}`);
console.log(`speech server         ${st.requests} passes (${st.partials} provisional, ${st.finals} final, ${st.skipped} skipped while busy) · ${st.avgMs ?? '—'} ms per pass`);
if (translations.length) console.log(`translation           ${Math.round(avg(translations.map((t) => t.ms)))} ms per sentence (${llmInfo().mtModel})`);
console.log(`\nfaster machine or smaller model → lower delay; bigger model → fewer errors. See docs/local.md.`);
process.exit(hyp.length ? 0 : 2);

function words(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}\s'-]/gu, ' ').split(/\s+/).filter(Boolean); }

/** Word error rate against the part of the script that was played (best-matching prefix length). */
function bestPrefixWer(ref, h) {
  let best = 1;
  for (let n = Math.max(1, h.length - 25); n <= Math.min(ref.length, h.length + 25); n++) best = Math.min(best, editDistance(ref.slice(0, n), h) / n);
  return best;
}
function editDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
