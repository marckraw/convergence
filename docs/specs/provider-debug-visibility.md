# Provider Debug Visibility

## Goal

Give users (and us) a way to tell whether a "still running" session is
genuinely working or silently stuck — without restarting the app — and
make the raw provider event stream available for after-the-fact
diagnosis when something does go wrong.

The motivating case is long Codex MCP turns: `mcpToolCall` returns in
~350ms with `status: completed`, then the session sits at `running`
for 30+ seconds with no transcript update, no activity change, and no
indication of whether the provider subprocess is reasoning, waiting on
the model API, or hung. Today Convergence cannot answer that question;
neither can the user.

This spec covers two complementary primitives:

1. **Always-on liveness signals** woven into each provider's session
   loop, so the renderer can show a passive "no provider events for Ns"
   hint and unknown notification methods are no longer silently
   discarded.
2. **A user-toggleable debug log** that captures every raw provider
   message into a per-session JSONL file plus an in-app drawer, so the
   user can flip it on, reproduce a hang, and either share the file
   with us or read it themselves.

## Product intent

- A user looking at a session that "feels stuck" gets a clear,
  unobtrusive note in the transcript (or status bar) the moment the
  provider has been silent long enough to warrant suspicion.
- The user can enable a setting once and have every subsequent session
  capture a complete event log to disk, without needing to rebuild or
  attach a debugger.
- Providers we already understand (Codex, Pi/OpenAI Coding Agent,
  Claude Code) must all surface comparable signals. Differences
  between provider transports are abstracted; the renderer should not
  care which provider it is observing.
- Nothing in this feature changes the conversation contract or
  provider semantics. No auto-kill. No retries. No cancellation. The
  feature is observability only.

## Non-goals (V1)

- **No auto-kill or cancellation.** Liveness thresholds emit notes,
  not signals to the subprocess. Stopping is the user's call.
- **No new model or transcript format.** Debug entries do not become
  conversation items in the canonical `session_conversation_items`
  table; they live in a separate sink (in-memory ring + JSONL file).
- **No production telemetry shipping.** JSONL stays on the user's
  machine. Sharing is a manual copy/upload step.
- **No provider-internal probes.** We do not start poking the
  subprocess for "are you alive?" — we observe what it already emits.
- **No retries of stuck calls.** A "stuck" indication is informational.

## V1 behavior

### A. Always-on liveness signals (Phase 1)

#### A1. Default-case capture for unknown notifications

Every provider's notification dispatcher gets a `default` branch that
records the unknown method to a per-session debug ring buffer. Today
Convergence's switch statements (e.g. `codex-provider.ts:746`,
`pi-provider.ts:506`) silently drop methods they do not recognize. New
methods emitted by an updated provider CLI become invisible.

The capture writes to the same ring buffer that the toggleable debug
log uses (Phase 2). With the toggle off, entries stay in memory and
roll out when the buffer fills. With the toggle on, entries also
flush to JSONL.

The renderer is **not** notified about every captured event. Default
captures do not pollute the transcript.

#### A2. Per-session liveness clock

A new pure module derives a `LivenessSignal` from the timestamp of the
last provider event:

```ts
type LivenessSignal =
  | { kind: 'fresh'; msSinceLastEvent: number }
  | { kind: 'quiet'; msSinceLastEvent: number } // crossed soft threshold
  | { kind: 'silent'; msSinceLastEvent: number } // crossed hard threshold
```

Thresholds are constants in the pure module:

- `LIVENESS_QUIET_MS = 60_000`
- `LIVENESS_SILENT_MS = 180_000`

Each provider session updates `lastEventAt` whenever any of the
following happens:

