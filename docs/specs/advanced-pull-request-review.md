# Advanced Pull Request Review

## Goal

Turn Convergence's local Pull Request review Workspace into an interactive
review notebook over the Pull Request diff.

The user should be able to inspect a Pull Request against its base branch,
select changed lines, write local draft questions or concerns, gather those
notes across files, and send a structured review packet to the active Agent
Session for explanation or follow-up work.

The product outcome is: "I can understand a large agent-generated Pull Request
by reading the diff, marking what I do not understand, and asking the agent
about exactly those places with file and line context."

## Problem

Agent-generated Pull Requests are often large. They may include many production
files, tests, fixtures, generated release artifacts, and mechanical refactors.
The developer's review problem is not only "is this correct?" It is also:

- why was this implementation shape chosen?
- are these changed files connected?
- is this line suspicious, or just unfamiliar?
- is this test enough for the behavior?
- should the agent simplify or fix a specific part?

Hosted Pull Request review UIs let a reviewer leave line comments, but they do
not connect naturally to the local agent session that created or can explain the
change. Convergence now has the local ingredients:

- Pull Request review Workspaces from `docs/specs/pull-request-local-review.md`
- Changed Files base-branch mode from
  `docs/specs/changed-files-base-branch.md`
- Agent Sessions with continuation and mid-run input
- Project context and attachment infrastructure

This feature connects those surfaces into a human-in-the-loop review workflow.

## Current Codebase Grounding

### Existing surfaces to reuse

- `src/features/pull-request-review-start/`
  - creates or reuses a `convergence/pr-<number>` review Workspace
  - starts an Agent Session with a review prompt
  - resolves full GitHub PR URLs to the matching configured Project
- `electron/backend/pull-request/pull-request-review.service.ts`
  - resolves PR metadata
  - prepares the Worktree
  - starts the review Session
- `electron/backend/git/changed-files.service.ts`
  - resolves the base branch from PR metadata, project settings, remote
    default, or conventional branches
  - returns files and diffs against the base comparison point
- `src/widgets/session-view/changed-files-panel.container.tsx`
  - owns changed-files mode state: `working-tree`, `base-branch`, `turns`
  - loads file lists and file diffs through `gitApi`
  - renders `DiffViewer`
- `src/widgets/session-view/diff-viewer.presentational.tsx`
  - currently renders a raw unified diff split into text lines
  - has no parsed line metadata, anchors, selection, or inline actions yet
- `src/entities/session/session.api.ts` and
  `src/entities/session/session.model.ts`
  - already support `sessionApi.sendMessage(sessionId, text, ...)`
  - mid-run behavior is controlled by existing session delivery mode rules
- `electron/backend/database/database.ts`
  - stores session/workspace/project data in SQLite
  - already has session-scoped tables and cascades that fit review-note
    persistence

### Missing pieces

- A line-aware diff model that maps unified diff rows to file path, hunk, old
  line number, and new line number.
- UI affordance to select one or more changed lines in the diff viewer.
- Local draft review notes tied to a Session, file path, changed-files mode, and
  line range.
- A side/tray surface to review, edit, delete, and navigate draft notes.
- A review packet prompt builder that groups the user's questions by file and
  line range with enough diff context for the agent.
- An action that sends the packet to the active Agent Session.
- Optional later actions that ask the agent to fix selected notes or export
  notes to GitHub review comments.

## Terminology

### Review Note

A local user-authored note attached to a changed file and optional diff line
range.

Review Notes are not GitHub comments in V1. They are Convergence-local drafts
used to organize reviewer questions and feed the Agent Session.

### Review Anchor

The location a Review Note points to:

- session id
- workspace id
- changed-files mode (`base-branch` or `working-tree`)
- file path
- old line range and/or new line range
- optional hunk header
- selected diff text

For Pull Request review, `base-branch` is the primary mode. `working-tree`
support is useful because review Workspaces can still accumulate local edits
after the PR head is checked out.

### Review Packet

A structured message assembled from one or more Review Notes and sent to the
active Agent Session.

The packet should preserve the human's wording and add deterministic context:
PR metadata when available, base branch, workspace path, file paths, line
ranges, and selected diff snippets.

## Product Behavior

### V1 Flow

1. User opens a Pull Request review Session.
2. User opens Changed Files and switches to `Base Branch`.
3. User selects a file.
4. User selects one or more diff lines.
5. User writes a local note/question for that selection.
6. User repeats this across files.
7. User opens a review notes tray or summary.
8. User clicks `Ask AI`.
9. Convergence sends a structured Review Packet to the active Session.
10. The Agent answers in the normal transcript.

### Note Creation

The first useful line-selection interaction should be simple:

- click a changed diff line to start selection
- shift-click another visible diff line to extend selection
- `Add note` opens a compact inline editor or small modal
- save creates a draft Review Note

