// A question to the whole event (src/assist.js askEvent): keyword search across rooms and talks, an answer only from
// the passages found, and sources that say where and when.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';
import { askEvent, _setClient } from '../src/assist.js';

const docs = [
  { ref: { roomId: 'main', room: 'Main Stage', talkId: 't1', talk: 'Telehealth for rural clinics' }, segs: [
    { channel: 'orig', text: 'Each clinic got a tablet and a good microphone.', start: 4000, end: 6000 },
    { channel: 'es', text: 'Cada clínica recibió una tablet y un buen micrófono.', start: 4000, end: 6000 },
  ] },
  { ref: { roomId: 'room-a', room: 'Room A', talkId: 't2', talk: 'Data protection for small teams' }, segs: [
    { channel: 'orig', text: 'Privacy starts with collecting less data.', start: 61000, end: 64000 },
    { channel: 'orig', text: 'The new law asks for a privacy officer.', start: 130000, end: 133000 },
  ] },
];

test('the whole event answers from passages in every room, citing the talk and the moment', async () => {
  const engine = config.engine;
  config.engine = 'gemini';
  let prompt = '';
  _setClient({ models: { generateContent: async (r) => { prompt = r.contents; return { text: JSON.stringify({ found: true, answer: 'In "Data protection for small teams" (Room A).', cite: [2, 1] }), usageMetadata: {} }; } } });
  try {
    const more = [...docs, { ref: { roomId: 'room-b', room: 'Room B', talkId: 't3', talk: 'Privacy by design' }, segs: [{ channel: 'orig', text: 'Privacy law is changing fast.', start: 5000, end: 7000 }] }];
    const a = await askEvent({ docs: more, lang: 'en', question: 'Which talk talked about privacy law?', clientKey: 'e1' });
    assert.equal(a.ai, true);
    assert.match(a.answer, /Data protection/);
    assert.deepEqual(a.sources.map((s) => [s.roomId, s.talkId, s.at]), [['room-b', 't3', '0:05'], ['room-a', 't2', '2:10']], 'the passages the model cited, in its order, across rooms');
    assert.match(prompt, /Room A · "Data protection for small teams"/);
    assert.doesNotMatch(prompt, /tablet/, 'passages without the question’s words never reach the model');
  } finally {
    config.engine = engine;
    _setClient(null);
  }
});

test('a question with no words in common with the talks: the model reads every talk and answers by meaning', async () => {
  const engine = config.engine;
  config.engine = 'gemini';
  let prompt = '';
  _setClient({ models: { generateContent: async (r) => { prompt = r.contents; return { text: JSON.stringify({ found: true, answer: 'Tablets and microphones.', cite: [1] }), usageMetadata: {} }; } } });
  try {
    const a = await askEvent({ docs, lang: 'es', question: '¿Qué equipos entregaron?', clientKey: 'e3' });
    assert.equal(a.ai, true);
    assert.match(prompt, /Cada clínica recibió/, 'the talk in the reader’s language');
    assert.match(prompt, /Privacy starts/, 'and every other talk, in the original where there is no translation');
    assert.equal(a.sources[0].talkId, 't1');
  } finally {
    config.engine = engine;
    _setClient(null);
  }
});

test('without a model it still finds the moments, in the reader’s language when the room has it', async () => {
  const engine = config.engine;
  config.engine = 'mock';
  try {
    const a = await askEvent({ docs, lang: 'es', question: '¿Quién habló del micrófono?', clientKey: 'e2' });
    assert.equal(a.ai, false);
    assert.equal(a.found, true);
    assert.equal(a.sources[0].text, 'Cada clínica recibió una tablet y un buen micrófono.');
    assert.equal(a.sources[0].talk, 'Telehealth for rural clinics');
    const none = await askEvent({ docs, lang: 'en', question: 'What about blockchain?', clientKey: 'e2' });
    assert.deepEqual(none, { ai: false, found: false, answer: '', sources: [] });
    await assert.rejects(askEvent({ docs, lang: 'en', question: 'a', clientKey: 'e2' }), { status: 400 });
  } finally {
    config.engine = engine;
  }
});
