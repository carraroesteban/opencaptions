# Changelog

All notable changes to this project are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/). Before 1.0, minor versions may include breaking changes, and they are marked **Breaking**.

## [Unreleased]

### Added — from the roadmap

- **Streaming translation:** when a sentence ends, its translation streams into the caption as Gemini writes it. Measured on Gemini 3.5 Flash-Lite: first translated words after a median 0.61 s instead of 0.69 s, and an average of 0.61 s instead of 0.83 s (slow answers gain most). The caption never shrinks while streaming. On by default; `MT_STREAM=0` turns it off. See [Latency](docs/latency.md#tuning).
- **Strict Content-Security-Policy:** every page's script moved to `public/pages/<page>.js`; `script-src` no longer allows inline scripts, and `script-src-attr 'none'` blocks `onclick=`-style handlers. A test fails if a page or template adds one back.
- **End-to-end test harness:** `test/e2e.test.js` runs the real server with Gemini replaced by a recorded session (`test/fixtures/talk-en.json`), from audio in to captions, transcripts, exports, summary and questions, with no API key. `npm run record` re-records it (`OC_RECORD` / `OC_REPLAY`, see `src/replay.js`).
- **Linting and type checking:** ESLint (`npm run lint`) on the server, scripts, tests and every page script, and TypeScript checking JSDoc types in `src/` and `scripts/` (`npm run typecheck`); both run in CI. They found a few real bugs: duplicate translations in `public/i18n.js`, a script that read a property the Gemini engine never sets (`check-gemini` always said the language was "not reported"), and JSDoc that no longer matched the code.

### Added — welcome wizard and offline backup

- **Welcome wizard** (`/welcome.html`): the first time someone opens the dashboard, five short illustrated steps ask for the event name, the rooms (with one-click presets) and the languages, explain which AI makes the captions, and show how to connect the sound. Every step can be skipped; **Skip setup** keeps the example configuration. The answers are saved in `data/setup.json` and through the existing room API, and the wizard can be reopened from **Setup wizard** in the toolbar. New `GET`/`PUT /api/setup`.
- **Offline backup:** `npm run local -- --fallback` keeps Gemini as the main engine and prepares the local engine on standby. If Google's API can't be reached for about 15 seconds, every room switches to Whisper and the local text model; after a minute of stable connection they switch back. The dashboard shows a banner and an AI selector (*Automatic*, *Always Gemini*, *Always this computer*); `POST /api/engine` does the same. Configure it with `FALLBACK=local` or `"fallback": "local"` in `config/event.json`. See [docs/local.md](docs/local.md#offline-backup).
- **Documentation in the brand style:** every technical diagram (how it works, components, one sentence end to end, room lifecycle, both deployment options, latency, local mode, offline backup, security) is redrawn like the website, in light and dark versions that follow the reader's GitHub theme, with a text version underneath. The main docs pages open with an illustration. Sources in `docs/diagrams/`, rendered with `npm run docs:images`.
- New illustrations for the wizard, and a 1280×640 GitHub social preview image (`docs/images/social-preview.png`).

### Changed — new identity

- **New brand: the "Open O"** logo, an ink / paper / lime palette, Bricolage Grotesque headlines and Atkinson Hyperlegible Next for everything you read. Every page shares one set of design tokens ([`public/tokens.css`](public/tokens.css)) with equally polished light and dark themes. See [docs/brand.md](docs/brand.md).
- **Highlighter on the live word:** the word being spoken right now gets a lime highlighter sweep on phones, the transcript page, the projector, the demo and floating captions.
- Restyled dashboard, audience page, transcripts, projector screen, overlay (the second language now uses a muted tone), QR posters, style editor, ingest and setup wizard. New favicon, app icons and link-preview image.
- The default caption font in the overlay and on the projector is now Atkinson Hyperlegible Next 700 (it was Inter 600), and the projector's default background is ink (`#111014`) instead of pure black. Existing URLs that set `font`, `weight` or `bg` look the same as before.
- The default `accent` is now lime (`#D4FF3A`). Text on an event's accent colour switches between ink and paper automatically.

### Changed — ready for any event

- **Event-neutral defaults:** the example event, rooms, agenda, glossary and demo captions no longer refer to a specific conference or to tech talks, and the AI prompts no longer assume a software audience, so summaries, answers and translations fit any field.
- **Dashboard:** a cleaner header with icon buttons, KPI cards, a first-run guide with an illustration, and compact room cards (status, talk, audio level, latest line, audience, delay and cost) with a **See details** toggle for engines, metrics and per-language previews. The first-run guide is now fully translated.
- **Presenter screen:** captions fill the whole screen from the bottom up instead of a fixed three lines (set `lines` to keep a fixed height), and **F** or a double-click toggles full screen. In the style editor, unchecking *Also show the original* now also removes it from the preview, and *Lines* has an *Auto (fill the screen)* setting.
- **New demo recordings:** `samples/talk-en.wav` and `samples/talk-es.wav` are now short fictional talks at the example event, read by a synthetic voice. Rebuild them on a Mac with `scripts/make-samples.sh`. The accuracy table in [docs/local.md](docs/local.md#measured-results) was measured again with them.
- `npm run multi` no longer defaults to one event's YouTube channel: pass `--playlist`, `--file`, `--channel @handle` or `--query`.
- The website has a new *Made for event day* section about the welcome wizard and the offline backup, and a more tactile design: a centred hero with real objects on the table that follow the pointer, a typing announcement, film grain, a section dock, an endless use-case marquee, a dark band whose statement captions itself as you scroll, and a dock to switch between screenshots. It opens in light mode by default.
- **Polish:** custom select arrows with proper padding; numbers use the system font's digits (Atkinson Hyperlegible Next only has a slashed zero).
- **Illustrations** for the room list, dashboard, style editor and website.

### Added — website

- **[opencaptions.kvza.ar](https://opencaptions.kvza.ar)** in English and Spanish, built from `site/` and deployed to GitHub Pages by the new `Site` workflow. Preview it with `npm run site`.

### Added — local mode: captions without the cloud

- **`ENGINE=local`:** speech recognition with Whisper and translation, summaries and answers with an open model (Gemma 3 through Ollama by default), on the same computer or a server on your network. No API key, no cost per hour, and the room's audio never leaves the machine. Everything else (audience pages, projector, overlay, agenda, transcripts, dashboard) works unchanged. See [docs/local.md](docs/local.md) and [ADR 0009](docs/adr/0009-local-engine-with-whisper-and-ollama.md).
- **Streaming Whisper:** utterances are re-transcribed about once a second while the speaker talks; words two passes agree on are committed and the rest shown as provisional, so captions appear during the sentence. Long monologues are cut at a quiet moment without losing or repeating words; Whisper's typical hallucinations on silence ("Thanks for watching", "Amara.org") and repetition loops are removed; a language the event doesn't use (Galician for Spanish) is re-transcribed in the room's language.
- **`npm run local`:** finds or starts a speech server (whisper.cpp, WhisperKit on Apple Silicon, or a bundled one on sherpa-onnx that runs on any CPU), starts Ollama, downloads the models once and starts the server. `npm run local -- --check` streams a sample talk through the whole pipeline and reports word error rate, delay and speed.
- Works with any whisper.cpp or OpenAI-compatible speech server (speaches, LocalAI, WhisperKit) and any Ollama or OpenAI-compatible chat server (LM Studio, llama.cpp, vLLM), so a GPU machine can serve several OpenCaptions servers. Optional separate translation model (`LOCAL_MT_MODEL=translategemma`) with the prompt it was trained on.
- The setup wizard asks which AI engine to use (Gemini, local or demo); the dashboard shows a 🔒 local chip and tells you what's missing (speech server down, Ollama not running, model not downloaded).

### Added — making it easy for people

- **✨ What did I miss?** on the audience page: a summary of the last 5 minutes (or the whole talk) in the viewer's language, generated from the transcript and cached for everyone.
- **💬 Ask the talk:** questions answered only from what was said, with quotes and timestamps; says so when the answer isn't there.
- **Transcript page** (`/talk.html`): paragraphs with timestamps, search with highlights, language switch, TXT/SRT/VTT download, copy link, print; updates live while the talk runs.
- **Transcript library** (`/talks.html`) of every talk, searchable by title, speaker or room (`publicTranscripts` in `config/event.json`).
- **Reading settings** on the audience page: text size, high-legibility fonts (Atkinson Hyperlegible, Lexend), line spacing, light/dark/automatic theme.
- **📅 Agenda:** paste the schedule as CSV; rooms name their talks (title + speaker) automatically and wait for a pause before switching. "Up next" on the room list and dashboard. Event time zone setting.
- **🖨 QR kit** (`/kit.html`): printable bilingual A4 posters per room.
- **`npm run setup`:** a one-minute wizard that writes `.env` and `config/event.json` and prints the next steps.
- Dashboard **getting-started checklist**, agenda editor, links to the kit and library, live transcript link per room.

### Added — product polish

- **App identity:** icon, favicon, home-screen icon, installable web app manifest (named after the event), and link previews with an image for WhatsApp, Slack and LinkedIn. The logo on every secondary page links back to the dashboard (operator pages) or the room list (audience pages).
- **⧉ Floating captions** on the audience page (desktop): an always-on-top window over the livestream, the slides or a video call. Chrome and Edge use Document Picture-in-Picture (resizable, follows the reading settings); other browsers fall back to video picture-in-picture.
- **README** rewritten in the style of well-known self-hosted projects (logo, badges, one hero image, quick start without an API key, install options, supported-platforms table, cost, documentation map) with a new, consistent screenshot set in `docs/images/`.
- **Setup wizard:** numbered questions, a check that the API key looks like a Gemini key, this computer's LAN address (instead of `localhost`) in the links for other devices, and a one-line sample feed to try it without audio hardware.
- **Agenda from Swapcard / Sessionize / Sheets:** paste the export straight from Excel or Google Sheets. Columns are recognized by their header (English or Spanish), rooms by name ("Sala A - Planta baja" → `sala-a`), dates in `DD/MM/YYYY`, US, ISO or `HH:MM` form, and rows for rooms without captions are skipped and reported instead of failing the import.
- **The agenda is context for the AI:** the current and next talk's title and speaker names go into the recognizer's vocabulary and the translator's glossary, so names are spelled right and not translated.
- **Bilingual stream overlay:** `overlay.html?…&also=en` (or `orig`) adds a smaller second line in another language, for streams watched in more than one language; also in the style editor (*Second line*). It never repeats the same words twice.
- **📌 Floating mini-dashboard** for operators: every room's status, alerts and last line in an always-on-top window over OBS or vMix. Clicking a room jumps to its card.

### Added — bilingual speakers

- Speakers can switch language mid-talk (Spanish hosts introducing an English talk, bilingual Q&A): every caption track follows — transcription when the speaker uses that language, translation when not. A switch is confirmed after ~15 characters, so a single foreign word doesn't flip the captions, and the words around the switch are never routed to the wrong language.
- Rooms with a pinned language now also give that language its own caption track (it used to be an alias of the original), so English speech in a Spanish room is translated into Spanish.
- **OBS / vMix can stream straight to a room**: set the room's pull to `rtmp://0.0.0.0:1935/live/<key>` and point the encoder's *Custom* stream target at it; the listener restarts when the encoder disconnects.
- `npm run multi` fills any number of rooms (e.g. 30) by reusing talks at different offsets when there aren't enough distinct videos.

### Fixed — event-day reliability (from a pre-launch review)

- A single oversized WebSocket frame or malformed upgrade URL could crash the whole server; sockets now have error handlers and there is a process-level safety net.
- A stream pull failing before its first byte (stream not live yet, typo) caused an unhandled rejection and a crash loop.
- Network blips before setup permanently downgraded the Gemini session config (dropping the glossary and pinned language); only real config rejections downgrade now, and resume handles survive transient errors.
- Words in flight were lost at every session renewal (`goAway`, watchdog); trailing transcriptions of the old connection are now kept.
- A hung Gemini connect was never retried; 12 s connect timeout and a dashboard alert.
- Text mode stored duplicate translated sentences (a provisional translation was committed on turn end or talk rollover); a talk rollover mid-sentence moved the translation into the next talk.
- Saving the room dialog (e.g. to set a title) cleared every phone/projector and restarted the audio pull; renames now keep captions, and pulls restart only when changed.
- Dead or slow viewer connections were never dropped (heartbeat + backpressure).
- A deleted room could keep a Live session running; its viewers are now disconnected.
- The agent didn't notice half-dead connections and fought other sources that took over a room.
- Double-click on "Start" in the ingest page could break it; unplugged inputs and suspended audio are now reported.
- A configured stream pull is resumed when a temporary browser/agent ingest leaves.
- SRT/VTT cue times are aligned to when words were spoken and talks start at their first words.
- Glossary JSON typos no longer silently empty the glossary; projector PCs keep the screen awake; iOS listen mode plays with the silent switch on; reconnects are jittered.


### Security

- **Breaking:** secure by default (`AUTH=auto`). Admin and ingest now need a token from every device except the server machine itself. If `ADMIN_TOKEN` or `INGEST_TOKEN` isn't set, a random token is generated into `data/secrets.json` and printed at startup. `AUTH=token` requires tokens everywhere. `AUTH=off` restores the old open behaviour for labs.
- **Breaking:** `/metrics` now requires the admin token (use `Authorization: Bearer`).
- **Breaking:** transcript listing and past-talk exports need the admin token. The talk in progress stays public (`PUBLIC_TRANSCRIPTS=current|all|none`).
- **Breaking:** audio pulls are validated. Only allowed schemes are accepted. Cloud metadata and link-local addresses are always blocked. HTTP(S) to private addresses is blocked unless `PULL_ALLOW_PRIVATE=1`. Local files must be in `samples/` or `MEDIA_DIR`. ffmpeg gets a protocol whitelist for URLs.
- Security headers: CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP/CORP, `X-Frame-Options`, and HSTS over HTTPS.
- Rate limits on state-changing API calls, failed logins (lockout) and WebSocket connections.
- Origin checks on admin and ingest WebSockets. Message size limits. `MAX_STAGES` and `MAX_VIEWERS` caps.
- Input validation for rooms and the glossary. Generic error responses without stack traces.
- Tokens are compared in constant time. The agent and scripts send tokens in the `Authorization` header. Pages remove `?token=` from the address bar.

### Added

- `npm run multi`: a multi-room latency test with real YouTube talks, including a JSON report.
- Hardened Docker image (non-root, read-only filesystem, optional yt-dlp) and a Compose file with an optional Cloudflare Tunnel profile.
- A sandboxed systemd unit for the server (`deploy/opencaptions.service`).
- Documentation set: getting started, requirements, deployment, networking, security, latency, architecture, ADRs, configuration and API reference, runbook, troubleshooting, contributing guide, security policy.
- CI on Linux, macOS and Windows.
- Interface localization (Spanish and English), light and dark themes, CPU, memory and event-loop metrics, caption style editor, headless agent, live microphone and YouTube demo pages.

## [0.1.0] - 2026-09-24

### Added

- First version:
  - Gemini Live Translate captions with text translation per sentence.
  - Multi-room server, audience, projector and overlay pages.
  - Production dashboard, glossary, and SRT/VTT/TXT export.
  - Mock engine.
