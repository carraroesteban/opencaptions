# Event-day runbook

This runbook takes a production team from the day before the event to the end of each day. The goal is **no dedicated operator per room**: one person watches the dashboard and acts only when an alert appears.

A shorter Spanish version for venue crews is in [event-day.es.md](event-day.es.md). For specific symptoms, see [Troubleshooting](troubleshooting.md).

## Roles

| Role | Responsibilities |
|---|---|
| Server owner | Server, HTTPS, tokens, Gemini billing and quotas |
| Room tech (one per 3–5 rooms) | Venue PCs, audio cables, projector and overlay setup, sound check |
| Production operator | Watches `/admin.html` during talks, titles talks, reacts to alerts |

## One day before

### Server

- [ ] Run `npm run setup` (event name, rooms, languages, API key, tokens) — or edit `.env` and `config/event.json` by hand.
- [ ] Choose a topology and deploy the server ([Deployment](../deployment.md)).
- [ ] Set up HTTPS and set `PUBLIC_URL` to the final address.
- [ ] Set `ADMIN_TOKEN` and `INGEST_TOKEN` to long random values (`openssl rand -base64 24`). Store them in the team's password manager.
- [ ] Walk through the [hardening checklist](../security-guide.md#hardening-checklist).
- [ ] Enable billing on the Gemini project and set a budget alert.
- [ ] Check the concurrent Live session limit for your tier. Run a full-scale test with `npm run multi -- --rooms <N> --minutes 3`.
- [ ] If the limit is below your room count, shard rooms across projects ([Deployment](../deployment.md#capacity-and-sharding)).

### Rooms and glossary

- [ ] Create the rooms in `config/event.json` or with **Dashboard → + Room**.
  - `source`: `"auto"` for rooms where hosts or speakers switch language (Spanish-speaking hosts introducing an English talk, Q&A in both languages). Pin it (`"en"`, `"es"`) only when the whole talk is in one language. In both cases, when the speaker switches language every caption track follows: Spanish viewers get Spanish, English viewers get English.
  - `targets`: the caption languages, for example `["es"]` for English talks.
- [ ] Fill the glossary (**Dashboard → Glossary** or `config/glossary.json`) with speaker names, sponsors, products and acronyms from the schedule. Changes apply immediately.
- [ ] Design the caption style once in `/style.html` and copy the generated overlay and projector URLs.
- [ ] Paste the agenda in **Dashboard → 📅 Agenda**. From Swapcard or Sessionize: export the sessions to Excel or Google Sheets, select everything including the header row, copy and paste. Columns are found by their header, rooms by their name, and rows for rooms without captions are skipped. By hand: CSV `room,time,title,speaker` (see `config/schedule.example.csv`). Talks then get their title and speaker automatically, and speaker names and titles are passed to the recognizer and the translator so they're spelled right; a room waits for a pause before switching, so a speaker who runs late is never cut.
- [ ] Print the QR posters: **Dashboard → 🖨 QR kit** (`/kit.html`), one bilingual A4 poster per room. Check the warning at the top: the QR must point to the public HTTPS address, not `localhost`.
- [ ] Decide what the audience can read afterwards: `publicTranscripts` in `config/event.json` (`all` = every talk in the library, `current` = only the talk in progress).

### Rehearsal

- [ ] `npm run loadtest -- --stages <N>` with the mock engine, or `npm run multi` with real talks. Watch the dashboard's CPU, memory and latency.
- [ ] Run the venue network test from [Networking](../networking.md#restricted-venue-networks).

## Two hours before: set up each room

Choose one audio path per room:

| Option | When | Per-room hardware |
|---|---|---|
| **A. Pull the stream** | The desk already feeds vMix or OBS | None. **Dashboard → ⚙ → Audio pull**: `rtmp://0.0.0.0:1935/live/<room>` and point OBS/vMix at it (*Stream → Custom → `rtmp://<server>:1935/live`*, key `<room>`), or `srt://…` / `https://…m3u8`. An HLS stream on the LAN needs `PULL_ALLOW_PRIVATE=1`. |
| **B. Headless agent** (recommended with a PC) | Audio arrives by cable at a PC | Mini PC running `scripts/agent.js` as a service, with no browser |
| C. Browser ingest page | Quick or emergency setup | Any PC with Chrome |

**B. Headless agent:**

```bash
node scripts/agent.js --list-devices
node scripts/agent.js --stage <room> --device <n> --server wss://<server> --token <INGEST_TOKEN>
```

Install it as a service so it survives reboots ([Deployment](../deployment.md#run-the-agent-as-a-service)). Useful options:

- `--channel left|right` when the desk sends different content on each channel.
- `--gain 1.5` for a quiet feed.

**C. Browser page:**

1. Open `https://<server>/ingest.html?stage=<room>&token=<INGEST_TOKEN>` in Chrome. The token is saved and removed from the address bar.
2. Choose the input and channel, and tick **Auto-start**.
3. For an unattended kiosk, run:

   ```
   chrome --kiosk --autoplay-policy=no-user-gesture-required --use-fake-ui-for-media-stream "https://<server>/ingest.html?stage=<room>&autostart=1"
   ```

**Displays:**

- Projector: `https://<server>/screen.html?stage=<room>` full screen, or the URL from the style editor.
- vMix: a *Web Browser* input at 1920×1080 with `https://<server>/overlay.html?stage=<room>&lang=es`, used as an overlay on the program output. OBS: *Browser Source* with the same URL. Use one overlay per language or stream. For a mixed-language audience add `&also=en` (or `&also=orig`): a smaller second line in that language under the main one. It hides itself while both lines would show the same words.

## Sixty minutes before: sound check (per room)

With someone speaking into the stage microphone, or with a handheld mic on `/demo.html?mode=mic&stage=<room>`:

- [ ] The level meter moves with the voice without clipping. Adjust the gain.
- [ ] On the dashboard the room is **LIVE** and the session chips are green.
- [ ] The original text and the translation appear within about 5 seconds.
- [ ] The projector shows captions, and the QR code scans from the back of the room.
- [ ] A phone scanning the QR code gets captions in the chosen language.
- [ ] vMix or OBS shows the overlay on the program output.
- [ ] After 30 s of silence the room shows **PAUSED · silence**. Speaking resumes it.

## During talks

There's nothing to press. If you're also running OBS or vMix, press **📌 Float** on the dashboard (Chrome or Edge): every room's status and alerts stay on top of the production software, and clicking a room jumps to it.

The system:

- stops sending audio to the model after 30 s of silence and resumes with 600 ms of pre-roll, so the first word isn't cut;
- closes model sessions after 5 minutes without speech and starts a new transcript when speech returns;
- renews the Gemini session before its connection limit without losing audio;
- restarts a session if there's speech but no text for 20 s;
- falls back to Live Translate's own captions while text translation is throttled.

Optionally, use **+ New talk** with the talk title. The title appears on screens and in the export file names.

### Tell the audience

Say it once at the start of each talk (or put it on the break slides): *"Live captions and translation on your phone: scan the QR. Arrived late? Tap ✨ What did I miss?"*

### Dashboard alerts

| Alert | Meaning | Action |
|---|---|---|
| **No ingest** | The room isn't sending audio | Check the agent service or the ingest page. After a reboot, autostart brings it back. |
| **No audio** | Connected, but no audio packets arriving | Check the venue PC's network. Restart the agent or reload the page. |
| **Muted?** | 60 s of near-silence | Check the desk fader, the cable and the selected input. |
| **Reconnecting** | The Gemini session is reconnecting | Wait about 5 s. If it persists, press ↻ on the room. Audio is buffered for 12 s. |
| **High latency** | Transcription more than 6 s behind | Normal for a few seconds after a reconnect. If it persists, press ↻ and check the server's network. |
| **Translation throttled** | Text translation hit a quota limit (429) | Automatic fallback is active. If frequent, raise the tier or set `MT_PARTIAL_MS=3000`. |
| Misspelled names | Speaker, product or acronym | **Dashboard → Glossary** → add a replacement. It applies instantly. |
| Wrong language | The talk isn't in the configured language | **Dashboard → ⚙ → Talk language** → `auto` (switches are handled live) |

### Plan B

| Failure | What happens | What to do |
|---|---|---|
| A room loses network | The agent buffers about 15 s and resends | If it lasts longer, connect the PC to a 4G/5G hotspot. |
| The server loses network | No captions until it returns. Pages reconnect by themselves. | Topology B avoids venue outages affecting the server. |
| Server restart | Screens, phones and agents reconnect by themselves. Saved transcripts stay in `data/`. | `docker compose restart` or restart the service |
| The browser hangs on a venue PC | No audio from that room | Reopen the URL. Kiosk mode with autostart recovers by itself. The agent avoids this entirely. |
| Gemini outage or credit exhausted | Captions stop. The dashboard shows the error per room, and the server keeps retrying. | Check status and billing in AI Studio. Show a slide explaining captions are temporarily unavailable. |
| Suspected token leak | Unknown ingest replaces a room's audio | Follow [Responding to a leaked token](../security-guide.md#responding-to-a-leaked-token). |

## End of each day

- [ ] The audience keeps every transcript at `/talks.html` (read, search, summary, download) if `publicTranscripts` is `all`.
- [ ] **Dashboard → Transcripts** per room: SRT or VTT to upload with the videos, TXT for the blog or accessibility archive.
- [ ] Back up `data/`.
- [ ] Compare the day's estimated cost on the dashboard with **AI Studio → Usage**.

## Quick URL reference

| For | URL |
|---|---|
| Audience (QR) | `/s/<room>`. On a laptop, **⧉** floats the captions over any other window. |
| Room list | `/` |
| Transcript of the talk in progress | `/talk.html?stage=<room>` |
| Transcript library | `/talks.html` |
| QR posters | `/kit.html` |
| Projector | `/screen.html?stage=<room>` |
| vMix/OBS overlay | `/overlay.html?stage=<room>&lang=es` |
| Browser ingest | `/ingest.html?stage=<room>&autostart=1` (add `&token=` the first time) |
| Dashboard | `/admin.html` (add `?token=` the first time from another device) |
| Sound check / live demo | `/demo.html?mode=mic&stage=<room>` |
| Caption style editor | `/style.html` |
| Prometheus metrics | `/metrics` with `Authorization: Bearer <ADMIN_TOKEN>` |
