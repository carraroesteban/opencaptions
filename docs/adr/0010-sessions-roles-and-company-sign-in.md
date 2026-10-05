# 0010. Sessions, an admin and a crew role, and company sign-in

- Status: Accepted
- Date: 2026-10-04

## Context

[ADR 0005](0005-token-auth-with-localhost-trust.md) gave every device the same admin token, stored in the browser and often shared as a `?token=` link. In practice the risk wasn't guessing (the tokens are 144 bits) but leaking: links in chat history and screenshots, a password a volunteer keeps after the event, and no way to sign out one device. Every person with the token could also change the setup, though most of the crew only needs to start the next talk. Hosted competitors offer accounts, roles, two-factor and SSO; a self-hosted tool can't require a user database or an identity provider at a venue.

## Options considered

1. Keep shared tokens and document the risks.
2. Built-in user accounts with a database.
3. Sessions on top of shared passwords per role, with optional two-factor codes and optional company sign-in (OpenID Connect).
4. Only SSO, through an identity-aware proxy in front of the dashboard.

## Decision

Option 3, without new dependencies. A password (admin or crew) is exchanged once for an `HttpOnly`, `SameSite=Strict` session cookie that expires; the server keeps only its hash, names each device, and can sign them out one by one. The crew role runs the live controls only. Two-factor codes (TOTP) protect the admin password; while they're on, the password alone opens nothing, not even in a script's header. Company sign-in maps work accounts to roles by email or domain. Room computers keep their own password, sent in a header or exchanged for a one-minute ticket, so no password travels in a URL. Localhost trust from ADR 0005 stays.

## Consequences

- Good: a leaked link or a lost tablet is fixed from **Settings → Access** without restarting; volunteers can't break the setup; the History says who changed what.
- Good: organizations get per-person accounts and their own MFA through any OpenID Connect provider, while a laptop at a venue with no identity provider still works with passwords.
- Bad: password sign-in shares one password per role, so the History knows the device's name, not a verified person. Company sign-in is the answer where that matters.
- Bad: scripts that use the admin password must run on the server computer once two-factor is on.
- Follow-ups: tests cover cookies, roles, cross-site requests, sign-out, password changes, two-factor and company sign-in against a stand-in provider (`test/auth.test.js`).
