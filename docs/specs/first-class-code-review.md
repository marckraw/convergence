# First-Class Code Review

## Goal

Make code review a first-class workflow inside Convergence's Code surface.

The user should be able to open a large, full-screen review experience for
agent-made code changes, inspect changed files with a real file tree and rich
diff renderer, gather local review notes, and send those notes to an agent
session with precise file and line context.

The product outcome is: "I can review all relevant code changes from one
dedicated review workspace, then ask the right agent about the exact files and
lines I selected."

## Source of Truth

Execution tracking lives in Linear under `MAR-1212` and its child issues.
This document captures durable product and architecture context.

Related completed or lower-level specs:

- `docs/specs/changed-files-base-branch.md`
- `docs/specs/advanced-pull-request-review.md`
- `docs/specs/pierre-review-primitives.md`
- `docs/specs/pull-request-local-review.md`

## Product Decision

First-class review is part of the **Code** product area, not a third top-level
app surface next to Code and Chat.

The current top-level app distinction remains:

- `code`: local projects, workspaces, sessions, terminal, changed files, review
- `chat`: global chat and Spaces

The review experience is "global" within Code: it is not owned by only the
currently visible session view. It can be opened from the sidebar, command
palette, a session's Changed Files panel, or Pull Request affordances. When it
opens from a session, it should preselect that session's workspace and preserve
the ability to send notes back to that session.

## Current Codebase Grounding

Existing pieces to reuse:

- `src/widgets/session-view/changed-files-panel.container.tsx`
  - compact changed-files and review-note workflow
  - modes: `working-tree`, `base-branch`, `turns`
  - line selection, note creation, packet preview, and `Ask AI`
- `src/widgets/session-view/changed-files-tree-model.container.tsx`
  - wraps `@pierre/trees/react`
- `src/widgets/session-view/pierre-diff-viewer.presentational.tsx`
  - wraps `@pierre/diffs/react` `PatchDiff`, virtualization, worker pool,
    selection, and annotations
- `src/entities/review-note`
  - local review-note persistence and packet actions
- `electron/backend/git/changed-files.service.ts`
  - resolves base branch comparison for a session
- `electron/backend/git/git.service.ts`
  - local working-tree status and diff commands
- `src/entities/pull-request`
  - cached Pull Request metadata for workspaces

Current limitation:

- The compact Changed Files panel owns too much orchestration.
- The available review real estate is too small for large agent-generated
  changes.
- Repeated file-list and diff calls are tied to one panel instead of a shared
  review domain.
- There is no dashboard for choosing which workspace/session/branch to review
  when the user opens review globally from Code.

## Review Target Model

A review surface must first answer: "what changes am I reviewing?"

Represent that answer as a **Review Target**.

Suggested renderer type:

```ts
interface CodeReviewTarget {
  id: string
  projectId: string
  projectName: string
  repositoryPath: string
  workspaceId: string | null
  sessionId: string | null
  sessionName: string | null
  branchName: string | null
  pullRequestId: string | null
  pullRequestLabel: string | null
  source: 'session' | 'workspace' | 'project-repository' | 'pull-request'
}
```

Target discovery should include:

- the active session workspace, when opened from a session
- active project workspaces and worktrees
- Pull Request review workspaces
- the active project's source repository
- later, multi-repository project members

Opening from a compact Changed Files panel should pass a concrete target:

- session id
- workspace id, if present
- working directory
- preferred mode
- selected file, when available

Opening globally from Code should show a dashboard of targets with enough
status to choose quickly:

- project / branch / session name
- Pull Request number and state, when known
- changed-file counts by mode
- last session activity / attention state, when tied to a session

## Review Modes

V1 modes:

- `working-tree`
  - staged, unstaged, and untracked local changes
  - source of truth is local Git
- `base-branch`
  - merge-base/base branch comparison plus local uncommitted edits
  - source of truth is local Git
- `turns`
  - session turn-level captured file changes
  - source of truth is existing turn capture data

Deferred mode:

- `pull-request-remote`
  - remote Pull Request patch/files from GitHub or another forge
  - useful for caching and metadata, but cannot replace working-tree review

## GitHub / Forge Data

