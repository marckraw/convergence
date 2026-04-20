# Agent Task Progress

## Goal

Give the renderer a uniform way to observe long-running agent backend
tasks — primarily provider `oneShot` calls today, and any future
request/response style agent work — so the UI can show liveness cues
(elapsed time, "still working…" hints, staleness warnings) without each
feature re-inventing its own plumbing.

The canonical motivating case is the session-fork **Structured summary**
preview: extracting a summary from a full parent transcript can take
30–120 seconds, and today the dialog shows a static "Extracting
summary from parent transcript…" string the entire time before
resolving or timing out. Session auto-naming has the same shape and
the same problem.

This spec defines the primitive once so fork-preview, auto-naming, and
any later oneShot-style task can opt into the same heartbeat without
new ad-hoc channels.

## Product intent

- Any backend task that runs long enough to feel stuck should be able
  to emit a progress stream the renderer can subscribe to.
- The renderer should be able to display at least: elapsed time since
  the task started, and a "this is taking longer than usual" hint after
  a configurable threshold.
- Subscription must be opt-in per call-site. A caller that does not
  want progress (e.g. short calls) passes nothing and gets today's
  behavior — no IPC traffic, no listeners.
- Progress is observability only. It must not affect task semantics,
  must not replace the return value, and must not change the caller's
  existing error-handling path.

## Non-goals (V1)

- **No cancellation.** We do not add a "Cancel" control or a way to
  abort the backend task from the renderer. Timeouts remain the only
  termination path. (Cancellation would add bidirectional control
  flow; it is a natural follow-up, but out of scope here.)
- **No session streaming refactor.** Streaming sessions already expose
  `SessionStatus` + `ActivitySignal` via `SessionHandle`. V1 does not
  touch that path. We intentionally leave the door open to align
  shapes later, but refactoring live-session observability is a
  separate, riskier piece of work.
- **No provider-level stage semantics.** V1 events describe transport-
  level activity ("stdout chunk arrived at t=1.2s"), not semantic
  stages ("model started responding"). Providers can enrich later by
  emitting `stage` events; V1 just guarantees the channel exists.
- **No progress bars.** Percent-complete is not derivable from a CLI
  subprocess's output stream. V1 presents elapsed time only.
- **No persistence.** Progress events are live-only. If the renderer
  was not listening when an event fired, it is gone. A new subscriber
  gets the remembered "last snapshot" (see below) but no history.
- **No cross-process tracing.** This is an intra-app observability
  primitive, not an OpenTelemetry integration.

## V1 behavior

### Task identity

Every observable task has a caller-generated `requestId: string`. The
backend does not assign IDs. The caller (fork service, naming service,
future callers) creates one when starting the task and passes it both
to the backend call and to anything in the renderer that wants to
observe progress.

The renderer-side hook also accepts a `requestId`; absent a matching
stream, it returns a zero state.

### Progress event shape

```ts
type TaskProgressEvent =
  | { requestId: string; kind: 'started'; at: number }
  | { requestId: string; kind: 'stdout-chunk'; at: number; bytes: number }
  | { requestId: string; kind: 'stderr-chunk'; at: number; bytes: number }
  | { requestId: string; kind: 'settled'; at: number; outcome: 'ok' | 'error' | 'timeout' }
```

- `at` is `Date.now()` on the main process, forwarded verbatim.
- `bytes` is the size of the chunk that just arrived. Used for
  "receiving output" feedback; renderer typically ignores the value
  and only uses the timestamp.
- `settled` is always the last event in a stream; subscribers should
  release their listeners on receipt.

### IPC contract

A single IPC channel: `task:progress`. The main process sends events
to **all** renderer windows; the renderer preload exposes:

```ts
window.electronAPI.taskProgress.subscribe(
  (event: TaskProgressEvent) => void,
): () => void // returns unsubscribe
```

Renderer code does not subscribe to a specific `requestId` at the IPC
boundary. Filtering happens in the renderer store (see below). This
keeps the IPC surface minimal — one channel, one payload shape.

### Renderer state

A small Zustand store (`src/entities/task-progress/task-progress.model.ts`)
maintains a map `requestId -> TaskProgressSnapshot`:

```ts
type TaskProgressSnapshot = {
  requestId: string
  startedAt: number
  lastEventAt: number
  stdoutBytes: number
  stderrBytes: number
  settled: null | { at: number; outcome: 'ok' | 'error' | 'timeout' }
}
```

