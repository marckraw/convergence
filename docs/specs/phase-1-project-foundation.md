# Phase 1: Project Foundation — Detailed Spec

> Parent: `docs/specs/project-spec.md`
> Builds on: Phase 0 (working repo, toolchain, app shell)
> Status: **DONE** (verified 2026-04-17)

## Objective

Establish the project as the central domain entity. After this phase, a user can create a project from a local git repository, close and reopen the app retaining the project, and switch between multiple projects.

## Success Criteria

All must be true before Phase 1 is complete:

1. User can click "Create Project" and select a local directory via native file picker
2. Selected path is validated as an existing git repository (`.git` directory exists)
3. Invalid paths show clear error feedback in the UI
4. Project is persisted to SQLite — survives app restart
5. App loads the last active project on startup
6. User can create multiple projects and switch between them
7. Project entity includes extensible settings (JSON column for future phases)
8. IPC layer is typed end-to-end: preload exposes, renderer consumes via `*.api.ts`
9. All Phase 0 verification commands still pass
10. New backend and entity code has test coverage

## Scope

### In scope

- Project entity: id, name, repositoryPath, settings, timestamps
- SQLite database setup with `better-sqlite3`
- Project CRUD operations (create, read, delete)
- Typed IPC layer (preload contextBridge + renderer API wrappers)
- Native directory picker dialog
- Git repository validation (`.git` directory check)
- App state persistence (active project ID)
- Welcome screen (no projects exist)
- Project view (active project loaded)
- Project switcher (multiple projects)
- Zustand store for renderer project state

### Out of scope

- Project rename UI (name defaults to directory name, rename deferred)
- Project settings UI (settings column exists but no editor)
- Copy/workspace flows (Phase 2)
- Session model or agent runtime (Phase 3)
- Multi-repository projects (Phase 7)
- Detailed project dashboard — main area stays placeholder

## Tech Decisions

| Decision        | Choice                                         | Rationale                                                                      |
| --------------- | ---------------------------------------------- | ------------------------------------------------------------------------------ |
| Database        | `better-sqlite3`                               | Synchronous, fast, works well with Electron main process. No async overhead.   |
| Schema approach | Raw SQL + typed wrappers                       | Simple for two tables. Migrate to Drizzle ORM if schema grows in later phases. |
| Native modules  | `@electron/rebuild`                            | Recompile `better-sqlite3` against Electron's Node headers                     |
| IPC typing      | Shared interface, mirrored in renderer `.d.ts` | Clean boundary — renderer never imports from `electron/`                       |
| Git validation  | `fs.existsSync(path + '/.git')`                | Simplest check. Spawning `git` is overkill for Phase 1.                        |
| Project ID      | `crypto.randomUUID()`                          | Built-in, no dependency needed                                                 |
| DB location     | `app.getPath('userData')/convergence.db`       | Standard Electron user data path                                               |

## Data Model

### SQLite Schema

```sql
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  repository_path TEXT NOT NULL UNIQUE,
  settings TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

### TypeScript Types

```typescript
interface Project {
  id: string
  name: string
  repositoryPath: string
  settings: ProjectSettings
  createdAt: string
  updatedAt: string
}

interface ProjectSettings {
  // Extensible — future phases add fields here
  // Phase 2: copyIgnorePatterns, copyTargetDir
  // Phase 7: additionalRepositories
}

