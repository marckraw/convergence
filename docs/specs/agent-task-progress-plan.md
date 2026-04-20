# Agent Task Progress — Implementation Plan

Companion to `docs/specs/agent-task-progress.md`. Work is sliced into
six phases. Each phase is independently shippable and verified before
the next begins. Verification means `npm run test:pure`,
`npm run test:unit`, `npm run typecheck`, and `chaperone check --fix`
all pass unless the phase explicitly notes otherwise.

## Phase P1 — Types, pure, threshold helpers

Goal: land the shared types and the pure threshold logic. No runtime
wiring, no IPC. Pure-testable end to end.

- [x] New file `electron/backend/task-progress/task-progress.types.ts`:
  - [x] `TaskProgressEvent` discriminated union exactly as spec'd.
  - [x] `TaskProgressSnapshot` for the renderer-side aggregate.
- [x] New file `electron/backend/task-progress/task-progress.pure.ts`:
  - [x] `applyEvent(snapshot | null, event): TaskProgressSnapshot` —
        reducer that aggregates an event into a snapshot (handles
        `started` → initial snapshot, chunk events → byte counters +
        `lastEventAt`, `settled` → terminal state).
  - [x] `shouldEvictSnapshot(snapshot, now, graceMs): boolean`.
- [x] `deriveForkProgressLabel` lives in
      `src/features/session-fork/session-fork.pure.ts` (kept inline
      per "decide by size"; ~25 LOC did not warrant a new file).
  - [x] `deriveForkProgressLabel({ elapsedMs, msSinceLastEvent }):
    { primary: string; secondary: string | null; stale: boolean }`
        — implements the three tiered hints from the spec.
- [x] Pure tests for both files covering all threshold branches,
      reducer branches, and eviction edges.

Verification: tests green. No IPC, no providers touched.

## Phase P2 — Main-process emit helper + IPC channel

Goal: a single place to broadcast `TaskProgressEvent`s to renderer
windows. No callers yet — this phase is the channel itself.

- [ ] New file `electron/backend/task-progress/task-progress.service.ts`:
  - [ ] `class TaskProgressService` with `emit(event)`, holding a
        reference to a `BroadcastFn` injected at construction (so
        tests can substitute a stub instead of a real
        `BrowserWindow`).
  - [ ] Default real-runtime broadcast implementation iterates
        `BrowserWindow.getAllWindows()` and sends on
        `task:progress`.
- [ ] Register the service in `electron/main/index.ts` bootstrap and
      expose it on the DI object passed to services that will use it.
- [ ] Preload (`electron/preload/index.ts`): expose
      `taskProgress.subscribe(cb)` over `contextBridge`, returning an
      unsubscribe function.
- [ ] Extend `src/shared/types/electron-api.d.ts` with the new method.
- [ ] Unit test `task-progress.service.test.ts` with an injected
      broadcast stub: asserts emit forwards exactly what was passed.

Verification: tests green, typecheck clean. Preload exposure smoke-
tested manually by logging from devtools.

## Phase P3 — Renderer store + hook

Goal: renderer ingests events into a snapshot map, exposes a hook.

- [ ] New slice `src/entities/task-progress/` with:
  - [ ] `task-progress.types.ts` (re-export from shared or duplicate
        the minimum needed — pick one, note in the file).
  - [ ] `task-progress.model.ts` — Zustand store:
    - state: `snapshots: Record<string, TaskProgressSnapshot>`
    - actions: `ingest(event)`, `evict(requestId)`, internal reducer
      powered by `applyEvent` from P1.
  - [ ] `use-task-progress.ts` — hook that reads a snapshot by id
        and owns a `setInterval(1000)` that re-renders so consumers
        get live `elapsedMs`.
  - [ ] `index.ts` public API: `useTaskProgress`, types.
- [ ] Mount a single subscription in `src/app/App.container.tsx`:
      on mount, `window.electronAPI.taskProgress.subscribe(ingest)`,
      unsubscribe on unmount.
