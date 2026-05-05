# Changed Files Base Branch Mode — Implementation Plan

Companion to `docs/specs/changed-files-base-branch.md`. Keep phases small
enough that each one can be resumed by reading this file. Mark completed
checkboxes as work lands.

Each phase ends with the repo-required gates:

- `npm install`
- `npm run typecheck`
- `npm run test:pure`
- `npm run test:unit`
- `chaperone check --fix`

Use the Node version from `.nvmrc` for all Node-backed commands.

## Phase B1 — Backend Diff Substrate

Goal: backend can resolve the review base and produce a file list/diff against
it. No renderer changes.

- [x] Add backend types near `electron/backend/git/git.service.ts`:
  - [x] `ResolvedBaseBranch`
  - [x] `BaseBranchDiffSummary`
  - [x] `BaseBranchResolutionSource`
- [x] Add pure helpers, either in `electron/backend/git/git.pure.ts` or a
      focused `base-branch-diff.pure.ts`:
  - [x] normalize `origin/<branch>` to `<branch>` for display
  - [x] parse `git diff --name-status --find-renames` into
        `{ status, file }[]`
  - [x] merge tracked and untracked file lists without duplicates
  - [x] choose branch resolution source from PR metadata, project settings,
        remote default, conventions, and current branch
- [x] Extend `GitService` with read-only helpers:
  - [x] `resolveBaseBranchForSession(sessionId: string)` or a lower-level
        method that accepts repo path plus optional PR/project base values
  - [x] `getBaseBranchStatus(repoPath, baseBranchName?)`
  - [x] `getBaseBranchDiff(repoPath, filePath, baseBranchName?)`
  - [x] `getMergeBase(repoPath, comparisonRef)`
  - [x] `getUntrackedFiles(repoPath)`
- [x] Decide ownership for DB lookups:
  - [x] Preferred: create a small `ChangedFilesService` in
        `electron/backend/git/changed-files.service.ts` that can read
        `sessions`, `projects.settings`, and `workspace_pull_requests`, then
        delegate git commands to `GitService`.
  - [x] Keep `GitService` focused on git commands and do not inject the
        database into it.
- [x] Add service tests using temporary git repositories:
  - [x] base from `workspace_pull_requests.base_branch`
  - [x] base from project settings
  - [x] remote default fallback
  - [x] conventional `main` / `master` fallback
  - [x] committed branch changes appear
  - [x] staged and unstaged changes appear
  - [x] untracked files appear
  - [x] selected file diff includes cumulative base changes
  - [x] missing configured base returns a clear error shape
  - [ ] merge-base failure falls back to direct ref comparison with warning

Verification: all gates. No UI or preload changes yet.

## Phase B2 — IPC, Preload, And Renderer API

Goal: renderer can request both changed-files sources through typed APIs.

- [x] Register IPC handlers in `electron/main/ipc.ts`:
  - [x] `git:getBaseBranchStatus`
  - [x] `git:getBaseBranchDiff`
  - [x] Include session id or workspace/project context in the request so the
        backend can use PR metadata and project settings.
- [x] Expose handlers in `electron/preload/index.ts`.
- [x] Extend `src/shared/types/electron-api.d.ts`.
- [x] Extend `src/entities/workspace/workspace.types.ts` with:
  - [x] `ChangedFilesMode`
  - [x] `ResolvedBaseBranch`
  - [x] `BaseBranchDiffSummary`
- [x] Extend `src/entities/workspace/workspace.api.ts`:
  - [x] `gitApi.getBaseBranchStatus(input)`
  - [x] `gitApi.getBaseBranchDiff(input)`
- [x] Add renderer API tests with mocked `window.electronAPI.git`.
- [x] Add IPC-level tests if the repo already has coverage patterns for git
      handlers; otherwise rely on service tests from B1 and API wrapper tests.

Verification: all gates. UI remains unchanged.

## Phase B3 — Shared Changed-Files Model

Goal: isolate mode switching and stale-result prevention before touching the
panel layout heavily.

- [x] Create `src/widgets/session-view/changed-files.types.ts`:
  - [x] `ChangedFilesMode = 'working-tree' | 'base-branch' | 'turns'`
  - [x] common `ChangedFile`
  - [x] mode-specific loading/error metadata
