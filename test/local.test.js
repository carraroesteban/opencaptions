// Local engine (ENGINE=local): streaming Whisper, the speech/text server clients, and local translation.
// The speech server is faked: test audio encodes "which word is being spoken" in each 100 ms chunk, so the fake
// transcribes exactly what's in any slice of audio the engine sends — like a perfect Whisper.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const { config } = await import('../src/config.js');
const { LocalEngine, continuation, overlap } = await import('../src/engines/local.js');
const asr = await import('../src/local/asr.js');
const llm = await import('../src/local/llm.js');
const { translateText } = await import('../src/translate.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SCRIPT = 'welcome everyone to horizon summit today we talk about care at a distance and why the best technology is the one patients barely notice a few years ago a nurse in a small town had to drive two hours to show a test result'.split(' ');

// Speech chunk k carries the value 1000 + 10k in every sample (loud enough to count as speech); silence is 0.
const speech = (k) => { const b = Buffer.alloc(3200); for (let i = 0; i < 1600; i++) b.writeInt16LE(1000 + 10 * k, i * 2); return b; };
const silence = () => Buffer.alloc(3200);

function fakeWhisper({ perWord = 4, minChunks = 2, unstable = true, lang = 'en', calls = [] } = {}) {
  return async (pcm, opts) => {
    calls.push({ seconds: pcm.length / 32000, language: opts.language, final: opts.final });
    await sleep(2);
    const seen = new Map();
    for (let off = 0; off + 3200 <= pcm.length; off += 3200) {
      const v = pcm.readInt16LE(off);
      if (v >= 1000) { const w = Math.floor(Math.round((v - 1000) / 10) / perWord); seen.set(w, (seen.get(w) || 0) + 1); }
    }
    const words = [...seen].filter(([, n]) => n >= minChunks).map(([w]) => SCRIPT[w % SCRIPT.length]);
    if (!opts.final && unstable && words.length) words[words.length - 1] += 'ish'; // Whisper's last word flickers
    return { text: words.join(' '), lang: typeof lang === 'function' ? lang(opts) : lang, noSpeech: 0 };
  };
}

function collect(engine) {
  const out = { inputs: [], interims: [] };
  engine.on('input', (e) => out.inputs.push(e));
  engine.on('interim', (e) => out.interims.push(e));
  out.text = () => out.inputs.map((e) => e.text).join('').replace(/\s+/g, ' ').trim();
  return out;
}

async function started(engine) {
  engine.start();
  for (let i = 0; i < 100 && engine.state !== 'live'; i++) await sleep(5);
  assert.equal(engine.state, 'live');
}
async function feed(engine, chunks) { for (const c of chunks) { engine.sendAudio(c); await sleep(1); } }
async function idle(engine) { for (let i = 0; i < 400 && (engine.busy || engine.finals.length); i++) await sleep(5); }

test('local: words are committed while the speaker talks, and the final pass completes the sentence', async () => {
  const calls = [];
  const e = new LocalEngine({ label: 't', target: 'es', transcriber: fakeWhisper({ calls }), ping: async () => true });
  const got = collect(e);
  await started(e);
  const n = 16 * 4; // 16 words
  await feed(e, [...Array(n).keys()].map(speech));
  const committedWhileSpeaking = got.inputs.length;
  await feed(e, Array(9).fill(0).map(silence)); // 900 ms pause → end of utterance
  await idle(e);
  e.stop();
  assert.ok(committedWhileSpeaking > 0, 'agreed words appear before the speaker pauses');
  assert.ok(got.interims.length > 0, 'provisional words are shown');
  assert.equal(got.text(), SCRIPT.slice(0, 16).join(' '), 'every word exactly once, no flickering "…ish" words');
  assert.equal(got.inputs.at(-1).finished, true);
  assert.equal(got.inputs.at(-1).lang, 'en');
  assert.ok(calls.some((c) => c.final) && calls.some((c) => !c.final));
});

test('local: a speaker who never pauses is cut, without losing or repeating words at the cut', async () => {
  const e = new LocalEngine({ label: 't', target: 'es', transcriber: fakeWhisper({ minChunks: 1 }), ping: async () => true });
  const got = collect(e);
  await started(e);
  await feed(e, [...Array(30 * 4).keys()].map(speech)); // 12 s without a pause
  await feed(e, [...Array(8 * 4).keys()].map((k) => speech(120 + k)));
  await feed(e, Array(9).fill(0).map(silence));
  await idle(e);
  e.stop();
  assert.equal(got.text(), SCRIPT.slice(0, 38).join(' '));
});

test('local: a language the room does not use is re-transcribed in the room\'s language', async () => {
  const calls = [];
  // Whisper "hears" Galician unless told the language.
  const e = new LocalEngine({ label: 't', target: 'en', languages: ['es', 'en'], transcriber: fakeWhisper({ calls, lang: (o) => o.language || 'gl', unstable: false }), ping: async () => true });
  e.lastLang = 'es';
  const got = collect(e);
  await started(e);
  await feed(e, [...Array(12).keys()].map(speech));
  await feed(e, Array(9).fill(0).map(silence));
  await idle(e);
  e.stop();
  assert.ok(calls.some((c) => c.final && c.language === 'es'), 'final pass repeated with language=es');
  assert.equal(got.inputs.at(-1).lang, 'es');
});

test('local: when the speech server goes away, utterances wait and are transcribed after it returns', async () => {
  let up = false;
  const whisper = fakeWhisper({ unstable: false });
  const e = new LocalEngine({ label: 't', target: 'es', transcriber: async (pcm, o) => { if (!up) throw new TypeError('fetch failed'); return whisper(pcm, o); }, ping: async () => up });
  e.backoff = 20;
  const got = collect(e);
  e.start();
  await feed(e, [...Array(12).keys()].map(speech));
  await feed(e, Array(9).fill(0).map(silence));
  await sleep(30);
  assert.notEqual(e.state, 'live');
  assert.equal(got.inputs.length, 0);
  up = true;
  for (let i = 0; i < 200 && !got.inputs.length; i++) await sleep(10);
  await idle(e);
  e.stop();
  assert.equal(got.text(), SCRIPT.slice(0, 3).join(' '));
});

test('local: short noises are not sent to the speech server', async () => {
  const calls = [];
  const e = new LocalEngine({ label: 't', target: 'es', transcriber: fakeWhisper({ calls }), ping: async () => true });
  await started(e);
  await feed(e, [speech(0), speech(1), ...Array(9).fill(0).map(silence)]); // 200 ms cough
  await idle(e);
  e.stop();
  assert.equal(calls.length, 0);
});

test('local: continuation and overlap helpers', () => {
  const w = (s) => s.split(' ');
  assert.equal(continuation(w('hello world how are you'), w('hello world')), 2);
  assert.equal(continuation(w('Hello, world! How are you'), w('hello world')), 2, 'punctuation and case are ignored');
  assert.equal(continuation(w('so hello world how are'), w('hello world')), 3, 'Whisper added a word in front');
  assert.equal(overlap(w('we talk about telehealth'), w('telehealth in clinics')), 1);
  assert.equal(overlap(w('this is it'), w('it is')), 0, 'a single short word is not enough');
  assert.equal(overlap(w('the nurse drove off'), w('drove off to the clinic')), 2);
});

test('local: transcript cleaning drops Whisper hallucinations, not real words', () => {
  assert.equal(asr.cleanTranscript('Hola a todos. Subtítulos realizados por la comunidad de Amara.org'), 'Hola a todos.');
  assert.equal(asr.cleanTranscript('Thanks for watching!'), '');
  assert.equal(asr.cleanTranscript('¿Preguntas? Gracias por venir.'), '¿Preguntas? Gracias por venir.');
  assert.equal(asr.cleanTranscript('[Música] Bienvenidos (risas) a Horizon Summit ♪'), 'Bienvenidos a Horizon Summit');
  assert.equal(asr.cleanTranscript('no no no no no no vamos'), 'no no no vamos');
  // Real speech that only contains a stock word or phrase is kept.
  for (const real of ['So the consumer will subscribe to the orders topic and process each event', 'nos vemos en el próximo slide', 'www.horizonsummit.org es la web', 'Nos vemos en el próximo Horizon Summit.']) {
    assert.equal(asr.cleanTranscript(real), real);
  }
  assert.equal(asr.cleanTranscript('¡Suscríbete al canal! Gracias por ver el video.'), '');
  assert.equal(asr.langCode('spanish'), 'es');
  assert.equal(asr.langCode('<|en|>'), 'en');
});

// ---------- HTTP clients against fake servers ----------
async function fakeServer(handler) {
  const reqs = [];
  const srv = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    reqs.push({ method: req.method, url: req.url, headers: req.headers, body });
    const out = await handler(req, body, reqs);
    res.writeHead(out.status || 200, { 'content-type': out.type || 'application/json' });
    res.end(typeof out.body === 'string' ? out.body : JSON.stringify(out.body));
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${srv.address().port}`, reqs, close: () => srv.close() };
}

test('local: speech client speaks whisper.cpp\'s /inference dialect', async () => {
  const srv = await fakeServer(() => ({ body: { task: 'transcribe', language: 'spanish', duration: 1, text: ' Hola a todos. Gracias por ver el video.', segments: [{ id: 0, text: 'x', no_speech_prob: 0.05 }] } }));
  config.localAsrUrl = `${srv.url}/inference`;
  const r = await asr.transcribe(Buffer.alloc(32000), { language: null, prompt: 'Horizon Summit', final: false });
  srv.close();
  const form = srv.reqs[0].body.toString('latin1');
  assert.equal(srv.reqs[0].url, '/inference');
  for (const [k, v] of [['language', 'auto'], ['response_format', 'verbose_json'], ['temperature_inc', '0'], ['prompt', 'Horizon Summit']]) {
    assert.match(form, new RegExp(`name="${k}"\\r\\n\\r\\n${v}\\r\\n`), k);
  }
  assert.match(form, /RIFF.{4}WAVE/s, 'audio is sent as WAV');
  assert.equal(r.text, 'Hola a todos.');
  assert.equal(r.lang, 'es');
});

test('local: speech client speaks the OpenAI transcription dialect', async () => {
  const srv = await fakeServer(() => ({ body: { text: 'hello', language: 'en' } }));
  config.localAsrUrl = `${srv.url}/v1/audio/transcriptions`;
  config.localAsrModel = 'whisper-large-v3-turbo';
  const r = await asr.transcribe(Buffer.alloc(3200), { language: null });
  srv.close();
  const form = srv.reqs[0].body.toString('latin1');
  assert.match(form, /name="model"\r\n\r\nwhisper-large-v3-turbo\r\n/);
  assert.doesNotMatch(form, /name="language"/, 'auto-detect = no language field');
  assert.equal(r.text, 'hello');
});

test('local: text model — Ollama dialect with keep_alive, context size and a thinking fallback', async () => {
  const srv = await fakeServer((req, body, reqs) => {
    const j = JSON.parse(body);
    if (reqs.length === 1 && j.think === false) return { status: 400, body: { error: 'registry.ollama.ai/library/gemma3:4b does not support thinking' } };
    return { body: { message: { role: 'assistant', content: '<think>hmm</think>{"ok":true}' }, prompt_eval_count: 12, eval_count: 3 } };
  });
  config.localLlmUrl = srv.url;
  config.localLlmApi = '';
  const r = await llm.chat({ system: 's', user: 'u', json: true });
  const r2 = await llm.chat({ system: 's', user: 'u' });
  srv.close();
  assert.equal(r.text, '{"ok":true}', 'reasoning is stripped');
  assert.equal(r2.text, '{"ok":true}');
  const sent = JSON.parse(srv.reqs[1].body);
  assert.equal(srv.reqs[1].url, '/api/chat');
  assert.equal(sent.format, 'json');
  assert.equal(sent.keep_alive, config.localLlmKeepAlive);
  assert.equal(sent.options.num_ctx, config.localLlmContext);
  assert.equal(sent.think, undefined, 'think:false dropped after the model rejected it');
  assert.equal(JSON.parse(srv.reqs[2].body).think, undefined, '…and not sent again');
});

test('local: text model — OpenAI-compatible dialect retries without response_format', async () => {
  const srv = await fakeServer((req, body) => {
    const j = JSON.parse(body);
    if (j.response_format) return { status: 400, body: { error: 'response_format not supported' } };
    return { body: { choices: [{ message: { content: '{"found":false}' } }], usage: { prompt_tokens: 5, completion_tokens: 2 } } };
  });
  config.localLlmUrl = `${srv.url}/v1`;
  const r = await llm.chat({ system: 's', user: 'u', json: true });
  srv.close();
  assert.equal(r.text, '{"found":false}');
  assert.equal(srv.reqs.at(-1).url, '/v1/chat/completions');
});

test('local: caption translation with a local model is cleaned of labels and notes', async () => {
  const srv = await fakeServer(() => ({ body: { message: { content: 'Traducción: "Hola a todos, bienvenidos."\n\nNota: mantuve el tono informal.' } } }));
  config.localLlmUrl = srv.url;
  const prev = config.engine;
  config.engine = 'local';
  try {
    const out = await translateText({ text: 'Hi everyone, welcome.', from: 'en', to: 'es', vocabulary: ['Horizon Summit'] });
    assert.equal(out, 'Hola a todos, bienvenidos.');
    const sent = JSON.parse(srv.reqs[0].body);
    assert.match(sent.messages[0].content, /Spanish/);
    assert.match(sent.messages[0].content, /Horizon Summit/);
  } finally {
    config.engine = prev;
    srv.close();
  }
  assert.equal(llm.cleanTranslation('Here is the translation:\nHello world'), 'Hello world');
  assert.equal(llm.cleanTranslation('English: “Hello world”'), 'Hello world');
});

test('local: TranslateGemma gets its own prompt, as a single user message, when LOCAL_MT_MODEL is set', async () => {
  const srv = await fakeServer((req) => (req.url === '/api/tags'
    ? { body: { models: [{ name: 'gemma3:4b' }] } }
    : { body: { message: { content: 'Hello everyone.' } } }));
  config.localLlmUrl = srv.url;
  config.localLlmModel = 'gemma3:4b';
  config.localMtModel = 'translategemma';
  const { translateGemmaPrompt } = await import('../src/translate.js');
  const prev = config.engine;
  config.engine = 'local';
  try {
    assert.equal(await translateText({ text: 'Hola a todos.', from: 'es', to: 'en', vocabulary: ['Horizon Summit'], context: ['Bienvenidos.'] }), 'Hello everyone.');
    const sent = JSON.parse(srv.reqs[0].body);
    assert.equal(sent.model, 'translategemma');
    assert.deepEqual(sent.messages, [{ role: 'user', content: translateGemmaPrompt({ text: 'Hola a todos.', from: 'es', to: 'en' }) }]);
    assert.match(sent.messages[0].content, /Spanish \(es\) to English \(en\) translator[\s\S]*into English:\n\n\nHola a todos\.$/);
    // Language not detected yet: the generic prompt (with a system message), still on the translation model.
    await translateText({ text: 'Hola.', from: null, to: 'en' });
    const generic = JSON.parse(srv.reqs[1].body);
    assert.equal(generic.model, 'translategemma');
    assert.equal(generic.messages[0].role, 'system');
    // Health: the translation model is reported missing by name.
    const h = await llm.llmHealth();
    assert.deepEqual(h.missing, ['translategemma']);
    assert.equal(h.hasModel, false);
  } finally {
    config.engine = prev;
    config.localMtModel = '';
    srv.close();
  }
});

test('local: the dashboard label of the speech server is never sent as the model name', async () => {
  const srv = await fakeServer(() => ({ body: { text: 'hola', language: 'es' } }));
  config.localAsrUrl = `${srv.url}/v1/audio/transcriptions`;
  config.localAsrModel = '';
  config.localAsrLabel = 'WhisperKit large-v3';
  try {
    assert.equal(asr.asrInfo().label, 'WhisperKit large-v3');
    await asr.transcribe(Buffer.alloc(3200), { language: 'es' });
    const form = srv.reqs[0].body.toString('latin1');
    assert.match(form, /name="model"\r\n\r\nwhisper-1\r\n/);
    assert.match(form, /name="language"\r\n\r\nes\r\n/);
  } finally {
    config.localAsrLabel = '';
    srv.close();
  }
});

test('local: translation loops of small models are cut', () => {
  assert.equal(llm.trimLoops('a las 3 de la noche, a las 3 de la noche, a las 3 de la noche, a las 3'), 'a las 3 de la noche…');
  assert.equal(llm.trimLoops('no, no, no quiero'), 'no, no, no quiero', 'short repeats are real speech');
});

test('local: a speech server that answers pings but fails every request is retried with backoff, not in a loop', async () => {
  let calls = 0;
  const e = new LocalEngine({ label: 't', target: 'es', transcriber: async () => { calls++; throw new TypeError('fetch failed'); }, ping: async () => true });
  e.backoff = 40;
  await started(e);
  await feed(e, [...Array(12).keys()].map(speech));
  await feed(e, Array(9).fill(0).map(silence));
  await sleep(400);
  e.stop();
  assert.ok(calls >= 2 && calls <= 6, `${calls} attempts in 0.4 s`);
  assert.ok(!asr.isNetworkError(new TypeError('x is not a function')), 'a bug is not a network error');
  assert.ok(asr.isNetworkError(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } })));
});
