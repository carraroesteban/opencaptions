# Changelog

All notable changes to this project are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/). Before 1.0, minor versions may include breaking changes, and they are marked **Breaking**.

## [Unreleased]

## [0.3.1] - 2026-10-06

### Added

- **Just for me notices a call app.** When Zoom, Microsoft Teams, Webex, FaceTime, Discord, Skype or GoTo Meeting is open, the personal page says how to caption the call. On Windows, it offers **Both** with the whole computer's sound in one click. On a Mac, where browsers can't capture another app's sound, it suggests joining the call in the browser. Only the names of running programs are checked, on this computer; a call in a browser tab can't be seen.
- **Captions in your language from the start:** Just for me translates into the computer's language by default (the browser's first language), and the pages already follow it. Choosing another language or *Don't translate* is remembered.

### Changed

- **Just for me has no event:** the room list, the audience and stage pages, the overlay, the kit, the report and the dashboard all lead to the personal page; no event name appears (it's kept for going back to events); and the transcript list is **My transcripts**, without a room filter, with its back link to your captions.

### Fixed

- **Buttons side by side line up:** a button with an icon (like **Edit** in Rooms) and one without (**Delete**) no longer sit at different heights.
- **The accessibility check runs on GitHub again:** Chrome on GitHub's Ubuntu runners now starts without its sandbox (only on CI), and if it can't start the check says why instead of crashing.

## [0.3.0] - 2026-10-05

### Added

- **The welcome screen asks what you want captions for,** with two big illustrated choices: *For an event* or *Just for me*.
- **Just for me: microphone and computer sound at once** (**Both**), to caption both sides of a call. The page suggests headphones, so the microphone doesn't pick up the speakers.
- **Just for me (personal mode).** The same app now also captions your own computer: choose **Just for me** on the welcome screen. Listen to the **microphone** (you, a conversation in the room) or the **computer's sound** (a video call, a video, a class: the whole computer on Windows, a tab on a Mac), translate into any of 40 languages, read in big text or in a **floating window** over everything, and keep a transcript to search, summarize or download. Nothing is public in this mode, not even on your Wi-Fi: captions and transcripts need this computer or a sign-in. Guide: [docs/personal.md](docs/personal.md).
- **Delete a transcript for good** from the dashboard's Transcripts (`DELETE /api/stages/:id/talks/:talk`).
- **Captions inside Zoom, YouTube Live and Microsoft Teams.** A new **Integrations** page in the dashboard: paste a meeting's or stream's caption link (Zoom's API token, YouTube's Captions ingestion URL, Teams' CART link), pick the room and language, and its captions appear inside the meeting or stream, translated if you like. Each connector shows what it sent or why it fails, and has a **Test** button. Links are kept with the secrets, and only each platform's own address is accepted. Guide: [docs/integrations.md](docs/integrations.md).
- **Webhooks:** each caption and/or each finished talk (with its transcript link), as JSON signed with HMAC-SHA256, to any system: an intranet, an archive, Zapier or Make.
- **Agenda import from Sessionize or a calendar link** (Google Calendar, Outlook, any `.ics`), on the Agenda page, with the same preview and undo as a pasted agenda. **Import again** re-reads it after changes. Tested against Sessionize's live demo event.
- **Deploy to Render, Fly.io or Railway** in a few minutes: `render.yaml` (a Deploy button in the README), `fly.toml` and `railway.json`, with a persistent disk and a server that never sleeps. On those platforms OpenCaptions finds its public address by itself.
- **Any language, without editing files.** The dashboard's **Settings → Languages** and the wizard's *Another language* add French, German, Japanese and 30-odd more (each by its own name). Then pick them in each room. A language a room still uses can't be removed by mistake.
- **Who can read transcripts is a dashboard setting:** **Settings → Transcripts for the audience** (only the talk in progress, every talk, or none).
- **The dashboard warns when the free public address changed** since the last start, so printed QR codes point nowhere, with a link to reprint them. The phone alert for it now also works across restarts.
- The wizard's summary warns when its address is `localhost`, which phones can't open, before anyone prints QR codes.
- New illustrations in the same hand-drawn style: the wizard's AI and phones steps have their own, the website's *Made for event day* section has three new panels (alerts on your phone, who's speaking, the event report) and its download section a picture, and an empty transcript library shows one instead of an icon.
- **A real demo on the website:** 30 seconds of a talk captioned live in Spanish, on the stage screen and on a phone, playing silently like a GIF on the website's dark band (no player controls, no frame). It's the real app with the AI played back from a recording, made by `npm run demo:record` (headless Chrome and ffmpeg), so it can be redone whenever the screens change.
- *How it works* has an illustration for each step (connecting the sound desk, the AI translating, everyone following along), and the feature cards' illustrations now fill the top of the card instead of sitting in a framed box.
- Three of the *Made for event day* panels are animated too (the laptop that keeps captioning offline, the phone that buzzes, the Q&A).
- The website's main illustration now moves: a five-second seamless loop (captions appearing on the phones and the stage screen, the audience reading), made with Higgsfield (Kling) from the illustration itself. About 100 KB each. Videos start only when they scroll into view, pause when they leave, and stay still for people who turn on "reduce motion".
- The QR posters show a small "scan me" pictogram next to the instructions, in black only so it prints anywhere. Posters still fit on one A4 page.
- **Guides on the website,** in English and Spanish, for what organizers search for: live captions for conferences, how to caption an event step by step, a FAQ (cost, accuracy, languages, offline use, privacy) and the captioning options compared. Each is an HTML fragment in `site/pages/<lang>/`; `scripts/site.js` gives it the shared layout and links it from the home page's footer. A test checks that every guide has its pair in the other language and that links resolve.
- The website tells search engines what it is: a generated sitemap (every page, both languages, and the demo video), `robots.txt`, and structured data (the app, the demo video, breadcrumbs, articles and the FAQ's questions).

- **[Licenses and responsibilities](docs/legal.md):** what OpenCaptions is made of and under which licenses, the AI providers' terms (including Gemini's free tier using data to improve Google's products), what organizers must tell speakers and the audience, and a ready-made notice in English and Spanish. The README, the FAQ and both event-day checklists point to it.

- **Privacy policy and accessibility statement** on the website, in English and Spanish, with a footer row that also links the code of conduct, the security policy and the license. The privacy policy describes visitor statistics only when they're turned on. A `security.txt` (RFC 9116) tells researchers how to report a vulnerability.
- **The accessibility check covers the website too:** `npm run a11y` builds it and checks every page in the sitemap. It found and we fixed a code box that keyboards couldn't scroll and two tables with an empty header.
- **By the numbers** on the website: measured facts (2–3 s from speech to caption, 150 phones in a rehearsal, about US$2.2 per room-hour, 10 rooms on a small server) that count up as they come into view.
- **Search engines:** organization and website structured data, descriptive image descriptions, a bilingual 404 page, an `llms.txt` summary for AI search tools, IndexNow notifications to Bing and others after every deploy, and optional Google and Bing verification codes and GoatCounter statistics through repository variables.
- **A lighter home page:** screenshots served as WebP and loaded only when the visitor gets near them, and the interface fonts preloaded. The home page went from 2.3 MB to under 1 MB.

### Changed

- **Just for me stays just for you.** The choice is remembered and the app opens straight to your captions. The personal page has **My transcripts** and a quieter **Use it for events** (it asks first) instead of a link to the event dashboard. In personal mode the room list and the transcript library show only your room, never an event's; in event mode your personal room and its transcripts stay private and out of the event's lists.
- **A level meter for each sound source** on the Just for me page: one for the microphone, one for the computer's sound, and both with **Both**, so you can see each one is heard. The meters now line up with the Start button.
- **Delete a transcript from its own page** (admin only, which includes anyone on the server computer), so personal users never need the event dashboard.
- **Sharper website:** every illustration has a 2× version for high-resolution screens (served only to them), and the animated loops are now 1600–1800 px wide instead of 960–1080. Upscaled with Higgsfield; the loops stay seamless. The audience, stage, organizer and Just for me illustrations no longer end in an empty band with cut-off legs.
- The website's phone mockup has its notch inside the screen, as on a real phone (it sat on the bezel, and turned light in dark mode).
- The transcript screenshot on the website and in the README shows the current page (line icons, not emoji). `npm run screenshots` retakes it from the real app.
- Transcript search says "1 match", not "1 matches" (and the same in Spanish and Portuguese).
- **Past transcripts are private by default.** The shipped `config/event.json` made every past talk public, though the docs (and the legal page) said only the talk in progress was. Organizers who want a public library choose it in Settings.
- **The crew no longer sees stream keys.** Audio addresses reach crew dashboards with only their scheme and host (`rtmp://host/…`): an RTMP key or SRT passphrase stays with the admins.
- **"Ask the talk" is limited per phone, not per venue.** Phones on one Wi-Fi share a public IP, so 6 questions a minute used to be shared by the whole audience. Now it's 6 per browser (a random id the page keeps), 60 per IP and 30 for the whole server.
- **One person guessing passwords no longer locks out the crew.** Failed sign-ins count per IP and browser (20 per 10 minutes), with a ceiling of 100 per IP.
- WebSocket connections allowed per IP per minute: 6000 (was 3000), so a full venue behind one IP reconnects at once after a restart.
- The glossary can only be read by the crew and admins (`GET /api/glossary`): it can hold names that aren't public yet.
- **Company sign-in with Microsoft's multi-tenant endpoint** (`/common/v2.0`) now requires `OIDC_TENANTS`: without it, any organization's accounts could claim an allowed email.
- **Downloads are pinned and checked:** `cloudflared` (in the app and the Docker image) and `yt-dlp` (Docker) are fixed versions verified against GitHub's SHA-256. GitHub Actions are pinned to commit hashes, and Dependabot (`.github/dependabot.yml`) keeps them and the npm packages current.
- **The website has a Content-Security-Policy:** only its own files, plus the statistics host when statistics are on. The app's pages allow YouTube only on the demo page.
- The live transcript page updates only the paragraph being written instead of rebuilding the whole transcript several times a second: smoother on phones during long talks, and a reader's selection and screen-reader position stay put.
- The agenda accepts `10h30` and `9h` times.
- The Mac app finds Node.js installed with nvm, fnm or volta.
- The server's "memory used" figure is right on macOS (it counted the file cache as used, so it read about 100 %).
- Updated `@google/genai`, `ws` and `dotenv` (minor versions).
- **Fonts are served by OpenCaptions itself** (`public/fonts/`, with their licenses) instead of Google Fonts. No page, including the audience's, sends visitors' addresses to Google any more (some courts in the EU found that unlawful without consent), the fonts work offline in local mode, and the Content-Security-Policy no longer allows Google's font servers. `scripts/fetch-fonts.js` updates them.
- The website names the warnings people actually see the first time they open the app ("could not verify" on a Mac, "protected your PC" on Windows).
- CI and release workflows use the current versions of GitHub's actions (no more Node.js 20 deprecation notices).

### Fixed

- The Windows app printed "[glossary] reload failed … ENOENT" at every start, because there's no glossary file until you save one. A missing glossary is now simply empty, and saving one later still applies it straight away.
- **Security: other websites could change settings through the server computer's browser.** On the computer running OpenCaptions no password is asked, and those requests skipped the check that refuses changes sent from another website. A page open in the organizer's browser could have restarted rooms, started a new talk or turned event mode on and off. Every change from a browser must now come from OpenCaptions' own pages. Scripts are unaffected. A test covers it.
- **Signing a device out now also cuts its open dashboard.** Before, a lost laptop that was signed out kept receiving the rooms' live status until someone reloaded its page.
- **The transcript library could freeze live captions.** Listing past talks re-read every saved transcript once per talk, on the thread that also sends captions: with 60 one-hour talks each visit to `/talks.html` took about 1.8 s, during which no captions went out. Summaries and recently read transcripts are now cached until their files change (0.2 s the first time, about 5 ms after).
- **A glossary typo could garble every caption.** A correction whose "from" was only `|` or spaces matched the empty string, so its replacement was written after almost every word of every live caption. Such corrections are now refused when saved and ignored if they're already in the file.
- With `RETENTION_DAYS` set, a stray file in the transcripts folder (such as the `.DS_Store` macOS Finder creates) crashed the server at startup.
- A crew member sending a room change they aren't allowed to make is refused before anything else happens. Their audio address used to be looked up on the network first.
- Transcript downloads build their file name only from safe characters. A link with a quote in the language could produce a broken `Content-Disposition` header.
- Five dashboard and demo messages stayed in Spanish for English users ("No se pudo iniciar", "(opcional)" and others): their dictionary entries had a space at the edge, which the lookup never matched.
- Renaming the event together with an invalid time zone renamed it in memory and in the history, but not on disk, and answered with an error. Now nothing changes unless everything is valid.
- Searching a transcript for "amp" or "lt" no longer garbles `&` and `<` in the text.
- **Linux service install:** the steps in `deploy/opencaptions.service` left `.env` owned by root with `chmod 600`, so the server (running as the `opencaptions` user) couldn't read it and silently ignored the passwords, public address and API key there. The steps now give the file to that user.
- `npm run setup` now makes `.env` readable only by you even when the file already existed (copied from `.env.example`). Before, only a new file got those permissions.
- **macOS room agent** (`deploy/com.opencaptions.agent.plist`): the ingest password moved from the command line, where any user could see it with `ps`, to `EnvironmentVariables`; the file is `chmod 600` when installed, and the steps say where `node` is on Apple Silicon Macs.
- A phone that went to sleep during a talk could show frozen captions when it woke up, until the connection timed out. The captions page now reconnects by itself after more than 20 seconds in the background and reloads what was said.
- The QR kit's warning about an address phones can't open now points to the dashboard's Settings instead of the `PUBLIC_URL` variable.
- **The sample talks are read by Kokoro now,** an open text-to-speech model (Apache-2.0). They used to be made with the voices built into macOS, whose license doesn't allow sharing what they say. Same scripts and length; Whisper still transcribes them with no errors. `scripts/make-samples.sh` rebuilds them on any system with Python and ffmpeg.
- The documentation link test used a JavaScript feature missing from Node.js 20, so CI failed there.

## [0.2.0] - 2026-10-04

The release that makes OpenCaptions ready for organizers who don't use a terminal, and safe to hand to a crew.

**Highlights**

- **Start without the terminal:** download the Mac app or the Windows launcher from the release page and open it, or run the published Docker image. The welcome wizard asks for the event, the rooms and the languages, connects Gemini with your API key and creates a public HTTPS address for the QR codes.
- **A dashboard you can't break by accident:** Event mode, history with undo, a trash for rooms, a review step in the wizard.
- **Safer sign-in:** sessions instead of passwords in the browser, a crew role for volunteers, two-factor codes, company sign-in (Google, Microsoft, any OpenID Connect provider).
- **For event day:** alerts on your phone, who's-speaking labels, an event report, an offline backup when the internet drops.
- **Accessibility:** every page passes WCAG 2.2 AA checks (axe-core), and screen readers read each caption once.

### Added — a production dashboard that protects the event manager's work

- **New dashboard layout:** a sidebar with Live, Rooms, Agenda, Glossary, Screens and QR, Transcripts, History and Settings. The Live view shows only what matters during the event; setup tools moved to their own pages, and the AI switch and setup wizard to Settings.
- **Event mode:** locks the setup on the server while the event is live (`POST /api/lock`; setup endpoints answer `423`). Starting the next talk, renaming the current one, reconnecting a room and the AI switch keep working.
- **History and undo:** every setup change (rooms, agenda, glossary, event name, AI mode) is recorded in `data/history.jsonl` with what it replaced, and can be undone (`GET /api/history`, `POST /api/history/:id/undo`). Each save shows an **Undo** button right away. Deleted rooms go to a trash and can be restored exactly as they were.
- **Overrun alert:** when the agenda says a new talk has started but the speaker is still going, the room's card says how many minutes over it is and offers **Start "…"** with one click (`dueTalk` in the room status).
- **Safer editing:** real confirmation dialogs instead of browser pop-ups; pasting an agenda shows what will be added and removed before replacing it (`PUT /api/schedule?dryRun=1`); the glossary is a table of terms and corrections instead of raw JSON.
- **The setup wizard no longer deletes anything silently:** it collects answers, then shows a review of every change. Rooms with transcripts are only removed if ticked, rooms with their own language setup keep it unless ticked, and nothing can be applied in Event mode.

### Added — set up from the browser, no terminal needed

- **API key in the dashboard:** the welcome wizard's AI step and **Settings → Gemini** explain where to get a key, check it with Google and connect it. Rooms on simulated captions switch to Gemini right away. The key is kept in `data/secrets.json` (mode 600), wins over `GEMINI_API_KEY`, and is never sent to a browser. Errors are explained (wrong format, rejected, project can't use Gemini, no free quota left, no internet with "Save it anyway"). `POST /api/ai/key/check`, `PUT` and `DELETE /api/ai/key`.
- **One-click public address:** the wizard's new "Phones" step and **Settings → Public address** start Cloudflare Tunnel: a free `trycloudflare.com` HTTPS address with no account, or a fixed address on your own domain with a tunnel token. `cloudflared` is downloaded the first time (the Docker image includes it). The link appears once it answers from the internet; it comes back after a restart, reconnects if `cloudflared` stops, and warns when a quick address changed. `POST /api/tunnel`, `TUNNEL`, `TUNNEL_HOST`, `CLOUDFLARED_PATH`. See [Deployment](docs/deployment.md#one-click-public-address).
- **QR codes never point at `localhost`:** without a public address, a dashboard opened as `localhost` gives phones this computer's Wi-Fi address.
- **Desktop downloads:** every release attaches `OpenCaptions-mac.zip` (an app with the OpenCaptions icon) and `OpenCaptions-windows.zip` (`Start OpenCaptions.exe`, a small launcher with the icon, built in CI). They point to the Node.js download if it's missing, install the libraries the first time, start the server in a terminal window and open the dashboard; started twice, they just reopen it. Data is kept outside the app (`~/Library/Application Support/OpenCaptions/data`, `%LOCALAPPDATA%\OpenCaptions\data`), so updating is replacing the app. Developers use `npm run app`; `--open` on the server opens the dashboard. Built with `npm run package`; see [ADR 0011](docs/adr/0011-desktop-launchers.md).
- **Published Docker image:** `ghcr.io/carraroesteban/opencaptions` (amd64, arm64), built by `.github/workflows/docker.yml` on every push to `main` and every `v*` tag. Runs with `docker run` and two named volumes, nothing to clone or build.
- The setup checklist and the "Simulated mode" badge now lead to Settings instead of `.env`.

### Added — for event day

- **Alerts on your phone:** when nobody is looking at the dashboard, OpenCaptions sends a message through the free ntfy app, Telegram, Slack, Discord or any webhook: a room's audio disconnected or silent, a muted microphone, the AI failing, translations throttled, captions running late, a talk 5 minutes past the agenda, the offline backup switching, no internet, the public address down or changed. Each problem once when it has lasted a little, and once more when it's over; no alerts for rooms the agenda says are off; at most 20 messages per 10 minutes; pause for an hour or until tomorrow. **Settings → Alerts**, `/api/alerts`. Messages in Spanish or English.
- **Who's speaking:** a tap on the room card (the agenda's speakers, the host, the audience in Q&A, or any name) labels the captions from then on. Phones show the name when the speaker changes, transcripts start a new paragraph, WebVTT exports get voice tags (`<v Ana Pérez>`), SRT and TXT name the speaker. `POST /api/stages/:id/speaker`. Gemini Live doesn't tell voices apart, so people set it.
- **Event report** (`/report.html`, from Dashboard → Transcripts): every talk with its length, words, caption languages, peak audience, reading minutes and AI cost, per room and in total, for one day or the whole event. Print it or save it as a PDF, or download a CSV that opens in Excel with its accents. `GET /api/report`, `/api/report.csv`.
- **Accessibility check:** `npm run a11y` runs axe-core (WCAG 2.2 AA) on every page, in light and dark, Spanish and English; CI runs it on every push. It found and we fixed: icon-only and unlabeled controls, faint text in the setup checklist and on the stage screen (the light theme's warning colour is a little darker now), missing headings and page regions, and an image with an empty description. Screen readers now read each caption once, when it's final, instead of every word as the line is rewritten. See [Accessibility](docs/accessibility.md).
- **A clear message when Docker can't write its data folder** (the usual Linux permissions problem), with the `chown` command to fix it, instead of a crash.

### Changed — security

- **Strict styles in the Content-Security-Policy:** no more `style=""` attributes (utility classes instead) and no `'unsafe-inline'`; each page's own `<style>` block is allowed by its hash. Injected markup can't restyle a page. A test fails if one comes back.
- **No passwords in WebSocket URLs:** browsers on room computers get a one-minute, single-use ticket (`POST /api/ingest/ticket`) for the audio socket; the dashboard uses its session cookie. `?token=` is refused on sockets. The agent already sent its password in a header.
- The security diagram shows the admin, crew and ingest roles.

### Added — safer dashboard sign-in

- **Sessions instead of a password in the browser:** signing in exchanges the password for an `HttpOnly`, `SameSite=Strict` session cookie that expires (`SESSION_HOURS`, 24 by default). Nothing is kept in `localStorage`; an old `?token=` link is exchanged and removed from the address bar. Changes made with a session must come from the dashboard's own `Origin`.
- **A crew role:** a third password, `CREW_TOKEN` (generated if unset), opens only the live controls (next talk, rename the current talk, reconnect a room, stop a pull, the offline-backup switch) and read-only views. Everything else answers `403`.
- **Settings → Access:** signed-in devices with their names and last activity (sign out one, or every other one), changing generated passwords (shown once; devices signed in with the old one are signed out), two-factor sign-in, and company sign-in status. The History now records who made each change.
- **Two-factor sign-in:** a 6-digit authenticator code on top of the admin password (standard TOTP; each code works once). While on, the admin password alone opens nothing, not even in a script's header.
- **Company sign-in (OpenID Connect):** Google Workspace, Microsoft Entra ID, Okta, Auth0, Keycloak… with PKCE and full ID-token checks, no new dependencies. `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_ADMINS`, `OIDC_CREW`, `OIDC_ONLY`. See [Security](docs/security-guide.md#company-sign-in).
- New sign-in screen in Spanish and English, with the device's name and the code step; `/api/auth/*` endpoints (see the [API reference](docs/reference/api.md#sign-in)).

### Changed — terminal and website

- **A friendlier terminal:** the server's startup screen shows the brand badge, a "Ready" line and what matters (dashboard, the address phones use, rooms, AI, passwords). `npm run local` shows spinners while servers load and progress bars with speed and time left for model downloads; the double-click starter shows a spinner instead of npm's output. Plain text when the output isn't a terminal, or with `NO_COLOR`. Shared code in `src/tty.js`, with no dependencies.
- **Website copy in Spanish rewritten** so it reads naturally instead of translated ("Gobierno y sesiones públicas" instead of "Sesiones públicas y concejos", "Preguntá sobre la charla", "Pantalla junto al escenario"…), and its event-day button now opens the Spanish guide. A few English sentences polished. The "Read the documentation" button pointed to a missing anchor.

### Changed — a new install starts blank

- `config/event.json` now ships with no event name and one room ("Main stage"); the welcome wizard asks for the rest. `config/glossary.json` ships empty, so no example names are sent to the AI as vocabulary. The old example glossary is in `config/glossary.example.json`.
- The dashboard and the wizard ask for the admin token with a sign-in screen that explains where to find it, and check it before saving, instead of a browser pop-up (cancelling the pop-up left an empty dashboard).
- Docker prints a dashboard link that signs in directly (`docker compose logs opencaptions | grep "Open the dashboard"`).

### Fixed

- WebVTT exports escape `&`, `<` and `>` in captions, as the format requires: a caption with "Q&A" made the file invalid for some players.
- `docker compose up` failed on a new install with "required variable TUNNEL_TOKEN is missing a value", even without the tunnel.

### Changed — a tidier project

- **Fewer files at the top of the repository:** the double-click starters moved into the desktop packaging (`deploy/desktop/`), and the contributing guide, security policy and code of conduct into `.github/`, where GitHub still finds them.
- **Time zone from the browser:** the welcome wizard offers the organizer's time zone and saves it (`data/setup.json`); the example `config/event.json` no longer sets one, so agendas no longer assumed Buenos Aires time. A `TZ` set in the environment still wins.
- **Lost the phone with the two-factor codes?** On the server computer itself, Settings → Access can turn two-factor sign-in off without a code.
- Documentation reviewed against the current dashboard (labels, sign-in, roles, downloads), two new ADRs ([0010](docs/adr/0010-sessions-roles-and-company-sign-in.md), [0011](docs/adr/0011-desktop-launchers.md)), and a test that fails when a link or anchor in the Markdown files breaks.
- Unused interface translations removed; `package.json` has a description, homepage, repository and keywords.

### Changed — tests

- Tests run against their own fictional event (`test/fixtures/event.json`, `test/fixtures/glossary.json`) and never read or write `config/`.

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
- The setup wizard asks which AI engine to use (Gemini, local or demo); the dashboard shows a local chip and tells you what's missing (speech server down, Ollama not running, model not downloaded).

### Added — making it easy for people

- **What did I miss?** on the audience page: a summary of the last 5 minutes (or the whole talk) in the viewer's language, generated from the transcript and cached for everyone.
- **Ask the talk:** questions answered only from what was said, with quotes and timestamps; says so when the answer isn't there.
- **Transcript page** (`/talk.html`): paragraphs with timestamps, search with highlights, language switch, TXT/SRT/VTT download, copy link, print; updates live while the talk runs.
- **Transcript library** (`/talks.html`) of every talk, searchable by title, speaker or room (`publicTranscripts` in `config/event.json`).
- **Reading settings** on the audience page: text size, high-legibility fonts (Atkinson Hyperlegible, Lexend), line spacing, light/dark/automatic theme.
- **Agenda:** paste the schedule as CSV; rooms name their talks (title + speaker) automatically and wait for a pause before switching. "Up next" on the room list and dashboard. Event time zone setting.
- **QR kit** (`/kit.html`): printable bilingual A4 posters per room.
- **`npm run setup`:** a one-minute wizard that writes `.env` and `config/event.json` and prints the next steps.
- Dashboard **getting-started checklist**, agenda editor, links to the kit and library, live transcript link per room.

### Added — product polish

- **App identity:** icon, favicon, home-screen icon, installable web app manifest (named after the event), and link previews with an image for WhatsApp, Slack and LinkedIn. The logo on every secondary page links back to the dashboard (operator pages) or the room list (audience pages).
- **Floating captions** on the audience page (desktop): an always-on-top window over the livestream, the slides or a video call. Chrome and Edge use Document Picture-in-Picture (resizable, follows the reading settings); other browsers fall back to video picture-in-picture.
- **README** rewritten in the style of well-known self-hosted projects (logo, badges, one hero image, quick start without an API key, install options, supported-platforms table, cost, documentation map) with a new, consistent screenshot set in `docs/images/`.
- **Setup wizard:** numbered questions, a check that the API key looks like a Gemini key, this computer's LAN address (instead of `localhost`) in the links for other devices, and a one-line sample feed to try it without audio hardware.
- **Agenda from Swapcard / Sessionize / Sheets:** paste the export straight from Excel or Google Sheets. Columns are recognized by their header (English or Spanish), rooms by name ("Sala A - Planta baja" → `sala-a`), dates in `DD/MM/YYYY`, US, ISO or `HH:MM` form, and rows for rooms without captions are skipped and reported instead of failing the import.
- **The agenda is context for the AI:** the current and next talk's title and speaker names go into the recognizer's vocabulary and the translator's glossary, so names are spelled right and not translated.
- **Bilingual stream overlay:** `overlay.html?…&also=en` (or `orig`) adds a smaller second line in another language, for streams watched in more than one language; also in the style editor (*Second line*). It never repeats the same words twice.
- **Floating mini-dashboard** for operators: every room's status, alerts and last line in an always-on-top window over OBS or vMix. Clicking a room jumps to its card.

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