- A notification arrives (any method, including unknown).
- A response to a request arrives.
- A stdout chunk arrives (subprocess wrote something, even if the
  parser hasn't completed a line yet).
- A stderr chunk arrives.

A timer in `SessionService` (interval `5s`, only running while at
least one session has `status === 'running'`) re-derives liveness for
every active session. On crossing a threshold for the first time
within a turn, the service emits a session note via the existing
`addNote` path:

- `quiet` → `level: 'info'`, text: `No provider events for 60s. Still
waiting; this can be normal for long reasoning steps.`
- `silent` → `level: 'warning'`, text: `No provider events for 3
minutes. The provider may be stuck. Use Stop if you want to abort.`

A new event resets the per-turn flag so future quiet stretches can
re-warn.

#### A3. Codex `reasoning` activity mapping

If Codex emits an `item/started` notification with item type
`reasoning` (or similar — confirmed via A1 once shipped), the activity
reducer maps it to `'thinking'`. The reducer change is gated on the
real method/type names; if Codex emits something we don't expect, the
default-case capture from A1 will reveal it before we hard-code a
mapping.

This is the concrete bug we expect to find behind the user-visible
"stuck after MCP" symptom. If A1 reveals a different mechanism, this
slice changes accordingly. The plan calls out that the exact mapping
is verified against captured logs before code lands.

### B. Toggleable debug log (Phase 2)

#### B1. Settings toggle

`AppSettings` grows a `debugLogging: { enabled: boolean }` field,
default `false`. Surfaced in the existing global settings dialog as a
single switch labelled "Capture provider debug logs". Subtitle:
"Records every event from Codex, Pi, and Claude into JSONL files for
diagnosis. Files live alongside the app data and are not uploaded
anywhere."

#### B2. Backend module

New module `electron/backend/provider-debug/`:

- `provider-debug.types.ts`
- `provider-debug.pure.ts` — ring buffer reducer + JSONL line
  serializer (pure, testable).
- `provider-debug.service.ts` — owns one ring buffer per active
  session (~500 entries each), broadcasts new entries on
  `provider:debug:event`, optionally appends to
  `app.getPath('userData')/debug-logs/<sessionId>.jsonl` when the
  setting is enabled.

Entry shape:

```ts
type ProviderDebugEntry = {
  sessionId: string
  providerId: string
  at: number // Date.now()
  direction: 'in' | 'out'
  channel:
    | 'notification'
    | 'response'
    | 'request'
    | 'event'
    | 'stdout'
    | 'stderr'
    | 'lifecycle'
  method?: string // for notifications/requests
  payload?: unknown // raw JSON, captured verbatim where possible
  bytes?: number // for stdout/stderr chunk events
  note?: string // free-form (e.g. 'subprocess exited')
}
```

#### B3. Provider integration

Each provider's session start path takes an optional
`debugSink: ProviderDebugSink` (lightweight interface, just
`record(entry)`), constructed from `ProviderDebugService.bind(sessionId)`.

- Codex: at the top of `rpc.onNotification`, `rpc.onServerRequest`,
  inside `child.stdout/stderr.on('data', ...)`, and on
  `child.on('exit'/'error')`.
- Pi: same, on `handleEvent`, `handleExtensionUiRequest`,
  `child.stdout/stderr`, `child.on('exit'/'error')`.
- Claude Code: at the streaming JSON parse site and stderr/exit hooks.

If `debugSink` is not provided (e.g. in unit tests), the provider
behaves exactly as today.

#### B4. Renderer drawer

A new feature `src/features/session-debug-drawer/`:

- Container subscribes to `provider:debug:event` filtered by current
  `sessionId` and renders the latest ~200 entries.
- Presentational shows a virtualized list with timestamp, channel,
  method, and a click-to-expand JSON payload.
- Header has "Copy session log" (writes the on-disk JSONL path to
  clipboard) and "Open log folder" (opens Finder/Explorer at
  `userData/debug-logs/`).

The drawer is hidden by default and accessible from the session
header overflow menu only when the setting is enabled. With the
setting off, no drawer entry; the in-memory ring still exists for
A1/A2 internal use but is not exposed.

### C. JSONL on disk

- One file per session: `userData/debug-logs/<sessionId>.jsonl`.
- Append-only. One line per `ProviderDebugEntry`.
- Rotated when a single file exceeds `10 MiB`: rename to
  `<sessionId>.<n>.jsonl` and start fresh. Keep at most 5 rotated
  files per session.
- A periodic cleaner (run on app start) deletes log files for
  sessions that no longer exist in SQLite, and any debug-log file
  older than 30 days regardless. Both bounds live as named constants.

## Data model

- **AppSettings**: `debugLogging: { enabled: boolean }`. Persisted
  via existing settings storage.
- **In-memory**: `Map<sessionId, RingBuffer<ProviderDebugEntry>>` in
  `ProviderDebugService`. No SQLite changes.
- **Disk**: JSONL files under `userData/debug-logs/`. No schema
  migrations.

## IPC

- `provider:debug:event` — main → renderer. Single payload of
  `ProviderDebugEntry`. Renderer filters by `sessionId` in store.
- `provider:debug:list(sessionId)` — renderer → main. Returns the
  current ring buffer for backfill when the drawer mounts.
- `provider:debug:openFolder()` — renderer → main. Opens the debug
  log folder in OS file manager.

## Testing

- Pure tests for `LivenessSignal` derivation across the three
  threshold buckets and the "no events at all" edge.
- Pure tests for ring buffer reducer (FIFO eviction at capacity).
- Pure tests for JSONL line serialization (deterministic field
  order, safe handling of payloads that fail `JSON.stringify`).
- Provider integration tests assert that the existing happy-path
  notification still reaches the session emitter when `debugSink` is
  attached, and that unknown methods reach `debugSink` but not the
  transcript.
- Service test: liveness clock emits the right notes at the right
  times given a fake clock and a session that has been silent for
  61s, then 181s, then receives a notification (resets).
- Settings round-trip test for `debugLogging.enabled`.
- Smoke test: with the toggle enabled, a session's JSONL file exists
  and contains at least one entry after a turn completes.

## Open questions / follow-ups

- **Sensitive payload masking.** Provider events include the model
  prompt and tool arguments, which can include user secrets if the
  user pasted any. V1 captures verbatim. A V2 toggle for "redact
  message text" is plausible but adds complexity; deferred.
- **Per-provider toggles.** V1 uses a single global flag. If users
  want to debug only one provider at a time we add a per-provider
  flag later.
- **Telemetry upload.** Out of scope. Files stay local.
- **Threshold tuning.** 60s/180s is a guess based on observed GPT-5
  reasoning latency. We adjust based on real captures from the
  shipped build.
