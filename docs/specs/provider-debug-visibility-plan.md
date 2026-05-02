# Provider Debug Visibility — Implementation Plan

Companion to `docs/specs/provider-debug-visibility.md`. Work is sliced
into seven phases across two PRs. Each phase is independently
shippable. Verification per phase: `npm run typecheck`,
`npm run test:pure`, `npm run test:unit`, `chaperone check --fix`, and
`npm install` before any of the above if dependencies change.

PR 1 = phases P1–P3 (always-on visibility, no settings, no UI changes).
PR 2 = phases P4–P7 (settings toggle, JSONL on disk, debug drawer).

Both PRs land before the next public release.

## Phase P1 — Pure primitives (provider-debug + liveness)

Goal: land the shared types, the ring-buffer reducer, and the
liveness threshold derivation. No runtime wiring, no IPC, no
providers touched.

- [ ] New `electron/backend/provider-debug/provider-debug.types.ts`:
  - [ ] `ProviderDebugEntry` discriminated by `channel`.
  - [ ] `ProviderDebugRingState` (capacity + entries).
- [ ] New `electron/backend/provider-debug/provider-debug.pure.ts`:
  - [ ] `appendEntry(state, entry, capacity): ProviderDebugRingState`
        with FIFO eviction.
  - [ ] `serializeEntry(entry): string` returning a deterministic
        JSONL line; falls back to `{ ...entry, payload: '<unserializable>' }`
        when the raw payload throws on `JSON.stringify`.
- [ ] New `electron/backend/provider/liveness.pure.ts`:
  - [ ] `LIVENESS_QUIET_MS`, `LIVENESS_SILENT_MS` constants.
  - [ ] `deriveLiveness({ lastEventAt, now }): LivenessSignal`.
- [ ] Pure tests covering: ring eviction at capacity, unserializable
      payload fallback, all three liveness branches plus the
      `lastEventAt = null` edge.

Verification: tests green.

## Phase P2 — Liveness clock in SessionService

Goal: emit the 60s and 180s notes when an active session has been
silent. No provider touchpoints in this phase — uses an existing
`onDelta` hook to learn about events, plus a new `onActivityHeartbeat`
hook the providers will land in P3.

- [ ] Extend `SessionHandle` types with an optional
      `onActivityHeartbeat: (cb: () => void) => void`. Providers that
      don't implement it stay backwards-compatible.
- [ ] In `SessionService`: maintain
      `Map<sessionId, { lastEventAt: number; warned: { quiet: boolean; silent: boolean } }>`.
      Reset on `setStatus('running')`, `turn-end`, and provider
      restart.
- [ ] Bump `lastEventAt` on every `applyDelta` call (already a
      session-level chokepoint).
- [ ] Add a single 5-second `setInterval` in `SessionService` started
      lazily when the first session enters `running`. The interval
      iterates `activeHandles`, calls `deriveLiveness`, and emits one
      `addNote` per (session, threshold) the first time it crosses.
- [ ] Stop the interval when no session is `running`.
- [ ] Service test with `vi.useFakeTimers()` covering: silent 61s →
      one info note, silent 181s → one warning note, receives a delta
      → both flags reset.

Verification: tests green. Manually start a session, leave it idle,
confirm notes appear.

## Phase P3 — Provider default-case capture + reasoning mapping

Goal: stop dropping unknown notifications, and map Codex `reasoning`
items to the `'thinking'` activity. No IPC. The captured entries flow
into a console-only sink for now (`ProviderDebugService` lands in P4);
the P3 sink is a tiny in-process logger that prints to
`process.stderr` so users running the dev build see it. In production
without P4, the sink is a no-op.

Wiring is the same shape that P4 will reuse: providers accept an
optional `debugSink: { record(entry) }` parameter. P3 ships a default
no-op implementation; P4 swaps it for the real service.

- [ ] New `electron/backend/provider-debug/provider-debug-sink.ts`:
  - [ ] `interface ProviderDebugSink { record(entry: ProviderDebugEntry): void }`
  - [ ] `noopDebugSink` (constant).
  - [ ] `consoleDebugSink` (development helper, prints serialized
        entries to `process.stderr`).
- [ ] Codex provider:
  - [ ] Accept `debugSink` in constructor (default `noopDebugSink`).
  - [ ] Add `default` case to the notification switch that calls
        `debugSink.record({ channel: 'notification', method, ... })`.
  - [ ] Hook `child.stdout.on('data', ...)` and stderr to record
        `{ channel: 'stdout', bytes: chunk.length }` etc. Existing
        stdout consumption stays untouched.
  - [ ] Map `item/started` items where `item.type === 'reasoning'` to
        `'thinking'` activity in `codex-activity.pure.ts`. Item type
        is verified against P3-captured logs before merging; if Codex
        uses a different shape we adjust here, not later.
- [ ] Pi provider: same shape — default case in `handleEvent`,
      stdout/stderr taps. Pi already maps `thinking_delta` so no
      reasoning rewire is needed.
- [ ] Claude Code provider: tap the streaming JSON parse site and
      stderr/exit. Claude doesn't have a `default` switch in the
      same shape; the capture sits at the parse-error path plus a
      generic "every event passed to the activity reducer" log.
- [ ] Provider tests assert that with `noopDebugSink` (default), no
      record calls happen, and existing snapshot tests stay green.
