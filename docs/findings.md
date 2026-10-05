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

Also updated: CHANGELOG, `docs/architecture.md`, `docs/security-guide.md`, `docs/reference/api.md`, ADR 0005. **123 tests pass, lint and typecheck pass, the accessibility check passes on every page.**

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

## Second round: everything from the list below was done

Done after "do all", each verified (tests, browser, or a real run):

| Item | What changed |
|---|---|
| Past transcripts public by default | `config/event.json` now says `"current"`, matching the docs and the legal page. New **Settings → Transcripts for the audience** to choose *every talk* or *none* without editing files. |
| Only 3 languages | **Settings → Languages** and the wizard's *Another language* add any of 40 languages (`public/languages.js`), saved in `data/setup.json`. A language a room uses can't be removed. Tested in the browser end to end. |
| Your `.env` readable by others | `chmod 600` done. |
| Address changed after a restart | The last free address is saved; the dashboard warns (with a link to the QR kit) and the phone alert works across restarts. |
| "Ask the talk" shared by the whole venue | 6/min per browser (random id), 60/min per IP, 30/min server-wide. Verified: a second phone on the same IP still gets answers. Test added. |
| Reconnect limit | `RATE_LIMIT_WS` default 6000 per IP per minute. |
| Wizard summary with `localhost` | Shows a warning. Verified in the browser. |
| Transcript page rebuilt on every caption | Only changed paragraphs are replaced. Verified live: earlier paragraphs keep their nodes; ~2 replacements/s (the last paragraph and the line being written). |
| Microsoft multi-tenant sign-in | Requires `OIDC_TENANTS`; other tenants are refused. |
| Crew sees stream keys | Crew gets `scheme://host/…` in status, the live feed and history. Test added. |
| Failed-login lockout per IP | Per IP + browser (20/10 min), ceiling 100 per IP. |
| Unpinned downloads | `cloudflared` pinned + SHA-256 in `src/tunnel.js` and the Dockerfile, `yt-dlp` too; real download hash checked, Docker image built and healthy. Actions pinned to commit hashes; `.github/dependabot.yml` added. |
| HLS to private addresses | Documented in the security guide's known gaps. |
| Glossary public | Crew/admin only. |
| Website CSP | `<meta>` policy per page with the inline script's hash. Verified: no violations, theme script, fonts, images and videos all work. |
| App CSP allowed YouTube everywhere | YouTube only on `/demo.html`. |
| Wizard "simulated" + "connected" | Explains demo mode instead. |
| macOS memory metric | Uses `vm_stat` (82 % here instead of 99 %). |
| Dependencies | Updated within their ranges; `npm audit`: 0. |
| `10h30` agenda times, nvm on the Mac app, CSV tab/CR | Done; agenda test added. |

### Still yours to do (GitHub settings, not code)

1. **Turn on private vulnerability reporting** (Settings → Code security), or run:

   ```bash
   gh api -X PUT repos/carraroesteban/opencaptions/private-vulnerability-reporting
   ```

2. **Turn on Dependabot alerts and security updates** (Settings → Code security). The new `dependabot.yml` already handles weekly version updates.

### Left as is, on purpose

- `connect-src ws: wss:` in the app's CSP: tightening it to `'self'` risks breaking captions on older iPhones (Safari didn't always count WebSockets as `'self'`).
- Two admins signing in with two-factor codes within the same 30 seconds: the second waits for the next code. That's what makes a stolen code useless.
- `main` without branch protection: fine while you work alone.

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
