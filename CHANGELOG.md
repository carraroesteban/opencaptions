# Changelog

All notable changes to this project are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/). Before 1.0, minor versions may include breaking changes, and they are marked **Breaking**.

## [Unreleased]

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

- First version for the Nerdearla 2026 Vibeathon:
  - Gemini Live Translate captions with text translation per sentence.
  - Multi-room server, audience, projector and overlay pages.
  - Production dashboard, glossary, and SRT/VTT/TXT export.
  - Mock engine.
