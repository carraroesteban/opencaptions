# 0006. Vanilla JavaScript front end, no build step

- Status: Accepted
- Date: 2026-09-24

## Context

The pages are small and task-specific: audience view, projector, overlay, ingest, dashboard, demo and style editor. They must load fast on venue Wi-Fi, run inside vMix and OBS browser inputs, and be easy for event teams to restyle.

## Options considered

1. A single-page app framework (React or similar) with a bundler.
2. Plain HTML pages with ES modules and a shared `common.js`, and no build.

## Decision

Option 2. Shared helpers live in `public/common.js` (sockets with auto-reconnect, caption state, theming, caption styling). Interface translation lives in `public/i18n.js`, with Spanish source strings and an English dictionary.

## Consequences

- Good: no toolchain, instant reloads, pages are easy to read and fork, and they're small.
- Good: overlays work in vMix and OBS without polyfills.
- Bad: inline module scripts require `'unsafe-inline'` in the CSP. Follow-up: move them to files and tighten the CSP.
- Bad: no type checking in the front end. Mitigated by keeping pages small and escaping all dynamic text.
