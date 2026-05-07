# Pierre Review Primitives

## Goal

Upgrade Convergence's local Pull Request review surface by replacing the
hand-built file-list and diff-rendering primitives with Pierre's dedicated
review UI libraries:

- `@pierre/trees` from <https://trees.software/>
- `@pierre/diffs` from <https://diffs.com/>

The product outcome is: "I can review a large agent-generated Pull Request in
Convergence with a fast, navigable changed-files tree, high-quality diff
rendering, line selection, and inline review-note affordances that can be sent
back to the active agent session."

This is a rendering-primitive migration first. It should preserve the current
local Git-backed data model and existing review-note workflow while improving
the review experience.

## Source of Truth

Execution tracking lives in Linear under `MAR-1200` and its child issues. Linear
is the source of truth for task state, acceptance criteria, and completion
status.

This document is intentionally limited to durable product and architecture
context so it does not drift from Linear issue checklists.

## Current Codebase Grounding

Existing surfaces to preserve:

- `src/widgets/session-view/changed-files-panel.container.tsx`
  - owns changed-files mode state: `working-tree`, `base-branch`, `turns`
  - loads changed file lists and per-file diffs
  - owns line selection, draft review-note creation, packet preview, and
    `Ask AI`
- `src/widgets/session-view/changed-file-item.presentational.tsx`
  - renders the current flat changed-file list row
- `src/widgets/session-view/pierre-diff-viewer.presentational.tsx`
  - wraps Pierre `PatchDiff` for selected-file and turn-level diffs
- `src/widgets/session-view/diff-lines.pure.ts`
  - parses unified diff text into line ids, old/new line numbers, hunk header,
    and selection ranges
- `electron/backend/git/git.service.ts`
  - shells out to Git for working-tree status and unified diffs
- `electron/backend/git/changed-files.service.ts`
  - resolves base branch context and returns base-vs-head changed files/diffs
- `src/entities/review-note`
  - persists local review notes and sends review packets to the active session

Current limitations:

- The changed-files list is flat, not a real folder tree.
- Diff rendering is hand-built and lacks syntax highlighting, split view,
  scalable virtualization, native annotations, and polished line selection.
- The local diff parser is useful but fragile as a rendering foundation.
- Large Pull Requests can feel slow because the app live-reads Git and renders
  diffs on demand.

## Product Intent

- Keep Convergence's current local review workflow intact.
- Replace rendering primitives gradually behind local adapter components.
- Preserve local review notes and `Ask AI` packet behavior.
- Use Pierre features where they match Convergence's model:
  - file tree with Git status badges
  - flattened empty directories
  - search/filter
  - keyboard navigation/accessibility
  - split/stacked diff layout
  - line selection
  - annotations/comments
  - virtualization for large trees and diffs
  - Shiki theming shared between tree and diff
- Avoid binding Convergence's persisted data model directly to Pierre types.

## Non-Goals

- No backend Git rewrite in the first Pierre integration.
- No GitHub REST/GraphQL API integration in the first Pierre integration.
- No database snapshot/cache of PR diffs in the first Pierre integration.
- No writing review comments back to GitHub.
- No replacement of the existing `ReviewNote` table or review-packet API.
- No drag-and-drop file operations in the changed-files tree.
- No context menu file mutations from the changed-files tree.

## Library Fit

### `@pierre/trees`

Use for changed-file navigation in the Changed Files panel.

Useful capabilities:

- file-tree rendering
- Git status indicators for added/modified/deleted/renamed/untracked/ignored
- folder descendant status indicators
- built-in virtualization
- search/filter modes
- flattened empty directories
- keyboard navigation and ARIA tree semantics
- built-in icon tiers
- Shiki/Pierre theme support
- density controls

Initial usage should be read-only. Disable or avoid drag-and-drop and mutation
context menus until Convergence has a clear file-operation product model.

### `@pierre/diffs`

Use for per-file diff rendering in the Changed Files panel and turn-level
diffs.

Useful capabilities:

- React components from `@pierre/diffs/react`
- patch-string rendering through `PatchDiff`
- split and stacked layouts
- Shiki syntax highlighting
- hunk separators and collapsed context controls
- line selection
- annotations/comments
- token callbacks for future code-intelligence integrations
- virtualized diff rendering
- worker pool for syntax highlighting off the main thread
- accept/reject primitives for later selective-change workflows

Initial usage should render the same unified diff strings Convergence already
gets from Git.

## Architecture

### Layering

Pierre integration belongs in the renderer, under the existing FSD-lite
session-view widget boundary.

