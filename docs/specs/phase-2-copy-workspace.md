# Phase 2: Workspaces (Git Worktrees) — Detailed Spec

> Parent: `docs/specs/project-spec.md`
> Builds on: Phase 1 (project entity, SQLite, IPC, Zustand store)

## Objective

Enable working on multiple branches of a project simultaneously by creating isolated workspaces backed by git worktrees. Each workspace is a separate working directory on its own branch, sharing the git object store with the original repo. When work is done and merged, the workspace is deleted.

This replaces Divergence's full-copy model with a faster, more disk-efficient, git-native approach while preserving the same user intent: "spin up an isolated workspace for an agent to work in."

## How Git Worktrees Work (Quick Primer)

```
/original-repo/              ← main branch, has .git/
/managed-workspaces/
  ├── feature-auth/          ← worktree, branch: feature-auth
  └── fix-header/            ← worktree, branch: fix-header
```

- `git worktree add <path> -b <branch>` creates a new working directory on a new branch
- `git worktree add <path> <existing-branch>` checks out an existing branch
- All worktrees share the same `.git` object store (commits, objects, refs)
- Each worktree must be on a **different branch** (git enforces this)
- `git worktree remove <path>` cleans up the worktree
- The original repo is completely untouched — agents work only in worktrees

**Key benefit:** Creating a worktree takes ~2 seconds regardless of repo size (vs minutes for a full copy).

## Success Criteria

1. User can create a workspace from the project view by entering a branch name
2. If branch exists, the worktree checks it out; if not, creates a new branch from HEAD
3. Workspace appears in a list on the project view with branch name, path, and created date
4. User can delete a workspace (removes worktree directory + git worktree registration + DB record)
5. Deleting a project also cleans up all its workspaces
6. Cannot create two workspaces on the same branch (git enforces, UI reports clearly)
7. Workspace paths are stored in managed app data directory
8. All existing Phase 0/1 verification commands still pass

## Scope

### In scope

- Git service: wraps `git` CLI commands (worktree add/remove/list, branch list, current branch)
- Workspace service: CRUD backed by SQLite + git worktree operations
- Workspace SQLite table with FK to projects
- IPC handlers for workspace + git operations
- Renderer workspace entity (types, store, API wrapper)
- Create workspace feature (branch name input, create button)
- Workspace list widget on project view
- Delete workspace with cleanup
- Cascade delete workspaces when project is deleted
- Schema migration (add workspaces table to existing DB)

### Out of scope

- Full-copy backend (deferred — worktrees cover the primary use case)
- Auto-installing dependencies in worktrees (`npm install`)
- Progress reporting for workspace creation (worktrees are fast enough)
- Agent session targeting of workspaces (Phase 3)
- File diff or branch comparison views
- Merge operations from the UI
- Branch deletion after workspace removal

## Tech Decisions

| Decision              | Choice                                               | Rationale                                                                          |
| --------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Workspace backend     | Git worktrees                                        | Fast (~2s), disk-efficient, git-native. Full copy available as future alternative. |
| Git operations        | `child_process.execFile` (async)                     | Shell out to `git` CLI. Reliable, handles all edge cases, no libgit2 dependency.   |
| Worktree storage path | `<userData>/workspaces/<project-id>/<workspace-id>/` | Managed location, easy cleanup, doesn't pollute the original repo.                 |
| Schema migration      | Append to SCHEMA constant                            | Simple — `CREATE TABLE IF NOT EXISTS` is idempotent.                               |
| Branch resolution     | Auto-detect new vs existing                          | Check if branch exists first, then use appropriate `git worktree add` variant.     |
| Abstraction           | `Workspace` interface with `type` field              | Designed so `type: 'copy'` backend can be added later behind same interface.       |

## Data Model

### SQLite Schema (added to existing)

```sql
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  path TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'worktree',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, branch_name),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```

### TypeScript Types

```typescript
interface Workspace {
  id: string
  projectId: string
  branchName: string
  path: string
  type: 'worktree' // | 'copy' in the future
  createdAt: string
}

interface CreateWorkspaceInput {
  projectId: string
  branchName: string
}
```

## IPC API Contract (additions)

```typescript
interface ElectronAPI {
  // ... existing project + dialog APIs unchanged

  workspace: {
    create: (input: CreateWorkspaceInput) => Promise<Workspace>
    getByProjectId: (projectId: string) => Promise<Workspace[]>
    delete: (id: string) => Promise<void>
  }

  git: {
    getBranches: (repoPath: string) => Promise<string[]>
    getCurrentBranch: (repoPath: string) => Promise<string>
  }
}
```

## Deliverables

### Backend (electron/)

