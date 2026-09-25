# Troubleshooting

Find the symptom, then follow the steps in order. Server logs are printed to the terminal, `docker compose logs -f` or `journalctl -u opencaptions -f`. The dashboard's event log shows the same messages per room.

## Server won't start

| Message | Cause | Fix |
|---|---|---|
| `EADDRINUSE` | Another process uses the port | Stop the other process, or set `PORT=8081` |
| `EACCES` on `data/` | The service user can't write `data/` | `chown` the folder to the service user. In Docker, check the volume permissions. |
| Starts in mock mode unexpectedly | `GEMINI_API_KEY` is empty or `.env` isn't in the working directory | Run from the repository folder, or set the variable in the service environment |

## Gemini connection

| Symptom | Cause | Fix |
|---|---|---|
| `npm run check` shows 401 or 403 | Invalid or restricted API key | Create a new key in AI Studio. Check API restrictions on the key. |
| 429 errors in the log | Free tier or per-minute quota reached | Enable billing. Set `MT_RPM` to your limit or raise `MT_PARTIAL_MS`. |
| Some rooms never go live when many run at once | Concurrent Live session limit | Check your tier's limit. Reduce rooms or shard across projects. |
| `setup rejected (…); retrying with '<level>' config` | The model rejected an optional field | Automatic. It retries with a smaller config (full → minimal → bare). Report it if it persists. |
| Sessions reconnect every few minutes | Normal session renewal (`goAway`) | Nothing. Audio is buffered and resumed. |

## Authentication

| Symptom | Cause | Fix |
|---|---|---|
| Dashboard asks for a token | You're not on the server machine, or you're going through a tunnel or proxy | Open `/admin.html?token=<ADMIN_TOKEN>` once. The token is printed at startup and stored in `data/secrets.json` if generated. |
| Agent exits with `bad ingest token` | Wrong or old token | Use the current `INGEST_TOKEN` (the admin token also works) |
| `HTTP 403` when opening the dashboard or ingest socket | The page's origin doesn't match the server host (a custom domain or embed) | Set `PUBLIC_URL`, or add the origin to `ALLOWED_ORIGINS` |
| `HTTP 429 too many failed attempts` | 20 wrong tokens from one IP within 10 minutes | Wait 10 minutes or restart the server. Then fix the token. |
| Local scripts get 401 inside Docker | Requests from the host reach the container through the bridge network, which isn't local | Pass `--admin-token` or set `ADMIN_TOKEN` in the environment for the script |

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
| Captions arrive late (more than 6 s) | Reconnect in progress, a poor audio feed or network jitter | See [Latency](../latency.md#tuning). Press ↻ if it persists. |
| Translation lags the original by a lot | Long sentences without punctuation, or throttling | Lower `MT_PARTIAL_MS`. Check for the "translation throttled" alert. |
| Wrong words for names or acronyms | Unknown vocabulary | Add them to the glossary vocabulary and replacements |
| Captions in the wrong language | Wrong `source` pinned, or auto-detection confused by a bilingual talk | Set the room's language, or `auto` |
| Phone shows "reconnecting" | Weak venue Wi-Fi | It recovers automatically. Captions need very little bandwidth. |

## Audience assistant and agenda

| Symptom | Cause | Fix |
|---|---|---|
| ✨ shows "Highlights from the transcript" instead of an AI summary | Mock mode, `AUDIENCE_AI=off`, or the model call failed (quota, network) | Check the server log and Gemini billing; it retries on the next request (summaries are cached for up to 2 min while live) |
| "Lots of questions right now" | Per-client or global question limit | Normal under load; raise `ASK_RPM` / `ASK_PER_CLIENT_PER_MIN` if your budget allows |
| Summary says there isn't enough yet | Fewer than a few sentences transcribed | Wait a minute |
| Agenda titles never appear | Times read in the wrong time zone, or room ids in the CSV don't match | Set `timezone` in `config/event.json` (or `TZ`); the dashboard reports unknown rooms when you save |
| The next talk's title doesn't switch | The room hasn't been quiet yet (the previous speaker is still talking) | Automatic once there's a 30 s pause; or press **+ New talk** |
| Transcript library is empty for the audience | `publicTranscripts` is `current` (only the talk in progress is public) | Set `"publicTranscripts": "all"` in `config/event.json` or `PUBLIC_TRANSCRIPTS=all` |

## Getting help

Open an issue with:

- the OpenCaptions version or commit;
- the OS and Node.js version;
- the topology;
- the relevant log lines, with tokens and keys removed.

Report security problems privately as described in [SECURITY.md](../../SECURITY.md).
