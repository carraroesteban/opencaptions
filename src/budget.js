// Weekly AI spending cap, for hosted test instances (BUDGET_USD_WEEK, in US$; unset or 0 = no cap). Every Gemini cost
// the app estimates (live sessions, translations, the assistant, recordings) is added up here and kept in
// data/budget.json, so a restart doesn't reset it. Past the cap, rooms close their AI sessions and new text requests are
// refused until Monday 00:00 UTC. A key typed in the dashboard is the tester's own money: no cap then.
import fs from 'node:fs';
import path from 'node:path';
import { config, writeFileAtomic } from './config.js';

const capUsd = Number(process.env.BUDGET_USD_WEEK || 0);
const file = path.join(config.dataDir, 'budget.json');
const DAY = 86_400_000;
/** Monday 00:00 UTC of the week `t` falls in (1 January 1970 was a Thursday). */
const weekOf = (t) => { const d = Math.floor(t / DAY); return (d - ((d + 3) % 7)) * DAY; };

let state = { week: 0, usd: 0 };
try { const s = JSON.parse(fs.readFileSync(file, 'utf8')); state = { week: Number(s.week) || 0, usd: Number(s.usd) || 0 }; } catch { /* first week */ }
let savedAt = 0, dirty = false;
function save() {
  savedAt = Date.now();
  dirty = false;
  try { writeFileAtomic(file, JSON.stringify(state)); } catch (e) { console.error(`✗ budget: can't save ${file}: ${e.message}`); }
}
process.on('exit', () => { if (dirty) save(); });

const on = () => capUsd > 0 && config.keySource !== 'dashboard';
function week() {
  const w = weekOf(Date.now());
  if (state.week !== w) state = { week: w, usd: 0 };
  return state;
}

/** Add an estimated Gemini cost (US$). Saved at most every 5 s (a crash loses at most that much). */
export function spend(usd) {
  if (!on() || !(usd > 0)) return;
  week().usd += usd;
  dirty = true;
  if (Date.now() - savedAt > 5000) save();
}

export const overBudget = () => on() && week().usd >= capUsd;

/** For the dashboard: null without a cap. */
export const budgetInfo = () => (on() ? { capUsd, usedUsd: +week().usd.toFixed(2), resetsAt: week().week + 7 * DAY } : null);

export class BudgetError extends Error {
  constructor() { super('the weekly AI budget is used up'); this.code = 'budget'; }
}
