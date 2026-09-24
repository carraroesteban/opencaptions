#!/usr/bin/env node
// Quick end-to-end check of your Gemini API key + Live Translate model, without the server.
//   node scripts/check-gemini.js [--input samples/talk-en.wav] [--target es] [--seconds 25] [--raw]
if (process.argv.includes('--raw')) process.env.OC_DEBUG_RAW = '1';
import { config } from '../src/config.js';
import { GeminiEngine } from '../src/engines/gemini.js';
import { Chunker } from '../src/audio.js';
import { openAudio } from '../src/pull.js';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] ?? true : d; };
const input = arg('input', 'samples/talk-en.wav');
const target = arg('target', 'es');
const seconds = Number(arg('seconds', 25));

if (!config.geminiApiKey && !config.vertex) {
  console.error('✗ GEMINI_API_KEY is not set. Create one (free) at https://aistudio.google.com/apikey and put it in .env');
  process.exit(1);
}
console.log(`model: ${config.model}\ninput: ${input} → target: ${target}\n`);

const e = new GeminiEngine({ label: 'check', target, echo: true, vocabulary: ['Nerdearla', 'Kubernetes', 'OpenTelemetry'] });
let inText = '', outText = '', audioBytes = 0, firstIn = 0, firstOut = 0, firstInterim = 0, interims = 0, audioT0 = 0;
const t0 = Date.now();
const log = [];
const at = () => ((Date.now() - (audioT0 || t0)) / 1000).toFixed(1);
e.on('state', (s) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] state: ${s} (config: ${e.status().level})`));
e.on('log', (m) => console.log('  log:', m));
e.on('error', (m) => console.log('  error:', m));
e.on('interim', ({ text }) => { firstInterim ||= Date.now(); interims++; if (interims <= 6) log.push(`${at()}s interim: ${JSON.stringify(text)}`); });
e.on('input', ({ text, lang }) => { firstIn ||= Date.now(); if (log.length < 14) log.push(`${at()}s input:   ${JSON.stringify(text)}`); inText += text; process.stdout.write(`\x1b[36m${text}\x1b[0m`); if (lang && !e._lang) { e._lang = lang; } });
e.on('output', ({ text }) => { firstOut ||= Date.now(); if (log.length < 20) log.push(`${at()}s output:  ${JSON.stringify(text)}`); outText += text; process.stdout.write(`\x1b[33m${text}\x1b[0m`); });
e.on('audio', (b) => { audioBytes += b.length; });
e.start();

const audio = openAudio(input, { realtime: true });
const chunker = new Chunker((c) => e.sendAudio(c));
audio.on('data', (b) => { audioT0 ||= Date.now(); chunker.push(b); });
audio.on('error', (err) => { console.error(`\n✗ audio input: ${err.message}`); process.exit(1); });

setTimeout(() => {
  audio.stopAudio();
  e.endAudio();
  setTimeout(() => {
    e.stop();
    console.log('\n\n──────── summary ────────');
    console.log(`detected language: ${e._lang || '(not reported)'}`);
    console.log(`input transcription (${inText.length} chars): ${inText.trim().slice(0, 300) || '✗ none'}`);
    console.log(`translation → ${target} (${outText.length} chars): ${outText.trim().slice(0, 300) || '✗ none'}`);
    console.log(`translated audio received: ${(audioBytes / 48000).toFixed(1)} s`);
    const rel = (t) => (t ? ((t - audioT0) / 1000).toFixed(1) + 's' : '-');
    console.log(`timing from first audio sent → interim: ${rel(firstInterim)} (${interims} msgs) · first text: ${rel(firstIn)} · first translation: ${rel(firstOut)}`);
    console.log(`VAD_SILENCE_MS=${config.vadSilenceMs || 'default'}`);
    console.log('\nfirst messages:\n  ' + log.join('\n  '));
    console.log(`final config level: ${e.status().level} · reconnects: ${e.status().reconnects} · errors: ${e.status().errors}`);
    process.exit(inText && outText ? 0 : 2);
  }, 4000);
}, seconds * 1000);
