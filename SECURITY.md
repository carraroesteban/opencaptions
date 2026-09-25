# Security policy

## Supported versions

OpenCaptions is pre-1.0. Security fixes go to the latest release on the `main` branch.

## Reporting a vulnerability

Please **don't open a public issue** for security problems.

1. Use GitHub's **private vulnerability reporting**: go to the repository's **Security** tab and choose **Report a vulnerability**.
2. Include the affected version or commit, the steps to reproduce, the impact, and a suggested fix if you have one.
3. You'll get an acknowledgement within 3 business days, and a plan or fix within 30 days for confirmed issues. Severe issues are prioritized.

We credit reporters in the release notes unless you prefer otherwise. Please give us a reasonable time to fix the issue before disclosing it publicly.

## Scope

In scope:

- The server (`src/`).
- The pages in `public/`.
- The scripts and agent (`scripts/`).
- The Docker image and the deployment files in `deploy/`.

Out of scope:

- Vulnerabilities in Google Gemini, Cloudflare or other third-party services.
- Findings that require `AUTH=off`, or a leaked admin token.
- Denial of service through volumetric traffic.

## Security design

The threat model, controls and hardening checklist are in [docs/security-guide.md](docs/security-guide.md).
