# Integrations

OpenCaptions can send a room's captions where your audience already is: a **Zoom** meeting or webinar, a **YouTube Live** stream, a **Microsoft Teams** meeting, or any system of yours through a **webhook**. It can also read your agenda from **Sessionize** or a **calendar link**. Everything is on the dashboard's **Integrations** page; no files to edit.

Each connector sends one room's captions in one language. To show two languages in the same Zoom meeting, add the room twice with two languages (Zoom shows the language people pick, when the meeting supports several).

## Captions in Zoom

1. In Zoom's web settings (**Settings → Meeting → Closed captioning**), turn on **Allow use of caption API token to integrate with 3rd-party closed captioning services**. Once per account.
2. Start the meeting or webinar as host. Open **Captions** (CC), choose the third-party captioning service, and click **Copy the API token**.
3. In OpenCaptions: **Integrations → Zoom**, pick the room and the caption language, paste the link, **Connect**.

Each meeting has its own link: connect again for the next meeting. Captions are sent when a sentence is complete, so they appear in Zoom a moment after they appear on phones. If the meeting hasn't started, the connector shows *the Zoom meeting hasn't started* and keeps trying with the next caption.

## Captions in YouTube Live

1. In **YouTube Studio → Go live**, open the stream's settings.
2. Under **Closed captions**, turn them on and choose **POST captions to URL** (HTTP POST). Copy the **Captions ingestion URL**.
3. In OpenCaptions: **Integrations → YouTube Live**, pick the room and language, paste the link, **Connect**.

Viewers turn captions on with the **CC** button. YouTube accepts one caption source per stream. Each caption carries the time its words were said (the talk's start plus the caption's start, already corrected for the AI's delay), so YouTube shows it in step with the video. **The clock of the computer running OpenCaptions must be right** (within a few seconds): YouTube drops captions more than about a minute off. A correction made from the dashboard isn't sent again to Zoom, YouTube or Teams (they've shown the line already).

## Captions in Microsoft Teams

1. Open the meeting in the Teams calendar → **Meeting options**, turn on **Provide CART captions**, save, and copy the **CART link**.
2. In OpenCaptions: **Integrations → Microsoft Teams**, pick the room and language, paste the link, **Connect**.

In the meeting, people turn on captions and choose the CART captions. Long sentences are split into lines of up to 120 characters, as Microsoft recommends.

## Webhooks

**Integrations → Webhook** sends JSON to an `https://` address of yours: each caption, each finished talk, or both. When you connect it, OpenCaptions shows a **secret** once. Every request carries `X-OpenCaptions-Signature: sha256=<hex>`, the HMAC-SHA256 of the request body with that secret, so your system can check that it came from your OpenCaptions.

A caption:

```json
{ "event": "caption", "room": "main", "roomName": "Main stage", "talk": "2026-10-05T13-00-00-000Z", "lang": "en",
  "text": "It all started with one question.", "speaker": "Ana Gómez", "start": 61200, "end": 63900, "at": "2026-10-05T13:01:04.512Z" }
```

A finished talk (sent when the next talk starts), with the link to its transcript:

```json
{ "event": "talk.ended", "room": "main", "roomName": "Main stage", "talk": "2026-10-05T13-00-00-000Z", "title": "Opening keynote",
  "startedAt": 1791205200000, "captions": 412, "transcript": "https://captions.example.org/talk.html?stage=main&talk=…", "at": "…" }
```

**Test** on a connector sends `{ "event": "test", … }`.

Checking the signature (Node.js):

```js
import crypto from 'node:crypto';
const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update(rawBody).digest('hex');
const ok = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(req.headers['x-opencaptions-signature'] || ''));
```

Zapier and Make accept webhooks too ("Catch Hook" / "Custom webhook"): use their address, then send the captions or transcripts anywhere they connect.

## Status and failures

Each connector shows how many captions it sent and when, or why it's failing: a wrong or expired link, a meeting that hasn't started (or, in Teams, whose captions aren't on yet), or no connection. A failed caption is retried a few times with increasing waits (up to about 5 seconds), then skipped: by then the next caption is more useful. A refused link or a meeting that hasn't started isn't retried; the next caption tries again. **Test** sends one line right away.

## Agenda from Sessionize or a calendar

On the **Agenda** page, **Import**:

- **Sessionize:** in Sessionize, **API / Embed**, create an endpoint that includes **All** data and copy its link (`https://sessionize.com/api/v2/…/view/All`). Service sessions (breaks, lunch, registration) become **breaks**: captions pause and the screens say when the next talk starts; a plenum one counts for every room.
- **Calendar (.ics):** a link to a published calendar: Google Calendar's *Secret address in iCal format*, Outlook's published *ICS* link, or any `.ics` file online. Each event's **location** is the room, its **title** the talk, and a `Speaker: …` line in the description the speaker. All-day and cancelled events are left out.

Rooms are matched by name (or id) to the event's rooms; talks in other rooms are listed as ignored. As with pasted agendas, you see what changes before saving, and **History** can undo it. **Import again** re-reads the same source after the program changes.

## Breaks from vMix or OBS

When the stream switches to a break (a "Break" slide, ads, "Starting soon"), the room's captions should pause and the screens should say so. Connect the vision mixer in **Integrations → Breaks from the vision mixer**, one per room:

- **vMix:** **Settings → Web Controller → Enable** (port 8088). OpenCaptions reads which input is on air every second (`http://<vmix-pc>:8088/api`) and uses its title.
- **OBS Studio 28 or newer:** **Tools → WebSocket Server Settings → Enable**, and copy the password. OpenCaptions connects to `ws://<obs-pc>:4455` and follows the program scene.

A scene or input whose name contains one of the **break words** (default: break, pausa, intervalo, receso, almuerzo, lunch, coffee, cafe, publicidad, tanda, comercial, commercial, ads, sponsor, brb, be right back, volvemos, starting soon, empezamos, intermission; whole words, accents ignored) starts a break; switching to any other scene ends it. Only changes act: if the crew resumes captions by hand while the mixer stays on the break scene, it stays resumed. Both run on your production network, so private addresses are fine; the OBS password is kept with the other secrets and never shown again.

## Already built in

- **Alerts** to Slack, Microsoft Teams, Telegram, Discord, ntfy or a webhook: **Settings → Alerts on your phone**.
- **OBS and vMix**: the transparent overlay (**Screens and QR**), and room audio over RTMP or SRT ([Deployment](deployment.md)).
- **Company sign-in** with Google, Microsoft or any OpenID Connect provider ([Security](security-guide.md#company-sign-in)).

## Security

The connector links carry the meeting's or stream's credentials, so they're stored with the other secrets in `data/secrets.json` and the dashboard only shows their host. Each type only accepts its platform's own address (`*.zoom.us`, `upload.youtube.com`, `api.captions.office.microsoft.com`); webhooks must be `https://` and public, like audio sources; `PULL_ALLOW_PRIVATE=1` also allows addresses on your network, over plain `http://` too. Only the admin can add, test or remove connectors. They keep working in Event mode, because a Zoom link only exists once the meeting has started.