interface CreateProjectInput {
  repositoryPath: string
  name?: string // defaults to directory basename
}
```

## IPC API Contract

```typescript
interface ElectronAPI {
  project: {
    create: (input: CreateProjectInput) => Promise<Project>
    getAll: () => Promise<Project[]>
    getById: (id: string) => Promise<Project | null>
    delete: (id: string) => Promise<void>
    getActive: () => Promise<Project | null>
    setActive: (id: string) => Promise<void>
  }
  dialog: {
    selectDirectory: () => Promise<string | null>
  }
}
```

The renderer accesses this via `window.electronAPI`. The preload script implements it with `ipcRenderer.invoke()`. The main process handles via `ipcMain.handle()`.

## Deliverables

### Backend (electron/)

| File                                          | What it does                                                |
| --------------------------------------------- | ----------------------------------------------------------- |
| `electron/backend/database/database.ts`       | SQLite connection setup, schema initialization              |
| `electron/backend/database/database.types.ts` | Row types for SQLite (snake_case, matching DB columns)      |
| `electron/backend/project/project.service.ts` | Project CRUD: create, getAll, getById, delete, validate git |
| `electron/backend/project/project.types.ts`   | Backend project types and mappers (row → domain)            |
| `electron/backend/state/state.service.ts`     | App state key-value store (active project ID)               |
| `electron/main/ipc.ts`                        | Register all IPC handlers (project + dialog channels)       |
| `electron/main/index.ts`                      | Updated: init database, register IPC before creating window |
| `electron/preload/index.ts`                   | Updated: expose full electronAPI via contextBridge          |

### Renderer — entities layer

| File                                    | What it does                                                  |
| --------------------------------------- | ------------------------------------------------------------- |
| `src/entities/project/project.types.ts` | Project domain types (shared with backend via mirroring)      |
| `src/entities/project/project.api.ts`   | Typed wrapper: `window.electronAPI.project.*` calls           |
| `src/entities/project/project.model.ts` | Zustand store: projects list, activeProjectId, loading states |
| `src/entities/project/index.ts`         | Public API barrel                                             |

### Renderer — features layer

| File                                                            | What it does                                                  |
| --------------------------------------------------------------- | ------------------------------------------------------------- |
| `src/features/project-create/project-create.container.tsx`      | Orchestrates: pick directory → validate → create → set active |
| `src/features/project-create/project-create.presentational.tsx` | Create project button + error display                         |
| `src/features/project-create/index.ts`                          | Public API barrel                                             |

### Renderer — widgets layer

| File                                                           | What it does                                           |
| -------------------------------------------------------------- | ------------------------------------------------------ |
| `src/widgets/welcome/welcome.container.tsx`                    | Welcome screen: shown when no projects exist           |
| `src/widgets/welcome/welcome.presentational.tsx`               | Welcome layout with create-project CTA                 |
| `src/widgets/welcome/index.ts`                                 | Public API barrel                                      |
| `src/widgets/project-header/project-header.container.tsx`      | Project header: name, switcher dropdown, create button |
| `src/widgets/project-header/project-header.presentational.tsx` | Header layout                                          |
| `src/widgets/project-header/index.ts`                          | Public API barrel                                      |

### Renderer — app layer

| File                             | What it does                                                               |
| -------------------------------- | -------------------------------------------------------------------------- |
| `src/app/App.container.tsx`      | Updated: load active project on mount, route between welcome/project views |
| `src/app/App.presentational.tsx` | Updated: layout with header + main content area                            |

### Type declarations

| File                                 | What it does                                 |
| ------------------------------------ | -------------------------------------------- |
| `src/shared/types/electron-api.d.ts` | Global `Window.electronAPI` type declaration |

### shadcn components to add

| Component        | Used for                                  |
| ---------------- | ----------------------------------------- |
| `dialog`         | Project creation confirmation (if needed) |
| `dropdown-menu`  | Project switcher in header                |
| `card`           | Project info display                      |
| `badge`          | Status indicators                         |
| `sonner` (toast) | Success/error notifications               |
| `separator`      | Layout dividers                           |

### Test files

| File                                                            | What it tests                                          |
| --------------------------------------------------------------- | ------------------------------------------------------ |
| `electron/backend/project/project.service.test.ts`              | Project CRUD, git validation, duplicate path rejection |
| `electron/backend/database/database.test.ts`                    | Schema creation, basic read/write                      |
| `electron/backend/state/state.service.test.ts`                  | App state get/set                                      |
| `src/entities/project/project.model.test.ts`                    | Zustand store actions, state transitions               |
| `src/features/project-create/project-create.container.test.tsx` | Create flow: success + error states                    |
| `src/widgets/welcome/welcome.container.test.tsx`                | Welcome screen renders, CTA triggers create            |

## UI Flows

### Flow 1: First launch (no projects)

```
App opens → SQLite init → no active project → Welcome screen

┌──────────────────────────────────────────┐
│ Convergence                       _ □ x  │
├──────────────────────────────────────────┤
│                                          │
│              Welcome to                  │
│            Convergence                   │
│                                          │
│   Create a project from a local git      │
│   repository to get started.             │
│                                          │
│        [ Create Project ]                │
│                                          │
└──────────────────────────────────────────┘
```

### Flow 2: Create project

```
Click "Create Project"
  → Native directory picker opens
  → User selects a directory
  → Backend validates: directory exists + has .git
  → If invalid: show error toast ("Not a git repository")
  → If valid: create project record in SQLite
  → Set as active project
  → UI transitions to project view
