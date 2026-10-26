# FAQ

Short answers, with a link to the page that has the details.

## The basics

**What do I need for an event?** One computer or small server for the whole event, the room's sound reaching it (a computer next to the sound desk, a browser tab, or OBS/vMix streaming to it), and a Gemini API key, or [local mode](local.md) for no key at all. The audience only needs their phones. [Requirements](requirements.md).

**Does the audience need an app or an account?** No. They scan the room's QR code and pick a language in the browser.

**How much does it cost?** The software is free. With Gemini, about US$ 0.54 per room-hour of speech, plus US$ 0.4–0.6 per extra caption language; silence isn't billed. Local mode costs nothing. [What it costs](../README.md#what-it-costs).

**Which languages?** 82 caption languages. A room can follow a speaker who switches language mid-talk; to make detection more reliable, list the languages the talk can be in (the room's settings, **Only these languages**). [Configuration → stages](reference/configuration.md#stage-object).

**How long until the words show up?** Usually a few seconds; with Gemini's default speech model, the first words show about a second after they're said. [Latency](latency.md).

**How accurate is it?** As good as the AI you use, and it makes mistakes, especially with names, strong accents and very fast language switches. Add names and brands to the **Glossary**, and the crew can fix a caption live. Where accuracy is required by law or contract, use human captioning too. [Licenses and responsibilities](legal.md#your-responsibilities-as-an-organizer).

## Running it

**Can I run it without a terminal?** Yes: download the Mac or Windows app; the setup wizard does the rest. [Quick start](../README.md#quick-start).

**How do I update it?** **Update now** on the dashboard's line when a new version is out, or **Check for Updates…** in the app's menu, like Zoom: it shows what's new and **Update and Restart** installs it in about a minute, keeping your settings and transcripts. On a server, see [Deployment → Backups and upgrades](deployment.md#backups-and-upgrades). From 0.9: [Upgrade notes](upgrading.md).

**Do I need an operator in every room?** No. Rooms pause in silence, resume when someone speaks and follow the agenda; one person watching the dashboard is enough. [Day-of-event checklist](operations/day-of-event.md).

**What if the venue's internet goes down?** With the offline backup, captions move to the computer running OpenCaptions and back to Gemini by themselves. [Local mode → Offline backup](local.md#offline-backup).

**My free Gemini key ran out in the middle of the event.** Click the AI badge at the top of the dashboard and choose this computer: captions carry on, more slowly, until you enable billing in AI Studio. [Troubleshooting](operations/troubleshooting.md#gemini-connection).

**Can phones outside the venue's Wi-Fi read the captions?** Yes, with a public HTTPS address: **Settings → Public address** makes one in a click (through Cloudflare), or use your own domain. [Deployment → HTTPS](deployment.md#https).

**Can I show captions in Zoom, YouTube Live or Teams?** Yes: paste the meeting's or stream's caption link in **Integrations**. [Integrations](integrations.md).

**How many rooms can one computer handle?** With Gemini, dozens: the server does little work, and the limit is your Gemini quota for live sessions. In local mode, about one room per laptop. [Deployment → Capacity](deployment.md#capacity-and-sharding).

## Privacy

**Where does the audio go?** With Gemini, to Google, only while a room is captioning; it's never saved to disk. In local mode, nowhere. [Privacy and data](privacy.md).

**Does OpenCaptions track anyone?** No. There's no telemetry, and nothing about the audience is collected. Once a day it asks GitHub for the latest version number, which you can turn off. [Privacy and data](privacy.md).

**Who can read the transcripts?** By default the audience can read only the talk in progress; past talks need the admin password. Change it in **Settings → Event → Transcripts for the audience**, after the speakers agree. [Legal](legal.md).

## Something's wrong

**No captions.** Follow [No captions at all](operations/troubleshooting.md#no-captions-at-all).

**Words were glued together, or capitals appeared mid-sentence.** Fixed in 0.9.2; update. [Troubleshooting → Captions](operations/troubleshooting.md#captions).

**My Mac or Windows PC warns about the app.** It isn't signed with a paid certificate yet; confirm once. [Opening it the first time](first-launch.md).
