# Changed Files Base Branch Mode

## Goal

The changed-files panel currently answers two review questions:

- **Compact view:** what is dirty in the current working tree?
- **Expanded view:** what did the agent change turn by turn?

This spec adds a third review question without replacing either existing
behavior:

- **Base branch mode:** what files differ between this session workspace and
  the branch that this work will eventually be reviewed against?

The base branch is project-specific. It may be `main`, `master`, `beta`, `b`,
or another branch configured for the project or discovered from an existing
pull request. The user must be able to switch between the current working-tree
view and the base-branch view while keeping the same changed-files affordances:
file list, selected file, diff viewer, refresh, empty states, and panel
position/width controls.

## Product Intent

- The panel remains one **Changed Files** surface. It gains a mode selector,
  not a separate sidebar or dialog.
- **Working tree** mode stays the current compact behavior: uncommitted staged,
  unstaged, and untracked changes in the session workspace.
- **Base branch** mode shows the cumulative file set that would matter for a
  pull request against the resolved base branch, plus local uncommitted changes
  layered on top so users can review work before committing.
- Existing expanded turn-history behavior remains available. This feature does
  not remove turn cards or per-turn diffs.
- The UI should make the active comparison explicit: for example,
  `Working tree` vs `Against beta`.
- The mode switch should be local UI state in V1. It does not need to persist
  globally or per session.
- Base-branch mode must degrade clearly when the base cannot be resolved or the
  workspace is not a git repository.

## Non-Goals

- No PR creation flow.
- No GitHub-only assumption. GitHub PR metadata can inform base resolution when
  available, but the feature works for any git repository.
- No branch checkout, merge, rebase, or write operation. This is a read-only
  diff surface.
- No mutation of project settings from the changed-files panel in V1.
- No replacement for turn-grouped file changes. Turn history remains the
  expanded agent-narrative view.
- No server-side cache or database table for base-branch diffs. Diffs are live
  git reads, like the current compact working-tree view.

## V1 Behavior

### Modes

The changed-files panel supports these comparison modes:

```ts
type ChangedFilesMode = 'working-tree' | 'base-branch'
```

**Working-tree mode**

- Uses the existing `gitApi.getStatus(session.workingDirectory)`.
- Uses the existing `gitApi.getDiff(session.workingDirectory, filePath)`.
- Includes staged, unstaged, and untracked files.
- Empty state remains: `No working tree changes detected`.

**Base-branch mode**

- Resolves a base branch for the session workspace.
- Lists files changed between the resolved base comparison point and the current
  workspace content.
- Includes:
  - commits on the current branch since the merge base with the base branch
  - staged changes
  - unstaged changes
  - untracked files
- Clicking a file opens the cumulative diff for that file against the same base
  comparison point.
- Empty state: `No changes against {baseBranch} detected`.

### Expanded Panel Interaction

The current `expanded` prop is a layout/review-depth control. V1 should avoid
overloading it as the only way to access turn history.

Recommended layout:

- Keep the header controls for side, width, refresh, and close.
- Add a compact segmented control near the top of the panel:
  - `Working Tree`
  - `Base Branch`
  - `Turns`
- In compact width, default to `Working Tree`.
- In expanded width, keep `Turns` as the default if that is the current
  behavior users expect, but allow switching to `Working Tree` or
  `Base Branch`.

If the implementation chooses a smaller first slice, it may initially expose
only `Working Tree` and `Base Branch` in compact mode, as long as the existing
expanded turn list remains reachable and unchanged.

### Base Branch Resolution

Base branch resolution is ordered by intent:

1. Existing pull request metadata for the workspace:
   `workspace_pull_requests.base_branch`, when present.
2. Project settings:
   `ProjectSettings.workspaceCreation.baseBranchName`, when present.
3. Git remote default branch:
   `refs/remotes/origin/HEAD`, normalized from `origin/<branch>` to
   `<branch>`.
4. Conventional local branches, in this order:
   `main`, `master`.
5. Current branch as a last-resort fallback only for resolution metadata. The
   UI should still report that this is not a useful base comparison because it
   produces no PR-style diff.

If a configured or PR-derived branch does not exist locally, the backend may
attempt `git fetch origin <branch>` and then use `origin/<branch>` if it
exists. Fetch failure must not fail the whole panel when a local matching ref
exists.