- [ ] Unit tests:
  - [ ] Store reducer tests — thin wrapper over the pure reducer,
        plus eviction timer behavior (use fake timers).
  - [ ] Hook tests (React Testing Library + fake timers): verify
        1s tick, `settled` surfaces, unmount clears interval.

Verification: tests green. No UI changes visible yet.

## Phase P4 — Provider plumbing

Goal: `runClaudeOneShot` and `runCodexOneShot` emit progress when a
`requestId` is present.

- [ ] Extend `OneShotInput` in
      `electron/backend/provider/provider.types.ts` with
      `requestId?: string`.
- [ ] `ClaudeCodeProvider.oneShot` receives a `TaskProgressService`
      at construction (or via deps). Thread it into
      `runClaudeOneShot`. On spawn → `started`. On stdout/stderr data
      → chunk events. On exit/timeout/error → `settled`.
- [ ] Same for `CodexProvider.oneShot` /
      `PIProvider.oneShot` (all providers that currently implement
      `oneShot`).
- [ ] Provider tests: emit nothing when `requestId` absent; emit the
      expected sequence when set. Use an in-memory stub for
      `TaskProgressService.emit`.

Verification: tests green. End-to-end still dormant — no caller
passes a `requestId` yet.

## Phase P5 — Fork-preview wiring + UI

Goal: fork dialog shows live elapsed time and tiered hints for the
summary extraction preview.

- [ ] `SessionForkService.previewSummary` accepts a `requestId` and
      forwards it into both `provider.oneShot(...)` calls.
- [ ] IPC layer (`session:fork:previewSummary`): accept a caller-
      supplied `requestId` in the request payload.
- [ ] Renderer `sessionFork` API / store: when `previewFork(parentId)`
      runs, it generates a `requestId` (crypto.randomUUID), writes it
      into a `currentPreviewRequestId` field on the fork store, and
      passes it in the IPC call.
- [ ] `SessionForkDialogContainer`: read `currentPreviewRequestId`
      and `useTaskProgress(requestId)`. Compute the label via
      `deriveForkProgressLabel` (from P1) and pass it to the
      presentational component.
- [ ] `SessionForkDialog` presentational: when
      `preview.status === 'loading'`, render `primary` and optionally
      `secondary`. When `stale === true`, render the "No output in
      the last 30s" cue in a warning tone.
- [ ] Container tests:
  - [ ] Slow preview path: mock oneShot with a delayed resolve,
        advance fake timers past 30s threshold, assert secondary
        hint appears.
  - [ ] Stale path: simulate no chunk events for 30s after start,
        assert stale warning renders.
  - [ ] Success path: when `settled: ok` arrives, hints disappear
        and seed markdown renders (existing behavior).

Verification: full gate. Smoke-test by hand in dev: open fork dialog,
pick summary, watch counter tick and hint appear.

## Phase P6 — Auto-naming opt-in + cleanup

Goal: wire the primitive into session auto-naming so the second
real caller exists, even without visible UI. Proves the abstraction
isn't over-fit to fork preview.

- [ ] `SessionNamingService.generateName` generates a `requestId`
      and passes it into `provider.oneShot(...)`. No UI surface.
- [ ] Add a minimal log subscriber for dev builds only: in
      `App.container.tsx` dev-mode branch, log `TaskProgressEvent`s
      to the console for visibility. (Behind an env flag, not
      shipped to users.)
- [ ] Update `docs/specs/agent-task-progress.md` "Open questions"
      section if any gaps became obvious during P5/P6.
- [ ] Changeset: single patch bump covering the whole series.

Verification: full gate. Changeset present.

## Rollback notes

Each phase is additive:

- P1–P3 add code but no behavior change.
- P4 adds branches behind the `requestId` check; providers behave
  identically when absent.
- P5 is the only phase with user-visible change. If the UI is
  wrong we revert P5 only; the primitive stays.
- P6 adds a second caller but no UI.

Revert granularity is one phase = one or two commits.