- [ ] New tests with a stub sink assert each provider records the
      expected entries on a happy-path turn.

Verification: tests green. Manually run a Codex session that calls an
MCP tool, confirm `consoleDebugSink` prints the unknown methods.

## Phase P3.5 — Wire `consoleDebugSink` for dev builds (PR 1)

Goal: until P4 ships the real service, dev builds use
`consoleDebugSink`. Production builds use `noopDebugSink` so we don't
spam logs.

- [ ] In `electron/main/index.ts`, choose sink by
      `import.meta.env.DEV` (or `app.isPackaged === false`).
- [ ] Inject the chosen sink into each provider via
      `provider-registry.ts`.
- [ ] Smoke test: run `npm run dev`, exercise a turn, observe stderr
      lines.

Verification: dev runs print sink output; packaged build does not.

**End of PR 1.** PR 1 ships P1 + P2 + P3 + P3.5.

## Phase P4 — `ProviderDebugService` + IPC

Goal: replace `consoleDebugSink` with a real service that owns the
per-session ring buffer and exposes IPC for the renderer.

- [ ] New `electron/backend/provider-debug/provider-debug.service.ts`:
  - [ ] Owns `Map<sessionId, ProviderDebugRingState>`.
  - [ ] `bind(sessionId): ProviderDebugSink`.
  - [ ] `record(entry)` updates the ring and broadcasts on
        `provider:debug:event`.
  - [ ] `list(sessionId): ProviderDebugEntry[]` for backfill.
  - [ ] No JSONL writing yet — that lands in P5 conditionally.
- [ ] IPC handlers `electron/backend/provider-debug/provider-debug.ipc.ts`:
  - [ ] `provider:debug:list` (renderer → main).
- [ ] Preload exposes `providerDebug.subscribe(cb)` and
      `providerDebug.list(sessionId)`.
- [ ] Renderer Zustand store
      `src/entities/provider-debug/provider-debug.model.ts` ingests
      events and exposes a per-session selector.
- [ ] Service test asserts `record` updates the ring, broadcasts the
      event, and `list` returns the buffer in arrival order.

Verification: tests green. Manually subscribe in DevTools console,
confirm events flow.

## Phase P5 — Settings toggle + JSONL persistence

Goal: gate JSONL writes behind a setting; ship the setting UI.

- [ ] Extend `AppSettings` with `debugLogging: { enabled: boolean }`,
      default `false`. Migration: missing field reads as `false`.
- [ ] `ProviderDebugService` checks the setting before writing JSONL.
      Setting reads route through `AppSettingsService`.
- [ ] JSONL writer: append-only, rotation at `10 MiB`, keep 5 rotated
      files per session. Cleanup pass on app start removes files for
      deleted sessions and anything older than 30 days. Constants in
      `provider-debug.pure.ts` so they're tested.
- [ ] Settings dialog: new switch row "Capture provider debug logs"
      with the spec's subtitle. Reuses existing settings widgets.
- [ ] Tests:
  - [ ] Round-trip the new setting via `AppSettingsService`.
  - [ ] Pure tests for rotation threshold and cleanup-age logic.
  - [ ] Service integration test verifies a JSONL file is written
        when enabled and absent when disabled, using a temp dir.

Verification: tests green. Toggle in app, run a turn, inspect the
generated file.

## Phase P6 — Debug drawer UI

Goal: in-app surface for the captured events.

- [ ] New widget `src/widgets/session-debug-drawer/`:
  - [ ] `session-debug-drawer.container.tsx` — subscribes via the
        renderer store, manages open state.
  - [ ] `session-debug-drawer.presentational.tsx` — virtualized list
        with timestamp, channel, method, expandable JSON payload.
  - [ ] `session-debug-drawer.styles.ts`.
  - [ ] `index.ts` public surface.
- [ ] Session header overflow menu shows "Open debug drawer" only
      when `debugLogging.enabled === true`.
- [ ] "Copy log path" action and "Open log folder" action wired
      through new IPC `provider:debug:openFolder`.
- [ ] Container test: enabled setting + non-empty store renders
      entries; disabled setting hides the menu item.
- [ ] Presentational test: snapshot of a few representative entries.

Verification: tests green. Visual check: open drawer during a real
turn, scroll, expand a payload, copy path.

## Phase P7 — Cleanup, changeset, docs

- [ ] Add a changeset entry summarizing PR 2 (under `.changeset/`).
- [ ] Update `docs/runbook/` if a runbook exists for "diagnosing
      stuck sessions"; otherwise add a short note in CONTEXT.md.
- [ ] Sweep `chaperone check --fix` once more, verify no drift.

**End of PR 2.** PR 2 ships P4 + P5 + P6 + P7.

## Risk notes

- **Capture volume.** A chatty provider could emit hundreds of
  entries per second. The ring's bounded capacity (500) protects
  memory; JSONL rotation protects disk. If we still see issues we
  add per-channel sampling.
- **Setting flag mid-session.** Toggling the setting while a session
  is running takes effect on the next entry; in-memory ring is
  unchanged. Documented in the settings subtitle if confusing.
- **Provider-shape drift.** The default-case capture is exactly what
  protects us here: when a provider CLI ships a new method, we see
  it in the log, not in a silently broken UI.
