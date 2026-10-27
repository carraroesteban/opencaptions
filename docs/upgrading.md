# Upgrading

Every update keeps your settings, passwords, rooms and transcripts: they live in the data folder, which no update touches. Back it up anyway before an event ([where it is](deployment.md#backups-and-upgrades)), and update between events, not between talks: captions pause for about a minute while it restarts. What changed in each version is in the [changelog](../CHANGELOG.md).

## How to update

| You run | Update with |
|---|---|
| The Mac app or the Windows launcher | **Check for Updates…** in the app's menu, then **Update and Restart**. The dashboard's line **Update…** does the same. [Details](deployment.md#updates) |
| `npm run app` from a clone | **Update…** in the dashboard (it runs `git pull --ff-only`), or `git pull` and start it again |
| `npm start` from a clone, or a service | `git pull`, `npm ci --omit=dev`, then restart |
| Docker Compose | `docker compose up -d` (it gets the newest release). Building it yourself: `git pull && docker compose up -d --build` |
| The published Docker image | `docker rm -f opencaptions`, then the same `docker run --pull always …` line again |

## 0.9.4 → 1.0

**Nothing to change in your settings.** Your `.env`, `config/` files and data folder work as they are, and nothing is turned off.

**New settings, all optional** ([Configuration](reference/configuration.md)): `SLIDES` (on), `INDEX_TALKS` (off), `EXPLAIN_PER_CLIENT_PER_MIN` (12), `EXPLAIN_RPM` (60), and **Settings → Event → Say where the captions come from** (on).

**What you'll notice:**

- **Slides on phones,** when a room's computer clicks **Share slides** on its audio page. Nothing is shared until someone does.
- **Tap a word** in the captions to have it explained, and **Ask the whole event** on the transcripts page. Both follow the transcript rules you already have (`PUBLIC_TRANSCRIPTS`) and the assistant's switch (`AUDIENCE_AI`).
- **Talk pages** open with chapters and key quotes, and preview as the talk when shared, where the transcript is public. They stay out of search engines unless `INDEX_TALKS=on`.
- **A quiet line on the audience pages,** "Live captions by OpenCaptions · free for your event". Switch it off in **Settings → Event**.

## 0.9.1 → 0.9.2

**Nothing to change in your settings.** Your `.env`, `config/` files and data folder work as they are.

**Node.js with the October 2026 security fixes is required** (22.23.4, 24.22.1 or 26.12.1 and newer; Node 20 is no longer supported). The Mac and Windows apps download one by themselves; on a server or from source, update Node first or OpenCaptions won't start and will say how.

**Updating the app itself, once.** The 0.9 apps don't have **Check for Updates…** in their menu yet. Click **Update now** in the dashboard as before, or download the new app and use it instead of the old one (on a Mac, drag it to Applications and replace the old copy). When an update also changes the app's window, the update dialog says so and offers **Download the App**. From then on, the menu does it all.

**What you'll notice:**

- **Cleaner original captions.** No more words glued together ("Summit.My name") or capitals in the middle of a sentence ("we also Think a lot"), with every speech engine. Names keep their capitals.
- **Talks over music are captioned.** A voice over loud music (a DJ behind a host, a party stream) used to be taken for music and paused; now only real music pauses the captions.
- **"Only these languages."** A room on *Detect automatically* can list the languages the talk can be in (its settings, under the spoken language), so the AI chooses only among them. None checked: any language, as before. In `config/event.json` it's the room's new `spoken` field ([Configuration](reference/configuration.md#stage-object)).
- **Pages that need the password** (the dashboard, QR kit, caption style, sound check, the report, the setup wizard, Just for me) show only the sign-in until you're in.

## Before 0.9

Settings were regrouped in 0.9.1: what used to be under **Settings → General** is now under **Settings → Event** (name, logo, languages, transcripts for the audience, Event mode) or, in Advanced mode, **Settings → System** (new versions, Just for me). Breaking changes in earlier versions are marked **Breaking** in the [changelog](../CHANGELOG.md).
