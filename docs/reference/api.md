# API reference

OpenCaptions exposes one HTTP + WebSocket server (`src/server.js`) for everything: the public JSON API, the
audience/production/stage web pages, and three WebSocket endpoints that carry audio in and captions out.

- **Base URL**: `http://localhost:8080` by default (`PORT`, `HOST`). Behind a tunnel or reverse proxy, use
  your `PUBLIC_URL`. Set `HTTPS_CERT`/`HTTPS_KEY` (or put TLS in front) for `https://` / `wss://`.
- **Format**: all request and response bodies are JSON (`Content-Type: application/json`), except file
  exports (`.srt`, `.vtt`, `.txt`) and the QR endpoint (SVG).
- **Versioning**: OpenCaptions is unversioned pre-1.0 software (`package.json` is at `0.1.0`). There is no
  `/v1` prefix and no stability guarantee yet — a route, field or WebSocket message shape can change between
  releases. Check the project's changelog for breaking changes before upgrading a deployed server.

See also: [Configuration reference](./configuration.md) for every environment variable, and
[Security](../security-guide.md) for the full auth/threat model this page summarizes.

## Authentication

Auth is controlled by `AUTH` (`src/security.js`):

| `AUTH` | Behavior |
|---|---|
| `auto` (default) | Requests **from this same machine** (loopback socket, a `localhost`/`127.0.0.1`/`[::1]` `Host` header, and no proxy headers) are trusted with no token. Anything else needs a token. |
| `token` | A token is required for every request, even from localhost. |
| `off` | No authentication at all. The server prints a warning on startup. Lab/local use only. |

There are two tokens, `ADMIN_TOKEN` and `INGEST_TOKEN` (auto-generated and printed on first start if unset,
then persisted in `data/secrets.json`). **The admin token also works for ingest.** A token is presented as:

- `Authorization: Bearer <token>` (preferred), or
- `x-admin-token` / `x-ingest-token` header, or
- `?token=` query parameter — accepted for admin **HTTP GET requests only** (not `POST`/`PATCH`/`DELETE`),
  and for all three WebSocket upgrade requests (browsers cannot set custom headers on a WebSocket handshake).

