# Upgrading

Every update keeps your settings, passwords, rooms and transcripts: they live in the data folder, which no update touches. Back it up anyway before an event ([where it is](deployment.md#backups-and-upgrades)), and update between events, not between talks: captions pause for about a minute while it restarts. What changed in each version is in the [changelog](../CHANGELOG.md).

## How to update

| You run | Update with |
|---|---|
| The Mac app or the Windows launcher | **Check for Updates…** in the app's menu, then **Update and Restart**. The dashboard's line **Update…** does the same. [Details](deployment.md#updates) |
| `npm run app` from a clone | **Update…** in the dashboard (it runs `git pull --ff-only`), or `git pull` and start it again |
| `npm start` from a clone, or a service | `git pull`, `npm ci --omit=dev`, then restart |
| Docker Compose | `git pull && docker compose up -d --build` |
| The published Docker image | `docker rm -f opencaptions`, then the same `docker run --pull always …` line again |

## 0.9.1 → the next version (not released yet)

What's below is in the code, listed under *Unreleased* in the [changelog](../CHANGELOG.md), and applies once that version is out.

**Nothing to change.** Your `.env`, `config/` files and data folder work as they are; the changelog lists no breaking changes since 0.9.

**Updating the app itself, once.** The 0.9 apps don't have **Check for Updates…** in their menu yet. Click **Update now** in the dashboard as before, or download the new app and use it instead of the old one (on a Mac, drag it to Applications and replace the old copy). When an update also changes the app's window, the update dialog says so and offers **Download the App**. From then on, the menu does it all.

**What you'll notice:**

- **Cleaner original captions.** No more words glued together ("Summit.My name") or capitals in the middle of a sentence ("we also Think a lot"), with every speech engine. Names keep their capitals.
- **Talks over music are captioned.** A voice over loud music (a DJ behind a host, a party stream) used to be taken for music and paused; now only real music pauses the captions.
- **"Only these languages."** A room on *Detect automatically* can list the languages the talk can be in (its settings, under the spoken language), so the AI chooses only among them. None checked: any language, as before. In `config/event.json` it's the room's new `spoken` field ([Configuration](reference/configuration.md#stage-object)).
- **Pages that need the password** (the dashboard, QR kit, caption style, sound check, the report, the setup wizard, Just for me) show only the sign-in until you're in.

## Before 0.9

Settings were regrouped in 0.9.1: what used to be under **Settings → General** is now under **Settings → Event** (name, logo, languages, transcripts for the audience, Event mode) or, in Advanced mode, **Settings → System** (new versions, Just for me). Breaking changes in earlier versions are marked **Breaking** in the [changelog](../CHANGELOG.md).
