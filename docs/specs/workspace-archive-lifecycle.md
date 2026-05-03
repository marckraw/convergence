# Workspace Archive Lifecycle

## Objective

Convergence should treat a workspace/worktree as the durable unit of agent work.
A workspace can contain multiple sessions/conversations. When the work is done
— usually because the workspace's pull request has been merged — the user should
be able to archive the workspace and its sessions without losing conversation
history.

The goal is to keep the normal sidebar clean while preserving enough historical
context for future inspection, search, analytics, and agent-assisted insight.

## Product framing

Today, users often delete workspaces and sessions after a PR is merged because
they want a clean sidebar. That works for visual cleanup, but it permanently
removes useful history. The intended behavior is:

- active work stays visible in the main sidebar
- merged/done work can be archived as a workspace-level action
- archived workspace sessions remain in the database
- the physical git worktree can be removed to reclaim disk space
- permanent deletion remains available but clearly destructive

A workspace's PR status is an awareness signal. If Convergence knows a workspace
PR is merged, it should help the user identify that the workspace is safe to
archive/clean up.

## Current implementation status

### Implemented

- Workspaces are backed by git worktrees.
- Sessions link to workspaces via `sessions.workspace_id`.
- Sessions already have `archived_at`.
- PR awareness exists for workspace sessions:
  - persisted `workspace_pull_requests` table
  - GitHub lookup through `gh pr list`
  - conversation header PR badge
  - right-side Pull Request panel
  - cached refresh state for no PR / open / draft / closed / merged / errors
- Sidebar workspace `Merged` badge renders when cached PR state is `merged`.

### Not implemented yet

- Workspace archive state.
- Worktree-removed state.
- Archive workspace action.
- Remove worktree while preserving workspace/session DB records.
- Archived workspace section in sidebar.
- Permanent-delete wording/confirmation changes.

## Terms

### Active workspace

A workspace that is visible in the main project tree and still represents active
or recent work.

### Archived workspace

A workspace that is done or intentionally hidden from the active project tree.
Its sessions are preserved and can be viewed from an archive/history surface.

### Removed worktree

A workspace whose physical git worktree directory has been removed from disk,
but whose Convergence workspace row and sessions still exist.

### Permanent delete

A destructive operation that removes the workspace row and cascades session and
conversation deletion. This should not be the normal cleanup path.

## UX principles

1. **Archive is not delete.** Archive hides work from the active sidebar but
   keeps history.
2. **Disk cleanup is separate from history cleanup.** Removing a worktree should
   not delete sessions.
3. **Merged PRs should be visually obvious.** If cached PR state is merged,
   show a small `Merged` badge near the workspace name.
4. **Permanent deletion should be explicit.** Avoid using plain "Delete" for the
   destructive workspace operation once archive exists.
5. **The workspace is the unit of cleanup.** Archiving a workspace archives all
   sessions under it.

## Data model

Extend the existing `workspaces` table:

```sql
ALTER TABLE workspaces ADD COLUMN archived_at TEXT;
ALTER TABLE workspaces ADD COLUMN worktree_removed_at TEXT;
```

Potential later extension:

```sql
ALTER TABLE workspaces ADD COLUMN archive_reason TEXT;
-- possible values: 'manual', 'merged', 'abandoned'
```

For the first implementation, timestamps are enough.

Update backend and renderer workspace types:

```ts
interface Workspace {
  id: string
  projectId: string
  branchName: string
  path: string
  type: 'worktree'
  archivedAt: string | null
  worktreeRemovedAt: string | null
  createdAt: string
}
```

## Backend behavior

### Workspace archive

Add a workspace service method:

```ts
archive(input: {
  id: string
  removeWorktree?: boolean
}): Promise<Workspace>
```

Behavior:

1. Find workspace.
2. Set `workspaces.archived_at` if it is not already set.
3. Set `sessions.archived_at` for all sessions with that `workspace_id`.
4. If `removeWorktree` is true:
   - call git worktree remove/prune for the physical path
   - set `workspaces.worktree_removed_at`
5. Return updated workspace.

Archive should be idempotent. Calling archive on an already archived workspace
should be safe.

### Workspace unarchive

Add a workspace service method:

```ts
unarchive(id: string): Workspace
```

Behavior:

1. Clear `workspaces.archived_at`.
2. Clear `sessions.archived_at` for sessions with that `workspace_id`.
3. Do **not** recreate a removed worktree in V1.

If `worktree_removed_at` is set, the UI should communicate that the historical
workspace can be inspected but cannot be used as a live working directory until
future restore support exists.

### Remove worktree only

Potential method:

```ts
removeWorktree(id: string): Promise<Workspace>
```

This removes the physical worktree and sets `worktree_removed_at` without
archiving. This is optional for V1; the archive flow can include this behavior
behind a checkbox.

### Permanent delete

Existing `workspace.delete(id)` currently removes the worktree and deletes the
workspace row, which cascades linked sessions.

After archive exists, the UI should present this as:

- `Delete permanently...`
- destructive styling
- confirmation copy clearly stating sessions and conversations will be deleted

The backend method can remain, but UI wording should change.

## IPC/preload API

Add workspace APIs:

```ts
workspace: {
  archive: (input: { id: string; removeWorktree?: boolean }) =>
    Promise<Workspace>
  unarchive: (id: string) => Promise<Workspace>
  removeWorktree: (id: string) => Promise<Workspace> // optional V1
}
```

## Renderer state

Update `src/entities/workspace`:

- add `archivedAt`
- add `worktreeRemovedAt`
- add `archiveWorkspace`
- add `unarchiveWorkspace`
- optional `removeWorktree`

