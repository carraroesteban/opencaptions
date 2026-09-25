# 0007. Docker optional for the server, native for venue agents

- Status: Accepted
- Date: 2026-09-24

## Context

Deployments range from a single laptop to a cloud VM that serves a whole conference. Venue PCs must capture from sound cards. Docker Desktop on macOS and Windows can't access audio devices.

## Options considered

1. Docker required everywhere.
2. Native Node.js only.
3. Both: a hardened Docker image for the server, and native Node.js for the agent and for laptops.

## Decision

Option 3. The image runs as non-root with a read-only root filesystem, no capabilities and a health check. Compose publishes on `127.0.0.1` by default and has an optional Cloudflare Tunnel profile. Native installs get a sandboxed systemd unit.

## Consequences

- Good: reproducible, isolated server deployments on Linux and in the cloud. Simple native runs for demos and venue PCs.
- Bad: two install paths to document and test. Both use the same code and configuration.
