# Turn-Grouped File Changes — Implementation Plan

Companion to `docs/specs/turn-grouped-file-changes.md`. Work is sliced
into six phases, each independently shippable and verified before the
next begins. Each phase ends with all four gates green:
`npm run test:pure`, `npm run test:unit`, `npm run typecheck`,
`chaperone check --fix`.

## Phase T1 — Backend foundation: schema, types, pure helpers

Goal: data model lands and all non-runtime logic is tested. No runtime
wiring, no IPC, no UI. Everything gated behind existing schema
migration conventions in `electron/backend/database/database.ts`.

- [ ] Extend `SCHEMA` in `electron/backend/database/database.ts` to
      include `session_turns` and `session_turn_file_changes` tables
      plus their indexes, following existing idempotent
      `CREATE TABLE IF NOT EXISTS` pattern.
- [ ] Add `SessionTurnRow` and `SessionTurnFileChangeRow` to
      `electron/backend/database/database.types.ts`.
- [ ] Create `electron/backend/session/turn/turn.types.ts` with domain
      shapes: `Turn`, `TurnFileChange`, `TurnStatus`,
      `TurnFileChangeStatus`.
- [ ] Create `electron/backend/session/turn/turn.pure.ts` with pure
      helpers:
  - [ ] `deriveTurnSummary(firstAssistantMessage: string | null): string | null`
        — trim, collapse newlines, truncate at 80 chars with ellipsis,
        null if no message.
  - [ ] `computeFileChangesBetweenSnapshots(baseline: Snapshot, current: Snapshot): TurnFileChange[]`
        — producing status/additions/deletions/diff per file. Handles
        added, modified, deleted, renamed, binary.
  - [ ] `truncateDiffIfTooLarge(diff: string, maxBytes: number): string`
        — applies 200 KB cap with truncation marker.
  - [ ] `turnFromRow(row: SessionTurnRow): Turn` and
        `turnFileChangeFromRow(row: SessionTurnFileChangeRow):
TurnFileChange`.
- [ ] Pure tests in `turn.pure.test.ts` covering all branches of each
      helper, including edge cases: empty input, rename detection,
      binary file sentinel, diff truncation exactly at threshold.
- [ ] Database test additions in
      `electron/backend/database/database.test.ts`: assert the two
      new tables exist with expected columns and indexes, assert
      `ON DELETE CASCADE` on both FKs, assert
      `UNIQUE(session_id, sequence)` on `session_turns` and
      `UNIQUE(turn_id, file_path)` on `session_turn_file_changes`.

Verification: `npm run test:pure`, `npm run test:unit`,
`npm run typecheck`, `chaperone check --fix` all pass. No renderer
changes.

## Phase T2 — Turn capture service

Goal: a standalone backend service that can take baselines, compute
deltas, persist turn rows, and recover from crashes. No session wiring
yet — the service exposes an API but nothing calls it in the real
lifecycle.

- [ ] Extend `electron/backend/git/git.service.ts` with any helpers
      required by capture (if the existing `getStatus` + `getDiff`
      surface is sufficient, skip this). Minimum needed: a way to read
      untracked file contents for baseline. If missing, add
      `readUntrackedFiles(repoPath: string): Promise<Map<string, string>>`.
- [ ] Create `electron/backend/session/turn/turn-capture.service.ts`:
  - [ ] Constructor takes a `GitService`, a database handle, and a
        delta-emit function (will be wired to session deltas in T3).
  - [ ] `startTurn({ sessionId, turnId, workingDirectory }): Promise<void>`
        — inserts the `running` turn row with next sequence, captures
        in-memory baseline. Short-circuits for non-git workspaces
        (still inserts the row, skips baseline).
  - [ ] `endTurn({ sessionId, turnId, status }): Promise<void>` —
        150 ms debounce, computes delta vs baseline, inserts
        `session_turn_file_changes` rows in a transaction, updates
        turn row (`ended_at`, final status, `summary`), drops the
        baseline, emits `turn.add` and `turn.fileChanges.add` deltas.
        (Delta emission is a no-op in T2; wired in T3.)
  - [ ] `recoverRunningTurns(): void` — synchronous boot-time call
        that transitions any `running` rows to `errored` with
        `ended_at = now`. No file-change backfill.
  - [ ] `listTurns(sessionId): Turn[]` and
        `listFileChanges(turnId): TurnFileChange[]` query helpers,
        ordered by sequence / created_at.
  - [ ] `getFileDiff(turnId, filePath): string` returns the stored
        per-turn diff, or truncation marker if capped.
- [ ] Unit tests `turn-capture.service.test.ts` with an in-memory DB
      and a stub `GitService` covering:
  - [ ] start + end with zero file changes
  - [ ] start + end with added, modified, deleted, renamed files
  - [ ] binary file handling
  - [ ] diff truncation at the 200 KB boundary
  - [ ] non-git workspace short-circuit
  - [ ] crash recovery query transitions `running` → `errored`
  - [ ] debounce coalescing: two `endTurn` calls within 150 ms
        produce a single persisted result