| File                                                   | What it does                                                            |
| ------------------------------------------------------ | ----------------------------------------------------------------------- |
| `electron/backend/git/git.service.ts`                  | Wraps git CLI: worktree add/remove, branch list, current branch         |
| `electron/backend/git/git.service.test.ts`             | Tests git operations against temp repos                                 |
| `electron/backend/workspace/workspace.service.ts`      | Workspace CRUD: create (git worktree + DB), list, delete (cleanup both) |
| `electron/backend/workspace/workspace.types.ts`        | Backend workspace types and row mapper                                  |
| `electron/backend/workspace/workspace.service.test.ts` | Tests workspace lifecycle                                               |
| `electron/backend/database/database.ts`                | Updated: add workspaces table to schema                                 |

### IPC + Preload

| File                                 | What it does                                 |
| ------------------------------------ | -------------------------------------------- |
| `electron/main/ipc.ts`               | Updated: add workspace + git IPC handlers    |
| `electron/preload/index.ts`          | Updated: expose workspace + git APIs         |
| `src/shared/types/electron-api.d.ts` | Updated: add Workspace types and API methods |

### Renderer — entities layer

| File                                        | What it does                                   |
| ------------------------------------------- | ---------------------------------------------- |
| `src/entities/workspace/workspace.types.ts` | Workspace domain types                         |
| `src/entities/workspace/workspace.api.ts`   | Typed wrapper for workspace + git IPC calls    |
| `src/entities/workspace/workspace.model.ts` | Zustand store: workspaces list, loading, error |
| `src/entities/workspace/index.ts`           | Public API barrel                              |

### Renderer — features layer

| File                                                                | What it does                                                      |
| ------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `src/features/workspace-create/workspace-create.container.tsx`      | Orchestrates: branch name input → create workspace → refresh list |
| `src/features/workspace-create/workspace-create.presentational.tsx` | Branch name input + create button                                 |
| `src/features/workspace-create/index.ts`                            | Public API barrel                                                 |

### Renderer — widgets layer

| File                                                           | What it does                                          |
| -------------------------------------------------------------- | ----------------------------------------------------- |
| `src/widgets/workspace-list/workspace-list.container.tsx`      | Loads and displays workspaces for active project      |
| `src/widgets/workspace-list/workspace-list.presentational.tsx` | Workspace cards with branch name, path, delete button |
| `src/widgets/workspace-list/index.ts`                          | Public API barrel                                     |

### shadcn components to add

| Component      | Used for                      |
| -------------- | ----------------------------- |
| `input`        | Branch name text input        |
| `card`         | Workspace cards in list       |
| `alert-dialog` | Delete workspace confirmation |

### Renderer — app layer

| File                             | What it does                                               |
| -------------------------------- | ---------------------------------------------------------- |
| `src/app/App.presentational.tsx` | Updated: project view shows workspace list + create button |

### Test files

| File                                                   | What it tests                                                    |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| `electron/backend/git/git.service.test.ts`             | Branch listing, current branch, worktree add/remove              |
| `electron/backend/workspace/workspace.service.test.ts` | Create, list, delete, cascade delete, duplicate branch rejection |
| `src/entities/workspace/workspace.model.test.ts`       | Zustand store actions                                            |
| `src/app/App.container.test.tsx`                       | Updated: project view with workspace list                        |

## UI Flows

### Flow 1: Create workspace

```
Project view → Click "New Workspace"
  → Input field appears for branch name
  → User types "feature-auth"
  → Click "Create"
  → Backend checks if branch exists:
    - Exists → git worktree add <path> feature-auth
    - New → git worktree add <path> -b feature-auth
  → Workspace record saved to SQLite
  → Workspace appears in list
```

### Flow 2: Project view with workspaces

```
┌──────────────────────────────────────────┐
│ ▼ my-project              [+ New Project]│
├──────────────────────────────────────────┤
│                                          │
│  Repository                              │
│  /Users/me/Projects/my-project           │
│  Branch: main                            │
│                                          │
│  ─── Workspaces ─────────────────────    │
│                                          │
│  ┌─────────────────────────────────────┐ │
│  │ feature-auth                        │ │
│  │ ~/Library/.../workspaces/abc/       │ │
│  │ Created: 2026-04-11     [Delete]    │ │
│  └─────────────────────────────────────┘ │
│                                          │
│  ┌─────────────────────────────────────┐ │
│  │ fix-header                          │ │
│  │ ~/Library/.../workspaces/def/       │ │
│  │ Created: 2026-04-11     [Delete]    │ │
│  └─────────────────────────────────────┘ │
│                                          │
│  Branch: [_______________] [+ Create]    │
│                                          │
│  Sessions will target these workspaces   │
│  in future phases.                       │
│                                          │
└──────────────────────────────────────────┘
```