The resolved response should include both the configured branch name and the
actual comparison ref:

```ts
interface ResolvedBaseBranch {
  branchName: string
  comparisonRef: string
  source:
    | 'pull-request'
    | 'project-settings'
    | 'remote-default'
    | 'convention'
    | 'current-branch'
  warning: string | null
}
```

### Git Comparison Semantics

Base-branch mode should match pull request review expectations.

1. Resolve `comparisonRef`, preferring `origin/<base>` when available.
2. Compute the merge base between `comparisonRef` and `HEAD`.
3. Use the merge base as the base comparison point.
4. Compare that point to the current workspace content, not just `HEAD`.

This means a user sees committed branch changes and uncommitted local edits in
one list. That is intentional: the mode should answer, "what would this branch
plus my local edits look like against the PR base if I committed now?"

Suggested git commands:

- List tracked file changes:
  `git diff --name-status --find-renames <mergeBase> --`
- Diff one tracked file:
  `git diff --no-color --find-renames <mergeBase> -- <filePath>`
- List untracked files:
  `git ls-files --others --exclude-standard`
- Diff one untracked file:
  synthetic `/dev/null` diff using the same mechanism as
  `GitService.getDiff()`.

If merge-base lookup fails, fall back to comparing directly against
`comparisonRef` and return a warning so the UI can show that the diff may not
match hosted PR semantics exactly.

### UI States

Header count reflects the active mode:

- Working tree: `Changed Files (3)`
- Base branch: `Against beta (12)` or `Changed Files (12)` with a visible
  `Against beta` mode pill.
- Turns: current turn-history label.

Empty states:

- Working tree: `No working tree changes detected`.
- Base branch with clean comparison: `No changes against {baseBranch} detected`.
- Base branch unresolved:
  `Base branch could not be resolved for this project.`
- Non-git workspace:
  `Changed files require a git repository.`

Error states should be mode-specific and retryable through the existing refresh
control.

### Data Shapes

Reuse the current file item shape where possible:

```ts
interface ChangedFile {
  status: string
  file: string
}
```

Add base-branch metadata separately so existing file rendering can stay shared:

```ts
interface BaseBranchDiffSummary {
  base: ResolvedBaseBranch
  files: ChangedFile[]
}
```

The renderer should normalize both working-tree and base-branch results into a
common `ChangedFile[]` list before rendering. The selected file and diff viewer
should not care which provider produced the list.

## Acceptance Criteria

- User can switch the changed-files panel between `Working Tree` and
  `Base Branch` modes.
- Working-tree mode behaves exactly as it does before this feature.
- Base-branch mode resolves the project/workspace base branch and displays the
  branch name in the UI.
- Base-branch mode includes committed branch changes, staged changes, unstaged
  changes, and untracked files.
- Selecting a file in base-branch mode shows that file's cumulative diff against
  the merge base with the resolved base branch.
- Switching modes preserves panel side/width and does not close the panel.
- Switching modes does not show stale files or stale diffs from the previous
  mode.
- Refresh reloads the active mode.
- Missing base branch, non-git workspace, and git command failures have clear
  empty/error states.
- Existing turn-history expanded view remains available and keeps using stored
  per-turn diffs.

## Architecture Notes

- Backend git behavior belongs in `electron/backend/git/git.service.ts`.
- IPC handlers belong in `electron/main/ipc.ts`.
- Preload exposure belongs in `electron/preload/index.ts`.
- Renderer API wrappers belong in `src/entities/workspace/workspace.api.ts`
  unless a dedicated git entity is introduced first.
- Shared electron API types belong in `src/shared/types/electron-api.d.ts`.
- Changed-files UI changes stay in `src/widgets/session-view/`.
- Prefer pure helpers for base-branch resolution and diff output parsing so the
  important edge cases are testable without real repositories.

## Open Questions

1. Should mode selection persist per session after V1?
2. Should the project settings screen expose a clearer "review base branch"
   field distinct from workspace creation base branch?
3. Should base-branch mode use existing PR metadata as authoritative even if it
   conflicts with project settings? This spec says yes for V1 because it
   matches the actual review target.
4. Should turn history become a third segment in the same selector immediately,
   or should V1 keep the current expanded-width behavior and add the third
   segment later?
