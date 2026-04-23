# Turn Risk Flags

**Status:** Phase B. Builds on `docs/specs/turn-grouped-file-changes.md`.
No V1 work until `turn-grouped-file-changes` is merged.

## Goal

Surface automatic risk signals on agent-produced file changes so the
reviewer knows where to look first. Scanning a turn's file list top to
bottom is fine for a handful of files, but as soon as the agent touches
many files per turn, attention has to go somewhere specific — a security
boundary, a big deletion, a file with no test coverage, a file the user
wrote recently.

Risk flags are decorations on existing file changes. They do not change
behavior, do not block anything, do not gate review. They are hints.

## Product intent

- Each `TurnFileChange` can carry zero or more risk flags.
- Flags are computed automatically by a separate service after
  `endTurn()` persists the file changes. No user action needed.
- In the panel, a file row with any flag shows a colored dot next to
  its status icon. Hovering the dot surfaces a tooltip listing each
  flag with a one-line explanation.
- A turn card aggregates: if any file in the turn has any flag, the
  card shows a small summary (e.g. "2 risk signals") in its header.
- Flag set is small, opinionated, and cheap to compute. No AI calls, no
  external integrations.
- Flags are advisory, not gating. The reviewer is free to ignore them.

## Non-goals

- No gating — no "approve required" mode, no modal warnings.
- No AI-generated risk analysis. Static, rule-based only.
- No per-user tuning in V1. Flags are on or off globally.
- No test-coverage integration with real coverage data (Istanbul,
  etc.) in V1. "No test coverage" is detected heuristically: "this file
  has no sibling test file" rather than "these specific lines are
  uncovered."
- No cross-session analytics. Each turn is evaluated in isolation.
- No false-positive suppression / snoozing.

## V1 behavior

### Flag taxonomy

Three flags in V1. Kept small to avoid alert fatigue.

1. **security-boundary**
   - Triggers when the file path matches a security-sensitive pattern:
     `electron/main/*`, `electron/preload/*`, files containing `auth`,
     `credentials`, `secret`, `token`, `crypto` in the path.
   - Severity: high (red dot).

2. **large-deletion**
   - Triggers when `deletions >= 50` and `additions < deletions / 4`.
     I.e. mostly a deletion, of non-trivial size.
   - Severity: medium (amber dot).

3. **no-test-coverage**
   - Triggers when the file has no corresponding test file (searched
     for `<basename>.test.{ts,tsx,js,jsx}` in same directory or a
     sibling `__tests__/` or `.test.<ext>` anywhere in the repo),
     the file is not itself a test file, and the file is not pure
     config / markdown.
   - Severity: low (yellow dot).

Each flag has:

- `id`: enum as above.
- `severity`: `'high' | 'medium' | 'low'`.
- `reason`: short human string shown in the tooltip.

Multiple flags stack — the displayed dot uses the highest severity.

### Data model

Additive column on `session_turn_file_changes`:

```sql
ALTER TABLE session_turn_file_changes
  ADD COLUMN risk_flags TEXT;    -- JSON array of RiskFlag, or null
```

Null means "not yet computed" (e.g. rows from before this feature
shipped, or in-flight). The UI treats null and empty array the same
way: no dot shown.

### Computation

A new `TurnRiskService` runs after every `turnCaptureService.endTurn`
finishes. It reads the just-persisted changes, computes flags, and
updates the row:

```
UPDATE session_turn_file_changes
   SET risk_flags = ?
 WHERE id = ?
```

Computation is purely local, synchronous, and cheap (regex on paths +
a single `fs.stat` per file for coverage check). Target: under 5 ms
per file.

A new `turn.riskFlags.add` delta is emitted once all files in a turn
are scored:

```
{ kind: 'turn.riskFlags.add', turnId, flagsByFileChangeId: Record<string, RiskFlag[]> }
```

Renderer merges into the local `fileChangesByTurn` cache.

### Backfill

On-demand only. If a user opens a turn whose file-change rows have
`risk_flags = null`, the backend computes lazily and updates in the
background. No bulk backfill.

### UI

- Per-file row in `turn-card.presentational.tsx`: a small dot between
  the status icon and filename, colored by highest severity. Hover →
  tooltip listing each flag + reason.
- Per-turn header: "N risk signals" chip in header when any file in
  the turn has any flag.
- No visual change inside `diff-viewer.presentational.tsx`. Flags
  surface at the file-list level only.

### IPC surface

Extends existing turn reads — `getFileChanges(turnId)` now includes
`riskFlags` on each returned change. No new channels.

### Configuration

In V1, no user-tunable toggle. Flags are always on. If they prove
noisy, we add a single global "Show risk flags" toggle in settings
later.

## Acceptance criteria

- Opening a turn with a file modifying `electron/preload/index.ts`
  shows a red dot on that file, tooltip: "Security boundary: preload
  file."
- A turn that deletes 60 lines and adds 2 shows an amber dot on that
  file with "Large deletion."
- A turn adding `src/features/foo/foo.ts` with no corresponding test
  file shows a yellow dot with "No test coverage."
- A turn where no file trips any flag shows no dots.
- Flags persist across app restart.
- Computing flags for a turn with 10 files completes in under 50 ms.
- All four gates pass.

## Implementation sketch

- Backend:
  - `electron/backend/session/turn/turn-risk.pure.ts` — pure rule
    functions, one per flag type. Each takes a `TurnFileChange` and
    the repo root; returns `RiskFlag | null`.
  - `electron/backend/session/turn/turn-risk.service.ts` — orchestrator
    that ties into `TurnCaptureService.endTurn`'s post-insert hook and
    writes the `risk_flags` column.
- Renderer:
  - Extend `TurnFileChange` type with `riskFlags?: RiskFlag[]`.
  - Small `risk-dot.presentational.tsx` component + tooltip.
  - `turn-card.presentational.tsx` accepts the enriched changes.
- Tests:
  - Pure tests per flag rule with representative inputs.
  - Service test with an in-memory DB + temp repo, asserting correct
    flags are written.
  - Renderer test for the dot and tooltip.

## Open questions

1. Should we surface a "dismiss this flag" UI in V1? (Suggest: no.
   Flags are hints; dismissal adds complexity and state.)
2. Is "no test coverage" going to be too noisy in practice? (Suggest:
   ship and measure. If noisy, tighten the heuristic or move it behind
   a toggle.)
3. Do we expose a "recently human-authored" flag (via `git blame`)?
   (Suggest: attractive but punted — blame is slow at scale and the
   signal is noisy. Revisit if the first three flags prove too sparse.)
4. How do we balance latency against accuracy if the repo is huge?
   (Suggest: the V1 flags are O(files_in_turn), not O(repo). Should
   scale fine.)
