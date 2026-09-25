# Architecture decision records

An architecture decision record (ADR) captures one significant technical decision: the context, the options considered, the choice made and its consequences. ADRs are never rewritten after they're accepted. If a decision changes, add a new ADR that supersedes the old one.

The format is a short version of [MADR](https://adr.github.io/madr/). Copy [template.md](template.md) to start a new one, and number it sequentially.

| # | Decision | Status |
|---|---|---|
| [0001](0001-single-process-node-no-database.md) | Single Node.js process, files instead of a database | Accepted |
| [0002](0002-gemini-live-translate-for-recognition.md) | Gemini Live Translate for recognition, with echo enabled | Accepted |
| [0003](0003-text-translation-per-sentence.md) | Translate captions per sentence with a text model by default | Accepted |
| [0004](0004-outbound-push-ingest.md) | Outbound push ingest from venues, optional server pull | Accepted |
| [0005](0005-token-auth-with-localhost-trust.md) | Token authentication with localhost trust | Accepted |
| [0006](0006-vanilla-js-frontend.md) | Vanilla JavaScript front end, no build step | Accepted |
| [0007](0007-docker-optional.md) | Docker optional for the server, native for venue agents | Accepted |
| [0008](0008-grounded-audience-assistant.md) | A grounded, cached audience assistant | Accepted |
