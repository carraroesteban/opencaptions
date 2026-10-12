// Translations, summaries and questions on another AI service instead of Gemini: OpenAI, OpenRouter, Groq, Mistral or
// anything else that speaks OpenAI's chat dialect. A base URL, a key and a model name, from Settings → AI (kept in
// data/secrets.json, wins) or TEXT_API_URL / TEXT_API_KEY / TEXT_MODEL (config.textApi). Cloud mode only: the speech
// model stays Gemini, and local mode has its own text model (LOCAL_LLM_*). Same client as local mode's OpenAI servers.
import { config, textApiFromEnv } from './config.js';
import { saveSecret } from './aikey.js';
import { openaiChat, chatEndpoint, stripThinking } from './local/llm.js';

export const textApiOn = () => config.engine === 'gemini' && !!config.textApi.url;

/** @returns {Promise<string>} the answer's text */
export async function textChat({ system, user, json = false, maxTokens = 512, temperature = 0.2, timeoutMs = 20000 }) {
  const { url, key, model } = config.textApi;
  const messages = [{ role: 'system', content: system }, { role: 'user', content: user }];
  return stripThinking((await openaiChat({ endpoint: chatEndpoint(url), key, model, messages, json, maxTokens, temperature, timeoutMs })).text);
}

/** What the dashboard may know: never the key itself. */
export function textApiInfo() {
  const { url, key, model, source } = config.textApi;
  return { url, model, last4: key ? key.slice(-4) : '', source };
}

/** http(s) only: the key goes in a header to this address. */
export const looksLikeUrl = (u) => { try { return /^https?:$/.test(new URL(u).protocol); } catch { return false; } };

/**
 * One tiny request (a few tokens) to see that the address, the key and the model work together.
 * @returns {Promise<{ ok: boolean, code: 'ok' | 'quota' | 'invalid' | 'model' | 'offline' | 'error', detail?: string }>}
 */
export async function checkTextApi({ url, key, model }, { timeoutMs = 15000 } = {}) {
  try {
    await openaiChat({ endpoint: chatEndpoint(url), key, model, messages: [{ role: 'user', content: 'Reply with OK.' }], maxTokens: 5, temperature: 0, timeoutMs });
    return { ok: true, code: 'ok' };
  } catch (e) {
    if (!e.status) return { ok: false, code: 'offline', detail: String(e.message).slice(0, 300) };
    let detail = String(e.body || '').slice(0, 300);
    try { detail = String(JSON.parse(e.body).error?.message || detail).slice(0, 300); } catch { /* not JSON */ }
    if (e.status === 429) return { ok: true, code: 'quota', detail }; // works, out of credit or rate-limited for now
    if (e.status === 401 || e.status === 403) return { ok: false, code: 'invalid', detail };
    if (e.status === 400 || e.status === 404 || e.status === 422) return { ok: false, code: 'model', detail }; // wrong model name or address
    return { ok: false, code: 'error', detail };
  }
}

/** Save from the dashboard (null goes back to .env's TEXT_API_URL, or to Gemini). */
export function saveTextApi(v) {
  saveSecret('textApi', v ? JSON.stringify(v) : '');
  config.textApi = v ? { ...v, source: 'dashboard' } : textApiFromEnv();
}
