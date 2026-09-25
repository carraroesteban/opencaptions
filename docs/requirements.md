# Requirements

This page lists what OpenCaptions needs to run, per role. OpenCaptions has three roles, which can share a machine or run on separate ones:

- **Server**: the Node.js process that talks to Gemini and serves every page and socket.
- **Venue PC**: one per room. It takes audio from the sound desk and sends it to the server. It isn't needed when the server pulls a stream from vMix or OBS.
- **Displays and audience**: projectors, the vMix/OBS overlay and phones. They only need a browser.

## Support levels

| Level | Meaning |
|---|---|
| **Tested** | Run end to end by the maintainers with real audio and the real model. |
| **CI** | Covered by automated tests on every change, not run with the real model. |
| **Expected** | Uses only portable components and should work, but nobody has verified it yet. Please report results. |

## Server

| Item | Requirement |
|---|---|
| Runtime | Node.js 20 or later (22 LTS recommended). No build step. |
| Operating system | macOS 13+ on Apple Silicon: **Tested**. Linux (Debian 12, Ubuntu 22.04+), x86-64 and arm64, bare metal or Docker: **CI**, and Tested in mock mode. Windows 10/11 x64: **Expected**. The unit tests run on Linux, macOS and Windows in CI. |
| CPU and memory | 1 vCPU and 512 MB RAM handle about 10 rooms. The load test ran 10 rooms with 20 model sessions at about 90 MB RSS. Budget 1 vCPU and 1 GB for 20+ rooms plus headroom. |
| Disk | Under 100 MB for the app. Transcripts are text only, typically a few hundred KB per room per day. Audio is never written to disk. |
| ffmpeg | Only for pulling streams (SRT, RTMP, HLS) or non-WAV files. `npm install` fetches `ffmpeg-static` for macOS, Linux and Windows. A system ffmpeg or `FFMPEG_PATH` takes precedence. |
| yt-dlp | Optional. Only for YouTube demos and `npm run multi`. |
| AI provider | A Gemini API key from Google AI Studio, or a Google Cloud project with Vertex AI (see [Security](security-guide.md#choosing-the-ai-backend)). |

### Why the operating system barely matters

The server does very little work itself. Per room it relays about 32 KB/s of audio to Gemini and forwards small caption messages to viewers. Speech recognition and translation run in Google's cloud. A Mac, a Linux VM and a Windows mini PC therefore give the same caption latency, as long as the network is similar. See [Latency](latency.md).

## Venue PC (one per room)

You can capture audio in two ways.

| | Headless agent (recommended) | Browser ingest page |
|---|---|---|
| What runs | `npm run agent`, as a background service | `/ingest.html` in Chrome or Edge |
| Needs | Node.js 20+ and the repository (ffmpeg is included) | A modern browser. HTTPS unless it is the server machine itself |
| macOS | **Tested** (AVFoundation). Grant microphone access to the terminal or service. | **Tested** (Chrome) |
| Linux | **Expected** (PulseAudio/PipeWire or ALSA) | **Expected** (Chrome) |
| Windows | **Expected** (DirectShow; pass `--device "<name>"`) | **Expected** (Chrome, Edge) |
| Survives reboots | Yes, with systemd, launchd or a Windows service ([Deployment](deployment.md#run-the-agent-as-a-service)) | Only with a kiosk setup |

**Hardware:**

- Any small PC works. Capture uses almost no CPU. Intel N100-class mini PCs, old laptops and Raspberry Pi 4/5 are all fine.
- Use a line-level input: a USB audio interface or a line-in jack fed from the sound desk (the usual 3.5 mm cable).
- Avoid laptop microphone inputs. Their automatic gain control and noise suppression hurt recognition.
- A clean feed from the desk gives better captions than a microphone in the room.

## Displays and audience

| Client | Requirement |
|---|---|
| Audience phones | Any current mobile browser (iOS Safari 15+, Chrome for Android). About 1 kbps per viewer for captions. Listening to the translated voice uses about 384 kbps. |
| Projector | Any browser in full screen, typically the venue PC's second output. |
| vMix | *Web Browser* input at 1920×1080. |
| OBS | *Browser Source* at 1920×1080. |

## Network

Everything uses outbound HTTPS/WSS on port 443, so a venue PC never needs to accept incoming connections. [Networking](networking.md) has the full port and domain list and a plan for restricted venues.

| Link | Bandwidth per room | Notes |
|---|---|---|
| Venue PC → server | about 260 kbps up | 16 kHz 16-bit mono PCM plus framing. Use wired Ethernet if you can. |
| Server → Gemini | about 260 kbps up, a few kbps down | Plus about 384 kbps down per room when translated voice is enabled. |
| Server → viewers | about 1 kbps per viewer | Text only. |

## Accounts and quotas

- **Gemini API key (AI Studio):** the free tier is enough for development. Its per-minute limits are too low for more than a couple of rooms. For an event, enable billing.
- **Concurrent Live sessions:** each room uses one Live session in the default `text` translation mode. Check your project's concurrent-session limit in AI Studio before the event, and test at full scale with `npm run multi`.
- **Vertex AI:** needs a Google Cloud project with the Vertex AI API enabled, and a service account or Application Default Credentials. The Vertex path uses the same SDK but has not yet been tested end to end.

## Cost

See the cost table in the [README](../README.md#-cost). The rule of thumb is about US$ 2.2 per room-hour of speech, plus US$ 0.4–0.6 per extra caption language. The silence gate means breaks and silent periods aren't billed.
