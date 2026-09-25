# Networking

This page lists every connection OpenCaptions makes, then gives a plan for venues where part of the network is blocked.

## Connections

All traffic uses TLS on port 443 once HTTPS is configured. Nothing at the venue needs to accept inbound connections.

| From | To | Protocol and port | Purpose |
|---|---|---|---|
| Venue PC (agent or browser) | OpenCaptions server | WSS 443 (`/ws/ingest`) | Room audio, 16 kHz PCM, about 260 kbps |
| OpenCaptions server | `generativelanguage.googleapis.com` (API key) or `<region>-aiplatform.googleapis.com` (Vertex AI) | WSS/HTTPS 443 | Gemini Live Translate and Flash-Lite |
| Phones, projectors, vMix/OBS | OpenCaptions server | HTTPS/WSS 443 (`/ws/view`) | Pages and captions |
| Production team | OpenCaptions server | HTTPS/WSS 443 (`/admin.html`, `/ws/admin`) | Dashboard |
| Browsers | `fonts.googleapis.com`, `fonts.gstatic.com` | HTTPS 443 | Optional caption fonts from the style editor. The pages work without them. |
| Browsers on `/demo.html` | `www.youtube.com` | HTTPS 443 | YouTube demo player only |
| Server (optional) | Stream sources | SRT/RTMP/RTSP/UDP/HTTPS | Pulling audio from vMix, OBS or an encoder |
| Server (optional) | YouTube via `yt-dlp` | HTTPS 443 | Demos and latency tests only |
| `cloudflared` (optional) | Cloudflare edge | Outbound 443 (QUIC/UDP 7844 preferred, TCP 443 fallback) | Tunnel |

Without TLS, the server listens on plain HTTP on `PORT` (default 8080). Use that only on `localhost` or a trusted LAN.

## Restricted venue networks

Conference networks often block things. Test the exact network you'll use a day before, from a venue PC. Run `npm run check` on the server, and `node scripts/agent.js --stage <id> --file samples/talk-en.wav` from a venue PC.

| Condition at the venue | Effect | What to do |
|---|---|---|
| Inbound connections blocked (NAT, no public IP) | None in either topology | Nothing. Both topologies are outbound-only. |
| Only ports 80 and 443 open outbound | None | Nothing. Every connection uses 443. The tunnel falls back from QUIC to TCP 443 automatically. SRT/RTMP pulls from outside the venue won't work, so use the agent instead. |
| Google APIs blocked at the venue | Topology A can't reach Gemini | Use **topology B**. The venue then only talks to your server's domain. |
| Your domain or Cloudflare blocked | Agents can't reach the server | Ask IT to allowlist the one hostname. Otherwise use a 4G/5G router for the venue PCs. |
| Wi-Fi with client isolation | Devices can't reach each other on the LAN | Use the public HTTPS URL for everything, not LAN IPs. |
| Captive portal | Agents can't connect until someone logs in | Use wired Ethernet or a dedicated SSID for production PCs. Ask IT to exempt their MAC addresses. |
| TLS-inspecting proxy (corporate) | WebSockets may be cut or blocked | Ask IT to exempt the hostname from inspection. The agent doesn't support HTTP proxies yet. |
| Unstable uplink | Short gaps in captions | The agent keeps up to 15 s of audio and the server keeps 12 s while reconnecting to Gemini, so short drops lose nothing. Prefer wired links and a failover router with 4G/5G. |
| No internet at all | No captions | Gemini is a cloud service. An offline engine (for example Gemma running locally) is on the [roadmap](architecture.md#extension-points). |
| Audience phones on mobile data with poor coverage | Phones lag or disconnect | Captions are about 1 kbps, so even a weak signal is enough. Offer venue Wi-Fi and show the captions on the projector as a fallback. |

## Sizing the uplink

For N rooms:

- **Venue uplink:** N × 0.3 Mbps upstream for audio in topology B. In topology A, add N × 0.3 Mbps for server-to-Gemini traffic.
- **Server uplink:** N × 0.3 Mbps to Gemini plus viewers × 1 kbps. Add N × 0.4 Mbps downstream if translated voice is enabled.

Ten rooms need roughly 3 Mbps up. Any venue connection handles that, but share it fairly: put production PCs on their own VLAN or SSID, or on wired ports, so audience Wi-Fi traffic can't starve them.

## Firewall rules (topology B VM)

| Direction | Port | Source | Why |
|---|---|---|---|
| Inbound | 443/tcp | Anywhere | HTTPS (Caddy) |
| Inbound | 80/tcp | Anywhere | Let's Encrypt HTTP challenge and redirect |
| Inbound | 22/tcp | Your IP only | SSH, or use IAP/OS Login instead |
| Inbound | 900x/udp | The encoder's IP only | Only if you pull SRT in listener mode |
| Inbound | 1935/tcp | The encoder's IP only | Only if OBS/vMix push RTMP to a room (`rtmp://0.0.0.0:1935/live/<key>`) |
| Outbound | 443 | Anywhere | Gemini, package updates |

Don't expose port 8080 publicly. Keep the app behind the proxy (`BIND_ADDR=127.0.0.1`).
