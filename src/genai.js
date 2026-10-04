// Gemini client factory: Gemini Developer API (API key) or Google Cloud Vertex AI (enterprise).
// Vertex AI keeps data in your own GCP project/region and is covered by Google Cloud's compliance
// program (ISO 27001/27017/27018/27701, ISO 42001, SOC 2, HIPAA BAA, DPA). Auth: Application Default
// Credentials (gcloud auth application-default login, or a service account on the VM).
import { GoogleGenAI } from '@google/genai';
import { config } from './config.js';
import { recordingClient, replayClient } from './replay.js';

/** @returns {any} the SDK client, or a recording / replaying stand-in for tests (OC_RECORD / OC_REPLAY, see src/replay.js) */
export function createClient() {
  // One recorder / player for the whole process: the Live engines, the translator and the assistant share it.
  if (process.env.OC_REPLAY) return (shared ??= replayClient(process.env.OC_REPLAY));
  const real = config.vertex
    ? new GoogleGenAI({ vertexai: true, project: config.gcpProject, location: config.gcpLocation })
    : new GoogleGenAI({ apiKey: config.geminiApiKey });
  return process.env.OC_RECORD ? (shared ??= recordingClient(real, process.env.OC_RECORD)) : real;
}
let shared = null;
