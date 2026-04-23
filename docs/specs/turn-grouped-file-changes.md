# Turn-Grouped File Changes

## Goal

Promote file changes to a first-class citizen of the app. Today the changed
files panel re-runs `git status` + `git diff` on demand and shows a flat,
session-wide, live snapshot. It answers "what is currently dirty in the
working tree" but not "what did the agent actually do, and when." Developers
reviewing agent work have no structural cue for which change came from which
step of the agent's reasoning.

This spec introduces a persisted, agent-authored record of file changes,
grouped by **turn** (one user-message → agent-idle cycle). The extended view
of the changed-files panel is reshaped to read from this record and present a
turn-by-turn narrative of code edits that can be read alongside the
transcript.

This is the foundation primitive. It unlocks (in later phases) inline review
comments, revert-by-turn, rewind, and risk flagging. Those are explicit
non-goals in V1.

## Product intent

- Every file change the agent produces is attributed to exactly one **turn**,
  identified by `turnId`. A turn is one round-trip of agent execution: it
  starts when the user's message enters the session and ends when the agent
  goes idle (status `completed` or `failed`).
- The changed-files panel has two modes, both already present:
  - **Compact view** — unchanged. Continues to render a flat list from
    `git status`. Useful for "what's currently dirty overall."
  - **Extended view** — reshaped. Shows a turn-grouped list: each turn is a
    card, listing the files the agent touched in that turn, with per-turn
    diffs. Click a file in a turn to view the diff for that turn only.
- The turn record is derived from snapshots taken at turn boundaries, not
  from intercepting individual tool calls. This keeps capture
  provider-agnostic and catches filesystem edits made via `Bash` as well as
  via `Edit`/`Write` tool calls.
- Same file touched across multiple turns appears multiple times, once under
  each turn, with the incremental diff for that turn only. That is the
  point — reviewers see the agent's incremental thinking, not a cumulative
  blob.
- Turn cards are read-only in V1. No accept/reject, no revert, no inline
  comments, no feedback-to-agent. Those are deferred.
- Transcript ↔ panel two-way selection: clicking a turn card highlights the
  turn's first message in the transcript, and vice versa.
- Existing sessions are not backfilled. The feature only applies to turns
  that start after the feature ships. Existing sessions show an empty
  turn list in the extended view, and the compact view continues to work
  exactly as today.
- Sessions whose workspace is not a git repo degrade gracefully: the
  extended view shows "Turn-grouped changes require a git repository" and
  the compact view behaves as today (which also degrades to empty).

## Non-goals

- No accept, reject, revert, or rewind actions in V1. The panel is a
  reviewer, not an editor.
- No inline review comments in V1. Phase B — covered only as a hook-point
  sketch here so the data model leaves room.
- No risk flagging, no confidence indicators, no test correlation.
- No AI-generated turn summaries. The turn card label is derived cheaply
  from the agent's first assistant message in the turn (truncated).
- No phase/goal grouping above turns. Turns are the only grouping unit in V1.
- No backfill of turn records onto existing sessions.
- No change to the compact view. It remains the live `git status` flat list.
- No provider-specific behavior. Capture is a git-snapshot pattern that
  applies to every provider uniformly.
- No attribution from file change to specific tool-call item. The unit is
  the turn; which `Edit` call inside the turn produced which hunk is out of
  scope.
- No server/remote storage. Everything is local SQLite, consistent with
  current architecture.

## V1 behavior

### Turn lifecycle

A turn begins at one of:

- `sessionService.start(id, input)` — first user message for a session.
- `sessionService.sendMessage(id, input)` — subsequent user message sent
  to an already-active or resumable session.

A turn ends when the session's `status` transitions to `completed` or
`failed`. For providers that support continuation and keep the handle
open, the turn boundary is the status transition, not handle teardown.

Each turn is assigned a `turnId` (UUID) at start. Every `ConversationItem`
emitted by the `ProviderSessionEmitter` during that turn is stamped with
the same `turnId`. This activates the existing `turn_id` column on
`session_conversation_items` that is currently always `null`.

