// The weekly AI budget of a hosted test instance (src/budget.js): it fills up, survives a restart, starts over each
// week, and once used up the AI isn't asked anything more.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-budget-'));
Object.assign(process.env, { DATA_DIR: dir, BUDGET_USD_WEEK: '1', ENGINE: 'gemini', GEMINI_API_KEY: 'k'.repeat(39) });
const file = path.join(dir, 'budget.json');

test('the cap fills up, is saved, and a restart remembers it', async () => {
  const b = await import('../src/budget.js?first');
  b.spend(0.6);
  assert.equal(b.overBudget(), false);
  b.spend(0.4);
  assert.equal(b.overBudget(), true);
  const info = b.budgetInfo();
  assert.deepEqual([info.capUsd, info.usedUsd], [1, 1]);
  assert.equal(new Date(info.resetsAt).getUTCDay(), 1, 'renews on a Monday');
  assert.ok(info.resetsAt > Date.now() && info.resetsAt - Date.now() <= 7 * 86_400_000);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).usd, 0.6, 'saved at most every 5 s: the first spend is on disk');
  const again = await import('../src/budget.js?restart');
  again.spend(0.5);
  assert.equal(again.overBudget(), true, 'what was spent before the restart still counts');
});

test('last week’s spend doesn’t count', async () => {
  fs.writeFileSync(file, JSON.stringify({ week: 0, usd: 99 }));
  const b = await import('../src/budget.js?newweek');
  assert.equal(b.overBudget(), false);
});

test('over the cap, translations aren’t sent to Gemini', async () => {
  fs.writeFileSync(file, JSON.stringify({ week: 0, usd: 0 }));
  const { spend } = await import('../src/budget.js');
  const { translateText } = await import('../src/translate.js');
  spend(5);
  await assert.rejects(translateText({ text: 'Hola a todos.', from: 'es', to: 'en' }), { code: 'budget' });
});
