# OpenCaptions documentation

OpenCaptions is open-source software for live captions and translation at conferences with many rooms running at the same time. These docs cover how to install it, run it at an event, operate it safely and change it.

The docs follow the [Diátaxis](https://diataxis.fr/) framework. Each page has one job: teach, solve a task, describe facts or explain a decision. If you're new, start at the top of the table.

## Start here

| Page | Type | Read it when you want to… |
|---|---|---|
| [Project overview](overview.md) | Explanation | Understand in one page what OpenCaptions is, who it's for, its status and roadmap. |
| [Getting started](getting-started.md) | Tutorial | See captions and translations working on your laptop in about 10 minutes. |
| [Requirements](requirements.md) | Reference | Check operating systems, hardware, network and accounts before an event. |

## Run it

| Page | Type | Read it when you want to… |
|---|---|---|
| [Deployment](deployment.md) | How-to | Choose between a venue PC and a cloud server, then install with Docker, Node.js or a system service. |
| [Networking](networking.md) | How-to | Know which ports and domains are used, and what to do when the venue network blocks something. |
| [Security](security-guide.md) | Explanation + how-to | Understand the threat model and apply the hardening checklist. |
| [Latency](latency.md) | Explanation + how-to | Understand where the seconds go and tune for lower delay. |
| [Event-day runbook](operations/runbook.md) | How-to | Prepare and operate the rooms on the day. |
| [Troubleshooting](operations/troubleshooting.md) | How-to | Fix a specific symptom quickly. |
| [Runbook in Spanish](operations/event-day.es.md) | How-to | Hand the production crew a checklist in Spanish. |

## Look things up

| Page | Type | Contents |
|---|---|---|
| [Configuration reference](reference/configuration.md) | Reference | Every environment variable, `config/event.json`, `config/glossary.json` and the command-line tools. |
| [API reference](reference/api.md) | Reference | HTTP endpoints, WebSocket protocols, metrics and page URLs. |

## Understand the design

| Page | Type | Contents |
|---|---|---|
| [Architecture](architecture.md) | Explanation | Components, data flow, failure handling and how it scales. |
| [Architecture decision records](adr/README.md) | Explanation | Why the main technical choices were made, and what they cost. |

## Contribute

- [Contributing guide](../CONTRIBUTING.md) covers the dev setup, tests, commit style and documentation standards.
- [Security policy](../SECURITY.md) explains how to report a vulnerability privately.
- [Changelog](../CHANGELOG.md) lists user-visible changes per release.

## Conventions used in these docs

- Commands are shown for macOS and Linux shells. Windows PowerShell equivalents are given where they differ.
- `<angle brackets>` mark values you replace, such as `<room-id>`.
- A **room** is the same thing as a **stage** in the code and API (`stage` is the identifier used in URLs).
- **Venue PC** means the computer in a room that receives audio from the sound desk.
