# Contributing to OpenCaptions

Thanks for helping. This guide covers the development setup, how changes are reviewed and the standards for code and documentation.

## Development setup

```bash
git clone https://github.com/carraroesteban/opencaptions.git
cd opencaptions
npm install
npm run mock          # full system with simulated captions, no API key needed
npm test              # unit tests
npm run lint          # ESLint
npm run typecheck     # TypeScript checks the JSDoc types in src/ and scripts/ (nothing is compiled)
```

### End-to-end test

`test/e2e.test.js` runs the real server with Gemini replaced by a recording (`test/fixtures/talk-en.json`): audio goes in through the ingest WebSocket and the test checks the captions the audience receives, the stored transcript, the SRT/VTT exports, the summary and a question. It needs no API key and runs in about 15 seconds.

When a change alters what OpenCaptions asks the model (prompts, models, the Live config), record the fixture again with a real key:

```bash
npm run record        # 30 s of samples/talk-en.wav against Gemini → test/fixtures/talk-en.json (a couple of cents)
```

- **Node.js:** 20 or later.
- **Real model:** put a Gemini key in `.env` and run `npm run check`.
- **Restarts:** restart the server after changing `src/`. Reload the browser after changing `public/`.

## Project layout

See the [architecture](docs/architecture.md#components) doc for what each module does. In short:

- `src/`: the server.
- `public/`: the pages. Each page's script is in `public/pages/<page>.js`: no inline scripts or `onclick=` handlers, because the Content-Security-Policy blocks them.
- `scripts/`: command-line tools.
- `test/`: unit tests.
- `docs/`: documentation.
- `deploy/`: service files.

## Making a change

1. Open an issue first for anything bigger than a small fix, so we can agree on the approach.
2. Create a branch from `main`: `feat/<topic>`, `fix/<topic>` or `docs/<topic>`.
3. Keep pull requests focused. One logical change per PR.
4. Add or update tests for behaviour changes. Security-relevant code (`src/security.js`, input validation, anything that handles tokens or URLs) must have tests.
5. Update the docs in the same PR: reference tables, how-to steps, diagrams (see [Diagrams in the docs](docs/brand.md#diagrams-in-the-docs)), and `CHANGELOG.md` under **Unreleased**.
6. Make sure `npm test`, `npm run lint` and `npm run typecheck` pass. CI runs the tests on Linux, macOS and Windows, and lint and types once.

### Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(translate): stream partial translations
fix(agent): reconnect after DNS failure
docs(security): add token rotation steps
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `chore`, `ci`, `security`.

### Code style

- ES modules, 2-space indentation, single quotes, semicolons. Keep lines readable (under about 140 characters).
- Few dependencies. Adding a runtime dependency needs a reason in the PR description.
- Never log secrets, tokens or audio content.
- Escape all dynamic text rendered as HTML (`esc()` in `public/common.js`).
- Document function parameters with JSDoc (`@param {string} name`): `npm run typecheck` checks them.
- User-facing strings in pages are written in Spanish and translated in `public/i18n.js`. Add the English entry when you add a string.

## Documentation standards

The docs are part of the product. They follow these standards:

| Standard | What it means here |
|---|---|
| [Diátaxis](https://diataxis.fr/) | Each page is one type: tutorial, how-to, reference or explanation. The type is shown in [docs/README.md](docs/README.md). Don't mix them: link instead. |
| [Google developer documentation style guide](https://developers.google.com/style) | Second person ("you"), present tense, active voice, sentence-case headings, short sentences, descriptive link text. |
| [MADR](https://adr.github.io/madr/) | Architecture decisions go in `docs/adr/` using the template. Accepted ADRs aren't edited. A new one supersedes them. |
| [Keep a Changelog](https://keepachangelog.com/) and [SemVer](https://semver.org/) | Every user-visible change gets a line in `CHANGELOG.md`. |
| Language | Documentation in English. The Spanish runbook for venue crews is kept in sync by hand. |

Checklist for doc changes:

- [ ] Every command was run, and every setting and default was checked against the code.
- [ ] Reference tables (`docs/reference/`) match the code: variable names, defaults, endpoints.
- [ ] Links are relative and work on GitHub.
- [ ] Claims about support or testing use the levels from [Requirements](docs/requirements.md#support-levels): Tested, CI, Expected.
- [ ] No secrets, internal hostnames or personal data in examples. Use `example.com` and `<placeholders>`.

## Roadmap

Contributions are especially welcome here:

- **Local mode** ([docs/local.md](docs/local.md)): measurements on GPUs and Apple's Neural Engine, several rooms per speech server, per-room speech servers, and a local translated voice.
- **Streaming translation in local mode** ([Latency](docs/latency.md#ideas-not-implemented-yet)), and speculative translation of stable prefixes.
- **Strict styles in the CSP:** move `style=""` attributes to classes, so `style-src` can drop `'unsafe-inline'` too.
- **OIDC login** as an alternative to shared tokens.
- More **end-to-end fixtures**: a Spanish talk, local mode, a room with three languages.
- **Type checking the pages** (`public/`) as well as the server.
- Speaker diarization in captions.

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). Be kind and assume good intent.
