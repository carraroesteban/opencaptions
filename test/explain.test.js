// A word tapped in the captions (src/assist.js explain): plain words in the reader's language, grounded in where the
// speaker said it, cached for every phone, and quotes only when there's no model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';
import { explain, highlights, _setClient } from '../src/assist.js';

const segs = [
  { channel: 'orig', text: 'Today we talk about telehealth.', start: 1000, end: 3000 },
  { channel: 'orig', text: 'Each clinic got a tablet for triage.', start: 4000, end: 6000 },
  { channel: 'orig', text: 'Triage means deciding who is seen first.', start: 7000, end: 9000 },
  { channel: 'es', text: 'Cada clínica recibió una tablet para el triaje.', start: 4000, end: 6000 },
];

test('a tapped word is explained in plain words, from where it was said, once for every phone', async () => {
  const engine = config.engine;
  config.engine = 'gemini';
  let calls = 0, prompt = '';
  _setClient({ models: { generateContent: async (r) => { calls++; prompt = r.contents; return { text: JSON.stringify({ meaning: 'Decidir a quién se atiende primero.', general: false, translation: 'triaje' }), usageMetadata: {} }; } } });
  try {
    const a = await explain({ segs, key: 'main/t1', lang: 'es', term: ' “Triage,” ', clientKey: 'c1' });
    assert.equal(a.ai, true);
    assert.equal(a.term, 'Triage', 'quotes and punctuation trimmed');
    assert.match(a.meaning, /primero/);
    assert.equal(a.translation, 'triaje');
    assert.match(prompt, /Triage means deciding/, 'the model sees where the speaker explained it');
    assert.equal(a.quotes[0].at, '0:04');
    const b = await explain({ segs, key: 'main/t1', lang: 'es', term: 'triage', clientKey: 'c2' });
    assert.equal(calls, 1, 'the same word in the same talk and language is answered from the cache');
    assert.deepEqual(b, a);
    await assert.rejects(explain({ segs, key: 'main/t1', lang: 'es', term: '!', clientKey: 'c1' }), { status: 400 });
  } finally {
    config.engine = engine;
    _setClient(null);
  }
});

test("without a model, the reader gets where the word was said, in their language when the room has it", async () => {
  const engine = config.engine;
  config.engine = 'mock';
  try {
    const a = await explain({ segs, key: 'main/t2', lang: 'es', term: 'triaje', clientKey: 'c3' });
    assert.equal(a.ai, false);
    assert.equal(a.meaning, '');
    assert.equal(a.quotes[0].text, 'Cada clínica recibió una tablet para el triaje.');
    const none = await explain({ segs, key: 'main/t2', lang: 'en', term: 'bandwidth', clientKey: 'c3' });
    assert.deepEqual(none.quotes, []);
  } finally {
    config.engine = engine;
  }
});

test("a talk's page gets chapters and quotes; a quote the model rephrased is dropped", async () => {
  const engine = config.engine;
  config.engine = 'gemini';
  const long = Array.from({ length: 10 }, (_, i) => ({ channel: 'orig', text: `Point number ${i} about clinics.`, start: i * 60000, end: i * 60000 + 5000 }));
  long.push({ channel: 'orig', text: 'The best technology is the one patients barely notice.', start: 700000, end: 704000 });
  _setClient({ models: { generateContent: async () => ({ text: JSON.stringify({
    chapters: [{ at: '0:00', title: 'Why clinics' }, { at: 'soon', title: 'bad time' }],
    quotes: [{ at: '11:40', text: 'The best technology is the one patients barely notice.' }, { at: '1:00', text: 'Technology should be invisible to patients.' }],
  }), usageMetadata: {} }) } });
  try {
    const h = await highlights({ segs: long, key: 'main/t9', lang: 'en', title: 'Telehealth' });
    assert.deepEqual(h.chapters, [{ at: '0:00', title: 'Why clinics' }]);
    assert.deepEqual(h.quotes.map((q) => q.text), ['The best technology is the one patients barely notice.']);
    assert.deepEqual(await highlights({ segs: long.slice(0, 3), key: 'main/t8', lang: 'en' }), { ai: false, chapters: [], quotes: [] }, 'too short to divide');
  } finally {
    config.engine = engine;
    _setClient(null);
  }
});
