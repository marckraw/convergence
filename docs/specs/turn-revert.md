# Turn Revert

**Status:** Phase B. Builds on `docs/specs/turn-grouped-file-changes.md`.
No V1 work until `turn-grouped-file-changes` is merged.

## Goal

Let the developer undo a specific turn's file changes with one action.
Today the extended view is a reviewer — it shows what the agent did but
gives no way to react other than manually reverting in git or asking the
agent to fix it. Revert-turn gives the reviewer a first-class undo.

Scope: file-content revert only. The conversation transcript is not
deleted or rolled back; the agent is not re-prompted.

## Product intent

- Each turn card shows a `Revert turn…` action (kebab menu or explicit
  button) for turns that ended in `completed` or `errored` status and
  are not already reverted.
- Clicking it opens a confirmation dialog listing the files that would
  be restored, with a per-file opt-out (checkbox to exclude a file).
- Confirming applies the inverse of each included `TurnFileChange` to
  the working tree.
- The turn is marked `reverted_at`. The card renders with a
  "reverted" badge from that point on.
- Reverting does not delete the row. It is still visible in the panel
  history, but the inverse has been applied to the working tree.
- Revert is atomic: if any file can't be written, the entire revert is
  rolled back (no partial state).
- Conflicts (the file has changed further since the turn) surface as a
  warning in the confirmation dialog. The user can still revert — it
  then overwrites the intervening edits — but must acknowledge the loss
  explicitly.

## Non-goals

- No re-run / re-prompt. That belongs to `turn-feedback-loop.md` (ask
  the agent to do something different).
- No rebase of later turns. Reverting turn N does not touch turn N+1's
  changes. If the user wants to undo a cascade, they revert each turn
  in reverse order.
- No transcript rollback. The assistant messages that described the now-
  reverted changes remain in the transcript. This is intentional — they
  are part of the record.
- No revert-many / select-multiple. One turn per action.
- No auto-stash of current uncommitted changes. Working tree must be in
  a state the user accepts before reverting (see "conflict handling"
  below).
- No undo of the revert itself in V1. If you revert by mistake, manually
  restore via git.

## V1 behavior

### Mechanism

Revert applies the inverse of each `TurnFileChange` in the turn.
Mechanics per status:

- `added` — file was created during the turn. Revert deletes the file.
- `deleted` — file was removed during the turn. Revert restores the
  file's pre-turn content.
- `modified` — revert replaces the current file content with the
  pre-turn content.
- `renamed` — revert moves the file back to its `old_path` and restores
  pre-turn content.

### Storage requirement

The existing schema stores per-turn **diff**, not per-turn pre-content.
That is insufficient for revert: applying the reverse of a unified diff
is fragile when the file has since changed.

Phase B adds a pre-content column (or separate table) to
`session_turn_file_changes`:

```sql
ALTER TABLE session_turn_file_changes
  ADD COLUMN pre_content TEXT;          -- null for binary or absent files
ALTER TABLE session_turn_file_changes
  ADD COLUMN pre_existed INTEGER NOT NULL DEFAULT 0;  -- 0 = file did not exist at turn start
```

`TurnCaptureService.finalizeEnd()` is updated to populate these columns
from the baseline it already holds in memory. No behavior change to V1
readers — the new columns are additive.

Storage cost: full pre-content for every changed file. Per-file cap of
200 KB (same as diff cap); files exceeding the cap are flagged
`pre_content_too_large = 1` and cannot be reverted (see "degraded
cases" below).

### Dialog

Confirmation dialog shows, for each file in the turn:

- Status icon + path
- Action that will be taken: "delete", "restore", or "replace"
- Per-file conflict indicator if the file diverged from what the agent
  wrote (checked via content hash)
- Per-file "Include in revert" checkbox (default: on)

Footer:

- "Revert selected files" button (primary)
- "Cancel" button
- If any conflicts exist, an amber warning banner above the file list:
  "N file(s) have changed since this turn. Reverting will overwrite
  those changes."

### Transaction

Revert runs as a single atomic operation:

1. Validate all target files can be written (permission check).
2. For each included `TurnFileChange`, apply the inverse in a
   temp-write-then-rename pattern.
3. If any step fails, delete temp files, leave working tree untouched,
   surface the error.
4. On success, update `session_turns.reverted_at = now`.

### Degraded cases

- **File cannot be reverted because pre_content was truncated.** UI
  shows the file with a lock icon and "diff too large to revert" in
  the dialog. Checkbox is disabled for that file. User can still
  revert the others.
- **Binary file.** Pre-content wasn't stored (`pre_content` is null
  and `pre_existed = 1`). UI shows "binary revert unavailable" and
  disables the checkbox.
- **Session workspace is not a git repo.** Revert still works — we
  don't need git, we need fs writes. Dialog omits the "changed since"
  conflict detection (since we have no quick diff) and warns:
  "no git integrity checks in this workspace."
- **Session working directory has moved or is missing.** Revert fails
  with a clear error.

### UI state after revert

- Turn card renders with a dashed gray border and a "reverted" badge
  adjacent to the summary.
- File rows inside the card remain visible but greyed out.
- The diff viewer still shows the per-turn diff (the record of what
  the agent did). Clicking a file no longer enables the "Revert turn"
  action (already reverted).

## Acceptance criteria

- Any completed/errored turn shows a `Revert turn…` action on its card.
- Clicking opens a dialog listing all files with per-file status and
  intended action.
- Confirming restores added files to pre-state, deletes files that
  were added, and replaces modified-file content with the pre-turn
  content.
- If any file cannot be written, no change is applied (atomic).
- After revert, `session_turns.reverted_at` is non-null and the turn
  card renders with the reverted badge.
- Binary / truncated files are correctly surfaced as unrevertable in
  the dialog.
- Revert works on non-git workspaces and in git worktrees.
- All four gates pass.

## Implementation sketch

- Extend `session_turn_file_changes` with `pre_content` +
  `pre_existed` + `pre_content_too_large`.
- Backfill for existing rows is not needed — they predate the revert
  feature, so their `Revert` action is disabled with a tooltip:
  "Turn predates revert support."
- Backend service `turn-revert.service.ts` under
  `electron/backend/session/turn/`. Owns the atomic apply.
- New IPC channel `turns:revert(turnId, filePaths): Promise<RevertResult>`.
- Renderer: revert dialog container + confirmation presentational.
- Chaperone presentational rule applies — revert dialog content is
  presentational, the container owns async + IPC.

## Open questions

1. Do we reverse-apply the diff or replace with pre_content? (Suggest:
   replace with pre_content. Reverse-applying diffs is fragile and the
   storage cost is acceptable.)
2. How do we detect "changed since the turn" for conflict warning?
   (Suggest: compare current file content SHA-256 to the post-turn
   content captured at `endTurn` — requires one more stored column
   `post_content_sha`.)
3. Undo the revert? (Suggest: no in V1. If needed later, we have the
   pre-revert content in git reflog or user can redo via the agent.)
4. Should reverting emit a synthetic "system" conversation item to
   mark the turn as reverted in the transcript? (Suggest: yes —
   `kind: 'note', level: 'info', text: "Turn N reverted"`. Helps the
   reviewer see the history.)
