# Architecture

This page describes how OpenCaptions is built, how data moves through it, how it handles failures and how it scales. The reasons behind the main choices are recorded as [architecture decision records](adr/README.md).

## Goals and constraints

| Goal | Consequence for the design |
|---|---|
| Run a whole multi-room conference with no operator per room | Automatic silence gating, session renewal, reconnection, watchdogs and talk splitting |
| Keep latency close to the model's own delay | The server only relays audio. No transcoding, no queues and no database on the hot path. |
| Predictable, low cost | One model session per room. Text translation per sentence instead of one speech session per language. Nothing is billed during silence. |
| Easy to deploy and fork | A single Node.js process, five runtime dependencies, no build step, plain files instead of a database |
| Fit the existing venue setup | Audio from a sound-desk cable into a PC, or from the vMix/OBS stream. Output to projectors, phones and vMix/OBS. |

## System context

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="images/diagrams/architecture-dark.png" />
  <img src="images/diagrams/architecture-light.png" alt="Components: room agents and streams send audio to one OpenCaptions process (HTTP API, WebSocket hub, one Stage per room, data folder); each Stage talks to Gemini Live Translate and Flash-Lite (or local models) and sends captions to viewers and status to the dashboard." />
</picture>

<details><summary>Text version of this diagram</summary>

```mermaid
flowchart LR
  subgraph Rooms
    AG[Headless agent / browser ingest]
    ENC[vMix / OBS stream]
  end
  subgraph OC[OpenCaptions server]
    direction TB
    HTTP[HTTP API + static pages]
    WS[WebSocket hub]
    ST[Stage x N]
  end
  AG -- /ws/ingest PCM --> WS
  ENC -- SRT/RTMP/HLS pull --> ST
  WS --> ST
  ST <-- Live API --> GL[Gemini Live Translate]
  ST -- generateContent --> GF[Gemini Flash-Lite]
  WS -- /ws/view captions --> V[Phones, projectors, overlays]
  WS -- /ws/admin status --> A[Production dashboard]
  ST --> FS[(data/: transcripts, rooms, secrets)]
```

</details>

## Components

