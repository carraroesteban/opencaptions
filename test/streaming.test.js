// Streaming translation: a finished sentence's translation appears word by word, and never shrinks the caption.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';
import { SentenceTranslator, _setClient } from '../src/translate.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A fake Gemini: partial requests answer at once, final ones stream word by word. */
function fakeClient(answers) {
  const pick = (contents) => answers[contents.split('Translate:\n').pop()] ?? 'TRANSLATED';
  return {
    models: {
      async generateContent({ contents }) { return { text: pick(contents) }; },
      async generateContentStream({ contents }) {
        const words = pick(contents).split(/(?<=\s)/);
        return (async function* () { for (const w of words) { await sleep(20); yield { text: w }; } })();
      },
    },
  };
}

function run(answers, feed) {
  const events = [];
  const q = new SentenceTranslator({
    from: 'en', to: 'es',
    onPartial: (text, id) => events.push({ kind: 'partial', text, id, at: Date.now() }),
    onFinal: (text, id) => events.push({ kind: 'final', text, id, at: Date.now() }),
  });
  _setClient(fakeClient(answers));
  feed(q);
  return { q, events };
}

test('a finished sentence streams into its caption before the whole answer arrives', async () => {
  config.engine = 'gemini';
  config.mtStream = true;
  const { events } = run({ 'Welcome to the summit, everyone.': 'Bienvenidos a la cumbre, a todos.' }, (q) => q.feed('Welcome to the summit, everyone.', { finished: true }));
  await sleep(400);
  const fin = events.find((e) => e.kind === 'final');
  assert.equal(fin.text, 'Bienvenidos a la cumbre, a todos.');
  const streamed = events.filter((e) => e.kind === 'partial' && e.id === fin.id);
  assert.ok(streamed.length >= 3, `streamed ${streamed.length} times`);
  assert.ok(streamed[0].at < fin.at, 'the first words appear before the final answer');
  assert.match(streamed[0].text, /^Bienvenidos/);
});

test('streaming never shrinks a provisional translation already on screen', async () => {
  config.engine = 'gemini';
  config.mtStream = true;
  config.mtPartialMs = 0;
  const long = 'Hoy les quiero contar cómo armamos todo esto desde cero';
  const { q, events } = run({ 'Today I want to tell you how we built all of this from scratch': long, 'Today I want to tell you how we built all of this from scratch.': 'Hoy les quiero contar cómo construimos todo esto desde cero.' }, (t) => t.feed('Today I want to tell you how we built all of this from scratch'));
  await sleep(50); // the provisional translation is on screen
  q.feed('.', { finished: true });
  await sleep(600);
  const id = events.find((e) => e.kind === 'final').id;
  const lens = events.filter((e) => e.id === id && e.kind === 'partial').map((e) => e.text.length);
  assert.ok(lens.length >= 2, 'provisional, then streamed');
  for (let i = 1; i < lens.length; i++) assert.ok(lens[i] >= lens[i - 1], `caption shrank: ${lens.join(' → ')}`);
  config.mtPartialMs = 1500;
});

test('MT_STREAM=0 waits for the whole answer', async () => {
  config.engine = 'gemini';
  config.mtStream = false;
  const { events } = run({ 'Thank you very much.': 'Muchas gracias.' }, (q) => q.feed('Thank you very much.', { finished: true }));
  await sleep(200);
  assert.deepEqual(events.map((e) => e.kind), ['final']);
  config.mtStream = true;
});