Recommended files:

- `src/widgets/session-view/changed-files-tree.pure.ts`
  - converts `GitStatusEntry[]` plus review-note counts into Pierre tree input
  - no React, no effects
- `src/widgets/session-view/changed-files-tree.presentational.tsx`
  - wraps `@pierre/trees/react`
  - receives a view model and callbacks from the container
- `src/widgets/session-view/pierre-diff-viewer.presentational.tsx`
  - wraps `@pierre/diffs/react`
  - receives patch text, selected file, selection state, annotations, and
    callbacks
- `src/widgets/session-view/pierre-diff-selection.pure.ts`
  - maps Pierre line-selection payloads into Convergence `ReviewNote` anchors
    if the library payload is sufficient

Do not put Pierre-specific types into `src/entities/review-note`,
`src/entities/workspace`, IPC types, or database rows. Adapter code should
translate between Convergence types and Pierre types.

### Data Flow

V1 data flow remains:

1. Renderer asks `gitApi.getStatus`, `gitApi.getBaseBranchStatus`, or
   turn APIs for changed files.
2. Renderer asks `gitApi.getDiff` or `gitApi.getBaseBranchDiff` for the
   selected file's unified patch.
3. Pierre tree renders the changed-file navigation from the existing file list.
4. Pierre diff renders the selected file from the existing patch string.
5. User selects lines and writes notes.
6. Convergence persists `ReviewNote` records using the existing entity/API.
7. `Ask AI` sends the existing structured review packet to the active session.

### Review Note Anchors

The existing `ReviewNote` anchor shape remains the source of truth:

- `filePath`
- `mode`
- old line range
- new line range
- `hunkHeader`
- `selectedDiff`
- `body`
- `state`

`@pierre/diffs` now owns visible diff rendering and line/range selection in the
Changed Files review path. Its `SelectedLineRange` callback gives Convergence
the selected side plus start/end line numbers, which is enough to drive the
visual selection state.

Keep `diff-lines.pure.ts` available only as a compatibility parser for the
persisted review-note data model:

- reconstructing selected diff text for packet context
- old/new range summaries used by `ReviewNote` anchor fields
- `hunkHeader` matching for note jump/highlight behavior
- adapting Pierre side/line selections back to existing line ids

Do not use the parser for rendering the selected-file diff or for local
shift-range selection. Only retire the parser after Pierre callbacks can
reliably provide old line, new line, side, hunk context, stable row identity, and
selected diff text.

### Theming

Pierre components render with their own theming model and, for diffs, Shadow
DOM. Tailwind classes should style only the wrapper shell. Internal styling
should use supported Pierre options and CSS variables.

Initial theme target:

- align with Convergence light/dark mode
- use compact density in constrained side-panel width
- preserve mono font sizing close to the current diff viewer
- avoid `unsafeCSS` unless a needed hook is unavailable

### Performance

First integration should be correct before it is heavily optimized.

Performance follow-ups:

- use `@pierre/trees` built-in virtualization for the changed-files tree
- wrap selected-file diffs at or above 300 lines in `@pierre/diffs/react`
  `Virtualizer`
- enable `WorkerPoolContextProvider` for selected-file diffs at or above 900
  lines when the renderer supports Web Workers
- avoid mounting all file diffs at once; continue rendering selected-file first

The current Changed Files review surface mounts only the selected-file
`PierreDiffViewer`. File navigation remains a virtualized Pierre tree; unselected
files do not mount diff renderers or syntax highlighters.

Turn-level diffs also render through `PierreDiffViewer` from the selected turn
file only. Turn inline comments remain a separate deferred feature; the PR
review-note annotations are not reused there until `turn-inline-comments`
defines a Pierre annotation adapter for `TurnComment` records.

## Deferred: Forge API and Snapshot Data

The current backend uses local Git commands as the source of truth. That is
acceptable for the first Pierre integration because Pierre can consume the same
changed-file lists and patch strings.

A later architecture track should evaluate replacing or complementing live Git
reads with a forge-aware review data layer:

- GitHub REST/GraphQL API for Pull Request files, comments, review threads, and
  patch metadata
- local SQLite snapshots of PR file lists and per-file patches
- cache invalidation keyed by PR head SHA, base SHA, and workspace dirty state
- background refresh instead of per-click blocking reads
- offline review behavior using the latest snapshot
- eventual export/sync of local `ReviewNote` records to GitHub review comments

This should not block the Pierre rendering migration. It is a separate
backend/data-source decision.
