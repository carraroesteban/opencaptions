# Security, privacy & compliance

**Short version:** OpenCaptions is self-hosted open-source software. Software itself is never "ISO 27001" or "SOC 2" certified — those certify an *organization* and how it operates systems. A company that already holds those certifications can run OpenCaptions **inside its own controlled environment**, with Gemini through **Google Cloud Vertex AI**, and cover it with its existing controls. This document describes what the software does with data and which settings matter for that.

## Data flow

```
Stage audio ──(WSS/TLS)──► OpenCaptions server ──(TLS)──► Google Gemini (Live Translate + Flash-Lite)
                                 │
                                 ├──► viewers / screens / overlays (WSS/TLS): caption text (+ translated voice if enabled)
                                 └──► disk: caption text per talk (JSONL) — optional, with retention
```

| Data | Where it goes | Stored? |
|---|---|---|
| Raw audio | Server memory (≤ 15 s buffers) → Gemini | **Never written to disk** by OpenCaptions |
| Transcripts & translations (text) | Viewers + `data/transcripts/` | Yes by default; `STORE_TRANSCRIPTS=false` disables it; `RETENTION_DAYS=N` auto-deletes |
| Translated voice audio (🎧) | Relayed in memory to listeners | Never stored |
| Room config, glossary | `config/`, `data/stages.json` | Yes (no personal data) |
| Viewer data | None collected: no accounts, cookies, analytics or IPs logged | — |

## Choosing the Gemini backend

| | Gemini Developer API (API key, AI Studio) | **Google Cloud Vertex AI** (recommended for companies) |
|---|---|---|
| Setup | `GEMINI_API_KEY` | `GOOGLE_GENAI_USE_VERTEXAI=true`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION` + service account / ADC |
| Data used to train models | Free tier: may be used to improve products · Paid tier: not used | Not used without permission |
| Compliance coverage | Google's API terms | Google Cloud compliance program: ISO 27001/27017/27018/27701, ISO 42001, SOC 2 Type II, HIPAA BAA, GDPR DPA with SCCs |
| Data residency | Global | Regional endpoints (e.g. EU) |
| Billing / IAM | AI Studio | Your GCP project, IAM, audit logs, VPC-SC |

Gemini 3.5 Live Translate is listed on Google Cloud (Gemini Enterprise Agent Platform / Vertex AI). The Vertex path in OpenCaptions uses the same `@google/genai` SDK and has **not yet been tested end-to-end**; the model ID on Vertex may differ — set it with `GEMINI_MODEL` / `TEXT_MODEL`. Always check the current terms and certifications for your region in Google Cloud's documentation and Compliance Reports Manager.

## Controls available in OpenCaptions

- **Transport security**: serve over HTTPS/WSS (`HTTPS_CERT`/`HTTPS_KEY`, or a TLS proxy / Cloudflare Tunnel / Google IAP).
- **Access control**: `INGEST_TOKEN` (who can send audio) and `ADMIN_TOKEN` (dashboard & API). For SSO, put the admin/ingest paths behind an identity-aware proxy (Google IAP, Cloudflare Access, oauth2-proxy); viewer pages can stay public or be protected the same way.
- **Data minimization**: `STORE_TRANSCRIPTS=false` (stream-only), `RETENTION_DAYS=N` (automatic deletion). No audio is persisted.
- **Secrets**: API keys only in environment variables / secret manager, never in the repo (`.env` is git-ignored).
- **Monitoring**: `/metrics` (Prometheus) and the production dashboard; server logs to stdout for your log pipeline.
- **Supply chain**: 5 runtime dependencies (`@google/genai`, `express`, `ws`, `qrcode`, `dotenv`) + optional `ffmpeg-static`; no build step; MIT licensed.

## Recommended enterprise deployment

1. Run the Docker image in your own cloud project/VPC (e.g. Cloud Run or GKE in the region you need).
2. Use **Vertex AI** with a dedicated service account with only the permissions needed to call Gemini.
3. Put **Google IAP / your SSO** in front of `/admin.html`, `/api/*` (except public viewer endpoints) and `/ws/ingest`.
4. Stage PCs run the **headless agent** (`scripts/agent.js`) as a system service, authenticated with `INGEST_TOKEN`.
5. Decide transcript policy: `STORE_TRANSCRIPTS=false` for confidential meetings, or `RETENTION_DAYS` aligned with your records policy; back up `data/` if you keep them.
6. Include OpenCaptions in your normal vulnerability management (dependency scanning, image scanning) and access reviews.

## Not included yet (contributions welcome)

Built-in SSO/RBAC and per-user audit logs (use an identity-aware proxy meanwhile), encryption at rest of stored transcripts (use an encrypted volume), and a fully local engine (e.g. Gemma) for air-gapped environments.

## Reporting a vulnerability

Please open a private security advisory on the GitHub repository instead of a public issue.
