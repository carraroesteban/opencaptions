# Troubleshooting

Find the symptom, then follow the steps in order. Server logs are printed in the window the Mac app or Windows launcher opened, the terminal, `docker compose logs -f` or `journalctl -u opencaptions -f`. The dashboard's event log shows the same messages per room.

<p align="center"><img src="../../public/art/waiting.webp" width="640" alt="A calm waiting screen with the OpenCaptions logo" /></p>

## Server won't start

| Message | Cause | Fix |
|---|---|---|
| `EADDRINUSE` | Another process uses the port | Stop the other process, or set `PORT=8081` |
| "can't write to its data folder" | The user running OpenCaptions can't write the data folder | It prints the fix. In Docker on Linux: `sudo chown -R 1000:1000 ./data`, or use a named volume. For a service: `chown` the folder to the service user. |
| Starts with simulated captions | No API key | Paste one in **Settings → Gemini**, or set `GEMINI_API_KEY` in `.env` (in the folder you start from) |

## Gemini connection

| Symptom | Cause | Fix |
|---|---|---|
| **Settings → Gemini** says the key isn't valid, or `npm run check` shows 401 | The key was copied incompletely, or was deleted | Copy the whole key again from AI Studio. Keys made since May 2026 start with `AQ.` (about 53 characters), older ones with `AIza` (39) |
| "The key exists but can't use Gemini" (403) | The key's project can't use the Gemini API, or the key is restricted | In AI Studio, create the key in a new project. Check API restrictions on the key. |
| 429 errors in the log | Free tier or per-minute quota reached | Enable billing. Set `MT_RPM` to your limit or raise `MT_PARTIAL_MS`. |
| Some rooms never go live when many run at once | Concurrent Live session limit | Check your tier's limit. Reduce rooms or shard across projects. |
| `setup rejected (…); retrying with '<level>' config` | The model rejected an optional field | Automatic. It retries with a smaller config (full → minimal → bare). Report it if it persists. |
| Sessions reconnect every few minutes | Normal session renewal (`goAway`) | Nothing. Audio is buffered and resumed. |

## Local mode

See [Local mode → Troubleshooting](../local.md#troubleshooting) for the speech server, Ollama and model problems.

## Authentication

| Symptom | Cause | Fix |
|---|---|---|
| The dashboard asks to sign in | You're not on the server machine, or you're going through a tunnel, a proxy or Docker | Sign in with the admin or crew password: the startup window shows both (`Admin token`, `Crew token`). In Docker: `docker compose logs opencaptions \| grep token`. |
| Signed out in the middle of the day | The session expired (`SESSION_HOURS`, 24 by default), someone signed this device out, or its password was changed | Sign in again. **Settings → Access** shows who is signed in. |
| "This needs the admin password" | Signed in with the crew password, which only runs the live controls | Sign out and sign in with the admin password |
| The two-factor code is always wrong | The phone's or the server's clock is off, or the code was already used | Set both clocks to automatic time, and use the next code. Lost the phone? On the server computer, open the dashboard (no sign-in there) and turn it off in **Settings → Access**, or delete `totpSecret` from `data/secrets.json` and restart. |
| Company sign-in: "isn't allowed to open this dashboard" | The account isn't in `OIDC_ADMINS` or `OIDC_CREW` | Add the email or its `@domain` and restart |
| Company sign-in: "started in another browser" or "expired" | The sign-in was finished in a different browser, or took over 10 minutes | Start again from the same browser |
| Company sign-in: the provider says the redirect address doesn't match | The callback registered with the provider differs from the server's public address | Register `https://<public address>/auth/oidc/callback`, or set `OIDC_REDIRECT_URI` |
| Agent or ingest page: `bad ingest token` | Wrong or old room password | Use the current ingest password (the admin and crew ones also work). Changed it in Settings → Access? Update every room computer. |
| `HTTP 403` when opening the dashboard or ingest socket | The page's origin doesn't match the server host (a custom domain or embed) | Set `PUBLIC_URL`, or add the origin to `ALLOWED_ORIGINS` |
| `HTTP 429 too many failed attempts` | 20 wrong passwords from one address within 10 minutes | Wait 10 minutes or restart the server. Then fix the password. |
| Scripts get 401 inside Docker, or after turning on two-factor | Requests from the host aren't local in Docker; with two-factor on, the admin password alone opens nothing | Run the script on the server computer (inside the container: `docker compose exec opencaptions node scripts/…`), or turn off two-factor while you use it |

## Audio

| Symptom | Cause | Fix |
|---|---|---|
| Level meter flat | Wrong input, muted fader, unplugged cable | `--list-devices`, check the desk output, try `--gain 2` |
| macOS agent captures silence | Microphone permission not granted | **System Settings → Privacy & Security → Microphone**: allow the terminal or `node` |
| Browser ingest: microphone blocked | Page isn't HTTPS or localhost | Use the HTTPS URL ([Deployment](../deployment.md#https)) |
| Captions only for one speaker in a panel | The desk sends mics on different channels | Use `--channel mix` or fix the desk bus |
| Pull refused: `private/loopback address` | HTTP pull from a LAN host is blocked by default | Set `PULL_ALLOW_PRIVATE=1` if the source is trusted, or use SRT |
| Pull refused: `local files must be inside samples/ or MEDIA_DIR` | File path outside the allowed folders | Move the file, or set `MEDIA_DIR` |
| YouTube demo: `no audio after 25 s` | `yt-dlp` missing, outdated or rate-limited | `brew upgrade yt-dlp` or `pip install -U yt-dlp`. Retry with fewer rooms. |

## Captions

| Symptom | Cause | Fix |
|---|---|---|
| Captions arrive late (more than 6 s) | Reconnect in progress, a poor audio feed or network jitter | See [Latency](../latency.md#tuning). Press **Reconnect AI** in the room's details if it persists. |
| Translation lags the original by a lot | Long sentences without punctuation, or throttling | Lower `MT_PARTIAL_MS`. Check for the "translation throttled" alert. |
| Wrong words for names or acronyms | Unknown vocabulary | Add them to the glossary vocabulary and replacements |
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
| Transcript library is empty for the audience | Only the talk in progress is public (the default) | **Settings → Transcripts for the audience → Every talk**, once the speakers agree (or `PUBLIC_TRANSCRIPTS=all`) |

## Desktop apps

| Symptom | Cause | Fix |
|---|---|---|
| Mac: "Apple could not verify…" | The app isn't signed yet | **System Settings → Privacy & Security** → **Open Anyway** next to OpenCaptions (once) |
| Mac: nothing happens after opening it | Permission to control Terminal was denied | **System Settings → Privacy & Security → Automation** → allow OpenCaptions to control Terminal, then open it again |
| Mac or Windows: "OpenCaptions needs Node.js" | Node.js isn't installed | Install the LTS version from nodejs.org, then open OpenCaptions again |
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