Line selection must not require pixel-perfect text selection. The product unit
is a diff row, not arbitrary text ranges.

### Notes Tray

The notes tray should answer:

- how many draft notes are unsent?
- which files have notes?
- what questions will be sent?
- can I edit/delete a note before sending?
- can I jump back to the related file/line?

The tray can initially live inside the Changed Files panel. It does not need to
be a global app surface in V1.

### Sending to AI

Sending should use the existing active Session:

- no new provider surface
- no special backend provider behavior
- call existing session send-message path with generated text

If the session is running, the existing mid-run input policy decides whether the
packet is sent now, queued as a follow-up, steered, or blocked. V1 can use the
normal composer/send-message behavior and display any existing error.

The sent prompt should be explicit that the user is asking for explanation or
review guidance first, not requesting code changes unless the user says so.

Example packet shape:

```text
I am reviewing this Pull Request locally and collected questions on specific
diff lines. Please answer each note. Do not change files unless I explicitly ask.

Pull Request:
- acme/app#123: Add importer pipeline
- Base: main
- Workspace: /path/to/worktree

Review notes:

1. src/importer/parser.ts:42-56
Question: Why is this ternary used here instead of an explicit branch?
Selected diff:
@@ ...
+ const value = condition ? parseFast(input) : parseSafe(input)

2. src/importer/parser.test.ts:80-105
Question: Is this test covering the failure path from note 1?
Selected diff:
@@ ...
+ expect(...)
```

### Sent State

After a packet is sent, notes should not disappear immediately. The user should
be able to see what was sent and send follow-up packets later.

V1 states:

- `draft`: not sent yet
- `sent`: included in a packet
- `resolved`: user manually marked as no longer needing attention

## Data Model

Persist Review Notes in SQLite so draft notes survive app reload and session
switches.

Suggested table:

```sql
CREATE TABLE review_notes (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  workspace_id TEXT,
  file_path TEXT NOT NULL,
  mode TEXT NOT NULL,
  old_start_line INTEGER,
  old_end_line INTEGER,
  new_start_line INTEGER,
  new_end_line INTEGER,
  hunk_header TEXT,
  selected_diff TEXT NOT NULL,
  body TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'draft',
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL
);
```

Suggested indexes:

- `(session_id, state, created_at)`
- `(session_id, file_path)`

The line anchor should be best-effort. Diffs can move after the Workspace is
refreshed. V1 does not need full code-review anchor rebasing. It should still
show stale notes and allow the user to delete or resend them.

## API Shape

Backend:

- `electron/backend/review-notes/review-notes.types.ts`
- `electron/backend/review-notes/review-notes.service.ts`
- `electron/backend/review-notes/review-note-prompt.pure.ts`

IPC:

- `reviewNotes:listBySession(sessionId)`
- `reviewNotes:create(input)`
- `reviewNotes:update(id, patch)`
- `reviewNotes:delete(id)`
- `reviewNotes:sendPacket(input)`

Renderer:

- `src/entities/review-note/review-note.types.ts`
- `src/entities/review-note/review-note.api.ts`
- `src/entities/review-note/review-note.model.ts`

The renderer model can be small in V1. It should cache notes by session id and
expose actions that the Changed Files panel can call.

## Diff Line Model

`DiffViewer` needs to stop treating diff text as unstructured lines.

Suggested pure parser:

```ts
interface DiffLine {
  id: string
  kind: 'context' | 'add' | 'delete' | 'hunk' | 'file' | 'meta'
  text: string
  oldLine: number | null
  newLine: number | null
  hunkHeader: string | null
}
```

This belongs under `src/widgets/session-view/` initially because it is a UI
projection of unified diff text. If backend prompt construction later needs the
same parse, create a shared pure parser under `src/shared` or duplicate a small
backend parser deliberately.

## Non-goals

- No GitHub review-comment publishing in V1.
- No automatic approval/rejection recommendation.
- No agent auto-fix on first packet send.
- No persistent cross-session review notebook.
- No semantic code intelligence or AST indexing.
- No guarantee that anchors rebase perfectly after PR branch refresh.
- No new provider protocol. Use existing Session send-message paths.

## Open Questions

1. Should notes be visible only in the review Session, or across every Session
   in the same Workspace?
2. Should `Ask AI` include only draft notes by default, or draft plus unresolved
   sent notes?
3. Should line selections allow unchanged context lines, or only added/deleted
   rows?
4. Should the user be able to create file-level notes without selecting lines?
5. Should note packets be stored as separate conversation metadata later so
   Convergence can link agent answers back to notes?

V1 recommendation:

- scope notes to Session
- send draft notes only by default
- allow added/deleted/context line selections
- support file-level notes only after line notes work
- keep answer linkage manual in V1