GitHub REST is not the primary substrate for V1 review because it cannot see
local working-directory changes. Local Git remains the source of truth for
`working-tree` and `base-branch` review.

GitHub or another forge can still help later:

- Pull Request title, state, base/head branches, and URL
- remote PR patch or file list for comparison with local state
- review comments and check metadata
- caching remote PR snapshots by head SHA

Treat forge integration as an optional provider behind a review data service,
not as a replacement for local Git.

## First-Class Review Surface

The full review surface should use the same primitives as the compact panel,
but with layout that fits review work.

Suggested layout:

- top bar
  - target selector
  - mode selector
  - refresh
  - branch / PR metadata
  - changed-file counts
- left rail
  - Pierre file tree
  - search and filters
  - status counts
  - file note badges
- main pane
  - selected-file diff initially
  - later optional multi-file diff mode
  - split/stacked toggle when supported cleanly
  - line selection and annotations
- right rail
  - draft/sent/resolved review notes
  - packet preview
  - `Ask AI`
  - later explicit `Ask AI to fix selected notes`

The compact Changed Files panel should remain available in session view, but it
should become a small consumer of the same review model and services.

## Sending Review Notes To Agents

Review notes remain local Convergence objects in V1.

When a review target has a `sessionId`, `Ask AI` sends the review packet to
that session through the existing session message path.

When a target has no session, the UI should make the missing route explicit:

- attach the review to an existing session
- start a new review session for the target
- save notes locally without sending

Do not silently choose a session for the user.

## Architecture

Introduce a shared review domain instead of growing
`ChangedFilesPanel`.

Renderer:

- `src/entities/code-review/`
  - `code-review.types.ts`
  - `code-review.api.ts`
  - `code-review.model.ts`
  - target, summary, file-list, selected file, active mode, loading/error state
- `src/features/code-review-target-picker/`
  - dashboard and target selector behavior
- `src/features/code-review-mode-switcher/`
  - mode controls and count labels
- `src/features/code-review-notes/`
  - review-note tray composed over `src/entities/review-note`
- `src/widgets/code-review-surface/`
  - full Code review workspace
- `src/widgets/session-view/`
  - compact Changed Files panel consumes `entities/code-review`

Backend:

- `electron/backend/code-review/`
  - `service.ts`
  - `types.ts`
  - `local-git-provider.ts`
  - later `github-provider.ts`
  - later `snapshot-cache.repository.ts`

IPC:

- `codeReview:listTargets`
- `codeReview:getSummary`
- `codeReview:getFilePatch`
- later `codeReview:getPatch`

Keep renderer imports FSD-compliant. Code review widgets can depend on
features/entities/shared. Entities must not import widgets or features.

## Performance Strategy

The main V1 performance risk is repeated live Git and diff rendering work.

Use a summary-first, lazy patch model:

1. load target list and cheap counts
2. load changed-file summary for the selected target/mode
3. load selected-file patch only when needed
4. cache summary and patch results by target, mode, comparison point, file path,
   and a short-lived working-tree version token
5. keep explicit refresh as the user-controlled invalidation path

Pierre rendering should keep:

- tree virtualization
- diff virtualization thresholds
- worker pool for large diffs
- selected-file rendering as the default for first implementation

Avoid full multi-file rendering until the selected-file path is stable and fast.

## Acceptance Criteria

- The user can open a full review surface from Code.
- Opening from a session Changed Files panel preselects the same target, mode,
  and selected file when possible.
- The review target dashboard lists relevant Code targets with changed-file
  counts.
- The full surface supports `working-tree` and `base-branch` modes.
- File tree, diff rendering, line selection, annotations, and review notes use
  shared primitives also consumed by the compact panel.
- Review notes can be created, edited, filtered, previewed, and sent to the
  linked session.
- The compact Changed Files panel remains usable and does not fork a separate
  data model.
- Local Git remains the source of truth for local and base-branch review.
- GitHub/forge data is additive and optional.

## Deferred

- Publish notes as GitHub review comments.
- Remote PR-only review mode.
- Multi-file virtualized diff as the default.
- Snapshot cache persisted across app restarts.
- Review answer-to-note linking.
- Multi-repository project review targets.
- Selective accept/reject hunk application.
