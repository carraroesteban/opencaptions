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
- ~~Bad: inline module scripts require `'unsafe-inline'` in the CSP.~~ Done: each page's script lives in `public/pages/<page>.js`, and the CSP allows no inline scripts or handlers.
- Bad: no type checking in the front end (the server and scripts are type-checked with `npm run typecheck`). Mitigated by ESLint on every page script, small pages, and escaping all dynamic text.