If the session is stopped via `stop()` or terminated abnormally, the turn
ends with status `failed`. Its `TurnRecord` is marked `status = 'errored'`.
Any file changes already captured at termination time remain associated
with the turn.

### Turn record data model

A new table `session_turns` stores one row per started turn:

```sql
CREATE TABLE IF NOT EXISTS session_turns (
  id TEXT PRIMARY KEY,                 -- turn UUID
  session_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,           -- 1-based, monotonic per session
  started_at TEXT NOT NULL,
  ended_at TEXT,                       -- null while in-flight
  status TEXT NOT NULL DEFAULT 'running',
                                        -- 'running' | 'completed' | 'errored'
  summary TEXT,                        -- derived label, nullable
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  UNIQUE (session_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_session_turns_session_sequence
  ON session_turns(session_id, sequence);
```

A new table `session_turn_file_changes` stores per-turn file-level deltas:

```sql
CREATE TABLE IF NOT EXISTS session_turn_file_changes (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  file_path TEXT NOT NULL,             -- relative to session.workingDirectory
  old_path TEXT,                       -- set for renames
  status TEXT NOT NULL,                -- 'added' | 'modified' | 'deleted' | 'renamed'
  additions INTEGER NOT NULL DEFAULT 0,
  deletions INTEGER NOT NULL DEFAULT 0,
  diff TEXT NOT NULL,                  -- unified diff for this turn only
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (turn_id) REFERENCES session_turns(id) ON DELETE CASCADE,
  UNIQUE (turn_id, file_path)
);

CREATE INDEX IF NOT EXISTS idx_session_turn_file_changes_session_turn
  ON session_turn_file_changes(session_id, turn_id);
```

Migrations follow the existing idempotent-schema pattern in
`electron/backend/database/database.ts`: add the two `CREATE TABLE IF NOT
EXISTS` blocks to `SCHEMA` and the corresponding indexes. No separate
migrations folder is used (matching current conventions, not the plan-level
note in `session-fork-plan.md`).

Backend types live in `electron/backend/database/database.types.ts`
(`SessionTurnRow`, `SessionTurnFileChangeRow`) and in a new
`electron/backend/session/turn/turn.types.ts` for the domain shapes
(`Turn`, `TurnFileChange`, `TurnStatus`, `TurnFileChangeStatus`).

### Capture lifecycle

Snapshot-at-turn-boundary. Provider-agnostic. Uses the existing
`GitService`. No shadow branches, no real commits, no shelling out from
the renderer.

A new `TurnCaptureService` (`electron/backend/session/turn/turn-capture.service.ts`)
owns the lifecycle:

1. **Turn start.** Session service notifies the capture service with
   `{ sessionId, turnId, workingDirectory }`. The service records a
   **baseline snapshot**: the current `git diff --cached` + unstaged diff
   - untracked-file contents of the working tree. This is the "state at
     the moment the user sent the message." It is kept in memory on the
     service (not persisted) and keyed by `sessionId`.

2. **Turn end.** Session service notifies with `{ sessionId, turnId,
status }`. The service computes a new snapshot and diffs it against
   the baseline. For each file that differs:
   - Determine status: added / modified / deleted / renamed.
   - Compute per-turn unified diff.
   - Count additions and deletions.
   - Insert one row into `session_turn_file_changes`.

3. The turn row itself is updated: `ended_at`, `status`, and `summary`
   (see below). The baseline snapshot is discarded.

Snapshot contents use `git status --porcelain -u` + `git diff --no-color`
for tracked files, `git diff --no-index` for untracked files, identical
in mechanism to the existing `GitService.getDiff`. Binary files are
represented by a sentinel diff body (`"[binary file change]"`) with
`additions = 0`, `deletions = 0`.

Turn-boundary snapshotting is debounced ~150 ms after the status
transition to `completed` / `failed`, giving in-flight writes from the
last tool call time to settle. Debounce is bounded — at most one pending
snapshot per session at a time.

Edge cases:

- **Manual user edits between turns.** Any file change not attributable
  to a specific turn (i.e., the file already differs from the prior
  turn's end-state at the next turn's start) is attributed to the next
  turn. This is imperfect but acceptable in V1 — the panel is a narrative,
  not an audit trail.
