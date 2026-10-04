// Text model running on this machine or the local network — translation and the audience assistant in local
// mode (ENGINE=local, see docs/local.md). Two HTTP dialects:
//   • Ollama's native API (default, http://127.0.0.1:11434): lets us keep the model loaded between captions
//     (keep_alive) and give it a large enough context window (num_ctx) for talk summaries.
//   • OpenAI-compatible chat completions (any URL ending in /v1): LM Studio, llama.cpp's llama-server, vLLM,
//     LocalAI, Jan… — e.g. LOCAL_LLM_URL=http://127.0.0.1:1234/v1
// The dialect is picked from the URL (override with LOCAL_LLM_API=ollama|openai).
import { config } from '../config.js';

export function llmInfo() {
  const url = config.localLlmUrl.replace(/\/+$/, '');
  let api = config.localLlmApi;
  if (!api) api = /\/v1(\/|$)/.test(new URL(url).pathname) ? 'openai' : 'ollama';
  const endpoint = api === 'openai'
    ? (url.endsWith('/chat/completions') ? url : `${url}/chat/completions`)
    : `${new URL(url).origin}/api/chat`;
  // mtModel: caption translation (LOCAL_MT_MODEL, defaults to the main model); model: summaries and questions.
  return { url, api, endpoint, model: config.localLlmModel, mtModel: config.localMtModel || config.localLlmModel };
}

// ---------- concurrency: a local model serves one request at a time well ----------
// Priority: final caption translations (2) > audience assistant (1). Provisional translations don't queue at
// all — callers check llmBusy() and skip them, so they never delay a final sentence.
const slots = { active: 0, waiters: [] };
export const llmBusy = () => slots.active >= Math.max(1, config.localLlmConcurrency) || slots.waiters.length > 0;

async function acquire(priority) {
  if (slots.active < Math.max(1, config.localLlmConcurrency) && !slots.waiters.length) { slots.active++; return; }
  await new Promise((resolve) => {
    slots.waiters.push({ priority, resolve });
    slots.waiters.sort((a, b) => b.priority - a.priority);
  });
  slots.active++;
}
function release() {
  slots.active--;
  slots.waiters.shift()?.resolve();
}

let jsonModeOk = true; // OpenAI dialect: some servers reject response_format → retried without it once
let thinkOff = true; // Ollama: `think: false` makes reasoning models (qwen3, deepseek-r1…) answer directly

/**
 * @param {object} o
 * @param {string} [o.system]  omitted for models trained on a single user prompt (TranslateGemma)
 * @param {string} o.user
 * @param {boolean} [o.json]   ask for a JSON object
 * @param {string} [o.model]   defaults to LOCAL_LLM_MODEL
 * @param {number} [o.maxTokens]
 * @param {number} [o.temperature]
 * @param {number} [o.timeoutMs]
 * @param {number} [o.priority]  higher goes first when the model is busy (final captions 2, partials 0)
 * @returns {Promise<{ text: string, promptTokens: number, outputTokens: number, ms: number }>}
 */
export async function chat({ system = '', user, json = false, model = config.localLlmModel, maxTokens = 400, temperature = 0.2, timeoutMs = config.localLlmTimeoutMs, priority = 1 }) {
  await acquire(priority);
  const t0 = Date.now();
  try {
    const { api } = llmInfo();
    const messages = [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: user }];
    const out = api === 'openai'
      ? await openaiChat({ model, messages, json, maxTokens, temperature, timeoutMs })
      : await ollamaChat({ model, messages, json, maxTokens, temperature, timeoutMs });
    return { ...out, text: stripThinking(out.text), ms: Date.now() - t0 };
  } finally {
    release();
  }
}

// Some OpenAI-compatible servers (vLLM with --api-key, LM Studio with auth on) want a key.
const auth = () => (process.env.LOCAL_LLM_KEY ? { authorization: `Bearer ${process.env.LOCAL_LLM_KEY}` } : {});

async function post(url, body, timeoutMs) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...auth() },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) throw Object.assign(new Error(`local model HTTP ${res.status}: ${text.slice(0, 200)}`), { status: res.status, body: text });
  return JSON.parse(text);
}

async function ollamaChat({ model, messages, json, maxTokens, temperature, timeoutMs }) {
  const { endpoint } = llmInfo();
  const body = {
    model,
    stream: false,
    keep_alive: config.localLlmKeepAlive, // don't unload the model between captions
    messages,
    options: { temperature, num_predict: maxTokens, num_ctx: config.localLlmContext },
    ...(json ? { format: 'json' } : {}),
    ...(thinkOff ? { think: false } : {}),
  };
  let j;
  try {
    j = await post(endpoint, body, timeoutMs);
  } catch (e) {
    // Older Ollama versions or models without a thinking switch: drop the field and remember.
    if (!thinkOff || e.status !== 400 || !/think/i.test(e.body || '')) throw e;
    thinkOff = false;
    delete body.think;
    j = await post(endpoint, body, timeoutMs);
  }
  if (j.error) throw new Error(`local model: ${j.error}`);
  return { text: String(j.message?.content ?? ''), promptTokens: j.prompt_eval_count || 0, outputTokens: j.eval_count || 0 };
}

