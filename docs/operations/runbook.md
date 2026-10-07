# Event-day runbook

This runbook takes a production team from the day before the event to the end of each day. The goal is **no dedicated operator per room**: one person watches the dashboard and acts only when an alert appears.

<p align="center"><img src="../../public/art/stage.webp" width="640" alt="A speaker on stage with captions on the screen behind them" /></p>

A shorter Spanish version for venue crews is in [event-day.es.md](event-day.es.md). For specific symptoms, see [Troubleshooting](troubleshooting.md).

## Roles

| Role | Responsibilities |
|---|---|
| Server owner | Server, HTTPS, passwords and sign-in, Gemini billing and quotas |
| Room tech (one per 3–5 rooms) | Venue PCs, audio cables, projector and overlay setup, sound check |
| Production operator | Watches `/admin.html` during talks (signed in with the crew password), labels speakers, starts talks that run over, reacts to alerts |

## One day before

### Server

- [ ] Start OpenCaptions (the Mac app, the Windows launcher, `npm start` or Docker) and go through the welcome wizard: event name, rooms, languages, the Gemini API key and the public address. From the terminal, `npm run setup` does the same.
- [ ] Choose a topology and deploy the server ([Deployment](../deployment.md)).
- [ ] Set up HTTPS: **Settings → Public address** (use your own domain for the event: a quick address changes on every restart), or your own proxy with `PUBLIC_URL` set to the final address.
- [ ] Note the three passwords from the startup window (admin, crew, room computers), or set your own with `ADMIN_TOKEN`, `CREW_TOKEN` and `INGEST_TOKEN` (`openssl rand -base64 24`). Store them in the team's password manager.
- [ ] Set up **alerts on your phone** (Settings → Alerts: the free ntfy app takes two minutes) and send a test.
- [ ] Give volunteers and technicians the **crew password** (live controls only), not the admin one. Turn on **two-factor sign-in** in Settings → Access.
- [ ] Walk through the [hardening checklist](../security-guide.md#hardening-checklist).
- [ ] Enable billing on the Gemini project and set a budget alert.
- [ ] **Tell speakers and the audience** that talks are captioned by AI, where the audio is processed and whether transcripts are published (a ready-made notice is in [Licenses and responsibilities](../legal.md#notice-template)). Turn off public transcripts for talks that shouldn't be published.
- [ ] Check the concurrent Live session limit for your tier. Run a full-scale test with `npm run multi -- --rooms <N> --minutes 3 --playlist <url>`.
- [ ] If the limit is below your room count, shard rooms across projects ([Deployment](../deployment.md#capacity-and-sharding)).

### Rooms and glossary

- [ ] Create the rooms with the welcome wizard or **Dashboard → Rooms**.
  - `source`: `"auto"` for rooms where hosts or speakers switch language (Spanish-speaking hosts introducing an English talk, Q&A in both languages). Pin it (`"en"`, `"es"`) only when the whole talk is in one language. In both cases, when the speaker switches language every caption track follows: Spanish viewers get Spanish, English viewers get English.
  - `targets`: the caption languages, for example `["es"]` for English talks.
- [ ] Fill the glossary (**Dashboard → Glossary** or `config/glossary.json`) with speaker names, sponsors, products and acronyms from the schedule. Changes apply immediately.
- [ ] Design the caption style once in `/style.html` and copy the generated overlay and projector URLs.
- [ ] Paste the agenda in **Dashboard → Agenda**; it shows what will change before you save. From Swapcard or Sessionize: export the sessions to Excel or Google Sheets, select everything including the header row, copy and paste. Columns are found by their header, rooms by their name, and rows for rooms without captions are skipped. By hand: CSV `room,time,title,speaker` (see `config/schedule.example.csv`). Talks then get their title and speaker automatically, and speaker names and titles are passed to the recognizer and the translator so they're spelled right; a room waits for a pause before switching, so a speaker who runs late is never cut.
- [ ] Print the QR posters: **Dashboard → Screens and QR → QR kit** (`/kit.html`), one bilingual A4 poster per room. Check the warning at the top: the QR must point to the public HTTPS address, not `localhost`.
- [ ] Decide what the audience can read afterwards: **Settings → Transcripts for the audience** (*Only the talk in progress*, the default; *Every talk*, after the speakers agree; or *None*).

### Rehearsal

- [ ] `npm run loadtest -- --stages <N>` with the mock engine, or `npm run multi` with real talks. Watch the dashboard's CPU, memory and latency.
- [ ] Run the venue network test from [Networking](../networking.md#restricted-venue-networks).

## Two hours before: set up each room

Choose one audio path per room:

| Option | When | Per-room hardware |
|---|---|---|
| **A. Pull the stream** | The desk already feeds vMix or OBS | None. **Dashboard → Rooms → Edit → Audio pull**: `rtmp://0.0.0.0:1935/live/<room>` and point OBS/vMix at it (*Stream → Custom → `rtmp://<server>:1935/live`*, key `<room>`), or `srt://…` / `https://…m3u8`. An HLS stream on the LAN needs `PULL_ALLOW_PRIVATE=1`. |
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

1. Open `https://<server>/ingest.html?stage=<room>&token=<INGEST_TOKEN>` in Chrome. The room computer keeps the password and removes it from the address bar; the audio connection uses a one-minute ticket, never the password.
2. Choose the input and channel, and tick **Auto-start**.
3. For an unattended kiosk, run:

   ```
   chrome --kiosk --autoplay-policy=no-user-gesture-required --use-fake-ui-for-media-stream "https://<server>/ingest.html?stage=<room>&autostart=1"
   ```

**Backup audio (recommended for main rooms):** a second computer on another output of the sound desk (or the same
computer with a second interface) for the same room. On the audio page tick **This is the room's backup**, or run the
agent with `--backup`. It stays on standby and takes over by itself when the main source stops sending (3 s) or goes
silent while the backup still hears the room (20 s), for example a pulled fader or a loose cable. The main source takes
back over after 10 s of healthy sound. The room card says which one is on air, and the **using the backup audio** alert
tells you it happened.

**Displays:**

- Projector: `https://<server>/screen.html?stage=<room>` full screen, or the URL from the style editor.
- vMix: a *Web Browser* input at 1920×1080 with `https://<server>/overlay.html?stage=<room>&lang=es`, used as an overlay on the program output. OBS: *Browser Source* with the same URL. Use one overlay per language or stream. For a mixed-language audience add `&also=en` (or `&also=orig`): a smaller second line in that language under the main one. It hides itself while both lines would show the same words.
- **Captions in sync with the video:** captions reach the overlay 2–3 s after the words are spoken. To have them line up with the speaker's lips on the stream, delay the camera and microphone sources by the room's delay shown on the dashboard (OBS: a *Render Delay* filter on the video sources and *Sync Offset* in Advanced Audio Properties; vMix: *Delay* on the input). Captions sent to YouTube Live are already timed to when the words were said.
- **Breaks from the vision mixer:** in **Dashboard → Integrations → Breaks from the vision mixer**, connect vMix (Web Controller, port 8088) or OBS (WebSocket server, port 4455) for each room. When the program output switches to a scene or input whose name says break (Break, Pausa, Intervalo, Publicidad, BRB, Starting soon…), that room's captions pause and its screens show the break; switching back resumes them.

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

There's nothing to press. If you're also running OBS or vMix, open **Floating window** in the dashboard’s **Screens and QR** (Chrome or Edge): every room's status and alerts stay on top of the production software, and clicking a room jumps to it.

The system:

- stops sending audio to the model after 30 s of silence and resumes with 600 ms of pre-roll, so the first word isn't cut;
- closes model sessions after 5 minutes without speech and starts a new transcript when speech returns;
- renews the Gemini session before its connection limit without losing audio;
- restarts a session if there's speech but no text for 20 s;
- falls back to Live Translate's own captions while text translation is throttled.

Turn on **Event mode** (bottom of the dashboard's sidebar, or **Settings**) when doors open. It locks the setup on the server: nobody can delete or change rooms, the agenda, the glossary or the event name by accident. Everything you need during talks keeps working: starting the next talk, renaming the current one, reconnecting a room and the AI switch.

**Breaks:** press **Break** on the room card (or **B** on the room's audio page) for an intermission, ads or anything that shouldn't be captioned; the screens and phones show the break, when the talk resumes and the next talk. **Resume captions**, **Next talk**, or the next talk's start in the agenda ends it. Breaks in the agenda (coffee, lunch: titles with no speaker, or Sessionize service sessions) start by themselves once the room is quiet, and end early if people speak for a while. If a break someone started by hand goes on while people are speaking, the card warns you.

**Music:** walk-in music, a sponsor video or a song between talks is recognized after about 10 s and not captioned (♪ on screens and the overlay, at no cost); captions come back as soon as someone speaks. If a talk with a soundtrack is taken for music, press **It's a talk: caption anyway** on the card.

**Fixing a caption:** **See details → Fix captions** lists the latest sentences; correct one and it changes on every screen, phone and the transcript at once. If you changed a single word (a speaker's name), you're offered to always write it that way: it goes to the glossary, and can be undone from History.

**Who's speaking:** on each room card, tap the speaker's name (the agenda's speakers are listed), **Host**, **Audience (Q&A)** or **Other…**. Captions on phones, the transcript and the subtitle files name the speaker from then on.

When a speaker runs over, the room's card turns orange and says which talk is due. Press **Start "…"** when the next speaker begins, or let the room switch by itself at the next pause. **Next talk** starts one by hand, with the title and speaker from the agenda already filled in.

If something was changed by mistake, open **History** and press **Undo** on that change: deleted rooms come back exactly as they were, and the agenda and glossary return to the previous version. Transcripts are never deleted.

### Tell the audience

Say it once at the start of each talk (or put it on the break slides): *"Live captions and translation on your phone: scan the QR. Arrived late? Tap What did I miss?"*

### Dashboard alerts

With **alerts on your phone** set up (Settings → Alerts), the ones that last reach you wherever you are: a room without audio for a minute, the AI failing, a talk 5 minutes over, no internet.

| Alert | Meaning | Action |
|---|---|---|
| **No ingest** | The room isn't sending audio | Check the agent service or the ingest page. After a reboot, autostart brings it back. |
| **No audio** | Connected, but no audio packets arriving | Check the venue PC's network. Restart the agent or reload the page. |
| **Muted?** | 60 s of near-silence | Check the desk fader, the cable and the selected input. |
| **Reconnecting** | The Gemini session is reconnecting | Wait about 5 s. If it persists, open the room's details and press **Reconnect AI**. Audio is buffered for 12 s. |
| **High latency** | Transcription more than 6 s behind | Normal for a few seconds after a reconnect. If it persists, press **Reconnect AI** and check the server's network. |
| **Translation throttled** | Text translation hit a quota limit (429) | Automatic fallback is active. If frequent, raise the tier or set `MT_PARTIAL_MS=3000`. |
| **Using the backup audio** | The main source stopped or went silent; the backup is on air | Check the main computer, its cable and the desk output. It takes back over by itself after 10 s of sound. |
| **Someone speaking during the break** | A break set by hand (or by the vision mixer) while people speak | If the talk started, press **Resume captions**. |
| **Music · paused** | Music detected in the room | Nothing to do. If it's actually a talk, press **It's a talk: caption anyway**. |
| Misspelled names | Speaker, product or acronym | **Fix captions** on the room card, and accept "always write it this way"; or **Dashboard → Glossary** → add a replacement. It applies instantly. |
| Wrong language | The talk isn't in the configured language | **Dashboard → Rooms → Edit → Talk language** → *Detect automatically* (switches are handled live) |

### Plan B

| Failure | What happens | What to do |
|---|---|---|
| A room loses network | The agent buffers about 15 s and resends | If it lasts longer, connect the PC to a 4G/5G hotspot. |
| The server loses network | With the [offline backup](../local.md#offline-backup), captions move to this computer in about 15 s and back when the connection is stable. Without it, no captions until it returns; pages reconnect by themselves. | Start with `npm run local -- --fallback` at venues with shaky internet. Topology B avoids venue outages affecting the server. |
| Server restart | Screens, phones and agents reconnect by themselves. Saved transcripts stay in `data/`. | `docker compose restart` or restart the service |
| The browser hangs on a venue PC | No audio from that room (or the backup takes over, if the room has one) | Reopen the URL. Kiosk mode with autostart recovers by itself. The agent avoids this entirely. Set the room computers' power settings to never sleep: the audio page keeps the screen on only on localhost or HTTPS. |
| Gemini outage or credit exhausted | Captions stop. The dashboard shows the error per room, and the server keeps retrying. | Check status and billing in AI Studio. Show a slide explaining captions are temporarily unavailable. |
| Suspected password leak | An unknown source replaces a room's audio, or an unknown device is signed in | Follow [Responding to a leaked password or a lost device](../security-guide.md#responding-to-a-leaked-password-or-a-lost-device). |

## End of each day

- [ ] The audience keeps every transcript at `/talks.html` (read, search, summary, download) if **Settings → Transcripts for the audience** is *Every talk*.
- [ ] **Dashboard → Transcripts** per room: SRT or VTT to upload with the videos, TXT for the blog or accessibility archive.
- [ ] Back up the data folder ([where it is](../deployment.md#backups-and-upgrades)).
- [ ] Compare the day's estimated cost on the dashboard with **AI Studio → Usage**.
- [ ] Pause alerts (**Settings → Alerts → Pause until tomorrow**) so nobody's phone buzzes while rooms are packed up.

## Quick URL reference

| For | URL |
|---|---|
| Audience (QR) | `/s/<room>`. On a laptop, the floating-captions button keeps them over any other window. |
| Room list | `/` |
| Transcript of the talk in progress | `/talk.html?stage=<room>` |
| Transcript library | `/talks.html` |
| QR posters | `/kit.html` |
| Projector | `/screen.html?stage=<room>` |
| vMix/OBS overlay | `/overlay.html?stage=<room>&lang=es` |
| Browser ingest | `/ingest.html?stage=<room>&autostart=1` (add `&token=` the first time) |
| Dashboard | `/admin.html` (other devices sign in with the admin or crew password) |
| Event report | `/report.html` |
| Sound check / live demo | `/demo.html?mode=mic&stage=<room>` |
| Caption style editor | `/style.html` |
| Prometheus metrics | `/metrics` with `Authorization: Bearer <CREW_TOKEN>` |

## After the event

- [ ] **Dashboard → Transcripts → Event report**: talks, words, audience and AI cost per room. Print it or save it as a PDF for sponsors, or download the CSV for a spreadsheet.
- [ ] Settings → Access: sign out every other device and change the crew password.