A single top-level subscription (mounted once by `App.container.tsx`)
ingests IPC events into this store. The store evicts `settled`
snapshots after a short grace window (e.g. 10s) so hooks that mount
right after completion can still render a final state.

A hook `useTaskProgress(requestId: string | null)`:

- Returns `null` when no `requestId` is given or no snapshot exists.
- Otherwise returns `{ elapsedMs, msSinceLastEvent, settled }` computed
  on each tick of a 1s interval (the hook owns the interval so
  consumers don't each spin one).

### Heartbeat emission (V1 callers)

Two callers in V1, both in `oneShot` flows:

1. **`SessionForkService.previewSummary`** — generates a `requestId`
   before the first `provider.oneShot(...)` call, passes it through
   `OneShotInput`, forwards it to the renderer via the existing
   `session:fork:previewSummary` IPC response path as a prelude event
   — *actually*, see "wiring" below; the `requestId` is returned
   synchronously so the renderer can bind the hook before the promise
   resolves.
2. **`SessionNamingService.generateName`** — same shape, but the
   rename currently happens silently in the background. V1 wires the
   primitive but surfaces UI only in fork preview. Auto-naming UI is
   a follow-up once we decide where to show it.

#### Wiring for fork preview

The current IPC flow is a single request/response: renderer invokes
`session:fork:previewSummary(parentId)` and awaits a `ForkSummary`.
That is fine, but the renderer needs a `requestId` **before** that
promise settles so the hook can attach.

V1 changes the IPC shape minimally:

```ts
// before
preview(parentId): Promise<ForkSummary>

// after
preview(parentId): { requestId: string; result: Promise<ForkSummary> }
```

The renderer generates the `requestId` (crypto.randomUUID) and passes
it in. The backend accepts it and forwards to `provider.oneShot`. No
change to the synchronous nature of the call.

### Provider plumbing

`OneShotInput` grows an optional `requestId?: string`. Each provider's
`runClaudeOneShot`/`runCodexOneShot` emits `TaskProgressEvent`s when a
`requestId` is set:

- `started` when the child process spawns.
- `stdout-chunk`/`stderr-chunk` on every data chunk.
- `settled` on exit, timeout, or error.

Emission goes through a single main-process helper,
`emitTaskProgress(event)`, that broadcasts to all renderer windows via
`BrowserWindow.getAllWindows().forEach(w => w.webContents.send('task:progress', event))`.

If `requestId` is not set, nothing is emitted. This keeps the feature
fully opt-in and makes non-observed calls free.

### Fork dialog UX

The `SessionForkDialog` presentational component gains a small
`<PreviewProgress>` block, visible only when `strategy === 'summary'`
and `preview.status === 'loading'`:

- Line 1: "Extracting summary from parent transcript… (12s)"
- Line 2, after 30s: "Still working. Long transcripts can take
  up to a couple of minutes."
- Line 3, after 90s: "No output in the last 30s." — shown only when
  `msSinceLastEvent > 30_000`. This is the "it might actually be
  stuck" cue distinct from "it's still running".

Thresholds (`30_000`, `90_000`, `30_000`) live as named constants in
`session-fork.pure.ts` so they're tested and not magic numbers.

## Data model

Nothing persisted. Renderer store only; evicted shortly after
`settled`.

## Testing

- Pure tests for threshold-derivation logic (given a snapshot + now,
  which hint label applies).
- Renderer store tests: ingest events, verify snapshot updates, verify
  eviction after grace window.
- Hook tests with fake timers: verify `elapsedMs` ticks, verify
  settled state is surfaced, verify unmount stops the interval.
- Container test for fork preview: simulate slow oneShot by delaying
  the mocked call, advance fake timers, assert the hint text changes
  at the configured thresholds.
- Provider tests: `runClaudeOneShot` called with a `requestId` emits
  `started`/`stdout-chunk`/`settled` in order; called without
  `requestId` emits nothing.

## Open questions (defer to follow-ups)

- **Cancellation.** Add `task:cancel(requestId)` and kill the child on
  receipt. Needs UX in the fork dialog and elsewhere.
- **Session streaming alignment.** Whether to retire
  `ActivitySignal` in favor of `TaskProgressEvent`, or bridge them.
- **Telemetry.** Logging progress events for diagnostics is trivially
  easy once the helper exists; decide whether/where to log.
- **Auto-naming surface.** Where (if anywhere) to show naming
  progress in the UI.