Verification: all four gates. No session-service changes yet.

## Phase T3 — Turn activation in session service + emitter

Goal: real turns get created and stamped on every user message. Items
carry `turnId`. Deltas flow. No UI yet — verify via DB state and
existing session-service tests.

- [ ] Extend `ProviderSessionEmitter`
      (`electron/backend/provider/provider-session.emitter.ts`):
  - [ ] Add `private currentTurnId: string | null = null`.
  - [ ] Replace `turnId: null` at line 266 of `buildBaseItem()` with
        `turnId: this.currentTurnId`.
  - [ ] Add `setCurrentTurnId(turnId: string | null): void`.
- [ ] Extend `SessionHandle` type in
      `electron/backend/provider/provider.types.ts` with:
  - [ ] `beginTurn: (turnId: string) => void`
  - [ ] `endTurn: () => void`
        Each provider implementation (`claude-code`, `codex`, `pi`) forwards
        to its emitter's `setCurrentTurnId`. Add matching test-only stubs in
        affected test files.
- [ ] Extend `SessionDelta` union type with:
  - [ ] `{ kind: 'turn.add'; turn: Turn }`
  - [ ] `{ kind: 'turn.fileChanges.add'; turnId: string;
fileChanges: TurnFileChange[] }`
        Add to the renderer `SessionDelta` type mirror in
        `src/entities/session/session.types.ts`.
- [ ] Inject `TurnCaptureService` into the session service. Wire its
      delta-emit callback to the existing per-session delta dispatcher.
- [ ] In `SessionService.start()` and `SessionService.sendMessage()`,
      before calling `startHandle()` / `handle.sendMessage()`:
  - [ ] Generate new `turnId`.
  - [ ] Call `turnCaptureService.startTurn({ sessionId, turnId,
workingDirectory })`.
  - [ ] After handle exists (startHandle path) or immediately
        (sendMessage path), call `handle.beginTurn(turnId)`.
- [ ] In `SessionService.handleLifecycle()`, when status transitions
      to `'completed'` or `'failed'`:
  - [ ] Read the active turn id from a new
        `Map<sessionId, turnId>` on the service.
  - [ ] Call `handle.endTurn()` on the handle (drops stamping).
  - [ ] Call `turnCaptureService.endTurn({ sessionId, turnId,
status })`.
  - [ ] Clear the map entry.
- [ ] Call `turnCaptureService.recoverRunningTurns()` once during
      backend bootstrap (wherever other startup services are
      initialized — see existing `app-settings.service` init for
      precedent).
- [ ] Session service tests `session.service.test.ts` additions:
  - [ ] `start` generates a turn row, stamps all emitted items with
        the same `turnId`, emits `turn.add` delta.
  - [ ] `sendMessage` on an active session generates a second turn
        row with sequence 2.
  - [ ] Status transition to `completed` triggers `endTurn` and emits
        `turn.fileChanges.add`.
  - [ ] Status transition to `failed` marks turn `errored`.
  - [ ] App-restart mid-turn: simulate by inserting `running` row
        directly and calling `recoverRunningTurns`; assert `errored`.
- [ ] Update `session.service.test.ts` existing tests that mock
      `SessionHandle` to include `beginTurn` / `endTurn` no-op stubs.

Verification: all four gates. Manual smoke check: start Convergence,
send a message, confirm `session_turns` and
`session_turn_file_changes` rows appear (via in-app DB or sqlite3
inspection at the dev DB path).

## Phase T4 — Renderer entity + IPC surface

Goal: renderer can query turns and subscribe to turn deltas. Still no
UI changes visible — this is the API layer.

- [ ] Create `src/entities/turn/turn.types.ts` mirroring backend
      `Turn`, `TurnFileChange`, `TurnStatus`, `TurnFileChangeStatus`.
- [ ] Create `src/entities/turn/turn.api.ts` with:
  - [ ] `listForSession(sessionId: string): Promise<Turn[]>`
  - [ ] `getFileChanges(turnId: string): Promise<TurnFileChange[]>`
  - [ ] `getFileDiff(turnId: string, filePath: string): Promise<string>`
- [ ] Create `src/entities/turn/index.ts` exporting types and the
      `turnsApi` object.
- [ ] Extend `src/shared/types/electron-api.d.ts` with the
      `turns` namespace.
- [ ] Extend `electron/preload/index.ts` to expose:
  ```ts
  turns: {
    listForSession: (sessionId) => ipcRenderer.invoke('turns:listForSession', sessionId),
    getFileChanges: (turnId)    => ipcRenderer.invoke('turns:getFileChanges', turnId),
    getFileDiff:    (turnId, p) => ipcRenderer.invoke('turns:getFileDiff', turnId, p),
  }
  ```
- [ ] Extend `electron/main/ipc.ts` with three new handlers routing
      to `turnCaptureService.listTurns` /
      `listFileChanges` / `getFileDiff`.
