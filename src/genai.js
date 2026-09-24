// Gemini client factory: Gemini Developer API (API key) or Google Cloud Vertex AI (enterprise).
// Vertex AI keeps data in your own GCP project/region and is covered by Google Cloud's compliance
// program (ISO 27001/27017/27018/27701, ISO 42001, SOC 2, HIPAA BAA, DPA). Auth: Application Default
// Credentials (gcloud auth application-default login, or a service account on the VM).
import { GoogleGenAI } from '@google/genai';
import { config } from './config.js';

export function createClient() {
  if (config.vertex) {
    return new GoogleGenAI({ vertexai: true, project: config.gcpProject, location: config.gcpLocation });
  }
  return new GoogleGenAI({ apiKey: config.geminiApiKey });
}