| Endpoint group | Who can call it |
|---|---|
| `GET /healthz`, `GET /api/event`, `GET /api/glossary`, `GET /api/schedule`, `GET /api/qr.svg`, `GET /s/:id`, `GET /manifest.webmanifest`, static pages | Public — no auth |
| `GET /api/talks`, `GET /api/stages/:id/talks`, `GET /api/stages/:id/talks/:talk`, `GET /api/stages/:id/export.:fmt` | Depends on `PUBLIC_TRANSCRIPTS` — see [Transcripts & exports](#transcripts--exports) |
| `GET /api/stages/:id/summary`, `POST /api/stages/:id/ask` | Depends on `PUBLIC_TRANSCRIPTS` — see [Audience AI](#audience-ai-summaries--ask) |
| `GET /api/status`, `POST/PATCH/DELETE /api/stages*`, `PUT /api/glossary`, `PUT /api/schedule`, `GET /metrics` | Admin token |
| `WS /ws/ingest` | Ingest token **or** admin token |
| `WS /ws/view` | Public — no auth |
| `WS /ws/admin` | Admin token |

```bash
# Admin call from a remote machine (AUTH=auto trusts localhost only; use a token everywhere else)
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://subs.example.com/api/status

# Same, with the query-string form (GET only)
curl "https://subs.example.com/api/status?token=$ADMIN_TOKEN"
```

WebSocket origin check (`ws/ingest`, `ws/admin` only — not `ws/view`): if the browser sends an `Origin`
header, it must match `ALLOWED_ORIGINS`, the request's own `Host`, or `PUBLIC_URL`'s origin. Non-browser
clients (the headless agent, scripts, curl) send no `Origin` and are unaffected.

## Errors and limits

Every JSON error response has the shape:

```json
{ "error": "human-readable message" }
```

| Status | Meaning |
|---|---|
| `400` | Bad request — validation error (`error` is the specific message, e.g. `"id: 1-40 chars, a-z 0-9 _ -"`) |
| `401` | Missing/invalid admin token (`{"error":"admin token required"}`) |
| `404` | Unknown route under `/api`, unknown stage id (`{"error":"unknown stage"}`), or an unknown talk id (`{"error":"unknown talk"}`) |
| `429` | Rate limited (`Retry-After` header set) |
| `500` | Internal error — message is always `"internal error"`; details are logged server-side only, never leaked |

**Rate limits** (`src/security.js`, per client IP; all configurable, `0`/unset disables the specific limit):

| Limit | Env var | Default | Applies to |
|---|---|---|---|
| API requests | `RATE_LIMIT_API` | 300 / 60 s | State-changing (non-`GET`/`HEAD`) requests under `/api`. Skipped for trusted localhost. Exceeding it returns `429 {"error":"too many requests"}` with `Retry-After: 60`. |
| Failed logins | `RATE_LIMIT_AUTH_FAIL` | 20 / 10 min | Failed admin/ingest token checks (HTTP and WebSocket). Exceeding it returns `429 {"error":"too many failed attempts"}` with `Retry-After: 600`, *before* the real 401/close is even evaluated. |
| WebSocket connects | `RATE_LIMIT_WS` | 3000 / 60 s | Every `/ws/*` upgrade attempt, any kind. Exceeding it rejects the upgrade with HTTP `429`. |

Viewer traffic (`GET` requests, `/ws/view` beyond the connection-flood limit above) is deliberately **not**
rate-limited per IP — venue Wi-Fi puts hundreds of phones behind one public IP.

**Body size**: JSON request bodies are capped at **256 KB** (`express.json({ limit: '256kb' })`); an oversized
body is rejected before your route handler runs. WebSocket messages are capped separately — see
[WebSocket endpoints](#websocket-endpoints).

## HTTP endpoints

### Health & metrics

| Method & path | Auth | Notes |
|---|---|---|
| `GET /healthz` | Public | Liveness probe. |
| `GET /metrics` | Admin | Prometheus text exposition. See [Prometheus metrics](#prometheus-metrics). |

`GET /healthz` response:

```json
{ "ok": true, "stages": 3, "engine": "gemini", "cpuPct": 4.2, "rssMB": 118, "loopLagP99Ms": 1.3 }
```

### Event & rooms (public)

| Method & path | Auth | Notes |
|---|---|---|
| `GET /api/event` | Public | Event metadata + a summary of every stage. Powers the audience homepage. |

Response:

```json
{
  "name": "Nerdearla 2026",
  "accent": "#7c5cff",
  "publicUrl": "https://subs.example.com",
  "languages": { "es": "Español", "en": "English", "pt": "Português" },
  "audienceAi": true,
  "publicTranscripts": "current",
  "timezone": "America/Argentina/Buenos_Aires",
  "stages": [
    {
      "id": "main", "name": "Auditorio", "title": "Observability in Kubernetes",
      "speaker": "Ana Pérez", "next": { "title": "Rust for Go developers", "speaker": "John Doe", "start": 1758728530441 },
      "talk": "2026-09-24T14-02-10-441Z",
      "source": "auto", "detectedLang": "en", "languages": ["orig", "en", "es"],
      "live": true
    }
  ]
}
```

`languages` here is the event's configured language names (`config/event.json` → `languages`), not
necessarily every language in use. `live` is `true` only when the stage has at least one running model
session and is not currently silence-gated. `audienceAi` mirrors `AUDIENCE_AI` (see
[Audience AI](#audience-ai-summaries--ask)); `publicTranscripts` is the effective `PUBLIC_TRANSCRIPTS` value
(see [Transcripts & exports](#transcripts--exports)); `timezone` is the server process's local IANA time zone
(what `HH:MM` agenda times are parsed in — see [Schedule](#schedule)). Per stage, `talk` is the current talk's
id and `next` is the upcoming agenda slot for that room (`{ title, speaker, start }`, from `src/schedule.js`),
or `null` when there's no schedule or no upcoming slot.

### Room administration

All of these require the admin token. `:id` is a stage id (`[a-z0-9][a-z0-9_-]{0,39}`).

| Method & path | Notes |
|---|---|
| `GET /api/status` | Full snapshot: every stage's [`status()`](#stage-status-object) plus server totals. Powers the production dashboard, polled here on load and then pushed over `WS /ws/admin`. |
| `POST /api/stages` | Create a room. |
| `PATCH /api/stages/:id` | Update a room (partial body — only sent fields change). |
| `DELETE /api/stages/:id` | Remove a room (stops its pull/ingest; **stored transcripts are kept**). |
| `POST /api/stages/:id/talk` | Start a new talk (flushes captions, opens a new transcript). |
| `POST /api/stages/:id/youtube` | Server-side YouTube pull for demos (see below). |
| `DELETE /api/stages/:id/pull` | Stop a configured audio pull. |
| `POST /api/stages/:id/pull/stop` | Same as `DELETE …/pull`, as a POST. The demo page calls it with `fetch(…, { keepalive: true })` and the admin header when the tab closes, so the server stops pulling YouTube audio nobody is watching. |
| `POST /api/stages/:id/restart` | Force-reconnect every model session for the room (manual "↻" button). |

**Request body** for `POST /api/stages` and `PATCH /api/stages/:id` (all fields optional on `PATCH`; `id` is
required and immutable on create):

| Field | Type | Constraints |
|---|---|---|
| `id` | string | Create only. `^[a-z0-9][a-z0-9_-]{0,39}$`, must not already exist. |
| `name` | string | ≤ 80 chars. Defaults to `id`. |
| `title` | string | ≤ 200 chars. Current talk title; on `PATCH` this renames the *current* talk (does not start a new one). |
| `source` | string | `"auto"` (default) or a BCP-47-ish code (`^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$`) — the language the room is spoken in. |
| `targets` | string[] | 1–8 language codes to translate into. Defaults to the event's `defaultTargets`. |
| `translation` | string | `"text"` \| `"live"` \| `"hybrid"`, or omit to use the server default (`TRANSLATION_MODE`). |
| `pull` | string | Audio source URL/path the server pulls with ffmpeg (`srt://`, `rtmp://`, `https://…`, or a file under `samples/`/`MEDIA_DIR`). Empty string stops an active pull. Validated with the same SSRF checks as the YouTube endpoint (see [Security](../security-guide.md)). |
| `loop` | boolean | Loop a file-based `pull`. |
| `vocabulary` | string[] | ≤ 500 terms, biases speech recognition for this room (merged with the global glossary). |

Response (both endpoints): the room's [`status()`](#stage-status-object) object. Changing
`source`/`targets`/`translation` restarts any running model sessions. `PATCH` only acts on fields that
actually changed, so re-saving the same dialog is a no-op:

- A changed `title` **renames the current talk in place** — it emits a WebSocket `title` message and viewers
  keep their captions. It does not start a new talk (a new `talk.id`, a blank transcript) — use
  `POST /api/stages/:id/talk` for that.
- A changed `pull` or `loop` (re)starts or stops the audio pull; submitting the same `pull` URL/`loop` value
  that's already configured leaves an active pull running untouched.

```bash
# Create a room
curl -X POST http://localhost:8080/api/stages \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"id":"sala-b","name":"Sala B","source":"auto","targets":["es","en"]}'

# Rename the current talk and add Portuguese
curl -X PATCH http://localhost:8080/api/stages/sala-b \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Observability in Kubernetes","targets":["es","en","pt"]}'
```

`POST /api/stages/:id/talk` — start a **new** talk: flushes any pending captions and opens a fresh transcript
(a new `talk.id`, with cue timestamps starting from that talk's first spoken words). Use this between
speakers; use `PATCH` above just to fix a typo in the running talk's title.

| Field | Type | Notes |
|---|---|---|
| `title` | string | ≤ 200 chars. Defaults to `''`. |
| `speaker` | string | ≤ 120 chars. Defaults to `''`. |

```bash
curl -X POST http://localhost:8080/api/stages/main/talk \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Rust for Go developers","speaker":"John Doe"}'
```

`POST /api/stages/:id/youtube` — demo/testing helper: the server pulls a YouTube video's audio in real time
from `start` seconds while a demo page plays the same video, so speech and captions can be compared live.

| Field | Type | Notes |
|---|---|---|
| `url` | string | Required. Must resolve to a public `http(s)` URL (no private/loopback/metadata hosts). |
| `start` | number | Seconds into the video to start from. Default `0`. |

The request **blocks until audio is flowing** (or up to 25 s), so the demo page can start the video in sync:

```bash
curl -X POST http://localhost:8080/api/stages/main/youtube \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ","start":120}'
# → { "ok": true, "start": 120 }

curl -X DELETE http://localhost:8080/api/stages/main/pull -H "Authorization: Bearer $ADMIN_TOKEN"
# → { "ok": true }
```

### Transcripts & exports

| Method & path | Auth | Notes |
|---|---|---|
| `GET /api/talks` | Depends on `PUBLIC_TRANSCRIPTS` | Cross-room library of talks — powers `/talks.html`. |
| `GET /api/stages/:id/talks` | Admin (public if `PUBLIC_TRANSCRIPTS=all`) | List **saved** talks for one room. |
| `GET /api/stages/:id/talks/:talk` | Depends on `PUBLIC_TRANSCRIPTS` and which talk | One talk's metadata (`talkInfo`, below). `:talk` is a saved talk id, or the literal `current`. |
| `GET /api/stages/:id/export.:fmt` | Public for the **talk in progress**; admin for past talks | Download/stream a talk's captions. |

Access to a specific talk — its listing, metadata, export, [summary and ask](#audience-ai-summaries--ask) — is
controlled by one rule (`canReadTalk` in `src/server.js`), driven by `PUBLIC_TRANSCRIPTS` (env var, or
`publicTranscripts` in `config/event.json` if the env var is unset):

| `PUBLIC_TRANSCRIPTS` | Listing (`/api/talks`, `.../talks`) | Talk in progress (metadata / export / summary / ask) | Past talks (same) |
|---|---|---|---|
| `current` (default) | Admin | Public | Admin |
| `all` | Public | Public | Public |
| `none` | Admin | Admin | Admin |

In code this is three middlewares built from the same check: `listAccess` gates the two listing endpoints
(public only under `all`); `talkAccess` gates a specific talk — `canReadTalk(req, stage, talkId)` is true under
`all`, or under `current` when `talkId` is the room's current talk (or omitted), or with a valid admin
token — and falls back to requiring one otherwise; `POST /api/stages/:id/ask` applies the identical
`canReadTalk` check inline (see [Audience AI](#audience-ai-summaries--ask)). `GET /api/talks` applies the rule
per room: `PUBLIC_TRANSCRIPTS=none` with no admin token is `401`; otherwise every room's *current* talk is
always included, and every room's *saved* talks are added too once the requester can see them (`all`, or an
admin token).

`GET /api/talks` response — every visible talk across every room, most recent first, each with at least one
caption:

```json
{
  "publicTranscripts": "current",
  "talks": [
    { "stage": "main", "stageName": "Auditorio", "id": "2026-09-24T14-02-10-441Z",
      "title": "Observability in Kubernetes", "speaker": "Ana Pérez", "startedAt": 1758724930441,
      "languages": ["orig", "en", "es"], "channels": ["orig", "es"], "segments": 214,
      "durationMs": 1820000, "live": true, "current": true }
  ]
}
```

Each entry is a `talkInfo` object — the same shape `GET /api/stages/:id/talks/:talk` returns for one talk:

| Field | Type | Meaning |
|---|---|---|
| `stage`, `stageName` | string | Room id and display name. |
| `id` | string | Talk id (an ISO timestamp with `:`/`.` replaced by `-`). |
| `title`, `speaker` | string | May be empty. |
| `startedAt` | number | Epoch ms of the talk's first spoken words. |
| `languages` | string[] | The room's caption channels at the time the talk started. |
| `channels` | string[] | Channels that actually have captions for this talk (a subset of `languages`). |
| `segments` | number | Final caption count on the `orig` channel only. |
| `durationMs` | number | Latest caption end time, ms from talk start. |
| `live` | boolean | This is the room's **current** talk *and* it currently has a running, ungated session. |
| `current` | boolean | This is the room's current talk (`talkId` was `current`/omitted, or matched `stage.talk.id`). |

```bash
curl http://localhost:8080/api/talks
curl http://localhost:8080/api/stages/main/talks/current
# → 404 {"error":"unknown talk"} for an unknown saved id, or "current" on a room with no captions yet
```

`GET /api/stages/:id/talks` response — one entry per **saved** talk (`src/store.js` `listTalks()`), most
recent first:

```json
[
  { "stage": "main", "id": "2026-09-24T14-02-10-441Z", "title": "Observability in Kubernetes",
    "speaker": "Ana Pérez", "startedAt": 1758724930441, "languages": ["orig", "en", "es"], "segments": 214 }
]
```

(`segments` here counts caption lines across **all** channels as stored on disk — unlike `talkInfo.segments`
above, which counts only the `orig` channel.)

`GET /api/stages/:id/export.:fmt` query params:

| Param | Default | Notes |
|---|---|---|
| `fmt` (path) | — | `srt` \| `vtt` \| `txt` \| `json`. Anything else → `400`. |
| `talk` | current talk id | Which saved talk to export (from the `talks` listing above). |
| `lang` | `orig` | Which caption channel/language to export. Ignored for `fmt=json`, which returns **all** channels. |
| `inline` | attachment | If present, sets `Content-Disposition: inline` instead of `attachment` (view in-browser vs. download). |

```bash
curl "http://localhost:8080/api/stages/main/export.srt?lang=es" -o captions-es.srt
curl "http://localhost:8080/api/stages/main/export.txt?lang=es&talk=2026-09-24T14-02-10-441Z"
```

`/talk.html` (linked from `/watch.html`'s 📄 button, and from `/talks.html`) is where captions actually get
downloaded — its ⬇ menu exports whichever talk it's showing. The dashboard's transcript links add the admin
token so past talks can be exported too.

**With `STORE_TRANSCRIPTS=false`** nothing is written to disk (`store.enabled` is `false`): `GET
/api/stages/:id/talks` and the saved-talk half of `/api/talks` are always empty, and every per-talk endpoint
above falls back to the **current** talk's in-memory caption history only (`talkSegs()` in `src/server.js`,
reading straight from each track's buffer). `talks/:talk`, `summary` and `ask` still `404` for anything but the
current talk (`talkInfo` finds no metadata for it), but `export.:fmt` has no such check — asking it for a
`talk=` id that isn't the current one returns an **empty** file (`200`) rather than `404`.

### Audience AI (summaries & ask)

"What did I miss?" and "ask the talk" (`src/assist.js`) — grounded in the transcript only, answered in the
viewer's language. Both are disabled entirely by `AUDIENCE_AI=off` (`0`/`false`/`no` also work), and both fall
back to a fast extractive (non-AI) summary/answer — picked straight from transcript lines, no model call — when
AI is disabled, `ENGINE=mock`, a rate limit is hit, or the model call itself fails.

| Method & path | Auth | Notes |
|---|---|---|
| `GET /api/stages/:id/summary` | Depends on `PUBLIC_TRANSCRIPTS` (same rule as the talk being summarized — see [Transcripts & exports](#transcripts--exports)) | Summary of the talk in progress or a past talk. |
| `POST /api/stages/:id/ask` | Same | Answer one question, grounded in the transcript, with quotes. |

`GET /api/stages/:id/summary` query params:

| Param | Default | Notes |
|---|---|---|
| `lang` | the room's `source` language, or `en` | BCP-47-ish code; silently falls back to the default if malformed. |
| `scope` | `full` | `recent` (last ~5 minutes of speech — "what did I miss?") or `full` (the whole talk so far). |
| `talk` | current talk id | Which talk to summarize (a saved id, or omit for the current one). |

Response:

```json
{
  "scope": "recent", "lang": "es", "generatedAt": 1758724938000, "fromMs": 1520000, "toMs": 1820000,
  "segments": 42, "ai": true,
  "headline": "Cómo escalar el control plane de Kubernetes",
  "bullets": ["…", "…", "…"],
  "terms": ["etcd", "OpenTelemetry"]
}
```

- `ai: false` means the extractive fallback ran instead of the model (no `headline`/`terms`; `bullets` are
  picked straight from the transcript). A model failure additionally sets `"error": "ai-unavailable"`.
- Results are cached and shared by every viewer, so concurrent requests are cheap: ~45 s TTL for
  `scope=recent` on a live talk, ~120 s for `scope=full` on a live talk, 24 h once the talk is no longer the
  room's current one. The HTTP response still sets `Cache-Control: no-store` so a browser/proxy doesn't also
  cache a stale copy.
- `404 {"error":"unknown talk"}` for an unknown `talk`.

```bash
curl "http://localhost:8080/api/stages/main/summary?lang=es&scope=recent"
```

`POST /api/stages/:id/ask` body:

| Field | Type | Notes |
|---|---|---|
| `question` | string | Required, 3–300 chars (trimmed). Shorter → `400 {"error":"question too short"}`. |
| `lang` | string | BCP-47-ish code; defaults to `en` if omitted/invalid. |
| `talk` | string | Which talk to ask about; defaults to the current one. |

Response:

```json
{ "ai": true, "found": true, "answer": "etcd is the cluster's key-value store […]",
  "quotes": [{ "at": "12:34", "text": "…verbatim line from the transcript…" }] }
```

- `found: false` means the transcript doesn't contain an answer (the model is instructed not to guess, never
  to use outside knowledge). `ai: false` means the extractive fallback ran (same conditions as summaries,
  plus `error: "ai-unavailable"` on a model failure); `answer` may then be empty with only `quotes` filled in.
- **Rate limited**, both per client and server-wide: `429 {"error":"too many questions right now, try again in
  a minute"}` once either is hit — `ASK_PER_CLIENT_PER_MIN` (default 6/min per client IP) or `ASK_RPM`
  (default 30/min across the whole server).
- Uses the same `PUBLIC_TRANSCRIPTS` access check as the other talk endpoints
  (`401 {"error":"admin token required"}` if not allowed); `404 {"error":"unknown talk"}` for an unknown `talk`.

```bash
curl -X POST http://localhost:8080/api/stages/main/ask \
  -H "Content-Type: application/json" \
  -d '{"question":"What database did they mention for the control plane?","lang":"en"}'
```

### Schedule

The event agenda (`src/schedule.js`): names talks automatically as each slot starts, so operators don't have
to press "New talk" between sessions — see the `nextTalk`/`next` fields on the
[stage status object](#stage-status-object) and [`GET /api/event`](#event--rooms-public).

| Method & path | Auth | Notes |
|---|---|---|
| `GET /api/schedule` | Public | The full agenda, sorted by start time. |
| `PUT /api/schedule` | Admin | Replace the whole agenda (CSV, or a list of entries). |

`GET /api/schedule` response — one entry per slot:

```json
[
  { "stage": "main", "start": 1758715200000, "startIso": "2026-09-24T13:00:00.000Z",
    "title": "Observability in Kubernetes", "speaker": "Ana Pérez" }
]
```

`PUT /api/schedule` body — one of:

| Body shape | Notes |
|---|---|
| `{ "csv": "stage,start,title,speaker\nmain,10:00,…,…" }` | Same CSV organizers can paste into the dashboard. A bare `HH:MM` start is *today*, in the server's local time zone (`timezone` on `/api/event`); a full date (`YYYY-MM-DD HH:MM`, or ISO) also works. |
| `{ "entries": [{ "stage", "start", "title", "speaker?" }, …] }` | `start` as an ISO string or epoch ms. |
| a bare JSON array of the same entry shape | Accepted directly, no `entries` wrapper needed. |

At most 2000 entries; `stage` must look like a room id, `start` must parse, and `title` is required (`speaker`
is optional). Any single bad row rejects the **whole** update (`400`, nothing is changed). Response:

```json
{ "ok": true, "count": 48, "unknownRooms": ["sala-c"] }
```

`unknownRooms` lists room ids used in the agenda that don't exist as stages yet — not an error, just a
heads-up (rooms are often created from the dashboard after the agenda spreadsheet is uploaded).

```bash
curl -X PUT http://localhost:8080/api/schedule \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"csv":"stage,start,title,speaker\nmain,10:00,Observabilidad en Kubernetes,Ana Pérez"}'
```

### Glossary

Shared across every room (per-room `vocabulary` in the stage config is merged in for recognition).

| Method & path | Auth | Notes |
|---|---|---|
| `GET /api/glossary` | Public | `{ vocabulary: string[], replacements: {from,to,lang?}[] }`. |
| `PUT /api/glossary` | Admin | Replace the whole glossary. Hot-reloads instantly — replacements apply to the very next caption, no restart. |

Validation: `vocabulary` ≤ 500 entries of ≤ 100 chars; `replacements` ≤ 500 entries, each `from`/`to` ≤ 300
chars, optional `lang` ≤ 12 chars (restricts the replacement to one caption channel). `from` may contain
`|`-separated alternatives and matches whole words only (Unicode-aware).

```bash
curl -X PUT http://localhost:8080/api/glossary \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"vocabulary":["Kubernetes","OpenTelemetry"],"replacements":[{"from":"cubernetes","to":"Kubernetes"}]}'
```

### Utilities

| Method & path | Auth | Notes |
|---|---|---|
| `GET /api/qr.svg` | Public | `?text=` (≤ 500 chars, default = the server's public URL). Returns an SVG QR code, `Cache-Control: public, max-age=3600`. |
| `GET /s/:id` | Public | Short link → `302` redirect to `/watch.html?stage=:id` (what the printed/QR-coded audience link points to). |
| `GET /manifest.webmanifest` | Public | Web app manifest named after the event (install to home screen). Audience pages (`/`, `/watch.html`, `/talk.html`, `/talks.html`) are served with the event name and absolute `og:image` URLs filled in for link previews; the base is `PUBLIC_URL`, or the request's host when that looks like a plain hostname. |
| static files | Public | `public/` is served at `/` (extensionless, e.g. `/watch` ≡ `/watch.html`); `samples/` is served at `/samples/` (bundled demo WAV files). |
| `/api/*` (unmatched) | — | `404 {"error":"not found"}`. |

## WebSocket endpoints

All three sockets are on the same HTTP(S) server, distinguished by path (`server.on('upgrade', …)`). Before
any application logic runs, an upgrade is rejected outright (plain HTTP response, socket then closed — no
WebSocket handshake completes) when:

| HTTP status on upgrade | Reason |
|---|---|
| socket destroyed, no response | Path is not one of `/ws/ingest`, `/ws/view`, `/ws/admin` |
| `429 Too Many Requests` | `RATE_LIMIT_WS` connection-flood limit exceeded for this IP |
| `403 Forbidden` | `ws/ingest` or `ws/admin` only: `Origin` header present but not allowed |
| `503 Service Unavailable` | `ws/view` only: `MAX_VIEWERS` (default 5000) already connected |

If the upgrade is accepted but the presented token is wrong, the WebSocket connection **is** established and
then immediately closed with code `4001` (see below) — the client sees a brief connect/close rather than a
rejected handshake, because browsers cannot inspect handshake-time HTTP status for WebSockets.

**Keep-alive & reconnection**: none of the sockets require the client to send periodic pings. `/ws/view`
receives a server-initiated WebSocket ping every 25 s (answered automatically at the protocol level by any
compliant client); a client that doesn't answer two pings in a row — no pong within roughly 25–50 s (Wi-Fi
roam, sleep, a dead tab) — is dropped with `ws.terminate()` so it doesn't linger as a phantom viewer. The
bundled clients (`public/common.js` `Socket` class, `scripts/agent.js`) reconnect with exponential backoff
(500 ms → 8 s for viewers, 1 s → 15 s for the agent) after any close **except** `4004` (unknown stage —
treated as permanent) and `4001` (bad token — the person must fix the token first).

**Protocol errors**: every socket (all three endpoints) has an `error` handler so a malformed frame never
crashes the server — a message over `maxPayload` (256 KB per connection) or otherwise invalid framing closes
just that connection with code `1009` instead.

### `WS /ws/ingest` — send audio into a room

`wss://host/ws/ingest?stage=<id>&kind=<label>&label=<text>&token=<token>`

| Query param | Notes |
|---|---|
| `stage` | Required. Unknown stage → connection closes with `4004`. |
| `kind` | Free text, ≤ 20 chars, shown on the dashboard (`browser`, `agent`, `pull`, …). Default `browser`. |
| `label` | Free text, ≤ 120 chars, shown on the dashboard (e.g. mic device name). |
| `token` | Ingest or admin token, if not sending it as a header. |

**Auth**: ingest or admin token (`canIngest`). **Origin check**: yes. Connecting **replaces** any existing
ingest for that stage (the previous socket gets a `replaced` message then closes with `4000`), and stops any
configured server-side `pull` for that stage while attached.

Client → server:
- **Binary frames**: raw **PCM16LE, mono, 16 kHz**. The reference clients send 100 ms frames (3200 bytes).
  Frames over **64 KB** are silently dropped (not an error, not a close) — send small, regular chunks.
  Server `maxPayload` for the whole connection is 256 KB.
- Text/JSON frames are not read by this endpoint (ignored).

Server → client, every 500 ms while connected:

```json
{
  "type": "status",
  "level": 0.041,
  "gated": false,
  "engines": [{ "target": "es", "state": "live" }],
  "preview": { "orig": "…the last words heard…", "es": "…las últimas palabras…" },
  "alerts": [],
  "latency": { "asr": 812, "tr": { "es": 1140 } }
}
```

On replacement, just before closing:

```json
{ "type": "replaced", "why": "replaced by a new ingest" }
```

**Close codes**: `4004` unknown stage · `4001` bad token · `4000` replaced by a newer ingest connection ·
`1011` unexpected server error while attaching.

Minimal Node.js ingest client (`ws` package):

```js
import WebSocket from 'ws';

const ws = new WebSocket('wss://subs.example.com/ws/ingest?stage=main&kind=agent&label=my-source', {
  headers: { authorization: `Bearer ${process.env.INGEST_TOKEN}` }, // token in a header, never the URL
});

ws.on('open', () => {
  // Send 16 kHz mono PCM16LE, 100 ms (3200-byte) frames, in real time.
  setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) return;
    const frame = getNext3200BytesOfPcm(); // your audio source
    ws.send(frame, { binary: true });
  }, 100);
});
ws.on('message', (data) => console.log('status:', JSON.parse(data.toString())));
ws.on('close', (code, reason) => console.log('closed', code, reason.toString()));
```

(`scripts/agent.js` is a complete, production-ready version of this — an ffmpeg-based headless capture
agent with device listing, reconnect-with-backoff and buffering while offline.)

### `WS /ws/view` — receive captions (and optional translated audio)

`wss://host/ws/view?stage=<id>&langs=<code,code,…>&audio=<code|0>`

| Query param | Notes |
|---|---|
| `stage` | Required. Unknown stage → `4004`. |
| `langs` | Comma-separated caption channels to subscribe to (`orig` plus target codes). `lang` (singular) also accepted. Default `orig`. |
| `audio` | A language code to also receive translated **voice** audio for, or `0`/omit for none. Only honored if that language has a live "Live"-mode voice session (`stage.audioLangs`). |

**Auth**: none. **Origin check**: skipped for this endpoint (it's meant to be embeddable/public). Subject to
the `RATE_LIMIT_WS` connect-flood limit and the `MAX_VIEWERS` cap like any socket.

Server → client:

```json5
// once, right after connecting
{
  "type": "hello",
  "stage": { "id": "main", "name": "Auditorio", "title": "Observability in Kubernetes",
             "speaker": "Ana Pérez", "next": { "title": "Rust for Go developers", "speaker": "John Doe", "start": 1758728530441 },
             "languages": ["orig", "en", "es"], "source": "auto", "audioLangs": ["es"], "mode": "text" },
  "languages": { "en": "English", "es": "Español" },
  "map": { "orig": "orig", "es": "es" },       // requested lang → actual channel
  "talk": "2026-09-24T14-02-10-441Z",
  "history": { "orig": [ /* up to 40 recent segments */ ], "es": [ /* … */ ] },
  "partial": { "orig": null, "es": { "id": "es-…", "channel": "es", "text": "…", "final": false } }
}
```

```json
// one per caption update (interim or final)
{ "type": "caption", "id": "es-m1a2b3-7", "channel": "es", "lang": "es",
  "text": "Bienvenidos a la charla.", "start": 1204, "end": 3980, "final": true }
```

```json
// whenever the room's operator starts a NEW talk (a new talk.id — clients should clear their captions)
{ "type": "talk", "talk": "2026-09-24T15-10-02-009Z", "title": "Next talk", "speaker": "John Doe" }
```

```json
// the operator renamed the CURRENT talk (PATCH .../:id with a new title/speaker) — same talk.id, captions
// are kept, this is just a re-label
{ "type": "title", "talk": "2026-09-24T14-02-10-441Z", "title": "Observability in Kubernetes, revisited", "speaker": "Ana Pérez" }
```

- **Binary frames**: translated speech audio — raw PCM16LE mono **24 kHz** — sent only while `audio=<lang>`
  is subscribed and that language has a live voice session; server-side backpressure drops frames once
  `bufferedAmount` exceeds 512 KB rather than letting a slow client fall behind.
- **Backpressure on captions too**: if a client's `bufferedAmount` is already over 1 MB when a new `caption`
  message would be sent, that message is dropped and the connection is terminated outright
  (`ws.terminate()`) rather than queuing further — a client that can't keep up is disconnected and simply
  reconnects to get fresh `history`.

Client → server (optional, to change subscriptions without reconnecting): JSON text frames, ≤ 4096 bytes,
binary frames and oversized text frames are ignored.

```json
{ "type": "subscribe", "langs": ["es", "orig"], "audio": "es" }
```

**Close codes**: `4004` unknown stage · `4001` bad token (not normally reachable here since `/ws/view` has no
auth, but the client library still special-cases it) · `1012` the room was removed (`DELETE
/api/stages/:id`) — reconnecting gets `4004` unless the room is re-created with the same id (reason `room removed`). A *live*
reconfigure (`PATCH` changing `source`/`targets`/
`translation`) does **not** close the socket — it just re-sends a fresh `hello` on the same connection · `1009`
oversized/malformed frame · `1011` unexpected server error.

Minimal browser viewer:

```js
const ws = new WebSocket('wss://subs.example.com/ws/view?stage=main&langs=es,orig');
ws.binaryType = 'arraybuffer';
ws.onmessage = (e) => {
  if (typeof e.data !== 'string') return; // translated audio — feed to a PCM16 24 kHz player if you want it
  const msg = JSON.parse(e.data);
  if (msg.type === 'caption') console.log(`[${msg.channel}]`, msg.text, msg.final ? '' : '…');
};
```

### `WS /ws/admin` — production dashboard feed

`wss://host/ws/admin?token=<admin-token>`

**Auth**: admin token. **Origin check**: yes.

Server → client:

```json
// once, on connect: the last 150 log entries across all rooms, oldest first
{ "type": "logs", "logs": [{ "t": 1758724930441, "stage": "main", "level": "info", "msg": "ingest connected: browser" }] }
```

```json
// pushed as it happens
{ "type": "log", "t": 1758724931002, "stage": "main", "level": "warn", "msg": "es: no transcription for 20s of speech → restarting session" }
```

```json
// broadcast to every connected admin socket every 1000 ms
{ "type": "status", "engine": "gemini", "model": "gemini-3.5-live-translate-preview", "event": "Nerdearla 2026",
  "uptimeSec": 5412, "system": { "cpuPct": 6.1, "rssMB": 132, "loopLagMs": { "p50": 0.4, "p99": 1.9, "max": 4.2 } },
  "totals": { "stages": 3, "live": 2, "sessions": 4, "viewers": 128, "costUsd": 1.84,
              "assist": { "requests": 340, "cacheHits": 210, "errors": 2, "usd": 0.04 } },
  "stages": [ /* one status() object per stage — see below */ ]
}
```

`totals.costUsd` is engine spend plus the audience-AI assistant's spend combined; `totals.assist` breaks the
assistant usage down on its own (`src/assist.js`'s `assistStats`: request/cache-hit/error counts and its own
USD total — [Audience AI](#audience-ai-summaries--ask)).

Client → server: none read (any message sent by the client is ignored).

**Close codes**: `4001` bad token · `1011` unexpected server error.

#### Stage status object

Returned by `GET /api/status` (as `stages[]`), the `status` request bodies of stage-mutating endpoints, and
inside every `admin` `status` broadcast:

| Field | Type | Meaning |
|---|---|---|
| `id`, `name` | string | Room id and display name. |
| `source` | string | `"auto"` or a pinned language code. |
| `detectedLang` | string\|null | Auto-detected spoken language, once known. |
| `targets` | string[] | Configured target languages (from the room definition). |
| `languages` | string[] | Viewer-selectable caption channels (`"orig"` + targets). |
| `mode` | string | Effective translation mode: `text` \| `live` \| `hybrid`. |
| `translationDef` | string | The mode explicitly set on this room (empty = using the server default). |
| `audioLangs` | string[] | Languages with a live "Live" voice session (eligible for `?audio=` on `/ws/view`). |
| `mt` | object | Per-target text-translation stats (request counts, quota errors, throttled state). |
| `pull` | string | Configured audio pull URL, if any. |
| `loop` | boolean | Whether that `pull` (if it's a file) loops. |
| `talk` | object | `{ id, title, speaker, startedAt }` for the current talk. |
| `nextTalk` | object\|null | `{ title, speaker, start }` — the next agenda slot for this room (`src/schedule.js`), or `null` if there's no schedule or no upcoming slot. Also surfaced as `next` on [`GET /api/event`](#event--rooms-public) and in the `/ws/view` `hello.stage`. |
| `ingest` | object\|null | `{ kind, label, since }` for the currently attached audio source. |
| `level`, `peak` | number | Current/decaying-peak input RMS (0–1). |
| `gated` | boolean | `true` while paused for silence (no audio sent to the model, no cost). |
| `lastSpeechAt`, `lastCaptionAt` | number | Epoch ms. |
| `latency` | object | `{ asr: ms\|null, tr: { <lang>: ms } }` — smoothed speech→caption / speech→translation latency. |
| `engines` | object[] | One per running model session: `{ target, state, level, reconnects, resumes, errors, lastError, connectedAt, stateSince, audioMs, tokens, … }`. `state` ∈ `idle`\|`connecting`\|`live`\|`reconnecting`\|`resuming`; `stateSince` (epoch ms) is when it last changed `state` (the stage's `alerts` uses it to tell a slow `connecting`/`resuming` from a fresh one). The stage's `alerts` also treat a hypothetical `error` state as reconnecting-like, but no engine currently emits it — failures instead increment `errors`/`lastError` and trigger a reconnect. |
| `viewers` | number | Currently connected `/ws/view` sockets for this room. |
| `audioMinIn` | number | Minutes of audio received so far. |
| `costUsd`, `costLiveUsd` | number | Estimated Gemini spend (all-in / Live-session-only). |
| `alerts` | string[] | Any of `no-ingest`, `no-audio`, `muted?`, `reconnecting`, `high-latency`, `mt-throttled`. |
| `preview` | object | `{ <channel>: "last text seen" }` — quick glance without subscribing. |

## Prometheus metrics

`GET /metrics` — **admin token required**. Prometheus's `authorization` scrape config sends
`Authorization: Bearer <credentials>` by default, so point it straight at the admin token:

```yaml
scrape_configs:
  - job_name: opencaptions
    static_configs: [{ targets: ['subs.example.com:443'] }]
    scheme: https
    authorization:
      credentials: <ADMIN_TOKEN>
```

| Metric | Labels | Meaning |
|---|---|---|
| `opencaptions_viewers` | `stage` | Connected `/ws/view` sockets. |
| `opencaptions_audio_level` | `stage` | Current input RMS, 0–1. |
| `opencaptions_ingest_connected` | `stage` | `1` if an audio source is attached, else `0`. |
| `opencaptions_cost_usd_total` | `stage` | Estimated cumulative Gemini spend for the room. |
| `opencaptions_latency_ms` | `stage`, `lang` | Smoothed speech→caption latency; `lang="orig"` for transcription, or a target code for translation. Only emitted once a value exists. |
| `opencaptions_session_live` | `stage`, `lang` | `1` if that language's model session is `live`, else `0`. |
| `opencaptions_session_reconnects_total` | `stage`, `lang` | Reconnect count for that session. |
| `opencaptions_process_cpu_percent` | — | Process CPU, % of one core (can exceed 100). |
| `opencaptions_process_rss_bytes` | — | Process resident memory. |
| `opencaptions_event_loop_lag_p99_ms` | — | Node event-loop delay, p99. |
| `opencaptions_host_memory_used_percent` | — | Host RAM used, %. |
| `opencaptions_host_load1` | — | Host 1-minute load average. |

No `HELP`/`TYPE` metadata lines are emitted — just metric samples, one per line.

## Static pages

All served from `public/` at the root path (e.g. `public/watch.html` → `/watch` or `/watch.html`). Every
page also accepts a global `?ui=es|en|pt` to force the UI language (persisted in `localStorage`), and
`ingest.html`/`admin.html` accept a one-time `?token=` that is stored locally and then stripped from the URL.

| Page | Purpose | Query parameters |
|---|---|---|
| `/` (`index.html`) | Audience homepage — pick a room. | — |
| `/watch.html` | Audience caption view (phone-optimized), the `/s/:id` short-link target. A ✨ sheet answers "what did I miss?" and questions about the talk ([Audience AI](#audience-ai-summaries--ask)); an Aa sheet holds text size/font/line-spacing/theme; a 📄 link opens the full transcript on `/talk.html`; ⧉ floats the captions in an always-on-top window (desktop). No download control here — that lives on `/talk.html`. | `stage` (required), `lang` |
| `/talk.html` | Full transcript reader for one talk: search, per-paragraph timestamps (click to jump), a ⬇ download menu (TXT/SRT/VTT), live-follows the talk in progress, and the same ✨ summary/ask panel as `/watch.html`. | `stage` (required), `talk` (a saved talk id, or omit/`current` for the room's current talk), `lang` |
| `/talks.html` | Public library of talks across every room ([`GET /api/talks`](#transcripts--exports)), searchable/filterable by room, links into `/talk.html`. | — |
| `/ingest.html` | Browser-based audio ingest for a stage PC (mic / tab-share / file / bundled sample). | `stage`, `mode` (`mic`\|`tab`\|`file`\|`sample`), `autostart=1` |
| `/admin.html` | Production dashboard (rooms, live status, logs, glossary, links/QR, exports). | — (uses stored/prompted admin token) |
| `/demo.html` | Sound-check / YouTube play-along demo. | `mode` (`youtube`\|`mic`), `v` (YouTube URL), `t` (start seconds), `stage`, `lang` |
| `/screen.html` | Full-screen projector captions with follow-on-phone QR. | `stage` (default `main`), `langs` (default `es,orig`), `lines`, `size` (vh), `qr` (`0`), `clock` (`0`), `bg`, plus [caption style params](#caption-style-params) |
| `/overlay.html` | Transparent/chroma-key broadcast overlay for vMix/OBS. | `stage` (default `main`), `lang` (default `es`), `lines` (default `2`), `size` (px, default `46`), `pos` (`bottom`\|`top`\|`middle`), `width` (%, default `78`), `margin` (px), `hide` (idle-hide seconds), `chars`, `bg`, plus [caption style params](#caption-style-params) |
| `/kit.html` | Printable A4 QR poster per room (one page each, EN+ES bilingual text toggle) for the venue entrance / near the stage. | `stage` (preselects one room in the picker; default is every room) |
| `/style.html` | Visual editor that generates `/overlay.html` / `/screen.html` URLs (font, size, colors, box/outline/shadow, presets). Live-previews via `preview=1` on those pages. | — |

Both `/screen.html` and `/overlay.html` also take `preview=1` to render a fake, server-independent caption
stream for style previewing.

#### Caption style params

Shared by `/overlay.html` and `/screen.html` (`applyCaptionStyle()` in `common.js`):

`font` (`system`\|`inter`\|`atkinson`\|`lexend`\|`roboto`\|`opensans`\|`montserrat`\|`mono`) · `weight`
(400–800) · `color` (hex, text color) · `box` (hex, box/outline color) · `alpha` (0–100, box opacity) ·
`style` (`box`\|`outline`\|`shadow`\|`none`) · `edge` (hex, outline/shadow edge color) · `upper` (`1` for
uppercase) · `align` (`center`\|`left`) · `accent` (hex, label color).

Non-page static assets also served from `public/`: `common.js`, `i18n.js` (shared client helpers and UI
localization), `pcm-worklet.js` (AudioWorklet used by `ingest.html`/`demo.html` to capture and downsample
microphone/tab audio to 16 kHz PCM16), and `style.css`.
