# Troubleshooting

Find the symptom, then follow the steps in order. Server logs are printed in the window the Mac app or Windows launcher opened, the terminal, `docker compose logs -f` or `journalctl -u opencaptions -f`. The dashboard's event log shows the same messages per room.

<p align="center"><img src="../../public/art/waiting.webp" width="640" alt="A calm waiting screen with the OpenCaptions logo" /></p>

## No captions at all

Check these in order; most "no captions" problems are one of the first three.

1. **Is sound arriving?** On the dashboard, the room's card says **No sound yet** or **Waiting for the stream** when nothing reaches the server. Open the room's sound page (the card's **Open the sound page**) and press Start, or start the stream in OBS or vMix. See [Audio](#audio).
2. **Is the level right?** The sound page's meter says **Good level** while someone speaks. **No sound: is the microphone on?** or **Too quiet: turn it up** means the AI hears too little to caption: raise the desk's output or the computer's input, or pick another input. **Too loud** clips and garbles words.
3. **Which AI is captioning?** The badge at the top of the dashboard says it. **Simulated captions** means no AI is connected: paste a Gemini key in **Settings → AI**, or click **Run it on this computer (free, slower)**.
4. **Is the AI failing?** The room's log and the dashboard's alerts show Gemini errors. A free key that ran out (429, quota) stops captions until the quota resets: enable billing in AI Studio, or switch to this computer with the badge. See [Gemini connection](#gemini-connection).
5. **Is the room on a break?** **Break**, **Music · paused** or a break from the agenda stop captions on purpose. Press **Resume captions**, or **It's a talk: caption anyway** for a talk taken for music.
6. **Is it just one phone?** A phone that says "Reconnecting…" is on weak Wi-Fi and recovers by itself. If no phone gets captions but the dashboard shows them, check that the QR code points to the public address, not `localhost` (the QR kit warns about it).

## Server won't start

| Message | Cause | Fix |
|---|---|---|
| `EADDRINUSE` | Another process uses the port | Stop the other process, or set `PORT=8081` |
| "can't write to its data folder" | The user running OpenCaptions can't write the data folder | It prints the fix. In Docker on Linux: `sudo chown -R 1000:1000 ./data`, or use a named volume. For a service: `chown` the folder to the service user. |
| Starts with simulated captions | No API key | Paste one in **Settings → AI**, or set `GEMINI_API_KEY` in `.env` (in the folder you start from) |

## Gemini connection

| Symptom | Cause | Fix |
|---|---|---|
| **Settings → AI** says the key isn't valid, or `npm run check` shows 401 | The key was copied incompletely, or was deleted | Copy the whole key again from AI Studio. Keys made since May 2026 start with `AQ.` (about 53 characters), older ones with `AIza` (39) |
| "The key exists but can't use Gemini" (403) | The key's project can't use the Gemini API, or the key is restricted | In AI Studio, create the key in a new project. Check API restrictions on the key. |
| 429 errors in the log | Free tier or per-minute quota reached | Enable billing. Set `MT_RPM` to your limit or raise `MT_PARTIAL_MS`. |
| A free key runs out in the middle of the event | The free tier's daily or per-minute limits | Click the AI badge at the top of the dashboard and choose this computer (or **Run it on this computer (free, slower)**): captions carry on, more slowly, until you enable billing in AI Studio. Then switch back. |
| Some rooms never go live when many run at once | Concurrent Live session limit | Check your tier's limit. Reduce rooms or shard across projects. |
| `setup rejected (…); retrying with '<level>' config` | The model rejected an optional field | Automatic. It retries with a smaller config (full → minimal → bare). Report it if it persists. |
| Sessions reconnect every few minutes | Normal session renewal (`goAway`) | Nothing. Audio is buffered and resumed. |

## Local mode

See [Local mode → Troubleshooting](../local.md#troubleshooting) for the speech server, Ollama and model problems.

## Authentication

| Symptom | Cause | Fix |
|---|---|---|
| The dashboard asks to sign in | You're not on the server machine, or you're going through a tunnel, a proxy or Docker | Sign in with the admin or crew password: the startup window shows both (`Admin token`, `Crew token`). In Docker: `docker compose logs opencaptions \| grep token`. |
| Signed out in the middle of the day | The session expired (`SESSION_HOURS`, 24 by default), someone signed this device out, or its password was changed | Sign in again. **Settings → Security** shows who is signed in. |
| "This needs the admin password" | Signed in with the crew password, which only runs the live controls | Sign out and sign in with the admin password |
| The two-factor code is always wrong | The phone's or the server's clock is off, or the code was already used | Set both clocks to automatic time, and use the next code. Lost the phone? On the server computer, open the dashboard (no sign-in there) and turn it off in **Settings → Security**, or delete `totpSecret` from `data/secrets.json` and restart. |
| Company sign-in: "isn't allowed to open this dashboard" | The account isn't in `OIDC_ADMINS` or `OIDC_CREW` | Add the email or its `@domain` and restart |
| Company sign-in: "started in another browser" or "expired" | The sign-in was finished in a different browser, or took over 10 minutes | Start again from the same browser |
| Company sign-in: the provider says the redirect address doesn't match | The callback registered with the provider differs from the server's public address | Register `https://<public address>/auth/oidc/callback`, or set `OIDC_REDIRECT_URI` |
| Agent or ingest page: `bad ingest token` | Wrong or old room password | Use the current ingest password (the admin and crew ones also work). Changed it in Settings → Security? Update every room computer. |
| Sound page: "This computer can’t send sound yet" or "needs the room link or the password" | A computer other than the server, not signed in | Open a room link from the room → **Sound → Make the link** (works once, 30 minutes), or type the room computer password |
| Sound page: "This link was already used or is more than 30 minutes old" | Room links work once | Make a new one in the room → **Sound**. A browser that is already signed in (or the server computer) doesn't use a link up. |
| `HTTP 403` when opening the dashboard or ingest socket | The page's origin doesn't match the server host (a custom domain or embed) | Set `PUBLIC_URL`, or add the origin to `ALLOWED_ORIGINS` |
| `HTTP 429 too many failed attempts` | 20 wrong passwords from one address within 10 minutes | Wait 10 minutes or restart the server. Then fix the password. |
| Scripts get 401 inside Docker, or after turning on two-factor | Requests from the host aren't local in Docker; with two-factor on, the admin password alone opens nothing | Run the script on the server computer (inside the container: `docker compose exec opencaptions node scripts/…`), or turn off two-factor while you use it |

## Audio

| Symptom | Cause | Fix |
|---|---|---|
| Level meter flat | Wrong input, muted fader, unplugged cable | `--list-devices`, check the desk output, try `--gain 2` |
| The sound page says **Too quiet: turn it up**, or captions miss words | The feed is too low for the AI | Raise the desk's output to this computer, or its input level in the system's sound settings; the agent's `--gain 1.5` (or 2) also helps. Aim for **Good level** while someone speaks at normal volume. |
| The sound page says **Too loud: turn it down a little** | The feed clips | Lower the desk output or the computer's input until it says **Good level**. |
| macOS agent captures silence | Microphone permission not granted | **System Settings → Privacy & Security → Microphone**: allow the terminal or `node` |
| Browser ingest: microphone blocked | Page isn't HTTPS or localhost | Use the HTTPS URL ([Deployment](../deployment.md#https)) |
| Captions only for one speaker in a panel | The desk sends mics on different channels | Use `--channel mix` or fix the desk bus |
| Pull refused: `private/loopback address` | HTTP pull from a LAN host is blocked by default | Set `PULL_ALLOW_PRIVATE=1` if the source is trusted, or use SRT |
| Room audio address refused: `OpenCaptions only plays files from its samples folder` | File path outside the allowed folders | Copy the file into `samples/` and write `samples/<name>`, or add its folder to `MEDIA_DIR`. For a file on your own computer, use the room's sound page → **A recording** instead. |
| YouTube demo: `no audio after 25 s` | `yt-dlp` missing, outdated or rate-limited | `brew upgrade yt-dlp` or `pip install -U yt-dlp`. Retry with fewer rooms. |

## Captions

| Symptom | Cause | Fix |
|---|---|---|
| Captions arrive late (more than 6 s) | Reconnect in progress, a poor audio feed or network jitter | See [Latency](../latency.md#tuning). Press **Reconnect AI** in the room's details if it persists. |
| Translation lags the original by a lot | Long sentences without punctuation, or throttling | Lower `MT_PARTIAL_MS`. Check for the "translation throttled" alert. |
| Wrong words for names or acronyms | Unknown vocabulary | Add them to the glossary vocabulary and replacements |
| Words glued together ("Summit.My name") or capitals in the middle of a sentence ("we also Think a lot") | Version 0.9.1 and earlier join the AI's fragments as they come | Fixed in the next version (*Unreleased* in the [changelog](../../CHANGELOG.md)): update when it's out. Every engine's words will get one space between fragments, and a stray capital after a pause lowered, only for words the speaker already said in lowercase, so names keep theirs. If you still see it after updating, open an issue with the sentence. |
| A talk over loud music pauses as **Music · paused** | Version 0.9.1 and earlier take a voice over music for music | Fixed in the next version. Until then press **It's a talk: caption anyway**. |
| Captions in the wrong language | Wrong `source` pinned | Set the room's language to `auto`: speakers can switch languages mid-talk and every caption track follows (the dashboard log shows `speaker switched language: es → en`) |
| Phone shows "reconnecting" | Weak venue Wi-Fi | It recovers automatically. Captions need very little bandwidth. |

## Audience assistant and agenda

| Symptom | Cause | Fix |
|---|---|---|
| *What did I miss?* shows "Highlights from the transcript" instead of an AI summary | Mock mode, `AUDIENCE_AI=off`, or the model call failed (quota, network) | Check the server log and Gemini billing; it retries on the next request (summaries are cached for up to 2 min while live) |
| "Lots of questions right now" | Per-client or global question limit | Normal under load; raise `ASK_RPM` / `ASK_PER_CLIENT_PER_MIN` if your budget allows |
| Summary says there isn't enough yet | Fewer than a few sentences transcribed | Wait a minute |
| Agenda titles never appear, or appear hours off | Times read in the wrong time zone (Docker runs in UTC), or room names in the CSV don't match | Reopen the welcome wizard (**Settings**): its review offers your browser's time zone. Or set `TZ`. The agenda preview lists rooms it doesn't recognize. |
| The next talk's title doesn't switch | The room hasn't been quiet yet (the previous speaker is still talking) | The room card turns orange and offers **Start "…"**; or it switches at the next 30 s pause |
| Transcript library is empty for the audience | Only the talk in progress is public (the default) | **Settings → Event → Transcripts for the audience → Every talk**, once the speakers agree (or `PUBLIC_TRANSCRIPTS=all`) |

## Desktop apps

| Symptom | Cause | Fix |
|---|---|---|
| Mac: "Apple could not verify…" | The app isn't signed yet | **System Settings → Privacy & Security** → **Open Anyway** next to OpenCaptions (once). [Step by step](../first-launch.md) |
| Mac: the OpenCaptions window says it stopped | Something went wrong while starting | The window's **Details** show the last lines; **Start Again** retries. A busy port is handled by itself (it takes the next one) |
| Mac: "You can't use this version of OpenCaptions with this version of macOS" | A Mac with an Intel chip on macOS 12 or earlier | Update macOS to 13 (Ventura) or later, or run OpenCaptions with Docker or `npm run app` |
| Mac or Windows: "OpenCaptions couldn't download Node.js" | No internet on the first start (it downloads Node.js when the computer doesn't have it) | Connect and open OpenCaptions again, or install the LTS version from nodejs.org |
| Mac: "To open OpenCaptions you need to install Rosetta" | A version older than 0.7 on a Mac with an Apple chip | Download the latest version; or click Install, which also works |
| Windows: "Extract the ZIP first" | The launcher was opened from inside the ZIP | Right-click the ZIP → **Extract All**, and open it from the extracted folder |
| Windows: "Windows protected your PC" | The launcher isn't signed yet | **More info → Run anyway**. If an antivirus blocks it, open `app\Start OpenCaptions.bat`. |
| "The installation didn't finish" on the first start | No internet, or a proxy blocks `registry.npmjs.org` | Connect to the internet once and start again; the libraries are installed only the first time |

## Public address

| Symptom | Cause | Fix |
|---|---|---|
| "Getting the address ready…" for more than two minutes | A new quick address takes a moment to exist, or the venue blocks outgoing connections | Wait a little longer; then check the network allows outgoing HTTPS (and ideally UDP 7844). |
| "Couldn't create the address" | `cloudflared` couldn't be downloaded or couldn't connect | Check the internet. In a locked-down service, allow writing to `local/` (the systemd unit does). |
| QR codes stopped working | The quick address changed after a restart (the dashboard and alerts say so) | Print the posters again, or use a fixed address on your own domain |

## Alerts

| Symptom | Cause | Fix |
|---|---|---|
| The test never arrives on the phone | ntfy: the app isn't subscribed to that exact topic. Telegram: the bot was never messaged, or the chat ID is wrong. | Copy the topic from **Settings → Alerts** again. For Telegram, message the bot once, then read the chat ID from `api.telegram.org/bot<token>/getUpdates`. |
| An alert for a room that's closed for the day | The agenda says the room is still on, or it has no agenda | **Pause until tomorrow** at the end of the day |

## Getting help

Open an issue with:

- the OpenCaptions version or commit;
- the OS and Node.js version;
- the topology;
- the relevant log lines, with passwords, tokens and keys removed.

Report security problems privately as described in [SECURITY.md](../../.github/SECURITY.md).