```

### Flow 3: Project active

```
┌──────────────────────────────────────────┐
│ ▼ my-project          [+ New Project]    │
├──────────────────────────────────────────┤
│                                          │
│   Repository                             │
│   /Users/me/Projects/my-project          │
│                                          │
│   Created                                │
│   2026-04-11                             │
│                                          │
│   Sessions and agent tools will          │
│   appear here in future phases.          │
│                                          │
└──────────────────────────────────────────┘
```

### Flow 4: Project switcher

```
Click project name dropdown
  → Shows list of all projects
  → Click another project → set as active, reload view
  → Click "Create Project" → same create flow
```

### Flow 5: App restart

```
App opens → SQLite init → read active_project_id from app_state
  → If project exists: load it, show project view
  → If project was deleted or path invalid: clear active, show welcome
```

## Implementation Order

### Step 1: SQLite setup

- Install `better-sqlite3`, `@types/better-sqlite3`, `@electron/rebuild`
- Add postinstall script for electron-rebuild
- Create `electron/backend/database/database.ts` — init connection, run schema
- Create `electron/backend/database/database.types.ts` — row types
- Write `database.test.ts`
- **Verify:** database creates, schema initializes, read/write works

### Step 2: Project service

- Create `electron/backend/project/project.service.ts` — CRUD + git validation
- Create `electron/backend/project/project.types.ts` — types + row mapper
- Create `electron/backend/state/state.service.ts` — key-value app state
- Write tests for project service and state service
- **Verify:** can create, list, get, delete projects. Git validation works.

### Step 3: IPC layer

- Create `electron/main/ipc.ts` — register all handlers
- Update `electron/main/index.ts` — init DB + register IPC before window
- Update `electron/preload/index.ts` — expose full electronAPI
- Create `src/shared/types/electron-api.d.ts` — global type declaration
- **Verify:** IPC calls work from renderer (manual test with `npm run dev`)

### Step 4: Renderer entity layer

- Create `src/entities/project/project.types.ts`
- Create `src/entities/project/project.api.ts` — typed wrapper
- Create `src/entities/project/project.model.ts` — Zustand store
- Update `src/entities/project/index.ts` — barrel
- Write `project.model.test.ts`
- **Verify:** store actions work, API wrapper types align

### Step 5: Create project feature

- Install needed shadcn components (dialog, dropdown-menu, card, sonner, separator, badge)
- Create `src/features/project-create/` — container + presentational
- Write tests
- **Verify:** create flow works end-to-end in dev

### Step 6: Welcome + project header widgets

- Create `src/widgets/welcome/` — container + presentational
- Create `src/widgets/project-header/` — container + presentational
- Write tests
- **Verify:** welcome screen shows when no projects, header shows when project active

### Step 7: App shell integration

- Update `src/app/App.container.tsx` — load active project on mount, conditional rendering
- Update `src/app/App.presentational.tsx` — layout with header + content
- **Verify:** full flow works: create project → see project view → restart → project persists

### Step 8: Verification gate

- Run all test commands
- Run `npm run dev` and test full flows manually
- **Verify:** all gates pass

## Verification Gate

```bash
npm install                          # no errors (including native rebuild)
npm run test:pure                    # passes
npm run test:unit                    # passes (including new backend + renderer tests)
npm run lint                         # no errors
npm run typecheck                    # no type errors
npm run build                        # production build succeeds
chaperone check --fix                # passes
```

Plus manual verification:

- `npm run dev` → welcome screen appears
- Create project from a git repo → project view loads
- Create second project → switcher works
- Quit and reopen → last project loads
- Select non-git directory → error toast appears

## Dependencies to Install

### Production

- `better-sqlite3` — SQLite driver (native module)

### Development

- `@types/better-sqlite3` — type definitions
- `@electron/rebuild` — recompile native modules for Electron

## Risks

| Risk                                                         | Mitigation                                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `better-sqlite3` native module fails to compile for Electron | Use `@electron/rebuild` in postinstall. Fall back to `sql.js` (WASM) if native fails. |
| IPC types drift between main and renderer                    | Keep the contract small. E2E tests in later phases will catch drift.                  |
| Database file locked if two instances open                   | Electron single-instance lock (already default behavior)                              |
| `externalizeDepsPlugin` doesn't handle `better-sqlite3`      | Verify in build step; add manual external if needed                                   |

## Open Questions

1. **Project deletion: confirm dialog?** → Yes, add a simple confirm before delete
2. **Project name editing?** → Defer to later — directory basename is sufficient for now
3. **What happens if repo path moves/disappears?** → Show "path not found" state, let user delete the stale project