- [ ] Delta subscription: the renderer already subscribes to
      `SessionDelta`. Verify the two new kinds (`turn.add`,
      `turn.fileChanges.add`) round-trip through the existing
      pipeline without changes to IPC wiring. If the delta contract
      is serialized via a discriminated union check somewhere (type
      guard), add the two kinds.
- [ ] Unit tests for the renderer `turn.api.ts` with mocked
      `window.electronAPI.turns`.

Verification: all four gates. No rendered UI change yet.

## Phase T5 — Extended view UI

Goal: the extended view renders turn cards with diffs. Compact view
untouched.

- [ ] Create `src/widgets/session-view/turn-list.container.tsx`:
  - [ ] Fetches `turnsApi.listForSession(sessionId)` on mount / when
        session id changes.
  - [ ] Subscribes to `SessionDelta` (via the session entity's
        existing subscription hook) and merges `turn.add` /
        `turn.fileChanges.add` into local state.
  - [ ] Owns selection state: `{ turnId, filePath } | null`.
  - [ ] Renders `turn-card.presentational.tsx` for each turn,
        newest first, with the in-flight turn pinned top.
  - [ ] When a file is selected, fetches its per-turn diff via
        `turnsApi.getFileDiff(turnId, filePath)` and passes it to
        `diff-viewer.presentational.tsx`.
- [ ] Create `src/widgets/session-view/turn-card.presentational.tsx`:
  - [ ] Props: `{ turn, fileChanges, selected, onTurnClick,
onFileClick, expanded }`.
  - [ ] Renders header (sequence, counts, summary, badge) and
        conditional file list.
  - [ ] No stateful hooks. No side effects. No direct Electron
        imports. Chaperone-verified.
- [ ] Create `src/widgets/session-view/turn-file-item.presentational.tsx`:
  - [ ] Props: `{ fileChange, selected, onClick }`.
  - [ ] Mirrors the visual style of
        `changed-file-item.presentational.tsx` for consistency.
- [ ] Modify `changed-files-panel.container.tsx`:
  - [ ] When `expanded === true`, render `turn-list.container.tsx`
        in place of the flat list + diff pair. Keep the existing
        flat path behind `expanded === false`.
  - [ ] When `expanded === true` and the workspace is not a git
        repo (detected via existing `git.getStatus` returning an
        error / empty), render the "requires git" empty state
        instead of the turn list.
- [ ] Renderer tests:
  - [ ] `turn-list.container.test.tsx`: empty states (no turns, no
        changes, not-git), streaming new turn via delta, click
        selects file and loads per-turn diff.
  - [ ] `turn-card.presentational.test.tsx`: snapshot-ish render of
        completed / running / errored variants.
  - [ ] Extend `changed-files-panel.container.test.tsx` to assert
        that expanded mode renders the turn list and compact mode
        renders the existing flat list unchanged.
- [ ] Styling: `turn-list.styles.ts`, `turn-card.styles.ts` only if
      styles are non-trivial; otherwise inline Tailwind is fine
      (match the conventions already used in `changed-files-panel`).

Verification: all four gates + manual smoke: run agent, open
extended panel, verify turn cards appear live, click a file,
confirm per-turn diff (not cumulative) renders.

## Phase T6 — Transcript ↔ panel linking

Goal: turn cards and transcript are bidirectionally navigable.

- [ ] Transcript renderer: find the existing conversation list in
      `src/widgets/session-view/` (likely
      `transcript.container.tsx` / `transcript-entry.presentational.tsx`).
      Update it to:
  - [ ] Group consecutive entries by `turnId` visually (subtle
        separator or gutter marker). Null `turnId` items render
        as today, no grouping.
  - [ ] Render a clickable "Turn N" gutter that calls an
        `onTurnClick(turnId)` callback.
- [ ] Thread `onTurnClick` up to `session-view.container.tsx`
      which owns the shared selection state between transcript and
      panel (lift the `turn-list.container` selection to this
      parent if not already there).
- [ ] In `turn-list.container.tsx`: accept an external
      `selectedTurnId` prop. When the prop changes, scroll the
      card into view and highlight briefly.
- [ ] In `transcript.container.tsx`: accept an external
      `selectedTurnId` prop. When it changes, scroll the first
      item of that turn into view and highlight briefly.
- [ ] Renderer tests:
  - [ ] Clicking the transcript gutter marker updates panel
        selection and scrolls the card.
  - [ ] Clicking a turn card updates transcript selection and
        scrolls the first item.
- [ ] Update `transcript-entry.pure.test.ts` if existing assertions
      depend on flat (non-grouped) rendering.

Verification: all four gates + manual smoke: full round-trip of
selection both directions.

## Post-merge

- [ ] Add a changeset describing the new feature (see
      `.changeset/` examples from recent PRs — e.g. the
      `agent-finish-notifications` changeset referenced in
      `git log` history).
- [ ] No release notes copy required beyond the changeset; the
      existing release-notes pipeline picks it up.

## Deferred to Phase B (not in this plan)

- Inline review comments on diff lines
- Revert-turn action
- Risk flag computation
- Feedback-to-agent loop from comments
- Turn retention / pruning knobs
- Phase / goal grouping above turns
