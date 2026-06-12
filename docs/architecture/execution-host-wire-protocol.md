# Execution Host Wire Protocol (v1)

Wire form of the SessionHandle interaction between Convergence and a remote
Provider Execution Host. Transport decision and rationale: ADR 0006. Message
shapes: `electron/backend/provider/execution-host/execution-host-protocol.types.ts`.
Codecs: `execution-host-protocol.pure.ts` (no transport I/O).

## Versioning

Every request body, command envelope, and event envelope carries
`protocolVersion` (currently `1`). A receiver that sees an unsupported
version rejects with decode reason `unsupported-protocol-version`; the
client surfaces this as a configuration-class error, mirroring the remote
daemon error-kind discriminator.

## Authentication

Same model as the remote guided-review daemon: Bearer token on every
request, `/health` for liveness, `/v0/meta` for capability discovery
(which Providers and Models the host machine has installed).

## Endpoints

| Method | Path                                         | Body / Stream                                                             |
| ------ | -------------------------------------------- | ------------------------------------------------------------------------- |
| POST   | `/v0/execution/sessions`                     | `ExecutionHostStartRequest` → `201` with `{ protocolVersion, sessionId }` |
| POST   | `/v0/execution/sessions/:sessionId/commands` | `ExecutionHostCommandEnvelope` → `202`                                    |
| GET    | `/v0/execution/sessions/:sessionId/events`   | SSE stream of `ExecutionHostEventEnvelope`                                |
| GET    | `/v0/execution/sessions/:sessionId`          | Session snapshot (see below)                                              |
| DELETE | `/v0/execution/sessions/:sessionId`          | stop + teardown → `204`                                                   |

`stop` exists both as a command kind (graceful, mirrors `SessionHandle.stop`)
and as DELETE (teardown including host-side cleanup).

## Event stream

Each SSE message carries one JSON `ExecutionHostEventEnvelope` in `data:`
and the envelope `seq` in `id:`. Per Session, `seq` starts at 1 and
increases by exactly one per event. Event kinds map one-to-one onto the
SessionHandle listeners:

| Wire kind            | SessionHandle listener  |
| -------------------- | ----------------------- |
| `delta`              | `onDelta`               |
| `status`             | `onStatusChange`        |
| `attention`          | `onAttentionChange`     |
| `continuation-token` | `onContinuationToken`   |
| `context-window`     | `onContextWindowChange` |
| `activity`           | `onActivityChange`      |
| `heartbeat`          | `onActivityHeartbeat`   |

## Workspace materialization

A start request may carry an optional `workspace` source —
`{ repository, ref?, branchName? }` — instead of relying on
`config.workingDirectory`. The host then materializes the workspace
itself: a cached bare clone of the repository plus a per-session git
worktree on `branchName` (generated when omitted) starting from `ref`
(repository default branch when omitted). `config.workingDirectory` is
ignored when a workspace source is present, teardown removes the worktree
while the clone cache is reused, and the snapshot reports
`workspace: { repository, branchName, baseRef }`. Repository access uses
the host's own credentials (the daemon's configured GitHub token); hosts
without materialization support reject workspace requests with `400`.

## Session snapshot

`GET /v0/execution/sessions/:sessionId` returns the host's current view of
the Session without consuming the stream: `{ protocolVersion, sessionId,
providerId, status, attention, activity, continuationToken, contextWindow,
conversation, lastSeq }`, where `conversation` is the ordered list of
conversation items derived by applying the delta log, and `lastSeq` is the
seq of the latest envelope. Polling consumers (for example
repo-command-center) read this instead of holding an SSE connection;
streaming clients use it to seed state before subscribing from `lastSeq`.

## Reconnect and resume

The host retains the full event log for every live Session. A client that
loses the stream reconnects with `Last-Event-ID: <last processed seq>`;
the host replays every event with a higher seq, in order, then continues
live. A gap in received seq numbers means events were missed and the
client must reconnect with its last contiguous seq rather than continue.

If the Session no longer exists on the host (host restart, teardown), the
events endpoint returns `404`; the client falls back to Provider
Continuation — resume via the persisted Continuation Token through a new
start request — or, failing that, Continuation Recovery semantics exactly
as for a lost local provider process.

## Commands

Commands are individual authenticated POSTs. The client serializes
commands per Session and awaits each response before sending the next,
preserving in-process SessionHandle ordering. `send-message` carries the
same payload as `SessionHandle.sendMessage` (text, attachments, skill
selections, delivery options).

## Attachments

`Attachment.storagePath` and `thumbnailPath` are paths on whichever
machine runs the Provider. For remote execution the client uploads
attachment bytes before referencing them in `start` or `send-message`
(MAR-1415); the host rewrites storage paths to its local copies.
