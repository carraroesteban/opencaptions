# API reference

OpenCaptions exposes one HTTP + WebSocket server (`src/server.js`) for everything: the public JSON API, the
audience/production/stage web pages, and three WebSocket endpoints that carry audio in and captions out.

- **Base URL**: `http://localhost:8080` by default (`PORT`, `HOST`). Behind a tunnel or reverse proxy, use
  your `PUBLIC_URL`. Set `HTTPS_CERT`/`HTTPS_KEY` (or put TLS in front) for `https://` / `wss://`.
- **Format**: all request and response bodies are JSON (`Content-Type: application/json`), except file
  exports (`.srt`, `.vtt`, `.txt`) and the QR endpoint (SVG).
- **Versioning**: OpenCaptions is pre-1.0 software (0.x, see `package.json`). There is no
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

There are three passwords (`src/auth.js`), auto-generated and printed on first start if unset, then persisted in
`data/secrets.json`: `ADMIN_TOKEN` (everything), `CREW_TOKEN` (the live controls, see below) and `INGEST_TOKEN`
(sending audio). **The admin and crew passwords also work for ingest.** Requests are authenticated by, in order:

1. **A session cookie** (`oc_session`): what the dashboard uses. `POST /api/auth/login` (or [company sign-in](#sign-in))
   sets it; it's `HttpOnly`, `SameSite=Strict`, expires after `SESSION_HOURS`, and changes (`POST`/`PUT`/`PATCH`/`DELETE`)
   made with it must carry an allowed `Origin`. So must changes from a browser on the server computer itself (no
   password there) and with `AUTH=off`; clients that send no `Origin` (scripts, curl, the agent) are unaffected.
2. **A password**: `Authorization: Bearer <password>` (preferred), an `x-admin-token` / `x-ingest-token` header, or
   `?token=` — accepted on HTTP **GET** only, never on WebSocket upgrades (browsers use a ticket from
   `POST /api/ingest/ticket` for audio, and the session cookie for the dashboard). While
   [two-factor sign-in](#sign-in) is on, the admin password is **refused** this way; use a session, or the server
   computer itself.

Roles: **admin** can call everything below. **crew** can call `GET /api/status`, `GET /api/setup`, `GET /api/history`,
`GET /api/glossary`, `GET /metrics`, `POST /api/stages/:id/talk`, `PATCH /api/stages/:id` with only `title`, `POST /api/stages/:id/restart`,
`DELETE /api/stages/:id/pull` and `POST …/pull/stop`, `POST /api/engine`, the transcripts (one talk at a time, not `GET /api/transcripts.zip`), and `WS /ws/admin`; anything
else answers `403` with `{ "role": "crew" }`. Unauthenticated calls answer `401`.

| Endpoint group | Who can call it |
|---|---|
| `GET /healthz`, `GET /api/event`, `GET /api/schedule`, `GET /api/qr.svg`, `GET /s/:id`, `GET /manifest.webmanifest`, `GET /api/auth/config`, `GET /api/auth/me`, `POST /api/auth/login`, static pages | Public — no auth |
| `GET /api/talks`, `GET /api/stages/:id/talks`, `GET /api/stages/:id/talks/:talk`, `GET /api/stages/:id/export.:fmt` | Depends on `PUBLIC_TRANSCRIPTS` — see [Transcripts & exports](#transcripts--exports); crew or admin otherwise |
| `GET /api/stages/:id/summary`, `POST /api/stages/:id/ask` | Depends on `PUBLIC_TRANSCRIPTS` — see [Audience AI](#audience-ai-summaries--ask) |
| The live controls listed above, `GET /metrics`, `WS /ws/admin` | Crew or admin |
| Everything else: rooms, agenda, glossary, setup, Event mode, undo, AI key, public address, every transcript in one `.zip`, `/api/auth/sessions`, `/api/auth/passwords`, `/api/auth/2fa/*` | Admin |
| `POST /api/ingest/ticket` | Ingest, crew or admin password (in a header), or a session. Returns `{ ticket, expiresIn: 60 }`: a single-use ticket for `WS /ws/ingest?ticket=…`, so browsers on room computers never put the password in a URL. |
| `WS /ws/ingest` | A ticket (`?ticket=`), a password in the `Authorization` header (the agent), or a session. A password in the URL (`?token=`) is refused on sockets. |
| `WS /ws/view` | Public — no auth |

```bash
# Admin call from a remote machine (AUTH=auto trusts localhost only; use a password everywhere else)
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://subs.example.com/api/status

# The crew password is enough for reading the status and for /metrics
curl -H "Authorization: Bearer $CREW_TOKEN" https://subs.example.com/metrics
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
| `401` | Not signed in, or a wrong password (`{"error":"sign-in required"}`; `twoFactor: true` when the admin password also needs a code) |
| `403` | Signed in with a role that can't do this (`{"role":"crew"}`), or a change sent from another website |
| `423` | Event mode is on and this changes the setup (`{"locked":true}`) |
| `404` | Unknown route under `/api`, unknown stage id (`{"error":"unknown stage"}`), or an unknown talk id (`{"error":"unknown talk"}`) |
| `429` | Rate limited (`Retry-After` header set) |
| `500` | Internal error — message is always `"internal error"`; details are logged server-side only, never leaked |

**Rate limits** (`src/security.js`, per client IP; all configurable, `0`/unset disables the specific limit):

| Limit | Env var | Default | Applies to |
|---|---|---|---|
| API requests | `RATE_LIMIT_API` | 300 / 60 s | State-changing (non-`GET`/`HEAD`) requests under `/api`. Skipped for trusted localhost. Exceeding it returns `429 {"error":"too many requests"}` with `Retry-After: 60`. |
| Failed logins | `RATE_LIMIT_AUTH_FAIL`, `RATE_LIMIT_AUTH_FAIL_IP` | 20 / 10 min per IP and browser, 100 per IP | Failed admin/ingest token checks (HTTP and WebSocket). Exceeding it returns `429 {"error":"too many failed attempts"}` with `Retry-After: 600`, *before* the real 401/close is even evaluated. |
| WebSocket connects | `RATE_LIMIT_WS` | 6000 / 60 s | Every `/ws/*` upgrade attempt, any kind. Exceeding it rejects the upgrade with HTTP `429`. |

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
  "name": "Horizon Summit 2026",
  "accent": "#D4FF3A",
  "publicUrl": "https://subs.example.com",
  "languages": { "es": "Español", "en": "English", "pt": "Português" },
  "audienceAi": true,
  "publicTranscripts": "current",
  "timezone": "America/Argentina/Buenos_Aires",
  "stages": [
    {
      "id": "main", "name": "Auditorio", "title": "Designing cities for everyone",
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

All of these require sign-in as admin, except the live controls the crew may also use (see [Authentication](#authentication)). `:id` is a stage id (`[a-z0-9][a-z0-9_-]{0,39}`).

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
| `POST /api/stages/:id/speaker` | Who is speaking now. Body `{ "name": "Ana Pérez" }` (`""` clears it). New captions carry it as `spk`, so phones, transcripts and exports name the speaker. Crew or admin. When a talk starts, it's the agenda's first speaker. The room status has `speaker` and `speakers` (the agenda's names for this talk). |

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
| `roomSound` | boolean | `true`: phones can play the room's own sound (assistive listening, `/ws/view?audio=orig`). Default off. **Anyone with the room's address can then listen**, from anywhere. |
| `roomSoundMax` | integer | 1–5000. How many phones may play the room's sound at once. Default `ROOM_SOUND_MAX` (100). |
| `vocabulary` | string[] | ≤ 500 terms, biases speech recognition for this room (merged with the global glossary). |

Response (both endpoints): the room's [`status()`](#stage-status-object) object. Changing
`source`/`targets`/`translation` restarts any running model sessions. `PATCH` only acts on fields that
actually changed, so re-saving the same dialog is a no-op:

- A changed `title` **renames the current talk in place** — it emits a WebSocket `title` message and viewers
  keep their captions. It does not start a new talk (a new `talk.id`, a blank transcript) — use
  `POST /api/stages/:id/talk` for that.
- A changed `pull` or `loop` (re)starts or stops the audio pull; submitting the same `pull` URL/`loop` value
  that's already configured leaves an active pull running untouched.
- A changed `roomSound` sends every phone on the room a fresh `hello` (Listen shows or hides on Original). Turning it
  off stops every phone playing it at once. A lower `roomSoundMax` doesn't cut off phones already listening.

```bash
# Create a room
curl -X POST http://localhost:8080/api/stages \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"id":"room-b","name":"Room B","source":"auto","targets":["es","en"]}'

# Rename the current talk and add Portuguese
curl -X PATCH http://localhost:8080/api/stages/room-b \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Designing cities for everyone","targets":["es","en","pt"]}'
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

### Event report

| Method & path | Auth | Notes |
|---|---|---|
| `GET /api/report?day=YYYY-MM-DD` | Crew or admin | Every talk with captions, per room (the event's rooms; in Just for me, only the personal room): `{ event, generatedAt, day, days, languages, totals, rooms: [{ id, name, totals, talks: [{ id, title, speaker, speakers, startedAt, durationMs, words, languages, peakViewers, viewerMinutes, costUsd, current }] }] }`. `day` (optional) keeps one day; `days` lists the days with talks. `peakViewers` = most people with the captions open at once; `viewerMinutes` = all of them added up; `costUsd` = this talk's AI spend (estimate). Shown at `/report.html`. |
| `GET /api/report.csv?day=` | Crew or admin | The same as a spreadsheet (UTF-8 with BOM, so Excel shows accents): `room, talk, speaker, date, start, minutes, words, caption_languages, peak_viewers, viewer_minutes, cost_usd`. Cells that start with `=`, `+`, `-` or `@` are quoted so spreadsheets never run them as formulas. |

### Alerts

| Method & path | Auth | Notes |
|---|---|---|
| `GET /api/alerts` | Admin | `{ lang, snoozeUntil, channels: [{ type, topic?, server?, chat?, token?, url? }] }` with tokens and webhook paths shortened (`…abcd`), never in full. |
| `PUT /api/alerts` | Admin | Body `{ lang: "es" \| "en", channels: [...] }`, each `{ type: "ntfy", topic, server? }`, `{ type: "telegram", token, chat }`, or `{ type: "slack" \| "discord" \| "webhook", url }`. A hidden or empty secret keeps the saved one. Saved in `data/secrets.json`. `400` with the reason if one isn't valid. |
| `POST /api/alerts/test` | Admin | Sends a test message to every channel, or only to one with `{ "type": "ntfy" }` (the dashboard tests a destination right after it is set up): `{ results: [{ type, ok, error? }] }`. |
| `POST /api/alerts/snooze` | Crew or admin | Body `{ minutes }` (0 resumes, up to 1440). |

What's sent, and when (`src/alerts.js`): a room's audio source disconnected for 1 minute (only if it had one and the agenda says the room is on, or it has no agenda), connected but no sound for 1 minute, a very low level for 2 more minutes, the AI reconnecting for 1 minute, translations throttled for 2 minutes, captions over 6 s late for 3 minutes, a talk 5 minutes past the agenda, the offline backup switching, no internet and no backup for 30 s, the public address down for 30 s or a quick address changing. Each one once, plus once more when it's over. At most 20 messages per 10 minutes; the rest are summed up in one. The generic webhook gets `{ source: "opencaptions", event, room, severity, resolved, title, text, at }`.

### Integrations (connectors)

Send a room's final captions to Zoom, YouTube Live, Microsoft Teams or a webhook (`src/integrations.js`, how-to in [Integrations](../integrations.md)). Allowed in Event mode.

| Method & path | Auth | Notes |
|---|---|---|
| `GET /api/integrations` | Admin | `{ connectors: [{ id, type, stage, lang, events, link, status: { state: "idle" \| "ok" \| "error", sent, failed, lastError, lastAt } }] }`. `link` is only the host and path: the full link is a credential. |
| `POST /api/integrations` | Admin | Body `{ type: "zoom" \| "youtube" \| "teams" \| "webhook", stage, lang: "orig" \| <language>, url, events?: ["caption", "talk.ended"] }` (`events` for webhooks only). `400` with the reason if the link isn't that platform's (`*.zoom.us/closedcaption`, `upload.youtube.com/closedcaption?cid=…`, `api.captions.office.microsoft.com/cartcaption`) or the webhook isn't a public `https://` address. A webhook's answer includes its `secret`, once. Saved in `data/secrets.json`. |
| `DELETE /api/integrations/:id` | Admin | Disconnect. |
| `POST /api/integrations/:id/test` | Admin | Send one test line now. |

What each platform receives: Zoom, `POST <link>&seq=N&lang=<region>` with the caption as `text/plain; charset=utf-8`; YouTube, `POST <link>&seq=N` with `<UTC time, YYYY-MM-DDTHH:MM:SS.mmm>\n<caption>\n` as `text/plain`; Teams, `POST <link>` unchanged, with lines of up to 120 characters. `seq` (Zoom, YouTube) grows by one per caption, not per retry. Webhooks get JSON (`caption`, `talk.ended`, `test`), signed in `X-OpenCaptions-Signature: sha256=<HMAC-SHA256 of the body>`; the payloads are in [Integrations](../integrations.md#webhooks).

### Vision mixers (breaks from vMix or OBS)

`src/switcher.js`, how-to in [Integrations](../integrations.md#breaks-from-vmix-or-obs). Allowed in Event mode.

| Method & path | Auth | Notes |
|---|---|---|
| `GET /api/switchers` | Admin | `{ switchers: [{ id, type: "vmix" \| "obs", stage, scenes, address, hasPassword, status: { state: "connecting" \| "ok" \| "error", scene, lastError, since } }] }`. The OBS password is never returned. |
| `POST /api/switchers` | Admin | Body `{ type, stage, url, password?, scenes? }`. `url` may be just the computer's address (`192.168.1.20`): vMix becomes `http://…:8088/api`, OBS `ws://…:4455`. `scenes`: comma-separated break words. |
| `DELETE /api/switchers/:id` | Admin | Disconnect; ends a break it had started. |

### Breaks, music and corrections

| Method & path | Auth | Notes |
|---|---|---|
| `POST /api/stages/:id/break` | Crew | Body `{ on: true \| false, title? }`. Captions pause (no audio goes to the AI) and viewers get a `pause` message. Allowed in Event mode. Starting a new talk also ends a break. |
| `POST /api/stages/:id/music` | Crew | Body `{ caption: true }`: the room isn't playing music (a talk with a soundtrack): caption anyway until the next talk. |
| `GET /api/stages/:id/captions?channel=orig&n=10` | Crew | The latest final captions of the talk in progress (≤ 50): `{ channel, talk, captions: [seg] }`. |
| `PATCH /api/stages/:id/captions/:seg` | Crew | Body `{ channel, text }`. Corrects a caption of the talk in progress: viewers receive it again (same `id`, `final: true`, `edited: true`) and replace it; the transcript keeps the fix. `404` if it's no longer in the talk in progress. Not resent to Zoom, YouTube or Teams. |
| `PATCH /api/stages/:id/talks/:talk/captions/:seg` | Admin | Body `{ channel, text }`. Corrects any saved transcript (appended to `captions.jsonl`; the newest text of each caption wins when read, and exports use it). |
| `POST /api/glossary/replacements` | Admin | Body `{ from, to }`: one glossary correction ("always write it this way"); `to` is also added to the vocabulary. Allowed in Event mode (it only adds). Recorded in History, so it can be undone. |

### Transcripts & exports

| Method & path | Auth | Notes |
|---|---|---|
| `GET /api/talks` | Depends on `PUBLIC_TRANSCRIPTS` | Cross-room library of talks — powers `/talks.html`. |
| `GET /api/stages/:id/talks` | Admin (public if `PUBLIC_TRANSCRIPTS=all`) | List **saved** talks for one room. |
| `GET /api/stages/:id/talks/:talk` | Depends on `PUBLIC_TRANSCRIPTS` and which talk | One talk's metadata (`talkInfo`, below). `:talk` is a saved talk id, or the literal `current`. |
| `DELETE /api/stages/:id/talks/:talk` | Admin | Delete a saved transcript for good (captions and metadata); the talk in progress is closed first. Recorded in the history (not undoable). `404` if there's no such talk. |
| `GET /api/stages/:id/export.:fmt` | Public for the **talk in progress**; admin for past talks | Download/stream a talk's captions. |
| `GET /api/transcripts.zip?day=YYYY-MM-DD&room=:id` | Admin | Every talk with captions in one `.zip`: a folder per room (its name), one per talk (`2026-10-08 10.30 Opening keynote`: date, time and title, made safe for Windows, macOS and Linux), and `original.srt`, `original.vtt`, `original.txt` (what was spoken) plus `<lang>.srt`, `.vtt` and `.txt` for each language the talk was translated into. Each file is what `export.:fmt` gives for that talk and language. The same talks as the [event report](#event-report), the talk in progress included. `day` and `room` (both optional) keep one day or one room. In Just for me, only the personal room. `404` for an unknown room or when there's nothing to download; `413` past 100 MB (built in memory): ask for one day or one room at a time. The dashboard's **Transcripts** view downloads the room it shows. |

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
`all`, or under `current` when `talkId` is the room's current talk (or omitted), or when signed in (crew or
admin) — and falls back to requiring sign-in otherwise; `POST /api/stages/:id/ask` applies the identical
`canReadTalk` check inline (see [Audience AI](#audience-ai-summaries--ask)). `GET /api/talks` applies the rule
per room: `PUBLIC_TRANSCRIPTS=none` without sign-in is `401`; otherwise every room's *current* talk is
always included, and every room's *saved* talks are added too once the requester can see them (`all`, or
signed in).

`GET /api/talks` response — every visible talk across every room, most recent first, each with at least one
caption:

```json
{
  "publicTranscripts": "current",
  "talks": [
    { "stage": "main", "stageName": "Auditorio", "id": "2026-09-24T14-02-10-441Z",
      "title": "Designing cities for everyone", "speaker": "Ana Pérez", "startedAt": 1758724930441,
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
  { "stage": "main", "id": "2026-09-24T14-02-10-441Z", "title": "Designing cities for everyone",
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
# Every talk of one day, every room and language (admin)
curl -H "Authorization: Bearer $ADMIN_TOKEN" "https://subs.example.com/api/transcripts.zip?day=2026-09-24" -o transcripts.zip
```

`/talk.html` (linked from `/watch.html`'s transcript button, and from `/talks.html`) is where captions actually get
downloaded — its download menu exports whichever talk it's showing. The dashboard's transcript links ride on its
session, so past talks can be exported too.

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
  "headline": "Cómo diseñar ciudades para todas las personas",
  "bullets": ["…", "…", "…"],
  "terms": ["accesibilidad", "transporte público"]
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

### Sign-in

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/auth/config` | public | What the sign-in screen offers: `{ "password": bool, "sso": "Google" \| null }` (`password: false` with `OIDC_ONLY=1`). |
| `GET` | `/api/auth/me` | public | Who this browser is: `{ role: "admin" \| "crew" \| null, via: "local" \| "session" \| "token" \| "off", label, session, expiresAt, twoFactor, sso }`. |
| `POST` | `/api/auth/login` | public | Body `{ "password", "device"?: "Stage left tablet", "code"?: "123456" }`. Sets the session cookie and returns `{ ok, role, device }`. `401 { "error": "wrong password" }`; with two-factor on and no code, `401 { "need": "code" }`; wrong code, `401 { "need": "code", "error": "wrong code" }`. Failures count towards the lockout (`429`). `403` from another website's `Origin`. |
| `POST` | `/api/auth/logout` | public | Ends this browser's session and clears the cookie. |
| `GET` | `/api/auth/sessions` | admin | Signed-in devices, most recently active first: `{ id, role, device, via: "password" \| "sso", createdAt, lastSeen, expiresAt, current }`. Never the cookie. |
| `DELETE` | `/api/auth/sessions/:id` | admin | Sign that device out. Recorded in the history (`auth.signout`). |
| `POST` | `/api/auth/sessions/sign-out-others` | admin | Sign out every device but this one: `{ ok, signedOut }`. |
| `GET` | `/api/auth/passwords` | admin | `[{ which: "admin" \| "crew" \| "ingest", fromEnv }]` (never the values). |
| `POST` | `/api/auth/passwords/:which` | admin | Replace a generated password with a new random one: `{ ok, password, signedOut }`. The value is returned only here; sessions signed in with the old one are ended (not this one). `409` if it's set in `.env`. Recorded (`auth.password`, without the value). |
| `POST` | `/api/auth/2fa/start` | admin | Start turning on two-factor sign-in: `{ secret, uri, qr }` (`uri` is an `otpauth://` link, `qr` an SVG of it). Valid for 10 minutes. |
| `POST` | `/api/auth/2fa/confirm` | admin | Body `{ "code" }` from the app: from now on the admin password needs a code. `400` if the code is wrong. |
| `POST` | `/api/auth/2fa/disable` | admin | Body `{ "code" }`: turn it off. |
| `GET` | `/auth/oidc/start?device=` | public | Company sign-in: redirects to the provider (PKCE, `state`, `nonce`, and a short-lived `oc_oidc` cookie binding the flow to this browser). `404` if `OIDC_ISSUER` isn't set. |
| `GET` | `/auth/oidc/callback` | public | The provider's redirect target. On success sets the session cookie and redirects to `/admin.html`; otherwise to `/admin.html?signin=<reason>` (expired, other browser, not allowed, bad token…). |

### Setup and engine

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/instance` | none | `{ "id" }`: names this server's data folder (`data/instance.json`). Pages compare it with the one the browser remembered its choices for, and forget them when it changed (a fresh start, or a deleted `data/`). |
| `GET` | `/api/setup` | crew | First-run state for the welcome wizard: `done`, `locked`, event `name` and `named` (`false` until someone names the event), `languages` (event.json's, minus the ones removed and plus the ones added from the dashboard), `addedLanguages`, `builtInLanguages` (event.json's codes), `removedLanguages`, `mode` (`event` or `personal`: Just for me), `eventDone` (`true` once the wizard was finished for an event), `publicTranscripts` and `publicTranscriptsFixed` (`true` when `PUBLIC_TRANSCRIPTS` is set in the environment), `defaultTargets`, `stages` (`id`, `name`, `source`, `targets`), `engine`, `primaryEngine`, `failover`, `ai` (see below), `tunnel` (see below), `tunnelTokenSaved`, `tunnelMoved` (`true` when the free address differs from the one used before the last restart, so printed QR codes are out of date), `publicUrl` (the address QR codes use for this request), `publicUrlSource` (`config` = `PUBLIC_URL` / `publicUrl`, `tunnel`, or `auto` = the address the page was opened with, or this computer's Wi-Fi address instead of `localhost`), `lanUrl` and `port`. |
| `PUT` | `/api/setup` | admin | Body `{ "name"?: string, "done"?: boolean, "mode"?: "event" \| "personal", "timezone"?: string, "languages"?: { code: name }, "removedLanguages"?: [code], "publicTranscripts"?: "current" \| "all" \| "none" }`. Renames the event (1–80 characters), marks the wizard as finished, switches between an event and Just for me, sets the agenda's time zone, replaces the languages added from the dashboard (up to 40) and the ones of `config/event.json` that aren't offered (`400` for other codes, or when no language would be left), and sets who can read transcripts (`409` when `PUBLIC_TRANSCRIPTS` fixes it). A language a room still uses can't go: `409` with `{ "code": "language-in-use", "rooms": [names], "languages": [names] }`. Everything is validated before anything changes. Saved in `data/setup.json`; the name overrides `eventName` from `config/event.json`. All but `done` and `mode: "event"` answer `423` in Event mode (switching to Just for me would take the event offline). |
| `POST` | `/api/lock` | admin | Event mode. Body `{ "locked": true \| false }`. While locked, the setup endpoints below answer `423 Locked` with `{ "locked": true }`: creating, changing (except the current talk's `title`) and deleting rooms, `PUT /api/schedule`, `PUT /api/glossary`, renaming the event and undoing changes. Live operations keep working: `POST /api/stages/:id/talk`, `/restart`, `/youtube`, the pull controls and `POST /api/engine`. Recorded in the history. |
| `GET` | `/api/history` | crew | `{ "locked", "changes": [...], "trash": [...] }`. `changes` are the latest setup changes, newest first: `{ id, at, kind, target, summary, before, after, undoes?, undone }` (`kind`: `room.create`, `room.update`, `room.delete`, `agenda.set`, `glossary.set`, `event.rename`, `engine.mode`, `event.lock`, `ai.key`, `tunnel`, `auth.signin`, `auth.signout`, `auth.password`, `auth.2fa`; `by` is who made it: the signed-in device's name, the work account, `this computer` or `admin password (script)`; agenda and glossary snapshots are summarized as counts). `trash` lists deleted rooms that haven't been restored: `{ id, at, room }`. |
| `POST` | `/api/history/:id/undo` | admin | Put back what that change replaced: a deleted room comes back exactly as it was, a changed room returns to its old settings, the agenda or glossary to the previous version, and so on. The undo is recorded as a new change. `409` if already undone; `423` in Event mode. |
| `POST` | `/api/ai/key/check` | admin | Body `{ "key": "AQ.…" }`. Refuses only copy-paste slips (`code: "format"`: spaces, under 30 or over 300 characters; keys start with `AQ.` since May 2026, `AIza` before). Asks Google whether the key works, without saving it: `{ ok, code }` with `code` `ok`, `quota` (a real key with no free quota left right now, `ok: true`), `invalid`, `forbidden` (the key can't use Gemini), `offline` (Google unreachable) or `error`, plus Google's `detail`. `400 { code: "format" }` if it doesn't look like a Gemini key. |
| `PUT` | `/api/ai/key` | admin | Body `{ "key": "AQ.…", "force"?: true }`. Checks the key (skipped with `force`, for when Google can't be reached), saves it in `data/secrets.json` and uses it right away: rooms on simulated captions switch to Gemini. Wins over `GEMINI_API_KEY`. Returns `{ ok, check, engine, key }`; `400` with the check's `code` if Google rejects it. Allowed in Event mode (a key that runs out of quota mid-event must be replaceable). Recorded in the history (`ai.key`, not undoable, without the key). |
| `DELETE` | `/api/ai/key` | admin | Removes the saved key: back to `GEMINI_API_KEY` from `.env`, or to simulated captions without one. `423` in Event mode. |
| `POST` | `/api/tunnel` | admin | Public HTTPS address through Cloudflare Tunnel. Body `{ "mode": "quick" }` (a random `https://….trycloudflare.com` address, no account), `{ "mode": "token", "token"?: string, "host": "captions.example.com" }` (a tunnel on your own domain; the token is saved in `data/secrets.json`, leave it out to reuse the saved one) or `{ "mode": "off" }`. Answers right away with the `tunnel` status; the address follows over the admin feed. While it's on, its address is the public URL (QR codes, links, allowed origins). Comes back on by itself after a restart. `423` in Event mode. Recorded in the history (`tunnel`). |
| `POST` | `/api/engine` | crew | Offline backup. Body `{ "mode": "auto" \| "cloud" \| "local" }`. `auto` switches by itself, `cloud` always uses Gemini, `local` always uses this computer (refused with `400` while the local engine isn't reachable). Only when Gemini is the main engine. Returns the `failover` status. |

The dashboard feed (`/api/status` and `WS /ws/admin`) includes `failover`: `{ mode, active, online, localReady, since, reason }`, or `null` when Gemini isn't the main engine. A `failover` message is also pushed when it changes.

`ai` (in `/api/setup` and the dashboard feed) never contains the key: `{ set, last4, source: "dashboard" | "env" | "", vertex, envKey }`.

`tunnel` (in `/api/setup` and the dashboard feed, and pushed as a `tunnel` message when it changes): `{ mode: "off" | "quick" | "token", state: "off" | "installing" | "starting" | "on" | "error", url, reachable, error, host, installed }`. `installing` = downloading `cloudflared` (once); `reachable` turns `true` when the address answers from the internet (a new quick address takes a minute or two), `false` if it didn't within about two minutes. If `cloudflared` stops, it's restarted; a quick tunnel then comes back with a **new** address. The feed also carries `publicUrl` (`''` when none is set).

### Schedule

The event agenda (`src/schedule.js`): names talks automatically as each slot starts, so operators don't have
to press "New talk" between sessions — see the `nextTalk`/`next` fields on the
[stage status object](#stage-status-object) and [`GET /api/event`](#event--rooms-public).

| Method & path | Auth | Notes |
|---|---|---|
| `GET /api/schedule` | Public | The full agenda, sorted by start time. |
| `PUT /api/schedule` | Admin | Replace the whole agenda (CSV, or a list of entries). `?dryRun=1` previews: `{ count, entries, unknownRooms, skipped }` without saving. |
| `POST /api/schedule/import` | Admin | Body `{ source: "sessionize" \| "ics", ref }` (the Sessionize API link or id, or a calendar link; `webcal://` works), or `{ again: true }` for the last source. Same answer as `PUT`, `?dryRun=1` too. Rooms are matched by name or id. The source is remembered in `data/secrets.json` (a calendar's private address is a secret). |
| `GET /api/schedule/source` | Admin | The last import source, `{ source, label }` (Sessionize id, or the calendar's host), or `null`. |

`GET /api/schedule` response — one entry per slot:

```json
[
  { "stage": "main", "start": 1758715200000, "startIso": "2026-09-24T13:00:00.000Z",
    "title": "Designing cities for everyone", "speaker": "Ana Pérez" }
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
{ "ok": true, "count": 48, "unknownRooms": ["room-c"] }
```

`unknownRooms` lists room ids used in the agenda that don't exist as stages yet — not an error, just a
heads-up (rooms are often created from the dashboard after the agenda spreadsheet is uploaded).

```bash
curl -X PUT http://localhost:8080/api/schedule \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"csv":"stage,start,title,speaker\nmain,10:00,Diseñar ciudades para todos,Ana Pérez"}'
```

### Glossary

Shared across every room (per-room `vocabulary` in the stage config is merged in for recognition).

| Method & path | Auth | Notes |
|---|---|---|
| `GET /api/glossary` | Crew or admin | `{ vocabulary: string[], replacements: {from,to,lang?}[] }`. |
| `PUT /api/glossary` | Admin | Replace the whole glossary. Hot-reloads instantly — replacements apply to the very next caption, no restart. |

Validation: `vocabulary` ≤ 500 entries of ≤ 100 chars; `replacements` ≤ 500 entries, each `from`/`to` ≤ 300
chars, optional `lang` ≤ 12 chars (restricts the replacement to one caption channel). `from` may contain
`|`-separated alternatives and matches whole words only (Unicode-aware).

```bash
curl -X PUT http://localhost:8080/api/glossary \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"vocabulary":["Horizon Summit","Ngozi Okafor"],"replacements":[{"from":"horizons summit","to":"Horizon Summit"}]}'
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

`wss://host/ws/ingest?stage=<id>&kind=<label>&label=<text>&role=<backup>&ticket=<ticket>` (browsers), or with an `Authorization: Bearer <ingest password>` header (the agent and scripts)

| Query param | Notes |
|---|---|
| `stage` | Required. Unknown stage → connection closes with `4004`. |
| `kind` | Free text, ≤ 20 chars, shown on the dashboard (`browser`, `agent`, `pull`, …). Default `browser`. |
| `label` | Free text, ≤ 120 chars, shown on the dashboard (e.g. mic device name). |
| `role` | `backup`: a standby source for the room. Only the main source is captioned; the backup takes over when the main one stops sending (3 s) or goes silent while the backup hears sound (20 s), and hands back after the main one has sent sound for 10 s. A new backup replaces the previous backup, not the main source. |
| `ticket` | A single-use ticket from `POST /api/ingest/ticket` (valid 60 s), if not sending a password header. A `token` parameter is refused. |

**Auth**: a ticket, an ingest/crew/admin password in the `Authorization` header, or a session. **Origin check**: yes. Connecting **replaces** any existing
ingest for that stage (the previous socket gets a `replaced` message then closes with `4000`), and stops any
configured server-side `pull` for that stage while attached.

Client → server:
- **Binary frames**: raw **PCM16LE, mono, 16 kHz**. The reference clients send 100 ms frames (3200 bytes).
  Frames over **64 KB** are silently dropped (not an error, not a close) — send small, regular chunks.
  Server `maxPayload` for the whole connection is 256 KB.
- Text frames: `{"type":"break","on":true|false}` starts or ends a break for this room (the B key on the audio page). Anything else is ignored.

Server → client, every 500 ms while connected:

```json
{
  "type": "status",
  "role": "primary",
  "active": true,
  "level": 0.041,
  "gated": false,
  "brk": null,
  "music": false,
  "sound": "voice",
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

`wss://host/ws/view?stage=<id>&langs=<code,code,…>&audio=<code|orig|0>`

| Query param | Notes |
|---|---|
| `stage` | Required. Unknown stage → `4004`. |
| `langs` | Comma-separated caption channels to subscribe to (`orig` plus target codes). `lang` (singular) also accepted. Default `orig`. |
| `audio` | A language code to also receive translated **voice** audio for, `orig` for **the room's own sound** (assistive listening), or `0`/omit for none. A language is only honored if it has a live "Live"-mode voice session (`stage.audioLangs`); `orig` only if the room has `roomSound` on (`stage.roomSound`), the server isn't in Just for me, and fewer than `roomSoundMax` phones are already listening. The answer is `listen` in `hello`. |

**Auth**: none. **Origin check**: skipped for this endpoint (it's meant to be embeddable/public). Subject to
the `RATE_LIMIT_WS` connect-flood limit and the `MAX_VIEWERS` cap like any socket.

Server → client:

```json5
// once, right after connecting
{
  "type": "hello",
  "stage": { "id": "main", "name": "Auditorio", "title": "Designing cities for everyone",
             "speaker": "Ana Pérez", "next": { "title": "Rust for Go developers", "speaker": "John Doe", "start": 1758728530441 },
             "languages": ["orig", "en", "es"], "source": "auto", "audioLangs": ["es"], "roomSound": true, "mode": "text" },
  "languages": { "en": "English", "es": "Español" },
  "map": { "orig": "orig", "es": "es" },       // requested lang → actual channel
  "talk": "2026-09-24T14-02-10-441Z",
  "history": { "orig": [ /* up to 40 recent segments */ ], "es": [ /* … */ ] },
  "partial": { "orig": null, "es": { "id": "es-…", "channel": "es", "text": "…", "final": false } },
  "listen": { "channel": "orig", "ok": true, "format": "mulaw", "rate": 16000 } // only when audio= asked for sound
}
```

`stage.roomSound` says whether this room plays its own sound to phones (the room's setting, and never in Just for me).
`listen` answers `audio=`: `{ channel, ok: true, format, rate }` when the sound comes (`mulaw` at 16000 Hz for
`orig`, `pcm16` at 24000 Hz for a translated voice), or `{ channel, ok: false, why }`: `why` is `off` (the room
doesn't play its sound), `full` (`roomSoundMax` phones are already listening) or `none` (that language has no voice).
A refused or stopped phone isn't put back by itself when a place frees up: it asks again (`subscribe`, or reconnect).

```json
// one per caption update (interim or final)
{ "type": "caption", "id": "es-m1a2b3-7", "channel": "es", "lang": "es",
  "text": "Bienvenidos a la charla.", "start": 1204, "end": 3980, "final": true, "spk": "Ana Pérez" }
```

`spk` is present when the crew has said who is speaking (`POST /api/stages/:id/speaker`). Exports use it: WebVTT
voice tags (`<v Ana Pérez>`) on every cue, and the name before the text in SRT and TXT when the speaker changes.
A final caption that arrives again with the same `id` and `"edited": true` is a correction from the crew: replace it.

```json
// captions paused on purpose: a break (by "crew", "room", "agenda" or "switcher"), or music in the room.
// Also in hello as "pause". { brk: null, music: false } = captions running again.
{ "type": "pause", "brk": { "by": "agenda", "since": 1791375874168, "title": "Coffee break", "until": 1791377674168,
  "next": { "title": "After the coffee", "speaker": "Bo", "start": 1791377674168 } }, "music": false }
```

```json
// whenever the room's operator starts a NEW talk (a new talk.id — clients should clear their captions)
{ "type": "talk", "talk": "2026-09-24T15-10-02-009Z", "title": "Next talk", "speaker": "John Doe" }
```

```json
// the operator renamed the CURRENT talk (PATCH .../:id with a new title/speaker) — same talk.id, captions
// are kept, this is just a re-label
{ "type": "title", "talk": "2026-09-24T14-02-10-441Z", "title": "Designing cities for everyone, revisited", "speaker": "Ana Pérez" }
```

```json
// the room's sound stopped for this phone: the room's setting was turned off, or the server went to Just for me
{ "type": "listen", "channel": "orig", "ok": false, "why": "off" }
```

- **Binary frames**: translated speech audio — raw PCM16LE mono **24 kHz** — sent only while `audio=<lang>`
  is subscribed and that language has a live voice session; server-side backpressure drops frames once
  `bufferedAmount` exceeds 512 KB rather than letting a slow client fall behind.
- **Binary frames with `audio=orig`**: the room's own sound as it reaches the server, **G.711 μ-law, mono, 16 kHz**,
  one frame per 100 ms (1600 bytes, 128 kbit/s), through breaks and music too. Decode each byte with the standard
  μ-law table (`public/common.js` `PcmPlayer`, `src/audio.js` `muLawDecode`). Frames are dropped while the
  phone has over 32 KB (~2 s) unsent: a phone that can't keep up skips audio rather than falling behind the room.
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
  if (typeof e.data !== 'string') return; // audio: PCM16 24 kHz (a translated voice) or μ-law 16 kHz (audio=orig)
  const msg = JSON.parse(e.data);
  if (msg.type === 'caption') console.log(`[${msg.channel}]`, msg.text, msg.final ? '' : '…');
};
```

### `WS /ws/admin` — production dashboard feed

`wss://host/ws/admin`

**Auth**: the dashboard's session cookie (crew or admin), or a password in the `Authorization` header. **Origin check**: yes.
A connection opened with a session cookie is closed with code `4001` (`signed out`) within a second of that session being
signed out or expiring.

Server → client:

```json
// once, on connect: the last 150 log entries across the event's rooms (in Just for me, the personal room's), oldest first
{ "type": "logs", "logs": [{ "t": 1758724930441, "stage": "main", "level": "info", "msg": "ingest connected: browser" }] }
```

```json
// pushed as it happens, for the same rooms
{ "type": "log", "t": 1758724931002, "stage": "main", "level": "warn", "msg": "es: no transcription for 20s of speech → restarting session" }
```

```json
// broadcast to every connected admin socket every 1000 ms
{ "type": "status", "engine": "gemini", "model": "gemini-3.5-live-translate-preview", "event": "Horizon Summit 2026",
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
| `roomSound`, `roomSoundMax`, `roomSoundListeners` | boolean, number, number | Whether phones can play the room's sound, how many may at once, and how many are now. |
| `audioMinIn` | number | Minutes of audio received so far. |
| `costUsd`, `costLiveUsd` | number | Estimated Gemini spend (all-in / Live-session-only). |
| `alerts` | string[] | Any of `no-ingest`, `no-audio`, `muted?`, `reconnecting`, `high-latency`, `mt-throttled`. |
| `preview` | object | `{ <channel>: "last text seen" }` — quick glance without subscribing. |

## Prometheus metrics

`GET /metrics` — **the crew or admin password**. Prometheus's `authorization` scrape config sends
`Authorization: Bearer <credentials>` by default, so point it at the crew password (it keeps working when
two-factor sign-in is on, unlike the admin password):

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
| `opencaptions_room_sound_listeners` | `stage` | Phones playing the room's sound (`audio=orig`). |
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
`admin.html`/`welcome.html` accept a one-time `?token=`, exchanged for a session and stripped from the URL; `ingest.html` accepts one that is kept on that room computer (and sent in a header for a ticket, never in the socket URL).

| Page | Purpose | Query parameters |
|---|---|---|
| `/` (`index.html`) | Audience homepage — pick a room. | — |
| `/watch.html` | Audience caption view (phone-optimized), the `/s/:id` short-link target. A *What did I miss?* sheet answers that and questions about the talk ([Audience AI](#audience-ai-summaries--ask)); an Aa sheet holds text size/font/line-spacing/theme; the transcript button opens the full transcript on `/talk.html`; the floating-captions button keeps them in an always-on-top window (desktop). Lines show the speaker's name when it changes. No download control here — that lives on `/talk.html`. | `stage` (required), `lang` |
| `/talk.html` | Full transcript reader for one talk: search, per-paragraph timestamps (click to jump), a download menu (TXT/SRT/VTT), live-follows the talk in progress, names speakers, and the same summary/ask panel as `/watch.html`. | `stage` (required), `talk` (a saved talk id, or omit/`current` for the room's current talk), `lang` |
| `/talks.html` | Public library of talks across every room ([`GET /api/talks`](#transcripts--exports)), searchable/filterable by room, links into `/talk.html`. | — |
| `/ingest.html` | Browser-based audio ingest for a stage PC (mic / tab-share / file / bundled sample). | `stage`, `mode` (`mic`\|`tab`\|`file`\|`sample`), `autostart=1` |
| `/admin.html` | Production dashboard: live rooms, rooms, agenda, glossary, screens and QR, transcripts, History, Settings (Event mode, access, alerts, Gemini, public address). The crew sees the live controls only. | `dashboard` (skip the first-run redirect to the wizard). Other devices sign in. |
| `/welcome.html` | The welcome wizard: event name, rooms, languages, the API key, the public address; a review lists every change before applying it. Admins only. | — |
| `/report.html` | The event report ([`GET /api/report`](#event-report)), printable, with a CSV download. Crew or admin. | `day` (`YYYY-MM-DD`) |
| `/demo.html` | Sound-check / YouTube play-along demo. | `mode` (`youtube`\|`mic`), `v` (YouTube URL), `t` (start seconds), `stage`, `lang` |
| `/screen.html` | Full-screen projector captions with follow-on-phone QR. | `stage` (default `main`), `langs` (default `es,orig`), `lines`, `size` (vh), `qr` (`0`), `clock` (`0`), `bg`, plus [caption style params](#caption-style-params) |
| `/overlay.html` | Transparent/chroma-key broadcast overlay for vMix/OBS. | `stage` (default `main`), `lang` (default `es`), `also` (optional second, smaller line in another language or `orig`; hidden while it would repeat the main line), `lines` (default `2`), `size` (px, default `46`), `pos` (`bottom`\|`top`\|`middle`), `width` (%, default `78`), `margin` (px), `hide` (idle-hide seconds), `chars`, `bg`, plus [caption style params](#caption-style-params) |
| `/kit.html` | Printable A4 QR poster per room (one page each, EN+ES bilingual text toggle) for the venue entrance / near the stage. | `stage` (preselects one room in the picker; default is every room) |
| `/style.html` | Visual editor that generates `/overlay.html` / `/screen.html` URLs (font, size, colors, box/outline/shadow, presets). Live-previews via `preview=1` on those pages. | — |

Both `/screen.html` and `/overlay.html` also take `preview=1` to render a fake, server-independent caption
stream for style previewing.

#### Caption style params

Shared by `/overlay.html` and `/screen.html` (`applyCaptionStyle()` in `common.js`):

`font` (`atkinsonnext` (default)\|`system`\|`inter`\|`atkinson`\|`lexend`\|`roboto`\|`opensans`\|`montserrat`\|`mono`) · `weight`
(400–800, default 700) · `color` (hex, text color) · `box` (hex, box/outline color) · `alpha` (0–100, box opacity) ·
`style` (`box`\|`outline`\|`shadow`\|`none`) · `edge` (hex, outline/shadow edge color) · `upper` (`1` for
uppercase) · `align` (`center`\|`left`) · `accent` (hex, label color).

Non-page static assets also served from `public/`: `common.js`, `i18n.js` (shared client helpers and UI
localization), `pcm-worklet.js` (AudioWorklet used by `ingest.html`/`demo.html` to capture and downsample
microphone/tab audio to 16 kHz PCM16), `illustrations.js` (line illustrations), `tokens.css` (design tokens, light +
dark) and `style.css` (shared components). Brand assets live in `brand/` (see [docs/brand.md](../brand.md)).
