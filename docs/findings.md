# Audit findings — 2026-10-05

An unattended audit of OpenCaptions: security review, load and reconnect tests, a first-run walk-through as a non-technical organizer, and a check of the docs and files against the code. Nothing is committed. Fixes already made come first; everything else needs a decision from you.

## Fixed during the audit

| What | Where |
|---|---|
| **Security: other websites could change settings through the organizer's browser** (cross-site request forgery). On the server computer no password is asked, and those requests skipped the check that refuses changes coming from other websites. Any page open in the organizer's browser could post to `localhost:8080` and restart rooms, start a new talk, lock or unlock event mode, or undo changes. Every browser change must now carry OpenCaptions' own `Origin`; scripts (no `Origin`) are unaffected. New test: fails before the fix, passes after. | `src/auth.js`, `test/http.test.js` |
| **Signing a device out didn't cut its live dashboard.** The session was deleted, but an open dashboard on that device kept receiving every room's status each second until reloaded. Same when a session expired. Its connection now closes within a second and the page asks to sign in. New test: fails before, passes after. | `src/auth.js`, `src/server.js`, `test/auth.test.js` |
| **The transcript library froze live captions.** `/api/talks` (public with the shipped config) re-read every saved transcript once per talk, synchronously, on the thread that sends captions. Measured with 60 one-hour talks: **1.8 s per request** with nothing else happening; twenty people opening the library ≈ 35 s of frozen captions. Now cached per talk until its files change: 0.19 s on the first request, ~5 ms after, identical output. Test added. | `src/store.js`, `src/server.js`, `test/core.test.js` |
| **Startup crash with `RETENTION_DAYS`** when the transcripts folder holds a plain file, such as the `.DS_Store` macOS Finder creates. Reproduced, fixed, tested. | `src/store.js` |
| **A glossary typo could garble every live caption.** A correction whose "from" is only `|` or spaces became an empty pattern, which matches between words: reproduced, `"Hello world, how are you?"` became `"Hello world,X how are you?X"`. Now refused by the API (with a clear message) and skipped when loading a hand-edited file. Test added. | `src/glossary.js`, `test/http.test.js` |
| A phone waking from sleep could show frozen captions until its dead connection timed out (the server noticed after ~50 s, the phone didn't). The captions page now reconnects when it comes back after more than 20 s in the background. Verified in the browser. | `public/pages/watch.js` |
| **Linux install steps** left `.env` root-owned with `chmod 600`; the service user couldn't read it, and dotenv fails silently, so the passwords, `PUBLIC_URL` and key in `.env` were ignored. The steps now give the file to the service user. (systemd's `EnvironmentFile=` was tried and reverted: it keeps inline `# comments` in values, dotenv strips them.) | `deploy/opencaptions.service` |
| **macOS agent plist** passed the ingest password on the command line (visible to any user via `ps`) and hard-coded `/usr/local/bin/node` (wrong on Apple Silicon with Homebrew). Password moved to `EnvironmentVariables`, file `chmod 600`, node path explained. | `deploy/com.opencaptions.agent.plist` |
| `npm run setup` wrote `.env` with `mode: 0o600`, which only applies to a new file: an existing `.env` (copied from `.env.example`) stayed readable by every user. It now sets the permissions explicitly. | `scripts/setup.js` |
| `PUT /api/setup` with a valid name and an invalid time zone renamed the event in memory and recorded it in the history, then failed before saving: the running server and the saved settings disagreed until a restart. Everything is now validated first. Test added (fails before, passes after). | `src/server.js`, `test/http.test.js` |
| A crew member's forbidden room change resolved their audio URL on the network before being refused. The role check now comes first. | `src/server.js` |
| Transcript downloads put `lang`/`talk` from the URL straight into the `Content-Disposition` header; a quote broke it (confirmed on a running server). Now only safe characters. | `src/server.js` |
| Transcript search highlighted inside the escaped HTML, so searching "amp" showed `&amp;`. Now matches the raw text, then escapes. | `public/pages/talk.js` |
| Five operator messages stayed in Spanish in the English UI ("No se pudo iniciar: …", "(opcional)", "listo · "…): `tr()` trims the text before looking it up, and those dictionary keys had a space at the edge. Keys are now trimmed when the dictionary loads. Found by checking every UI string against the dictionary; the rest are all translated. | `public/i18n.js` |
| The QR kit's "phones can't open this address" warning told organizers to set `PUBLIC_URL`, an environment variable. It now points to the dashboard's Settings. | `public/pages/kit.js` |
| Requirements said phones need "iOS Safari 15+"; the captions page uses `<dialog>` and CSS `:has()`, which need **iOS 15.4** (and Chrome 105). Corrected. | `docs/requirements.md` |
| Getting started said **Dashboard → Rooms → + Room**; the button is **New room**. | `docs/getting-started.md` |
| Three exports nothing used: `asrLoad`, `mtLimiter`, `_test`. Removed. | `src/local/asr.js`, `src/translate.js`, `src/security.js` |