- **Stop / fail before baseline is recorded.** No file-change rows are
  written. The turn row is marked `errored`. The extended view shows
  the card with a "no changes recorded" note.
- **Session restart (app relaunch) mid-turn.** On backend startup, any
  turn in `running` state is force-closed to `errored` with no file
  changes. See "Implementation notes."
- **Non-git workspace.** `TurnCaptureService.startTurn()` short-circuits
  and records no baseline. `endTurn()` inserts the turn row with status
  `completed` and zero file-change rows. The extended view distinguishes
  between "agent made no changes" (zero rows, git available) and "git not
  available" (session flag) in its empty state copy.
- **Per-file diff size.** If a file's per-turn unified diff exceeds
  200 KB, the `diff` column stores a truncation marker (`"[diff truncated:
N lines]"`) and additions/deletions counts are preserved. The panel
  shows "diff too large" with a button to open the full diff via the
  existing compact view flow. V1 acceptable; revisit in Phase B if users
  hit it often.

### Turn summary

Cheap derivation only. No LLM calls. When `endTurn()` runs:

- Read conversation items with this `turnId` where `kind = 'message'` and
  `actor = 'assistant'`, ordered by sequence.
- Take the first such message's `text`. Trim. Collapse newlines to single
  spaces. Truncate at 80 characters with an ellipsis if longer.
- Store in `session_turns.summary`. Null if no assistant message exists
  for the turn (e.g., errored before any response).

### Extended view — UI

The extended view of `changed-files-panel.container.tsx` is the surface
that changes. The compact view is untouched.

Layout:

```
┌─ Changed Files (extended) ───────────────────────────┐
│  By turn ▾                                            │
│                                                       │
│  ▼ Turn 5 · 2 files · +12 −3                          │
│       "Fix auth regression — moved token val…"        │
│       M  login.service.ts             +12 −3          │
│       M  login.types.ts                +4             │
│                                                       │
│  ▶ Turn 4 · 1 file · +8                               │
│                                                       │
│  ▶ Turn 3 · no changes                                │
│                                                       │
│  ▼ Turn 2 · 3 files · +40 −15                         │
│       ...                                              │
└───────────────────────────────────────────────────────┘
```

Behavior:

- Turns are listed newest first. In-flight turn (status `running`) is
  pinned at the top with a pulsing indicator and an "in progress" label.
- Turn header shows: sequence number, file count, total +/-, summary
  (truncated to fit width). Click → collapse / expand the file list.
- File row inside a turn shows: status badge (A/M/D/R), relative path
  (middle-truncated if it wraps), +X −Y. Click → selects this
  `(turnId, filePath)` pair and opens the per-turn diff in the diff
  viewer area.
- Diff viewer shows only this turn's diff for this file, not the
  cumulative diff.
- Empty states:
  - Session has no turns yet (new feature on a new session, agent hasn't
    run): "No turns yet. Changes will appear as the agent works."
  - Session has turns but no file changes across all turns (read-only
    session): "Agent hasn't changed any files yet."
  - Workspace is not a git repo: "Turn-grouped changes require a git
    repository in this workspace. Compact view still available."
  - Session started before feature shipped: same empty state as "no
    turns yet," plus a subtle "(earlier turns predate this feature)"
    footnote.
- Errored turn card renders with an amber badge. File list may be empty
  or partial. Tooltip: "Turn ended before changes could be captured."

### Transcript ↔ panel linking

Each `ConversationItem` carries `turnId` (already schema-supported). The
transcript renderer is extended to visually group consecutive items that
share a `turnId`, and to expose a subtle "turn N" gutter marker. Clicking
the gutter marker selects the turn in the panel. Clicking a turn card in
the panel scrolls the transcript to that turn's first item and highlights
it briefly.

Selection is one-way persistent within the session view — scrolling the
transcript does not change panel selection, and vice versa, until the
user clicks the link target explicitly. This avoids selection thrashing
during streaming.

### IPC surface