### Flow 3: Delete workspace

```
Click "Delete" on a workspace
  → Confirmation dialog: "Remove workspace 'feature-auth'? This deletes the working directory."
  → Confirm → Backend:
    1. git worktree remove <path> --force
    2. rm -rf <path> (cleanup if worktree remove fails)
    3. DELETE from workspaces WHERE id = ?
  → Workspace disappears from list
```

### Flow 4: Delete project with workspaces

```
Delete project
  → All workspaces cleaned up first (worktree remove + directory delete)
  → Project record deleted (FK cascade deletes workspace rows)
```

## Implementation Order

### Step 1: Git service

- Create `electron/backend/git/git.service.ts`
- Implement: `getBranches`, `getCurrentBranch`, `branchExists`, `addWorktree`, `removeWorktree`
- All operations use `child_process.execFile('git', [...args], { cwd: repoPath })`
- Write `git.service.test.ts` (creates temp git repos for testing)
- **Verify:** tests pass

### Step 2: Database migration + workspace service

- Update `electron/backend/database/database.ts` — add workspaces table to SCHEMA
- Create `electron/backend/workspace/workspace.types.ts`
- Create `electron/backend/workspace/workspace.service.ts` — create, getByProjectId, delete
- Create delegates to GitService for worktree operations
- Delete cleans up both git worktree and DB record
- Write `workspace.service.test.ts`
- **Verify:** tests pass

### Step 3: Project delete cascade

- Update `electron/backend/project/project.service.ts` — before deleting a project, clean up all workspaces (worktree remove + directory cleanup)
- Update tests
- **Verify:** deleting project cleans up worktrees

### Step 4: IPC + preload + type declarations

- Update `electron/main/ipc.ts` — add workspace + git handlers
- Update `electron/preload/index.ts` — expose workspace + git APIs
- Update `src/shared/types/electron-api.d.ts` — add workspace + git types
- **Verify:** typecheck passes

### Step 5: Renderer entity layer

- Create `src/entities/workspace/` — types, API wrapper, Zustand store
- Update `src/entities/index.ts`
- Write store tests
- **Verify:** tests pass

### Step 6: Create workspace feature + workspace list widget

- Install shadcn components (input, card, alert-dialog)
- Create `src/features/workspace-create/`
- Create `src/widgets/workspace-list/`
- Update `src/app/App.presentational.tsx` — project view shows workspace section
- **Verify:** UI renders correctly

### Step 7: Integration + verification gate

- Test full flow: create project → create workspace → see it listed → delete it
- Run all verification commands
- **Verify:** all gates pass

## Verification Gate

```bash
npm install                          # no errors
npm run test:pure                    # passes (including git + workspace service tests)
npm run test:unit                    # passes (including renderer workspace tests)
npm run lint                         # no errors
npm run typecheck                    # no type errors
npm run build                        # production build succeeds
chaperone check --fix                # passes
```

Plus manual verification:

- `npm run dev` → project view shows workspace section
- Create workspace with new branch name → worktree created, appears in list
- Create workspace with existing branch → worktree checks it out
- Create duplicate branch workspace → error toast
- Delete workspace → worktree cleaned up, disappears from list
- Delete project with workspaces → all worktrees cleaned up

## Dependencies to Install

No new production dependencies. Git CLI is the only external tool (assumed available on all developer machines).

### shadcn components to add

- `input` — branch name text input
- `card` — workspace cards
- `alert-dialog` — delete confirmation

## Risks

| Risk                                       | Mitigation                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------ |
| `git` not in PATH                          | Check at app startup, show clear error if missing                              |
| Worktree directory left behind after crash | On startup, reconcile DB records with actual worktree state                    |
| Git repo in detached HEAD state            | Worktree add still works — branch from detached HEAD                           |
| Large repo makes worktree add slow         | Unlikely — worktrees are fast by design. Monitor and add async if needed.      |
| User deletes worktree directory manually   | Reconcile on load: if path gone, run `git worktree prune` and delete DB record |

## Design Notes

### Why not full copy?

Worktrees solve the same problem (parallel branch work) with:

- ~100x faster creation (seconds vs minutes)
- ~0 extra disk usage (shared objects)
- Native git branch tracking (no manual checkout after copy)
- No skip list needed

Full-copy backend can be added behind the `Workspace` interface (`type: 'copy'`) if edge cases arise.

### Future: session targeting

In Phase 3+, agent sessions will target a workspace path instead of (or in addition to) the project root. The workspace `path` field is the session's working directory. This phase just creates and manages the workspaces — session integration comes later.
