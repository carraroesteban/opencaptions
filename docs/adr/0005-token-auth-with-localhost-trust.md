# 0005. Token authentication with localhost trust

- Status: Accepted
- Date: 2026-09-24

## Context

Early versions were open by default: without `ADMIN_TOKEN`, anyone on the network could control rooms and inject audio into captions shown on projectors and live streams. At the same time, the first-run experience (`npm start`, open the dashboard) must stay simple, and event crews aren't security specialists.

## Options considered

1. Keep it open by default and document tokens.
2. Always require tokens, even on localhost.
3. Trust only direct local requests. Require tokens from everywhere else, and generate them automatically if they aren't configured.
4. Built-in user accounts and SSO.

## Decision

Option 3 (`AUTH=auto`). A request counts as local only when:

- it comes from a loopback socket,
- its Host header is `localhost` or a loopback IP (this blocks DNS rebinding), and
- it has no proxy headers, so a tunnel on the same machine isn't trusted.

Missing tokens are generated into `data/secrets.json` and printed at startup. `AUTH=token` and `AUTH=off` are available for stricter and lab setups. For SSO we recommend an identity-aware proxy instead of building accounts (option 4).

## Consequences

- Good: secure by default when exposed, and zero friction on the operator's own machine.
- Good: tokens are sent in headers by scripts and the agent. Browsers move them out of the URL after the first load.
- Bad: shared tokens mean no per-person audit trail. Documented as a known gap in [Security](../security-guide.md#known-gaps).
- Bad: in Docker, requests from the host come from the bridge network, so they aren't local and need a token. This is intended.