Also updated: CHANGELOG, `docs/architecture.md`, `docs/security-guide.md`, `docs/reference/api.md`, ADR 0005. **118 tests pass, lint and typecheck pass, the accessibility check passes on every page.**

## Load and reliability results

All on this Mac, mock engine, one room fed with the English sample in a loop.

| Test | Result |
|---|---|
| 1000 phones on one room for 25 minutes | 6.2 million messages delivered, 0 disconnects, 0 errors. Server memory between 67 and 99 MB with no upward trend. |
| 2900 phones at once | About 10 % CPU; the slowest 1 % of event-loop ticks waited 13–26 ms. Plenty of headroom. |
| Server restart with 1000 phones connected | 97 % back within 6 s of the server returning, 100 % within 12 s. |
| 4000 phones from one IP address | 3000 connections per minute per IP are allowed (`RATE_LIMIT_WS`); the rest get in at the next minute. See item 9. |
| Caption history over a long session | Capped at 5000 lines per language in memory, so a 3-hour talk can't grow without limit. |
| Gemini sessions longer than ~10 min | Handled by session resumption and `goAway`, covered by recorded fixtures. |
| Audio buffers while a connection is down | Bounded everywhere: room agent and browser audio page ~15 s, Gemini engine capped, local engine backlog capped. |

Not tested: a real 3-hour Gemini session (needs a key and real time), and real phones on a real venue Wi-Fi. Both are worth one rehearsal before a first big event.

## Needs your decision

### Do before the next release

1. **Past transcripts are public on a fresh install, but the docs say they aren't.** `config/event.json` ships with `"publicTranscripts": "all"`, so every past talk is listed and downloadable at `/talks.html` by anyone. `docs/security-guide.md`, `docs/legal.md` ("past talks are only public if you set `publicTranscripts` to `all`") and the configuration reference all say the default is `current`. I'd change `config/event.json` to `"current"` (private by default, matches the legal page). The other way is to change the three docs and tell organizers to get speakers' consent first. Not changed, because it changes what audiences see.
2. **Private vulnerability reporting is turned off on GitHub**, but `SECURITY.md`, `security.txt` and the website's Security link all tell researchers to use it, so nobody can report a hole privately. Turn it on in Settings → Code security, or run:

   ```bash
   gh api -X PUT repos/carraroesteban/opencaptions/private-vulnerability-reporting
   ```

3. **Dependabot is off** (alerts and security updates), and there's no `.github/dependabot.yml`. CI runs `npm audit` only when you push. Turn both on in Settings → Code security. (`main` has no branch protection; fine while you work alone.)
4. **Your own `.env` is readable by other users on this Mac** (`-rw-r--r--`), and it holds your Gemini key. `chmod 600 .env` fixes it. (New installs are now handled by the setup script fix above.)

### Blocks a non-technical organizer

5. **Only Spanish, English and Portuguese can be picked.** The wizard and the room editor list only the languages in `config/event.json`; French means editing JSON by hand. The code already knows other languages (French, German, Italian in `src/assist.js`). The website's FAQ says "You choose the languages for each room, for example Spanish, English and Portuguese", so visitors will expect to pick others. Suggestion: "+ Add a language" in the wizard and Settings, saved to `data/`.
6. **Local AI needs the terminal.** The wizard's "run the AI on this computer" option says to run `npm run local`, but launcher users never open a terminal. Suggestion: a dashboard button that runs the local setup with a progress bar (~4 GB download).

### Confusing, but there's a way through

7. **The free public address changes on every restart.** The wizard warns clearly, but printed QR codes break if the computer restarts mid-event. Suggestion: a dashboard alert "your address changed, reprint the QR"; long-term, a fixed short link that redirects to the current tunnel.
8. **"Ask the talk" is limited to 6 questions a minute per IP**, and at a venue every phone shares one public IP: the whole audience shares those 6. Suggestion: key the limit by a random per-browser id (plus the existing global limit of 30 a minute, which already caps cost).
9. **More than 3000 phones on one venue network after a restart**: some wait up to a minute (per-IP connection limit). Suggestion: raise the default `RATE_LIMIT_WS` to `MAX_VIEWERS` (5000).
10. **The wizard's summary can show `127.0.0.1` as the address** (`HOST=127.0.0.1`, or Docker's default port mapping). The QR kit warns, but the summary doesn't. Suggestion: show the same warning there.

10b. **The live transcript page rebuilds the whole transcript on every caption update**, including the provisional ones that arrive several times a second (`public/pages/talk.js`, `render()`). Measured on this Mac with a one-hour talk: 13 ms per rebuild (240 paragraphs); expect 50–80 ms on a mid-range phone, and three times that for a three-hour talk. Worse for accessibility: every rebuild resets text selection and a screen reader's reading position. Suggestion: while live and not searching, update only the last paragraph and the provisional line.

### Security hardening (low risk today)