async function openaiChat({ model, messages, json, maxTokens, temperature, timeoutMs }) {
  const { endpoint } = llmInfo();
  const body = {
    model,
    stream: false,
    temperature,
    max_tokens: maxTokens,
    messages,
    ...(json && jsonModeOk ? { response_format: { type: 'json_object' } } : {}),
  };
  let j;
  try {
    j = await post(endpoint, body, timeoutMs);
  } catch (e) {
    if (!body.response_format || e.status !== 400) throw e;
    jsonModeOk = false; // JSON is also requested in the prompt; the reply is parsed leniently
    delete body.response_format;
    j = await post(endpoint, body, timeoutMs);
  }
  const u = j.usage || {};
  return { text: String(j.choices?.[0]?.message?.content ?? ''), promptTokens: u.prompt_tokens || 0, outputTokens: u.completion_tokens || 0 };
}

/** Reasoning models may wrap their thoughts in <think>…</think>: captions only want the answer. */
export function stripThinking(s) {
  return String(s || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^[\s\S]*<\/think>/i, '').trim();
}

/**
 * Small local models sometimes decorate a translation ("Translation: …", quotes, a note after a blank line).
 * Keep only the translated text.
 */
export function cleanTranslation(s) {
  let lines = stripThinking(s).split('\n').map((l) => l.trim());
  const firstBlank = lines.findIndex((l, i) => !l && lines.slice(0, i).some(Boolean));
  if (firstBlank > 0) lines = lines.slice(0, firstBlank); // "…translation\n\nNote: …"
  lines = lines.filter(Boolean).filter((l) => !/^(translation|traducci[oó]n|tradu[cç][aã]o|here is|aqu[ií] (tienes|est[aá])|note|nota)\b[^:]*:?$/i.test(l));
  let out = lines.join(' ')
    .replace(/^(translation|traducci[oó]n|tradu[cç][aã]o)(\s*\([^)]*\))?\s*[:：]\s*/i, '')
    .replace(/^(spanish|english|portuguese|espa[nñ]ol|ingl[eé]s|portugu[eé]s|french|franc[eé]s|german|alem[aá]n|italian|italiano)\s*[:：]\s*/i, '')
    .trim();
  out = out.replace(/^["“«„']+/, '').replace(/["”»']+$/, '').trim();
  return trimLoops(out);
}

/** "el 3 de la noche, el 3 de la noche, el 3 de la noche…" → "el 3 de la noche…": small models can loop. */
export function trimLoops(s) {
  const w = String(s || '').split(/\s+/).filter(Boolean);
  const key = (i, n) => w.slice(i, i + n).map((x) => x.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')).join(' ');
  for (let n = 2; n <= 12; n++) {
    for (let i = 0; i + 3 * n <= w.length; i++) {
      const k = key(i, n);
      if (k && k === key(i + n, n) && k === key(i + 2 * n, n)) return `${w.slice(0, i + n).join(' ').replace(/[,;:]$/, '')}…`;
    }
  }
  return w.join(' ');
}

/** Is the local text model server reachable, and are the configured models installed? */
export async function llmHealth(timeoutMs = 3000) {
  const { url, api, model, mtModel } = llmInfo();
  const wanted = [...new Set([model, mtModel])];
  try {
    if (api === 'ollama') {
      const r = await fetch(`${new URL(url).origin}/api/tags`, { headers: auth(), signal: AbortSignal.timeout(timeoutMs) });
      const j = /** @type {any} */ (await r.json());
      const names = (j.models || []).map((m) => m.name || m.model);
      const missing = wanted.filter((w) => !names.some((n) => n === w || n === `${w}:latest` || n.split(':')[0] === w));
      return { ok: true, hasModel: !missing.length, missing, models: names };
    }
    const r = await fetch(`${url.replace(/\/chat\/completions$/, '')}/models`, { headers: auth(), signal: AbortSignal.timeout(timeoutMs) });
    const j = /** @type {any} */ (await r.json().catch(() => ({})));
    const names = (j.data || []).map((m) => m.id);
    // Single-model servers (llama.cpp's llama-server) answer whatever model name you send.
    const missing = names.length <= 1 ? [] : wanted.filter((w) => !names.includes(w));
    return { ok: r.ok, hasModel: !missing.length, missing, models: names };
  } catch (e) {
    return { ok: false, hasModel: false, missing: [], models: [], error: e.message };
  }
}
