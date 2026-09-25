# Configuration reference

OpenCaptions reads its configuration from four places, in this order of precedence (highest wins):

1. **`data/stages.json`** — the room list as last saved by the production dashboard (`PATCH`/`POST`/`DELETE /api/stages/*`). The server uses it instead of `config/event.json` only when the `STAGES` environment variable is **not** set and the file is newer than `config/event.json`. Delete it (or touch `config/event.json`) to fall back to the file again.
2. **`STAGES` environment variable** — a compact override for the room list, handy for sharding stages across hosts. When set, it replaces `config/event.json`'s `stages` array entirely and `data/stages.json` is never consulted.
3. **Environment variables / `.env`** — loaded with [dotenv](https://www.npmjs.com/package/dotenv) from a `.env` file in the project root (copy `.env.example` to start), then from the real process environment (which wins on conflicts). Most settings live here.
4. **`config/event.json`** — the event's static defaults: branding, languages, per-stage rooms, and fallback values for any setting that also has an environment variable. An environment variable always overrides the matching `event.json` key.

Two more things affect what runs:

- **`--mock` CLI flag** (`npm run mock`, or `node src/server.js --mock`) forces the simulated caption engine regardless of `GEMINI_API_KEY` — useful for demos and UI work without burning API quota.
- **`EVENT_CONFIG`** environment variable points to a different event file than `config/event.json` (see [Environment variables](#environment-variables)).

Related docs: [Security](../security-guide.md) · [Event-day runbook](../operations/runbook.md) · [API reference](./api.md) · [Latency tuning](../latency.md)

## Environment variables

### Server & network

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | HTTP/WebSocket listen port. |
| `HOST` | `0.0.0.0` | Listen address. `127.0.0.1` restricts the server to this machine. |
| `PUBLIC_URL` | `''` (falls back to `event.json`'s `publicUrl`, then the request's own host) | Canonical external URL, used in QR codes, admin/ingest links, and WebSocket origin checks. No trailing slash. |
| `HTTPS_CERT` / `HTTPS_KEY` | unset (plain HTTP) | Paths to a TLS certificate/key (e.g. from `mkcert`) to serve HTTPS directly. Both must be set together. Required for microphone capture from any host other than `localhost`, unless a TLS-terminating proxy sits in front. |
| `TRUST_PROXY` | `loopback` | Express `trust proxy` setting — which upstream proxies' `X-Forwarded-*` headers to trust for `req.secure`/`req.ip`. Docker Compose overrides this to `uniquelocal`. |
| `EVENT_CONFIG` | `config/event.json` | Path to the event config file (relative to the project root). Also determines which file's mtime `data/stages.json` is compared against. |
| `DATA_DIR` | `data` | Directory for `stages.json`, `secrets.json`, and `transcripts/` (relative to the project root, or absolute). |

### Security & access

See [Security](../security-guide.md) for the full threat model.

| Variable | Default | Description |
|---|---|---|
| `AUTH` | `auto` | `auto`: requests from this machine (loopback socket, no proxy headers, `Host: localhost`) are trusted; everything else needs a token. `token`: a token is required even from localhost. `off`: no authentication at all (lab use only — the server prints a warning at startup). |
| `ADMIN_TOKEN` | unset (random, generated once into `data/secrets.json`) | Bearer token (or `?token=`) required for the production dashboard and admin API when `AUTH` isn't `off`. |
| `INGEST_TOKEN` | unset (random, generated once into `data/secrets.json`) | Bearer token required to send audio to a stage (`/ws/ingest`). An admin token also works for ingest. |
| `ALLOWED_ORIGINS` | `''` | Comma-separated extra web origins allowed to open the admin/ingest WebSockets (beyond the request's own `Host` and `PUBLIC_URL`). Browsers always send `Origin` on WebSocket upgrades; this blocks a page on another site from driving those sockets with a stored token. |
| `FRAME_ANCESTORS` | `'self'` | CSP `frame-ancestors` value — who may embed the pages in an `<iframe>`. Leaving it at `'self'` also sets `X-Frame-Options: SAMEORIGIN`. |
| `PULL_ALLOW_PRIVATE` | `false` (`0`/unset) | `1`/`true`/`yes` allows server-side `http(s)://` audio pulls to target LAN/private/loopback addresses. Off by default as SSRF protection; streaming schemes (`srt://`, `rtmp://`, `rtsp://`, `udp://`, `rtp://`) are always allowed on private addresses (typical venue LAN sources) — only cloud metadata/link-local addresses are always refused. |
| `MEDIA_DIR` | unset | Extra local-file director(y/ies) a stage's `pull` may read from, in addition to the bundled `samples/`. Multiple paths are joined with the OS path-list separator (`:` on Linux/macOS, `;` on Windows). |
| `PUBLIC_TRANSCRIPTS` | `current` (or `event.json`'s `publicTranscripts`) | Who may download transcripts. `current`: anyone can export the talk in progress, listing and past talks need admin. `all`: everything public. `none`: admin only. |
| `MAX_STAGES` | `60` | Maximum number of stages the server will hold at once. |
| `MAX_VIEWERS` | `5000` | Maximum concurrent `/ws/view` connections across all stages; further connections get `503`. |
| `RATE_LIMIT_API` | `300` | State-changing `/api/*` requests allowed per client IP per 60 s window (`GET`/`HEAD` and localhost are exempt). |
| `RATE_LIMIT_AUTH_FAIL` | `20` | Failed admin/ingest auth attempts allowed per client IP per 10-minute window before `429`. |
| `RATE_LIMIT_WS` | `3000` | WebSocket upgrade attempts allowed per client IP per 60 s window. High by default because venue Wi-Fi puts hundreds of phones behind one public IP; only this connection-flood limit and the two above apply to public viewer traffic — per-viewer caption traffic itself is never rate-limited. |

### AI provider

| Variable | Default | Description |
|---|---|---|
| `GEMINI_API_KEY` | `''` | Gemini Developer API key ([aistudio.google.com/apikey](https://aistudio.google.com/apikey)). Without a key (and without Vertex AI configured) the server runs in mock mode. |
| `GEMINI_MODEL` | `gemini-3.5-live-translate-preview` (or `event.json`'s `model`) | Gemini Live Translate model used for transcription + speech translation. |
| `TEXT_MODEL` | `gemini-3.5-flash-lite` (or `event.json`'s `textModel`) | Fast text model used for per-sentence caption translation (`text`/`hybrid` modes). |
| `ENGINE` | auto: `gemini` if `GEMINI_API_KEY` or Vertex AI is configured, else `mock` | Force `gemini` or `mock` explicitly. Overridden by `--mock`. |
| `GOOGLE_GENAI_USE_VERTEXAI` | `false` | `1`/`true` switches from the Gemini Developer API to **Vertex AI** in your own Google Cloud project — data stays in your project/region, covered by Google Cloud's compliance program (ISO 27001/27017/27018/27701, ISO 42001, SOC 2, HIPAA BAA, DPA). Auth via Application Default Credentials (`gcloud auth application-default login`, or a service account on the VM) — no API key needed. |
| `GOOGLE_CLOUD_PROJECT` | `''` | GCP project ID. Required when `GOOGLE_GENAI_USE_VERTEXAI=1`. |
| `GOOGLE_CLOUD_LOCATION` | `us-central1` | GCP region for Vertex AI. |

### Audience AI

Viewer-facing "What did I miss?" summaries and question answering, grounded only in the transcript (see [API reference](./api.md)). Both use the same fast text model as caption translation (`TEXT_MODEL`) and are cheap — a full-talk summary costs well under one US cent — but public, so results are cached and shared by all viewers (45 s for a "recent" summary and 120 s for a full-talk summary while the talk is live; 24 h once it's finished) and every question is rate-limited both per client and server-wide. Without a model available (mock mode, an API error, or exhausted quota) both fall back to an extractive, AI-free answer instead of failing.

| Variable | Default | Description |
|---|---|---|
| `AUDIENCE_AI` | `on` | `off`/`0`/`false`/`no` disables AI summaries and Q&A entirely; both then always use the extractive fallback (longest/most keyword-matching transcript lines) instead of calling the model. |
| `ASK_RPM` | `30` | Questions per minute across the whole server (`POST /api/stages/:id/ask`); further questions get `429` until the window clears. |
| `ASK_PER_CLIENT_PER_MIN` | `6` | Questions per minute allowed from a single client (by IP). |
| `SUMMARY_RPM` | `30` | Summary generations per minute across the whole server (`GET /api/stages/:id/summary`) before falling back to the extractive summary; a cache hit doesn't count against it. |

### Translation & latency tuning

See [Latency tuning](../latency.md).

| Variable | Default | Description |
|---|---|---|
| `TRANSLATION_MODE` | `text` (or `event.json`'s `translation`; per-stage `translation` overrides this). With the mock engine and no explicit value, rooms use `live`. | `text`: one Gemini Live session per stage (transcription + one translated voice) plus fast text-MT captions for every target language — lowest latency/cost, any number of languages. `live`: one Live session per target language, captions straight from Live's own speech translation. `hybrid`: text-MT captions plus one Live session per language (so every language also gets translated voice 🎧). |
| `MT_RPM` | `0` (unlimited) | Text-translation requests/minute budget for the whole server. Set it to your AI Studio tier's limit (e.g. `15` on the free tier). Provisional (in-progress) translations use at most 60% of the budget; final sentences get priority. |
| `MT_PARTIAL_MS` | `1500` | How often (ms) the in-progress sentence is re-translated as a provisional caption. Lower = faster-feeling captions, more requests. |
| `MT_TIMEOUT_MS` | `5000` | Give up on (and retry) a text-translation request after this long. |
| `VAD_SILENCE_MS` | `0` (model default) | Shortens Gemini Live's end-of-speech wait, e.g. `300`, to cut caption latency. Only applied at the engine's `'full'` config level. |
| `TRANSCRIPTION_MODE` | `''` | `''` (verbatim) or `SMART` (removes filler words) — passed to Gemini Live as the input transcription mode. |
| `USE_INTERIM` | `false` (`0`) | `1` shows the model's low-latency interim transcription as provisional text on the original-language channel, before it's confirmed. |

### Audio & session lifecycle

| Variable | Default | Description |
|---|---|---|
| `SILENCE_GATE_SEC` | `30` | Stop streaming audio to the model after this many seconds of silence (no cost while gated); resumes instantly on speech. |
| `IDLE_CLOSE_SEC` | `300` | Close model sessions entirely after this many seconds without speech or ingest (zero cost, zero live session between talks). |
| `SPEECH_RMS` | `0.012` | RMS threshold (0–1) for a 100 ms audio chunk to count as "speech" (drives the silence gate and level meter). |
| `STAGES` | unset | Compact override for the room list: `id:name:source:target1+target2,id2:name2:...` (e.g. `main:Principal,sala2:Sala 2`). Empty fields fall back to the normal per-stage defaults. Takes precedence over both `config/event.json` and `data/stages.json`. |
| `FFMPEG_PATH` | unset | Custom `ffmpeg` binary path. Falls back to a system `ffmpeg` on `PATH`, then the bundled `ffmpeg-static` npm package. Not needed for 16 kHz mono 16-bit WAV files, which are read natively. |

### Data & retention

| Variable | Default | Description |
|---|---|---|
| `STORE_TRANSCRIPTS` | `true` | `false`/`0`/`no` disables writing transcripts to disk entirely — captions are only streamed to viewers, never persisted. |
| `RETENTION_DAYS` | `0` (keep forever) | Delete stored talks older than N days. Checked on startup and every 6 hours. |
| `DATA_DIR` | `data` | See [Server & network](#server--network) above. |

### Media tools

| Variable | Default | Description |
|---|---|---|
| `FFMPEG_PATH` | unset | See [Audio & session lifecycle](#audio--session-lifecycle) above. |
| `MEDIA_DIR` | unset | See [Security & access](#security--access) above. |

### Docker Compose only

These are read by `docker-compose.yml` itself, not by the Node process (except `TRUST_PROXY`, which is passed through as a real server variable).

| Variable | Default | Description |
|---|---|---|
| `BIND_ADDR` | `127.0.0.1` | Host address the container's port 8080 is published on. Set to `0.0.0.0` to expose it on the LAN (tokens are still enforced). |
| `WITH_YTDLP` | `0` | Build arg — `1` includes `yt-dlp` in the image (needed for YouTube demos / `npm run multi`). |
| `TUNNEL_TOKEN` | required for the `tunnel` profile | Cloudflare Tunnel token, used by `docker compose --profile tunnel up`. |
| `TRUST_PROXY` | `uniquelocal` (compose default; `loopback` if run outside Compose) | Trusts `X-Forwarded-*` from the private Docker network the `tunnel` service sits on. |

### Debugging

| Variable | Default | Description |
|---|---|---|
| `OC_DEBUG_RAW` | unset | `1` logs every raw Gemini Live server message (truncated, with audio payloads elided) to the console. Also set automatically by `node scripts/check-gemini.js --raw`. Very verbose — local debugging only. |

## Event file (`config/event.json`)

Loaded once at startup from the path in `EVENT_CONFIG` (default `config/event.json`). All keys are optional; the built-in defaults are shown below. An environment variable with the same purpose (see the tables above) always wins over the matching key here.

### Top-level keys

| Key | Type | Default | Description |
|---|---|---|---|
| `eventName` | string | `"OpenCaptions"` | Shown in the UI and startup banner. |
| `accent` | string | `"#7c5cff"` | Accent color (CSS color value) used across the audience/admin pages. |
| `publicUrl` | string | `""` | Canonical external URL. Overridden by `PUBLIC_URL`. |
| `publicTranscripts` | `"current"` \| `"all"` \| `"none"` | `"current"` | Who may download transcripts. Overridden by `PUBLIC_TRANSCRIPTS`. |
| `timezone` | string (IANA zone, e.g. `"America/Argentina/Buenos_Aires"`) | unset | Sets `process.env.TZ` at startup, but only if `TZ` isn't already set in the environment. Controls what "today" and `HH:MM` mean when parsing the schedule's start times (see [Schedule file](#schedule-file-configschedulejson)) — containers default to UTC otherwise. No matching environment variable; set `TZ` directly if you'd rather not use this key. |
| `model` | string | `"gemini-3.5-live-translate-preview"` | Overridden by `GEMINI_MODEL`. |
| `textModel` | string | `"gemini-3.5-flash-lite"` | Overridden by `TEXT_MODEL`. |
| `languages` | object `{code: displayName}` | `{"es":"Español","en":"English","pt":"Português"}` | Display names for language codes used anywhere in the event (stage targets, sources). |
| `defaultTargets` | string[] | `["es","en"]` | Fallback `targets` for any stage that doesn't specify its own (or specifies an empty list). |
| `glossary` | string (path) | `"config/glossary.json"` | Path to the glossary file. Overridden by `GLOSSARY`. |
| `silenceGateSec` | number | `30` | Overridden by `SILENCE_GATE_SEC`. |
| `idleCloseSec` | number | `300` | Overridden by `IDLE_CLOSE_SEC`. |
| `speechRms` | number | `0.012` | Overridden by `SPEECH_RMS`. |
| `translation` | `"text"` \| `"live"` \| `"hybrid"` | `"text"` | Default translation mode for stages that don't set their own `translation`. Overridden by `TRANSLATION_MODE`. |
| `mtRpm` | number | `0` | Overridden by `MT_RPM`. |
| `mtPartialMs` | number | `1500` | Overridden by `MT_PARTIAL_MS`. |
| `mtTimeoutMs` | number | `5000` | Overridden by `MT_TIMEOUT_MS`. |
| `useInterim` | boolean | `false` | Overridden by `USE_INTERIM`. |
| `vadSilenceMs` | number | `0` | Overridden by `VAD_SILENCE_MS`. |
| `transcriptionMode` | `""` \| `"VERBATIM"` \| `"SMART"` | `""` | Overridden by `TRANSCRIPTION_MODE`. |
| `stages` | array of stage objects | `[]` | The room list. Replaced entirely by `STAGES` when that env var is set, and superseded by `data/stages.json` once the dashboard has edited it (see [precedence](#configuration-reference) above). |

### Stage object

Each entry in `stages` (and the body of `POST /api/stages` / `PATCH /api/stages/:id`) has this shape. Validation (`validateStage` in `src/server.js`) runs on every create/update, whether the stage comes from `event.json`, `STAGES`, `data/stages.json`, or the API.

| Field | Type | Default | Constraints |
|---|---|---|---|
| `id` | string | — (required) | Lowercased and sanitized to `[a-z0-9_-]` before validation. Must then match `^[a-z0-9][a-z0-9_-]{0,39}$` (1–40 chars) and not be the literal `"undefined"`. Used in URLs, file paths and metric labels. |
| `name` | string | `id` | Display name. Max 80 characters. |
| `source` | `"auto"` \| BCP-47 code | `"auto"` | `"auto"` = language detected continuously (recommended for bilingual hosts, Q&A and mixed talks). A code (`en`, `es`, `pt-BR`; must match `^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$`) hints the recognizer when the whole talk is in one language. Either way every caption language is its own track: it shows the transcription while the speaker uses that language and a translation when they switch (a switch is confirmed after ~15 characters, so one foreign word doesn't flip the captions). |
| `targets` | string[] | `defaultTargets` (used when omitted or empty) | 1–8 entries, each a language code matching the same BCP-47-ish pattern as `source`. |
| `pull` | string | `""` (no server-side pull; audience/ingest page must push audio) | URL or local path the server pulls audio from via ffmpeg: `srt://`, `rtmp(s)://`, `rtsp(s)://`, `udp://`, `rtp://`, `http(s)://`, or a bare path under `samples/`/`MEDIA_DIR`. Validated with the same SSRF checks as `PULL_ALLOW_PRIVATE` (see above) before being accepted. |
| `loop` | boolean | `false` | Loop the pulled file/stream when it ends, instead of stopping. |
| `title` | string | `""` | Current talk title, shown to viewers. Max 200 characters. Can also be changed live via `POST /api/stages/:id/talk`. |
| `vocabulary` | string[] | `[]` | Extra terms biasing speech recognition for this stage, merged with the global glossary vocabulary (500-term cap after merging). Up to 500 entries. |
| `translation` | `"text"` \| `"live"` \| `"hybrid"` \| unset | unset (falls back to `TRANSLATION_MODE`/`event.translation`) | Per-stage override of the translation mode. |

### Example

```json
{
  "eventName": "Nerdearla 2026",
  "accent": "#8b5cf6",
  "publicUrl": "",
  "publicTranscripts": "all",
  "timezone": "America/Argentina/Buenos_Aires",
  "model": "gemini-3.5-live-translate-preview",
  "languages": { "es": "Español", "en": "English", "pt": "Português" },
  "defaultTargets": ["es", "en"],
  "glossary": "config/glossary.json",
  "silenceGateSec": 30,
  "idleCloseSec": 300,
  "stages": [
    { "id": "main",   "name": "Escenario Principal", "source": "auto", "targets": ["es", "en"] },
    { "id": "sala-a", "name": "Sala A", "source": "en", "targets": ["es", "pt"], "translation": "hybrid" },
    { "id": "sala-b", "name": "Sala B", "source": "es", "targets": ["en"], "pull": "srt://0.0.0.0:9001?mode=listener" },
    { "id": "sala-c", "name": "Sala C", "source": "auto", "targets": ["es", "en"], "vocabulary": ["Nerdearla", "Kubernetes"] }
  ]
}
```

## Glossary file (`config/glossary.json`)

Loaded from the path in `glossary`/`GLOSSARY` (default `config/glossary.json`). Hot-reloaded: the file is watched (polled every 2 s) and changes apply instantly, no restart needed. It can also be replaced via `PUT /api/glossary` (admin-only), which writes it back to the same file.

| Key | Type | Constraints | Description |
|---|---|---|---|
| `vocabulary` | string[] | up to 500 entries, each ≤100 chars | Biases speech recognition — sent to Gemini as `customVocabulary`, merged with each stage's own `vocabulary`. |
| `replacements` | array of `{ from, to, lang? }` | up to 500 entries; `from` ≤300 chars, `to` ≤300 chars, `lang` ≤12 chars | Deterministic text fixes applied to every finalized caption. |

`replacements[].from` is **not a regex** — it's one or more literal alternatives separated by `|` (e.g. `"cube control|cube ctl"`), matched case-insensitively as whole words (Unicode-aware word boundaries, so accented text works). Each match is replaced with `to`. `lang`, if set, restricts the rule to one caption channel (`"orig"`, or a target language code like `"es"`); omitted, it applies to every channel.

### Example

```json
{
  "vocabulary": [
    "Nerdearla", "SysArmy", "Kubernetes", "kubectl", "Terraform", "OpenTelemetry",
    "Prometheus", "Grafana", "PostgreSQL", "Gemini", "DevOps", "SRE", "on-call",
    "pull request", "CI/CD", "TypeScript"
  ],
  "replacements": [
    { "from": "nerd earla|nerdear la|nerdiarla|nerdle", "to": "Nerdearla" },
    { "from": "cubernetes|kubernete|kuber netes", "to": "Kubernetes" },
    { "from": "cube control|cube ctl|kube control", "to": "kubectl" },
    { "from": "solicitud de extracción|solicitud de incorporación", "to": "pull request", "lang": "es" },
    { "from": "de guardia", "to": "on-call", "lang": "es" }
  ]
}
```

## Schedule file (`config/schedule.json`)

The event agenda — lets OpenCaptions name a room's talk automatically as each session starts, instead of an operator pressing **New talk** for every room by hand. Loaded from the path in `SCHEDULE` (default `config/schedule.json`), watched and hot-reloaded (polled every 3 s, same pattern as the glossary). It can also be replaced via `PUT /api/schedule` (admin-only — the dashboard's 📅 Agenda screen uses it), which writes back to the same file.

The file is a JSON array of entries:

| Field | Type | Description |
|---|---|---|
| `stage` | string | Room id, matching a stage's `id`. |
| `start` | string (ISO timestamp) or number (epoch ms) | When the slot starts. |
| `title` | string | Talk title. Max 200 characters. |
| `speaker` | string | Optional. Max 120 characters. |

`PUT /api/schedule` (and the dashboard's paste-in box) also accepts CSV in place of JSON — either raw text or `{ "csv": "..." }` — with one talk per line: `stage,start,title,speaker`. Fields may be comma-, semicolon-, or tab-separated and quoted (doubled `""` for a literal quote inside one, as usual). A header row (first column `stage`, `sala`, or `room`, case-insensitively) and lines starting with `#` are skipped automatically; at most 2000 rows. `start` accepts `HH:MM` (today, in the event's time zone — see `timezone` above), a full `YYYY-MM-DD HH:MM`, or any ISO date-time. A sample sheet is at `config/schedule.example.csv`:

```csv
stage,start,title,speaker
main,10:00,Keynote de apertura,Organización Nerdearla
main,10:45,Observabilidad en Kubernetes sin morir en el intento,Ana Pérez
sala-a,10:45,Rust para gente que viene de Go,Juan Gómez
sala-b,11:30,"IA en producción: costos, latencia y calidad",María López
```

**How a room follows the agenda** (`Stage#applySchedule` in `src/stage.js`, checked roughly every 15 status ticks):

- Once a slot's start time has passed, the room's talk is renamed to that slot's title as soon as nothing has been said yet, or the current talk has no title — no need to wait for a pause.
- If a talk is already running and being captioned, the room only switches to a **new** talk once the room goes quiet (silence-gated, or has no live session) — so a speaker who runs long is never cut mid-sentence — and only within **45 minutes** of the slot's start; past that window the agenda gives up on that slot.
- A slot with no successor is still treated as "now" for up to **3 hours** after its start; older than that, it's dropped and the agenda stays quiet for that room until its next slot.
- An operator's manual **New talk** or title change always wins: it marks that slot as handled, so the agenda won't rename or restart the talk again for it.

## Files written at runtime

All under `DATA_DIR` (default `data/`), created on demand.

| Path | Written by | Contents |
|---|---|---|
| `data/stages.json` | Every `POST`/`PATCH`/`DELETE /api/stages*` call | JSON array of the current stage definitions (same shape as `event.json`'s `stages`). Takes precedence over `config/event.json` on the next restart — see [precedence](#configuration-reference). |
| `data/secrets.json` | First startup, when `AUTH != off` and `ADMIN_TOKEN`/`INGEST_TOKEN` aren't both set via env | `{ "adminToken": "...", "ingestToken": "..." }`, random 24-character base64url tokens (18 random bytes). Written with file mode `0600`. Whichever of the two you *do* set via env is used in preference to the stored value; the file still fills in the other. |
| `data/transcripts/<stage-id>/<talk-id>/meta.json` | `Store.openTalk` — on every new talk and title change (only when `STORE_TRANSCRIPTS` is not disabled) | `{ "stage", "id", "title", "startedAt", "languages" }`. `stage-id` and `talk-id` are sanitized to `[a-zA-Z0-9_-]`; `talk-id` is an ISO timestamp with `:`/`.` replaced by `-` (e.g. `2026-09-24T18-30-05-123Z`). |
| `data/transcripts/<stage-id>/<talk-id>/captions.jsonl` | `Store.append` — one line per **finalized** caption segment | Each line: `{ "id", "channel", "lang", "text", "start", "end", "final": true }` (`start`/`end` in ms since the talk started). Read back by `GET /api/stages/:id/export.{srt,vtt,txt,json}`. |
| `data/latency-<ISO timestamp>.json` | `npm run multi` (`scripts/multi-youtube.js`), on exit/Ctrl+C | Latency/cost report: p50/p90 for original transcription and translation, total cost, system stats, and a per-room breakdown. Not written by the server itself. |

`npm run setup` (below) writes two files outside `DATA_DIR`, in the project root: `.env` and `config/event.json`. Any existing copies are backed up to `<file>.bak` first, and an existing `data/stages.json` is moved to `data/stages.json.bak` — so the room list you just entered takes effect immediately instead of being shadowed by a previous dashboard edit (see [precedence](#configuration-reference)).

## Command-line tools

`npm` scripts (see `package.json`); each also accepts the flags below via `--` (e.g. `npm run feed -- --stage main`).

| Script | Runs | Flags |
|---|---|---|
| `npm start` | `node src/server.js` | — |
| `npm run setup` | `node scripts/setup.js` | Interactive wizard, no flags — asks for the event name, rooms (comma-separated), the language talks are usually given in, caption languages for the audience, a Gemini API key, the public URL, whether past-talk transcripts should be public too, and the event's time zone. Writes `.env` (`GEMINI_API_KEY`, `ADMIN_TOKEN`, `INGEST_TOKEN`, `PUBLIC_URL`) and `config/event.json`, generating admin/ingest tokens if none exist yet. Safe to re-run — see [Files written at runtime](#files-written-at-runtime) for what it backs up. |
| `npm run mock` | `node src/server.js --mock` | Forces the mock caption engine. |
| `npm test` | `node --test` (finds every `*.test.js`) | — |
| `npm run check` | `node scripts/check-gemini.js` | `--input <file>` (default `samples/talk-en.wav`), `--target <lang>` (default `es`), `--seconds <n>` (default `25`), `--raw` (sets `OC_DEBUG_RAW=1`). End-to-end check of your Gemini key/model without starting the server. |
| `npm run feed` | `node scripts/feed.js` | `--stage <id>` (default `main`), `--input <file\|url>` or `--youtube <url>`, `--start <sec>`, `--loop`, `--server <ws(s)://host:port>` (default `ws://localhost:8080`, or `OC_SERVER`), `--token <ingest token>` (or `INGEST_TOKEN`), `--label <text>`, `--quiet`. Streams any audio/video file, URL, or YouTube link into a stage in real time. |
| `npm run loadtest` | `node scripts/loadtest.js` | `--stages <n>` (default `10`), `--input <file>` (default `samples/talk-en.wav`), `--server <url>` (default `http://localhost:8080`), `--admin-token <token>` (or `ADMIN_TOKEN`/`INGEST_TOKEN`), `--source`, `--targets`, `--cleanup`. Simulates N simultaneous stages fed with the same audio. |
| `npm run agent` | `node scripts/agent.js` | `--stage <id>` (required), `--server <ws(s)://host:port>` (default `ws://localhost:8080`, or `OC_SERVER`), `--token <token>` (or `INGEST_TOKEN`), `--device <index\|name>`, `--channel mix\|left\|right`, `--gain <x>`, `--label <text>`, `--quiet`, `--list-devices`, `--file <path>` (test mode: loop a file instead of a sound card). Headless stage agent — captures a sound card with ffmpeg and streams it to the server, reconnecting forever; meant to run as a system service on each stage PC. Reconnects if the server sends no message for 6 s (a half-dead connection TCP wouldn't notice for minutes); if the server closes the connection with code `4000` (another source — browser ingest, a `pull` — took over the room), it backs off and waits 60 s before retrying instead of fighting for the room every second. |
| `npm run multi` | `node scripts/multi-youtube.js` | `--rooms <n>` (default `15`), `--minutes <n>` (default `5`, `0` = until Ctrl+C), `--start <sec>` (default `180`), `--playlist <url>`, `--file <path>` (one YouTube URL per line), `--list` (only show discovered videos), `--cleanup` (delete the rooms at the end), `--prefix <text>`, `--query <text>`, `--year <yyyy>`, `--min-duration <sec>`, `--server <url>` (or `OC_SERVER`), `--admin-token <token>` (or `ADMIN_TOKEN`), `--concurrency <n>`, `--source`, `--targets`. Latency/scale test: N rooms, each fed server-side from a different YouTube video; writes a `data/latency-*.json` report. Requires `yt-dlp` on the machine running the server. |
| `npm run subtitle` | `node scripts/subtitle.js` | `<file>` (required, any audio/video ffmpeg can read), `--langs <codes>` (default `en,es`), `--source <code\|auto>` (default `auto`), `--out <dir>` (default: next to the file), `--server <url>` (or `OC_SERVER`), `--admin-token <token>` (or `ADMIN_TOKEN`; not needed on the server machine). Plays the file into a temporary room in real time and writes `<name>.<lang>.srt`/`.vtt` (plus `.original`) for YouTube uploads, then deletes the room. |

`OC_SERVER` (default `ws://localhost:8080` / `http://localhost:8080` depending on the script) and `INGEST_TOKEN`/`ADMIN_TOKEN` are read by these client-side scripts to reach a server — they are not server configuration.

## Recipes

The fastest way to reach any of these is `npm run setup` (see [Command-line tools](#command-line-tools)), which asks a few questions and writes `.env`/`config/event.json` for you. The recipes below show the underlying `.env` values directly, for scripted or repeat deployments.

**Local laptop demo** — mock captions, no API key, everything on localhost:

```env
# no GEMINI_API_KEY → mock engine; AUTH=auto trusts this machine
```

**Exposed on a conference LAN, with fixed tokens** (so admin/ingest links survive a server restart):

```env
GEMINI_API_KEY=AIza...
HOST=0.0.0.0
AUTH=token
ADMIN_TOKEN=<openssl rand -base64 24>
INGEST_TOKEN=<openssl rand -base64 24>
RATE_LIMIT_WS=3000
```

**Behind a Cloudflare Tunnel** (`docker compose --profile tunnel up`):

```env
GEMINI_API_KEY=AIza...
PUBLIC_URL=https://subs.example.com
AUTH=token
ADMIN_TOKEN=<openssl rand -base64 24>
INGEST_TOKEN=<openssl rand -base64 24>
TUNNEL_TOKEN=<cloudflare tunnel token>
BIND_ADDR=127.0.0.1
```

**Enterprise: Vertex AI, no transcript storage**:

```env
GOOGLE_GENAI_USE_VERTEXAI=true
GOOGLE_CLOUD_PROJECT=my-gcp-project
GOOGLE_CLOUD_LOCATION=us-central1
STORE_TRANSCRIPTS=false
AUTH=token
ADMIN_TOKEN=<openssl rand -base64 24>
INGEST_TOKEN=<openssl rand -base64 24>
```