New IPC channels, following the existing pattern
(`electron/main/ipc.ts` + preload exposure + `src/entities/.../.api.ts`):

- `turns:listForSession(sessionId: string) → Turn[]`
- `turns:getFileChanges(turnId: string) → TurnFileChange[]`
- `turns:getFileDiff(turnId: string, filePath: string) → string`

The renderer gets a new entity: `src/entities/turn/turn.api.ts` and
`src/entities/turn/turn.types.ts`, plus a public `index.ts`.

Real-time updates: when a turn starts, ends, or has file-changes
written, the backend emits a session-scoped delta the renderer already
subscribes to. We reuse the existing `SessionDelta` stream by adding two
new delta kinds:

- `turn.add` — `{ turn: Turn }`
- `turn.fileChanges.add` — `{ turnId: string, fileChanges: TurnFileChange[] }`

Backend types extended in
`electron/backend/provider/provider.types.ts`. The existing
renderer subscription path (`onDelta`) dispatches these.

## Acceptance criteria

- Starting a new session, sending a message, and waiting for the agent
  to finish creates exactly one row in `session_turns` and zero-or-more
  rows in `session_turn_file_changes` linked to that turn.
- Every `ConversationItem` inserted during that turn has a non-null
  `turn_id` matching the turn row.
- The extended view lists the turn. Its summary matches the first
  assistant message's first 80 chars. The file list shows every file the
  agent touched in that turn, with status, per-turn diff, and correct
  +/- counts.
- Clicking a file in a turn card opens the per-turn diff in the diff
  viewer (not the cumulative diff).
- Sending a follow-up message creates a second turn. The same file
  touched in both turns appears under both turn cards, each with its
  own incremental diff.
- Stopping an in-flight agent marks its turn `errored`. The card
  renders with an amber badge.
- On a non-git workspace, the extended view renders the "requires git"
  empty state. The compact view still works as today.
- App restart mid-turn: the in-flight turn is transitioned to `errored`
  on next boot; no ghost `running` rows persist.
- Transcript scrolls / highlights correctly when a turn card is clicked,
  and vice versa.
- Existing sessions (no turn rows) show the "no turns yet" empty state in
  the extended view without breaking.
- Compact view is byte-identical to pre-change behavior.
- All four verification gates pass: `test:pure`, `test:unit`, `typecheck`,
  `chaperone check --fix`.

## Implementation notes

### Turn ID injection into the emitter

`ProviderSessionEmitter.buildBaseItem()` currently hardcodes `turnId:
null` at line 266. Add a `currentTurnId: string | null` field on the
emitter plus a `setCurrentTurnId(turnId: string | null)` setter. The
setter is called by `sessionService` at turn boundaries (see below).
`buildBaseItem()` reads the field instead of hardcoding `null`.

This avoids changing every call site of `buildBaseItem()` and keeps the
per-item stamping centralized.

### Session service wiring

`sessionService` owns the turn lifecycle. Before `startHandle()` runs in
`start()` / `sendMessage()`, the service:

1. Generates a new turn UUID.
2. Inserts a `session_turns` row with `status = 'running'`, `started_at =
now()`, `summary = null`, `sequence = max(sequence) + 1`.
3. Calls `emitter.setCurrentTurnId(newTurnId)` on the active handle's
   emitter (requires exposing the emitter from the `SessionHandle`
   internals, or routing the setter through a new `SessionHandle` method
   like `beginTurn(turnId)` — preferred, since it keeps the emitter
   encapsulated).
4. Calls `turnCaptureService.startTurn({ sessionId, turnId,
workingDirectory })`.

On status transition to `completed` / `failed` in `handleLifecycle()`:

1. Calls `turnCaptureService.endTurn({ sessionId, turnId, status })`.
2. Capture service finalizes the turn row and inserts file-change rows
   within a single transaction.
3. Capture service emits `turn.add` (if not already emitted at start)
   and `turn.fileChanges.add` deltas.
4. Emitter's `currentTurnId` is cleared (`setCurrentTurnId(null)`) via
   the same `SessionHandle` method used on start, e.g. `endTurn()`.

### Baseline snapshot storage

