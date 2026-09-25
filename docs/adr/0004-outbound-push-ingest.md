# 0004. Outbound push ingest from venues, optional server pull

- Status: Accepted
- Date: 2026-09-24

## Context

At Nerdearla, audio goes from each sound desk through a 3.5 mm cable into a mini PC. Venue networks usually block inbound connections, and we don't want venue PCs reachable from the internet. Some rooms already produce an SRT, RTMP or HLS stream from vMix or OBS.

## Options considered

1. Venue PCs push PCM over a WebSocket to the server (outbound only).
2. The server pulls from each venue PC. That requires inbound access to the venue.
3. The server pulls the stream vMix or OBS already produces.

## Decision

Option 1 is the primary path, with two clients: a headless agent (`scripts/agent.js`, a system service) and a browser page for quick setups. Option 3 is supported per room (`pull`) for rooms with an existing stream. A live ingest always takes precedence over a pull.

## Consequences

- Good: works behind any NAT or firewall that allows outbound 443. No port forwarding.
- Good: raw PCM avoids codecs and transcoding latency. At about 260 kbps per room, bandwidth is negligible.
- Bad: server pulls can be abused for SSRF. Mitigated by URL validation in `src/security.js` and admin-only access.
- Bad: uncompressed audio uses more bandwidth than Opus. Acceptable at this scale. Opus could be added later.
