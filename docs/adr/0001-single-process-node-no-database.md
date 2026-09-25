# 0001. Single Node.js process, files instead of a database

- Status: Accepted
- Date: 2026-09-24

## Context

The workload is I/O-bound: relaying about 32 KB/s of audio per room to a cloud model and fanning out small text messages. Event teams need something they can install in minutes on a laptop, a mini PC or a small VM. The only durable data is transcripts (append-only text), a room list and a glossary.

## Options considered

1. A single Node.js process with an event loop, plus files on disk.
2. Microservices (ingest, engine workers, fan-out) with Redis or NATS and a database.
3. Python with asyncio.

## Decision

Option 1. Node.js handles thousands of sockets per process. The official `@google/genai` SDK supports the Live API. Plain files (JSONL per talk, JSON config) need no operations work and are easy to back up, inspect and export.

## Consequences

- Good: one command to run, five runtime dependencies, tiny memory footprint, easy to fork.
- Good: rooms are independent, so scaling out is sharding by room without shared state.
- Bad: no active-active high availability for a single room. Mitigated by supervisor restarts and fast client reconnection.
- Bad: rate limits and metrics are per process. Acceptable at event scale.
- Follow-up: if a deployment ever needs search or analytics over transcripts, export JSONL to a database outside the hot path.