In-memory map on `TurnCaptureService`: `Map<sessionId, TurnBaseline>`
where `TurnBaseline = { turnId, takenAt, trackedDiff: string,
untrackedContents: Map<relPath, content> }`. Dropped on `endTurn` /
session close. This avoids persistence and keeps cost bounded to active
sessions.

### Crash recovery

On backend boot, before accepting any new IPC traffic:

```sql
UPDATE session_turns
SET status = 'errored', ended_at = datetime('now')
WHERE status = 'running';
```

No file changes get backfilled — we have no baseline to diff against.
The panel surfaces this as an errored turn.

### Renderer layering

- Entity: `src/entities/turn/` — `turn.types.ts`, `turn.api.ts`,
  `index.ts`. Pure API wrapper over `window.electronAPI.turns.*`.
- Widget changes scoped to `src/widgets/session-view/`:
  - New: `turn-list.container.tsx` — fetches turns, subscribes to
    deltas, renders cards.
  - New: `turn-card.presentational.tsx` — pure render of one turn.
  - New: `turn-file-item.presentational.tsx` — pure render of one file
    row inside a turn (replaces compact view's `changed-file-item` only
    inside turn cards; compact view keeps its existing component).
  - Modified: `changed-files-panel.container.tsx` — delegates to
    `turn-list.container.tsx` when `expanded === true`, keeps current
    rendering when `expanded === false`.
  - `diff-viewer.presentational.tsx` unchanged; the extended view calls
    `turnsApi.getFileDiff(turnId, filePath)` instead of
    `window.electronAPI.git.getDiff()`.

Presentational files must not call stateful hooks per project
conventions — verified in existing `changed-file-item.presentational.tsx`.

### Test coverage

- `turn-capture.service.test.ts` (unit, `npm run test:unit`): asserts
  snapshot-diff behavior with a fake `GitService`, turn-row lifecycle,
  crash recovery query, per-file diff truncation, renamed/deleted/
  binary handling.
- `session.service.test.ts` additions: verify that `start` and
  `sendMessage` generate a new turn, stamp items, and emit boundary
  deltas. Assert items carry `turnId` in database after the run.
- `conversation-item.pure.test.ts` additions: assert that legacy
  migration preserves pre-existing (null) `turn_id` — we do not
  backfill.
- `turn-list.container.test.tsx` (renderer, `npm run test:unit` via
  vitest + RTL): empty-state branches, card click selects panel state,
  in-flight card renders with indicator, errored card renders with
  badge.
- Pure tests for any diff-math helpers live next to the service.

### Storage footprint

Rough estimate: average turn ≈ 3 files, average per-file unified diff
≈ 2 KB, one row overhead ≈ 0.2 KB → roughly 7 KB per turn. 100 turns per
session ≈ 700 KB. Acceptable for V1. Monitor on real sessions; Phase B
may add a retention knob.

## Phase B hook-points (informational, not V1)

- **Inline comments.** Add `session_turn_file_comments` table keyed by
  `(turn_id, file_path, line_from, line_to)`. Render as margin
  annotations in the existing `diff-viewer.presentational.tsx`. No
  changes to Phase A data model are needed to enable this.
- **Revert turn.** Add `reverted_at` column to `session_turns`. Revert
  action applies the inverse of each row in
  `session_turn_file_changes` for the turn. Data model already has what
  it needs.
- **Risk flags.** New nullable column `risk_flags TEXT` (JSON blob) on
  `session_turn_file_changes`. Computed by a separate service reading
  the existing rows. Additive, no schema migration impact on Phase A.
- **Feedback to agent.** Reuse `session_turn_file_comments` rows as the
  payload for a follow-up user message. Purely renderer-level.

## Open questions

None remaining — all five resolved before drafting this spec:

1. Turn summary — first assistant message truncated. No LLM.
2. Per-turn diff size — 200 KB cap with truncation marker.
3. Existing sessions — no backfill; empty state.
4. Non-git workspaces — compact view unchanged; extended view shows
   "requires git" empty state.
5. Errored turns — explicit `errored` status, amber badge on card.
