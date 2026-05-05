# Advanced Pull Request Review Plan

## Source Spec

This plan implements `docs/specs/advanced-pull-request-review.md`.

It builds on:

- `docs/specs/pull-request-local-review.md`
- `docs/specs/changed-files-base-branch.md`
- `src/widgets/session-view/changed-files-panel.container.tsx`
- `src/widgets/session-view/diff-viewer.presentational.tsx`
- `electron/backend/git/changed-files.service.ts`
- `electron/backend/session/session.service.ts`

## Implementation Strategy

Use thin vertical slices. Each slice should produce a working end-to-end path
through the layers it touches, with tests at the riskiest boundaries.

Do not start with GitHub review publishing or agent auto-fix. The first product
win is local review notes plus a structured `Ask AI` packet inside the existing
Session.

## Phase 1 - Line-Aware Review Notes

### Slice 1 - Parse and render selectable diff lines

Goal: make the existing `DiffViewer` line-aware and selectable without
persistence.

Build:

- Add `src/widgets/session-view/diff-lines.pure.ts`
  - parse unified diff hunks into rows with old/new line numbers
  - preserve existing coloring semantics
  - handle file headers, hunk headers, additions, deletions, context, and empty
    diffs
- Replace the current `diff.split('\n')` render path in
  `diff-viewer.presentational.tsx`
- Add selectable row state in `ChangedFilesPanel`
  - click selects one row
  - shift-click selects a contiguous visible range
  - clear selection on file/mode/session change
- Show a small `Add note` action when a range is selected

Acceptance:

- Diff rows display old/new line numbers where available.
- User can select a contiguous range of diff rows.
- Selection survives scrolling but resets when a different file is selected.
- Existing working-tree and base-branch diff loading still works.

### Slice 2 - Persist local draft review notes

Goal: a selected diff range can become a durable local Review Note.

Build:

- Add `review_notes` table in `electron/backend/database/database.ts`
- Add backend service under `electron/backend/review-notes/`
- Add IPC and preload bridge under `reviewNotes:*`
- Add renderer entity `src/entities/review-note/`
- Add create/list/update/delete behavior
- Wire `ChangedFilesPanel` `Add note` action to create a note for the selected
  file/range

Acceptance:

- User can create a note from a selected diff range.
- Notes persist after app reload.
- Notes are scoped to the active Session.
- User can edit/delete a note.
- Unit tests cover CRUD and cascade behavior.

### Slice 3 - Show review notes in the Changed Files panel

Goal: reviewers can manage the notes they have gathered while moving through
files.

Build:

- Add a notes tray/section inside `ChangedFilesPanel`
- Group notes by file path
- Show unsent count in the panel header or mode controls
- Add note badges/counts to file rows in the changed-files list
- Jump from a tray note to its file and selected line range when possible

Acceptance:

- User can see all notes for the active Session without leaving Changed Files.
- File list shows which files have notes.
- Clicking a note navigates to the file and highlights its range when the diff
  still contains that range.
- Stale notes remain visible even if the line anchor cannot be restored.

## Phase 2 - Ask AI Packet

### Slice 4 - Build and preview review packets

Goal: convert draft notes into a deterministic prompt the user can inspect.

Build:

- Add pure prompt builder:
  `electron/backend/review-notes/review-note-prompt.pure.ts`
- Include:
  - PR metadata from `workspace_pull_requests` when available
  - base branch metadata from `ChangedFilesService`
  - session/workspace identifiers
  - grouped file paths
  - line ranges
  - selected diff snippets
  - user note bodies
- Add `reviewNotes:previewPacket(sessionId, noteIds?)`
- Add UI preview affordance in the notes tray

Acceptance:

- Packet output is deterministic and covered by pure tests.
- Preview groups notes by file in stable order.
- Empty draft-note state is handled clearly.
- Packet tells the agent not to change files unless explicitly asked.

### Slice 5 - Send review packet to the active Session

Goal: the reviewer can send all draft questions to the active Agent Session.

Build:

- Add backend `reviewNotes:sendPacket`
  - builds packet
  - calls existing `SessionService.sendMessage`
  - marks included notes as `sent` with `sent_at`
- Add renderer action `Ask AI`
- Reuse existing Session Store refresh/conversation patch behavior
- Respect existing mid-run input policy by surfacing errors from
  `SessionService.sendMessage`

Acceptance:

- Clicking `Ask AI` sends a message to the active Session.
- Sent notes stay visible and are marked as sent.
- Draft notes not included in the packet remain draft.
- If the active Session cannot accept input, the user sees the existing
  actionable error.

## Phase 3 - Review Workflow Polish

### Slice 6 - File-level notes and note states

Goal: make notes useful when the concern is about a whole file or when the user
has already handled a question.

Build:

- Allow `Add file note` from selected file without selecting lines.
- Add manual state transitions:
  - draft
  - sent
  - resolved
- Add filters in the tray: draft, sent, resolved, all.

Acceptance:

- User can create a file-level note.
- User can mark sent notes resolved.
- Resolved notes no longer count toward the default `Ask AI` draft count.

### Slice 7 - Follow-up actions from notes

Goal: after the agent explains the notes, the reviewer can ask for changes
without retyping context.

Build:

- Add `Ask AI to fix selected notes` action.
- Use a separate prompt builder that clearly asks for implementation changes.
- Require explicit confirmation before sending a fix request.
- Keep this separate from the explanation-oriented `Ask AI`.

Acceptance:

- User can select notes and send a fix request.
- The prompt includes the same anchors and diff snippets as the explanation
  packet.
- The UI makes it clear that this action may modify files.

## Deferred / Future

- Publish selected notes as GitHub review comments.
- Link agent answers back to specific notes automatically.
- Rebase anchors after PR branch refresh.
- Generate a review summary from notes and answers.
- Attach review notes to Initiative Attempts or Outputs.

## Linear Ticket Breakdown

Recommended parent:

- MAR-1136 - Advanced PR review: line notes and AI review packets

Recommended child issues:

1. MAR-1137 - Parse and render selectable diff lines
2. MAR-1138 - Persist draft review notes for selected diff ranges
3. MAR-1139 - Show review notes and file badges in Changed Files
4. MAR-1140 - Build previewable AI review packets from notes
5. MAR-1141 - Send review packets to the active Session
6. MAR-1142 - Add file-level notes and note state filters
7. MAR-1143 - Add explicit fix-request action from selected notes

Dependency order:

- MAR-1137 before MAR-1138
- MAR-1138 before MAR-1139 and MAR-1140
- MAR-1140 before MAR-1141
- MAR-1139 and MAR-1141 before MAR-1142
- MAR-1141 and MAR-1142 before MAR-1143

MAR-1137 through MAR-1141 are the minimum coherent product.