Workspace store should refresh both project workspaces and global workspaces
after archive/unarchive.

Session store should reload project/global sessions after workspace archive so
session archive state stays in sync.

## Sidebar UI

### Active section

The normal workspace list should hide archived workspaces by default.

For each active workspace row:

- branch name
- session count
- if cached PR state is merged, show compact `Merged` badge
- actions menu:
  - New session
  - Archive workspace...
  - Delete permanently...

The immediate small enhancement is the `Merged` badge next to the workspace name
when `workspace_pull_requests.state === 'merged'` for that workspace.

### Archived section

Add a collapsed `Archived` section similar to archived sessions, but workspace
aware:

```text
Archived
  feature/pr-status        Merged
    Session A
    Session B
```

Archived section behavior:

- collapsed by default
- includes archived workspaces
- can show sessions under each archived workspace
- supports opening archived sessions for reading
- can offer `Unarchive workspace` action
- can show `Worktree removed` badge when `worktree_removed_at` is set

Root archived sessions can remain in the existing archived sessions section, or
be combined into a broader archive section later.

## Conversation/session UI

When viewing an archived session:

- existing `Archived` badge remains
- if the workspace is archived, optionally show `Workspace archived`
- composer behavior can stay as-is initially, but future UX may disable sending
  messages if the physical worktree has been removed

When PR status is merged:

- existing conversation header PR badge should show `PR #123 merged`
- PR panel should show merged timestamp when available

## Archive workspace flow

Suggested flow from workspace row:

1. User clicks workspace actions.
2. User chooses `Archive workspace...`.
3. Confirmation dialog:

```text
Archive workspace "feature/foo"?

This will hide the workspace from the active sidebar and archive all sessions
inside it. Conversation history will be kept.

[ ] Also remove git worktree from disk

Cancel | Archive workspace
```

If PR state is merged, the checkbox may default to checked, but the action
should remain explicit.

After confirmation:

- workspace disappears from active list
- appears under Archived
- sessions are archived
- if worktree removed, disk path is gone and workspace has `Worktree removed`
  status

## Restore behavior

V1 restore can be minimal:

- `Unarchive workspace` restores it to the active sidebar
- sessions become unarchived
- if the worktree still exists, user can continue working
- if the worktree was removed, Convergence should not auto-recreate it in V1

Future restore could recreate a worktree from the branch if it still exists.

## Interaction with PR status

PR status does not automatically archive anything.

Merged PR state should:

- show `Merged` badge next to workspace name
- make `Archive workspace...` more discoverable
- optionally default the archive dialog's `removeWorktree` checkbox to checked

Manual archive should still be allowed when PR state is unknown, absent, or not
merged.

## Suggested implementation phases

### Phase 1 — Merged badge in sidebar

Status: complete.

Goal: surface already-known merged PR state near the workspace name.

Tasks:

- [x] Read cached `workspace_pull_requests` in sidebar/project tree.
- [x] Pass PR state by workspace ID to `ProjectTree`.
- [x] Render compact `Merged` badge beside workspace branch name when state is
      `merged`.
- [x] Add unit tests for badge rendering.

### Phase 2 — Workspace archive data model and service

Status: complete.

Goal: persist archived workspace state and archive child sessions.

Tasks:

- [x] Add `archived_at` and `worktree_removed_at` columns to `workspaces`
      schema.
- [x] Add migration helpers for existing DBs.
- [x] Update backend/renderer `Workspace` types.
- [x] Add `WorkspaceService.archive` and `WorkspaceService.unarchive`.
- [x] Add backend tests for:
  - archive sets workspace timestamp
  - archive sets child session `archived_at`
  - archive with removeWorktree removes physical worktree and sets
    `worktree_removed_at`
  - unarchive clears workspace/session archive timestamps

### Phase 3 — IPC/store wiring

Status: complete.

Goal: expose archive operations to renderer.

Tasks:

- [x] Add IPC handlers.
- [x] Add preload types.
- [x] Add renderer API/store actions.
- [x] Refresh workspace stores after archive/unarchive.
- [x] Refresh session stores after archive/unarchive in the sidebar UX flow
      where the active project id is available.

### Phase 4 — Sidebar archive UX

Status: complete.

Goal: make archive the normal cleanup path.

Tasks:

- [x] Hide archived workspaces from active list.
- [x] Add collapsed archived-workspaces section.
- [x] Add workspace action menu.
- [x] Add `Archive workspace...` confirmation flow.
- [x] Rename destructive action to `Delete permanently...`.
- [x] Add `Unarchive workspace` action.
- [x] Show `Worktree removed` badge for archived workspaces where applicable.

### Phase 5 — Optional restore/remove refinements

Status: partially complete.

Goal: improve historical workspace handling.

Tasks:

- [x] Add standalone `Remove worktree from disk` action.
- [x] Disable or warn in composer when workspace worktree is removed.
- [ ] Consider recreating removed worktree from branch.
- [ ] Add archive filters/search/history surfaces.

## Open questions

1. Should archive dialog default `removeWorktree` to true when PR is merged?
2. Should unarchiving a workspace also unarchive all sessions, or ask?
3. Should root sessions have a parallel "archive group" concept, or stay as
   individual archived sessions?
4. Should archived workspaces be visible in command center search by default?
5. Should future AI insight include archived workspaces automatically, or only
   when requested?

## Non-goals for V1

- Automatic archive when PR merges.
- Automatic deletion of worktrees without confirmation.
- Recreating removed worktrees.
- Full GitHub REST integration.
- Multi-forge support beyond the current GitHub CLI PR lookup.