- [x] Create `src/widgets/session-view/changed-files.model.ts` or
      `changed-files.pure.ts` with pure helpers:
  - [x] derive active header label from mode, file count, and resolved base
  - [x] derive empty-state copy from mode and error state
  - [x] keep selected file if it still exists after reload; otherwise select
        first file or clear selection
- [x] Add pure tests for label, empty-state, and selection behavior.
- [x] Refactor `changed-files-panel.container.tsx` internally so working-tree
      behavior uses the shared model but remains visually unchanged.
- [x] Add regression tests proving current working-tree behavior still passes.

Verification: all gates. Base-branch mode may still be hidden.

## Phase B4 — Mode Selector UI

Goal: users can switch between working tree and base branch in the current
panel without losing existing controls.

- [x] Add a compact segmented control to
      `src/widgets/session-view/changed-files-panel.container.tsx`.
      Use existing UI primitives if available; otherwise use small buttons with
      clear selected state.
- [x] Modes:
  - [x] `Working Tree`
  - [x] `Base Branch`
  - [x] `Turns` when the panel is expanded, or keep the current expanded
        behavior if the third segment is deferred.
- [x] Make refresh reload only the active mode.
- [x] Clear `selectedFile`, `diff`, and error state when mode changes unless
      the same selected file exists in the new mode after load.
- [x] Display base branch name once resolved, for example `Against beta`.
- [x] Ensure panel side, width, close, and expand/collapse controls are
      unchanged.
- [x] Renderer tests:
  - [x] starts in current default mode
  - [x] switching to base branch calls the new API
  - [ ] switching back calls existing `git.getStatus` / `git.getDiff`
  - [x] stale diff from prior mode is not displayed
  - [ ] refresh reloads active mode only
  - [ ] base branch empty state includes branch name
  - [ ] unresolved base branch error is visible and retryable

Verification: all gates. Manual smoke in the app is recommended.

## Phase B5 — Base-Branch Diff Rendering Details

Goal: base-branch mode feels equivalent to working-tree mode for review.

- [x] Reuse `ChangedFileItem` for both modes unless base-mode status parsing
      requires a tiny status-label helper.
- [x] Reuse `DiffViewer`, but update its empty title/copy so it can describe
      the active mode:
  - [x] no file selected in working-tree mode
  - [x] no file selected in base-branch mode
  - [x] loading diff
  - [x] diff failed
- [x] Add a short mode summary above the file list:
  - [x] Working tree: current copy can remain.
  - [x] Base branch: `Changes compared with {baseBranch}. Includes local
    uncommitted edits.`
- [x] Preserve keyboard/mouse selection behavior.
- [ ] Verify long branch names and long file paths do not overflow the panel.
- [x] Add focused component tests for mode-specific copy and status rendering.

Verification: all gates plus manual screenshot check in compact and expanded
widths.

## Phase B6 — Final Hardening

Goal: close edge cases and make the implementation resilient across real repos.

- [ ] Test manually on repositories whose base branch is:
  - [ ] `main`
  - [ ] `master`
  - [ ] a custom name such as `beta` or `b`
- [ ] Test a workspace with an existing cached PR row whose base differs from
      project settings; confirm PR base wins.
- [ ] Test no `origin` remote.
- [ ] Test detached HEAD or current branch equal to base branch.
- [ ] Test deleted files, renamed files, and binary files.
- [ ] Test a non-git workspace.
- [x] Run final gates:
  - [x] `npm install`
  - [x] `npm run typecheck`
  - [x] `npm run test:pure`
  - [x] `npm run test:unit`
  - [x] `chaperone check --fix`
- [x] Update this plan's checkboxes before opening a PR or handing work back.

## Dependency Notes

- B1 and B2 must land before any visible base-branch UI.
- B3 can happen in parallel with B1 if the shared model is kept generic and
  does not depend on final backend response shapes.
- B4 should be small: it wires UI state and loading, not git semantics.
- B5 is polish and copy once behavior is correct.
- B6 is intentionally manual-heavy because base branch resolution depends on
  real repository shapes.
