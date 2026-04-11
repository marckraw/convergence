# Phase 6: Project-Aware Tooling — Detailed Spec

> Parent: `docs/specs/project-spec.md`
> Builds on: Phase 5 (real providers running against repos)

## Objective

Make sessions deeply useful inside a project context. After a session runs, show what files changed, display diffs, and surface workspace/branch info. Sessions become project-aware tools, not just chat windows.

## Success Criteria

1. Changed files panel shows files modified/created/deleted during a session
2. Clicking a changed file shows its diff
3. Session header shows workspace branch name
4. Changed files update in real-time as the agent works
5. Collapsible side panel for changed files (doesn't block transcript)
6. Git status check works for both project root and workspace paths

## Scope

### In scope

- GitService: `getStatus` (changed files), `getDiff` (file diff)
- Changed files IPC handlers
- Changed files side panel (collapsible)
- Inline diff viewer (basic)
- Session header: branch name display
- Auto-refresh changed files on session update events

### Out of scope

- Full code editor / file browser
- Merge conflict resolution
- Commit from UI (defer)
- Multi-file diff navigation
- Syntax highlighting in diffs (basic for now)

## Deliverables

### Backend

| File                                  | What it does                                |
| ------------------------------------- | ------------------------------------------- |
| `electron/backend/git/git.service.ts` | Updated: add `getStatus`, `getDiff` methods |
| `electron/main/ipc.ts`                | Updated: add git status/diff handlers       |
| `electron/preload/index.ts`           | Updated: expose git status/diff APIs        |
| `src/shared/types/electron-api.d.ts`  | Updated: add git status/diff types          |

### Renderer

| File                                                            | What it does                                    |
| --------------------------------------------------------------- | ----------------------------------------------- |
| `src/widgets/session-view/changed-files-panel.container.tsx`    | Loads changed files, shows collapsible panel    |
| `src/widgets/session-view/changed-file-item.presentational.tsx` | Single file with status badge + click to diff   |
| `src/widgets/session-view/diff-viewer.presentational.tsx`       | Basic diff display                              |
| `src/widgets/session-view/session-view.container.tsx`           | Updated: add side panel + branch info in header |
