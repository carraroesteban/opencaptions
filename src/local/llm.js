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
  const endpoint = api === 'openai' ? chatEndpoint(url) : `${new URL(url).origin}/api/chat`;
  // mtModel: caption translation (LOCAL_MT_MODEL, defaults to the main model); model: summaries and questions.
  return { url, api, endpoint, model: config.localLlmModel, mtModel: config.localMtModel || config.localLlmModel };
}

/** An OpenAI-compatible base URL (…/v1) → its chat endpoint. */
export const chatEndpoint = (url) => {
  const u = String(url).replace(/\/+$/, '');
  return u.endsWith('/chat/completions') ? u : `${u}/chat/completions`;
};

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

let thinkOff = true; // Ollama: `think: false` makes reasoning models (qwen3, deepseek-r1…) answer directly

/**
 * @param {object} o
 * @param {string} [o.system]  omitted for models trained on a single user prompt (TranslateGemma)
 * @param {string} o.user
 * @param {{ role: 'user' | 'assistant', content: string }[]} [o.history]  earlier turns, between the system prompt and `user`
 * @param {boolean} [o.json]   ask for a JSON object
 * @param {string} [o.model]   defaults to LOCAL_LLM_MODEL
 * @param {number} [o.maxTokens]
 * @param {number} [o.temperature]
 * @param {number} [o.timeoutMs]
 * @param {number} [o.priority]  higher goes first when the model is busy (final captions 2, partials 0)
 * @returns {Promise<{ text: string, promptTokens: number, outputTokens: number, ms: number }>}
 */
export async function chat({ system = '', user, history = [], json = false, model = config.localLlmModel, maxTokens = 400, temperature = 0.2, timeoutMs = config.localLlmTimeoutMs, priority = 1 }) {
  await acquire(priority);
  const t0 = Date.now();
  try {
    const { api } = llmInfo();
    const messages = [...(system ? [{ role: 'system', content: system }] : []), ...history, { role: 'user', content: user }];
    const out = api === 'openai'
      ? await openaiChat({ endpoint: llmInfo().endpoint, key: process.env.LOCAL_LLM_KEY, model, messages, json, maxTokens, temperature, timeoutMs })
      : await ollamaChat({ model, messages, json, maxTokens, temperature, timeoutMs });
    return { ...out, text: stripThinking(out.text), ms: Date.now() - t0 };
  } finally {
    release();
  }
}

// Some OpenAI-compatible servers (vLLM with --api-key, LM Studio with auth on) want a key.
const auth = (key = process.env.LOCAL_LLM_KEY) => (key ? { authorization: `Bearer ${key}` } : {});

async function post(url, body, timeoutMs, key) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...auth(key) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) throw Object.assign(new Error(`text model HTTP ${res.status}: ${text.slice(0, 200)}`), { status: res.status, body: text });
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

// What each server turned down, so it isn't asked again: JSON mode (some local servers), and max_tokens or a custom
// temperature (OpenAI's reasoning models want max_completion_tokens and their own temperature).
const refused = new Map(); // endpoint → Set of body fields

/**
 * One chat request in OpenAI's dialect: a local server (LOCAL_LLM_URL …/v1) or a cloud service (src/textapi.js).
 * A 400 that names a field we sent drops (or renames) it and tries again; with no field named, JSON mode goes.
 */
export async function openaiChat({ endpoint, key, model, messages, json = false, maxTokens, temperature, timeoutMs }) {
  if (!refused.has(endpoint)) refused.set(endpoint, new Set());
  const skip = refused.get(endpoint);
  for (;;) {
    const body = {
      model,
      stream: false,
      messages,
      ...(skip.has('temperature') ? {} : { temperature }),
      ...(skip.has('max_tokens') ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens }),
      ...(json && !skip.has('response_format') ? { response_format: { type: 'json_object' } } : {}), // JSON is also asked for in the prompt
    };
    try {
      const j = await post(endpoint, body, timeoutMs, key);
      const u = j.usage || {};
      return { text: String(j.choices?.[0]?.message?.content ?? ''), promptTokens: u.prompt_tokens || 0, outputTokens: u.completion_tokens || 0 };
    } catch (e) {
      if (e.status !== 400) throw e;
      const field = ['max_tokens', 'temperature', 'response_format'].find((f) => f in body && String(e.body || '').includes(f)) ?? ('response_format' in body ? 'response_format' : null);
      if (!field) throw e;
      skip.add(field);
    }
  }
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