| Module | Responsibility |
|---|---|
| `src/server.js` | Express HTTP API, static pages, WebSocket endpoints (`ingest`, `view`, `admin`), room registry, persistence of rooms edited at runtime, the event report, the startup screen |
| `src/config.js` | Reads `config/event.json`, `.env` and the environment into one `config` object; switches the engine at runtime |
| `src/preflight.js` | Startup checks that end with a clear sentence instead of a stack trace (a data folder it can't write to) |
| `src/security.js` | The passwords (generated if unset), localhost trust (`AUTH`), security headers and the strict Content-Security-Policy, rate limits, WebSocket origin checks, SSRF validation for pulls |
| `src/auth.js` | Who is signed in and what they may do: session cookies, the admin and crew roles, signed-in devices, changing passwords, two-factor codes (TOTP) |
| `src/oidc.js` | Company sign-in with OpenID Connect (PKCE, ID-token checks) |
| `src/history.js` | The History: every setup change with what it replaced and who made it, undo, and the room trash |
| `src/aikey.js` | Secrets set from the dashboard (`data/secrets.json`): the Gemini API key (checked with Google first) and the tunnel token |
| `src/tunnel.js` | The public address: runs Cloudflare's `cloudflared` (downloaded the first time), reads its address, checks it's reachable |
| `src/alerts.js` | Alerts on the organizers' phones (ntfy, Telegram, Slack, Discord, webhooks): when to send, once, and when it's over |
| `src/failover.js` | The offline backup: watches the connection to Google and moves rooms between Gemini and the local engine |
| `src/stage.js` | One room: receives audio (a main source and an optional backup that takes over by itself), detects speech, gates silence, breaks and music, owns model sessions and caption tracks, applies live corrections, measures latency and cost, raises alerts |
| `src/voice.js` | Voice or music: how much the sound's spectral brightness moves over 2 s tells speech from music, so a room playing music between talks pauses its captions |
| `src/switcher.js` | Breaks from the vision mixer: vMix (Web Controller API) or OBS (obs-websocket v5) switching to a break scene pauses that room |
| `src/languages.js` | Every caption language's English name, for the AI's instructions ("Guarani", not "gn") |
| `src/engines/gemini.js` | One Gemini Live Translate session: config fallbacks, session resumption, reconnect with backoff, 12 s audio buffer while reconnecting |
| `src/engines/local.js` | Local engine: cuts audio into utterances and makes Whisper stream (re-transcription about once a second, words committed when two passes agree, a final pass per utterance). See [Local mode](local.md#how-it-works). |
| `src/local/` | Clients for the local speech server (`asr.js`: whisper.cpp and OpenAI dialects, hallucination filter, request queue) and the local text model (`llm.js`: Ollama and OpenAI dialects, priorities) |
| `src/engines/mock.js` | Offline engine with the same interface, for development and load tests |
| `src/translate.js` | `SentenceTranslator`: sentence-level text translation with provisional partials, a global rate limiter, timeouts, retries and fallback to Live's own translation. In local mode it calls the local text model instead of Flash-Lite. |
| `src/captions.js` | `CaptionTrack`: turns model fragments into partial/final caption segments with timestamps and line-length limits |
| `src/glossary.js` | Vocabulary hints for recognition and whole-word replacements, hot-reloaded from `config/glossary.json` |
| `src/store.js` | Per-talk JSONL storage, retention purge, SRT/VTT/TXT export |
| `src/pull.js` | Audio sources: native WAV reader, ffmpeg for streams and files, yt-dlp for YouTube, real-time pacing |
| `src/system.js` | Process and host metrics: CPU, memory, event-loop lag |
| `src/genai.js` | The one Gemini client every module shares (API key or Vertex AI), rebuilt when the key changes |
| `src/replay.js` | Records the AI's answers and plays them back, for the end-to-end test without an API key |
| `src/tty.js` | Terminal output for the server and tools: the brand badge, spinners, progress bars, plain text in logs |
| `src/audio.js` | PCM16 helpers: the 16 kHz format, sound level (RMS), cutting audio into 100 ms chunks |
| `src/assist.js` | Audience assistant: *What did I miss?* summaries and *Ask the talk* answers from the transcript (Gemini Flash-Lite), cached and rate-limited, with an extractive fallback |
| `src/schedule.js` | Agenda: parses CSV/JSON, finds the current and next talk per room; the Stage uses it to name talks automatically |
| `public/` | Vanilla JavaScript pages (audience, transcripts, projector, overlay, ingest, dashboard, wizard, event report, demo, style editor), with no build step. `smooth.js` paces words at the speaker's rate and rolls lines up TV-style on every caption display; `speak.js` reads captions aloud with the device's voice. |
| `scripts/` | The starter the desktop apps run (`start.js`), headless agent, feed, load test, multi-room latency test, Gemini check, local mode launcher (`local.js`), bundled speech server (`local-asr-server.js`) and local check; developer tools for the downloads, icons, diagrams and the accessibility check |
| `deploy/desktop/` | The Mac app and the Windows launcher, their icons and "Read me" files, packaged by `scripts/package-desktop.js` |

## Data flow for one sentence

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="images/diagrams/caption-flow-dark.png" />
  <img src="images/diagrams/caption-flow-light.png" alt="One sentence end to end: the agent streams 100 ms audio chunks to the Stage, Gemini Live returns the words, the Stage sends provisional captions, asks Flash-Lite for provisional and then final translations, and viewers get the original and the Spanish caption." />
</picture>

<details><summary>Text version of this diagram</summary>

```mermaid
sequenceDiagram
  participant Desk as Sound desk
  participant Agent as Venue agent
  participant Stage as Stage (server)
  participant Live as Gemini Live
  participant MT as Flash-Lite
  participant View as Viewers
  Desk->>Agent: analog audio
  loop every 100 ms
    Agent->>Stage: PCM16 16 kHz (3200 bytes)
    Stage->>Live: sendRealtimeInput
  end
  Live-->>Stage: inputTranscription "Today we talk about" (lang=en)
  Stage-->>View: caption orig (partial)
  Stage->>MT: translate in-progress sentence (every 1.5 s)
  MT-->>Stage: "Hoy hablamos de"
  Stage-->>View: caption es (partial)
  Live-->>Stage: inputTranscription "accessible cities." (sentence end)
  Stage-->>View: caption orig (final)
  Stage->>MT: translate full sentence (with context and glossary)
  MT-->>Stage: "Hoy hablamos de ciudades accesibles."
  Stage-->>View: caption es (final)
```

</details>

Key points:

- **One Live session per room** (in the default `text` mode) produces the original transcription with the detected language.
- **Translation per target language** is a separate, stateless text request per sentence, so adding a language doesn't add a streaming session.
- **Passthrough:** if the speaker already uses a caption language, the transcription is shown as-is for that language.
- **Glossary** replacements are applied to every caption right before it's emitted.

## Room lifecycle

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="images/diagrams/lifecycle-dark.png" />
  <img src="images/diagrams/lifecycle-light.png" alt="Room lifecycle: Idle, then Live when speech is detected; Paused after 30 s of silence; back to Live on speech; Idle after 5 minutes without speech. Nothing is billed while paused or idle." />
</picture>

<details><summary>Text version of this diagram</summary>

```mermaid
stateDiagram-v2
  [*] --> Idle: room created
  Idle --> Live: speech detected (sessions opened, 600 ms pre-roll sent)
  Live --> Paused: 30 s of silence (audio no longer sent, nothing billed)
  Paused --> Live: speech detected
  Paused --> Idle: 5 min without speech (sessions closed)
  Idle --> Live: speech again → a new talk transcript starts
```

</details>

## Failure handling

| Failure | Detection | Recovery |
|---|---|---|
| Gemini ends the connection (about every 10 min, `goAway`) | Server message | Resume with the session handle. Audio is buffered meanwhile, and the old connection's trailing transcriptions are still accepted for 4 s so the words in flight aren't lost. |
| Network drop to Gemini | Socket close or error | Reconnect with exponential backoff. Up to 12 s of audio is buffered and replayed. Network errors keep the full config and the resume handle. |
| Connect hangs (blocked network, no `setupComplete`) | 12 s connect timeout | Retry; the dashboard alerts if a session stays connecting for more than 10 s |
| Model rejects optional config fields | Setup closed with an invalid-argument reason | Retry with a smaller configuration (full → minimal → bare) |
| Session alive but silent while people talk | Watchdog: 20 s of speech without text | Force a fresh session |
| Translation throttled (HTTP 429) or slow | Error or timeout | Back off and retry. Provisional updates are dropped first. The primary language temporarily falls back to Live's own translation. |
| Venue network drop | Agent socket closes, or no server message for 6 s (half-dead connection) | The agent reconnects forever and keeps about 15 s of audio |
| Phone vanishes without closing (Wi-Fi roam, sleep) | No pong to the 25 s ping | The server drops it after about 50 s; slow clients with over 1 MB queued are dropped too. They reconnect and get the history. The phone page also reconnects by itself when it comes back after more than 20 s in the background, so a phone that slept never shows a frozen page. |
| Malformed input (oversized frame, bad URL, stream that isn't live yet) | Socket/stream error | Logged; the connection or pull is closed or retried, the process keeps serving every other room |
| Talk rollover while a translation is in flight | — | Translators are bound to their talk: the late sentence is stored in the talk it belongs to, never duplicated or moved to the next one |
| Server restart | Clients see the socket close | Pages, projectors and agents reconnect automatically. Rooms are reloaded from config or `data/stages.json`. |

## State and persistence

- **In memory:** rooms, sessions, caption history (last lines per track), metrics. Losing it only loses the last few seconds of live context.
- **On disk (`data/`, or the desktop apps' data folder):** transcripts and each talk's audience and cost (`transcripts/<room>/<talk>/`), rooms created at runtime (`stages.json`), the wizard's answers, Event mode and the public address (`setup.json`), the History (`history.jsonl`), signed-in devices (`sessions.json`), passwords, the API key and alert destinations (`secrets.json`), latency reports.
- **Config (`config/`):** event and rooms (`event.json`), glossary (`glossary.json`) and agenda (`schedule.json`), both also written by the dashboard.

There is no database. That's deliberate ([ADR 0001](adr/0001-single-process-node-no-database.md)).

## Scaling

- **Per room:** about 32 KB/s of audio in and out, one Live session, a few text requests per minute per language. Server CPU per room is a small fraction of one core.
- **Per process:** dozens of rooms. Tested with 10 rooms and 20 sessions at about 90 MB RSS. The practical ceiling is the Gemini quota for concurrent Live sessions.
- **Horizontal:** shard by room. Each instance gets its own `STAGES` list, and optionally its own API key or project. A reverse proxy routes by the `stage` parameter. Rooms share nothing, so no pub/sub is needed.
- **Audience:** each viewer is one WebSocket that receives small JSON messages. For very large audiences, put a WebSocket-capable CDN or fan-out gateway in front of `/ws/view`.
- **Not supported today:** running two instances for the **same** room (active-active). Use a supervisor with restart (Docker `restart`, systemd) for availability.

## Extension points

- **Engines:** implement `start`, `sendAudio`, `endAudio`, `stop`, `restart` and `status`, and emit `input`, `output`, `audio`, `turn`, `state`, `log` and `error`. `mock.js` is the smallest example; `local.js` shows how to wrap a non-streaming model ([ADR 0009](adr/0009-local-engine-with-whisper-and-ollama.md)).
- **Audio sources:** anything that produces PCM16 mono 16 kHz can send it to `/ws/ingest`. See the [API reference](reference/api.md).
- **Outputs:** the viewer protocol is plain JSON over WebSocket. Overlays and pages are static HTML that you can copy and restyle.

## Quality attributes and how they're verified

| Attribute | How it's checked today |
|---|---|
| Correctness of segmentation, exports, sign-in and security rules, alerts | Tests (`npm test`) in CI on Linux, macOS and Windows |
| The whole path, audio to captions, transcripts, exports and summaries | An end-to-end test that replays a recorded Gemini session (`test/e2e.test.js`, re-recorded with `npm run record`) |
| Accessibility | `npm run a11y`: axe-core, WCAG 2.2 AA, every page in light and dark, in CI |
| Documentation | Every relative link and anchor is checked by `npm test` |
| Latency | Dashboard metrics and `npm run multi` reports |
| Load | `npm run loadtest` (mock engine, many rooms) |
| Real model behaviour | `npm run check`, and rehearsals with real audio and simulated phones |

The tests don't call the real model on every change, because of cost and quota; the recorded session stands in for it.
