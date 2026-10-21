// Telling the spoken language from a sentence (src/langid.js): never wrong, unsure is fine (the room keeps the last one).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guessLang } from '../src/langid.js';

const ROOM = ['es', 'en', 'pt', 'fr', 'it', 'de'];

test('each language from one ordinary sentence', () => {
  for (const [want, text] of [
    ['en', 'My name is Hiroshi Tanaka and I work on telehealth for rural clinics.'],
    ['es', 'Hace dos años, en nuestro barrio, una plaza nueva se quedó vacía, porque nadie la había diseñado con los vecinos.'],
    ['pt', 'Hoje quero falar sobre como a tecnologia pode ajudar as pessoas.'],
    ['fr', 'Est-ce que vous avez des questions pour nous ?'],
    ['it', 'Oggi vorrei parlare di come la tecnologia può aiutare le persone.'],
    ['de', 'Heute möchte ich darüber sprechen, wie Technik den Menschen helfen kann.'],
  ]) assert.equal(guessLang(text, ROOM), want, text);
});

test('unsure rather than wrong', () => {
  assert.equal(guessLang('Empecemos con una historia.', ROOM), null, 'Spanish or Italian: too short to tell');
  assert.equal(guessLang('Dzień dobry wszystkim i witam na naszej konferencji.', ROOM), null, 'Polish is not mistaken for English');
  assert.equal(guessLang('Horizon Summit', ROOM), null);
});

test('other scripts, and the room decides between languages that share one', () => {
  assert.equal(guessLang('皆さん、こんにちは。', ['en', 'ja']), 'ja');
  assert.equal(guessLang('大家好，欢迎来到会议。', ['en', 'zh']), 'zh');
  assert.equal(guessLang('Привет всем, добро пожаловать.', ['en', 'uk']), 'uk');
  assert.equal(guessLang('Привет всем, добро пожаловать.', ['en', 'es']), 'ru', 'none of the room’s: still not English');
  assert.equal(guessLang('Привет всем, добро пожаловать.', ['ru', 'uk']), null);
});