11. **Microsoft multi-tenant sign-in:** the code accepts the `{tenantid}` issuer template (`/common/v2.0`). Configured that way, any Microsoft tenant can sign in, and roles are matched by email, a claim another tenant's admin controls (the 2023 "nOAuth" issue). The docs tell people to use their own tenant's issuer, which is safe. Suggestion: refuse a multi-tenant Microsoft issuer, or require an allowlist of tenant ids.
11b. **The crew can see stream keys.** The crew password is meant for volunteers, but `/api/status`, the live dashboard feed and `/api/history` give the crew every room's full `pull` URL (also shown as the room's audio label, which defaults to the URL in `src/pull.js`), which can include a stream key or an SRT passphrase (`rtmp://…/live2/<key>`, `srt://…?passphrase=…`). Suggestion: send the crew a redacted URL (scheme and host only); only the admin's room editor needs the full one.
12. **Failed-login limit is per IP** (20 per 10 minutes). On a venue network sharing one IP, one person guessing passwords locks the whole crew out for 10 minutes. Suggestion: also count per device cookie, or raise it for private-network addresses.
13. **Downloads without checksums:** the Docker image fetches `cloudflared` and `yt-dlp` as "latest", and the app downloads `cloudflared` on organizers' computers the same way (`src/tunnel.js`). All over HTTPS from GitHub, but unpinned and unverified. Suggestion: pin versions and check SHA-256.
14. **HLS audio sources can reach private addresses:** the private-address check covers the URL an admin types, but a public HLS playlist can list segments on `10.x`/`192.168.x`, and ffmpeg fetches them. Admin-only. Suggestion: document it.
15. **`GET /api/glossary` is public**, though only the dashboard uses it. A glossary can hold names of unannounced products or speakers. Suggestion: make it crew-only (an API change, so your call).
16. **The website has no Content-Security-Policy.** GitHub Pages can't send headers, so it would be a `<meta>` tag. Low risk for a static site, but it would enforce the privacy page's "nothing from other companies".
17. **The app's CSP allows YouTube scripts and frames on every page** and WebSockets to any host (`connect-src ws: wss:`); only the demo page needs YouTube. Tightening it per page would limit the damage of any future XSS.

### Minor

18. The wizard says "captions are simulated" and "Connected to Gemini" at once when the server is started with `--mock` while a key is set. Developer-only.
19. `opencaptions_host_memory_used_percent` reads ~100 % on macOS: `os.freemem()` doesn't count the file cache as free there. Only Prometheus uses it.
20. Dependency updates available (none with known vulnerabilities): `@google/genai` 2.24→2.27, `ws` 8.21→8.22, `dotenv` 18.0.3→18.0.5.
21. GitHub Actions are pinned to major versions (`@v7`), not commit hashes. Common practice; pinning by hash protects against a compromised action.

## Checked and fine

**Security**

- Every HTTP route has the right role: 65 routes reviewed. Public ones are read-only, plus login and the audience "ask", which is rate-limited and cached.
- No cross-site scripting found: every page escapes room names, titles, speaker names, captions and AI answers before inserting them (dashboard included, so a crew member can't attack an admin).
- File paths are safe: transcript folders are sanitized, local audio files must stay inside `samples/` or `MEDIA_DIR`, and ffmpeg gets a protocol whitelist without `file`.
- Company sign-in checks PKCE, state, nonce, signature, issuer, audience and expiry.
- Passwords and session ids are 144–256 random bits; secrets files are `0600`; the cookie is `HttpOnly`, `SameSite=Strict` and `Secure` behind HTTPS (the local tunnel counts as a trusted proxy).
- Strong security headers: CSP with hashed styles and no inline scripts, `nosniff`, `no-referrer`, `frame-ancestors 'self'`, COOP/CORP.
- The local AI servers (Whisper, Ollama) listen on this computer only.
- No secrets in the repository or its history (only fake test keys).
- `npm audit`: 0 vulnerabilities.
- Docker: non-root user, read-only filesystem, all capabilities dropped, published on localhost only. The systemd unit is well sandboxed.
- GitHub Actions use least-privilege permissions, and no workflow runs untrusted pull-request code with write access.

**Docs and files**

- Every environment variable in `.env.example` and the configuration reference is read by the code, and every one the code reads is documented (except internal/dev ones).
- Every UI string in the operator pages has an English translation, and the audience pages' Spanish and English dictionaries have the same keys.
- The agenda importer handles commas, semicolons (Spanish Excel), tabs, quotes, a BOM, Windows line endings, room names instead of ids, and 12/24-hour times; `10h30` is refused with a clear message.
- Every `npm run …` command and flag mentioned in the docs and on the website exists.
- Every file path mentioned in the docs exists.
- Every dashboard label the docs point to (Settings → …) exists in English and Spanish, and the troubleshooting guide quotes the app's real error messages.
- The desktop ZIPs' layout matches what the README says to click.
- Numbers in the docs match the code (25 s Gemini check, 25 s ping / ~50 s drop, 5000 viewers, cost example).
- The website loads nothing from other companies, as the privacy page says; the "audio is never recorded" claim holds (audio is sent from memory).
- The accessibility statement's claim that a failing check stops the build is true (CI runs `npm run a11y`).
