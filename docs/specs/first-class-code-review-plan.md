# First-Class Code Review Plan

Companion to `docs/specs/first-class-code-review.md`.

Execution tracking lives in Linear under `MAR-1212` and its child issues. Keep
this plan focused on durable sequencing and resume context. Mark checkboxes as
work lands.

Each phase ends with the repo-required gates:

- `npm install`
- `npm run typecheck`
- `npm run test:pure`
- `npm run test:unit`
- `chaperone check --fix`

Use the Node version from `.nvmrc` for all Node-backed commands.

## Phase R1 - Shared Review Domain

Goal: extract changed-files/review orchestration into a reusable domain without
changing the visible product yet.

- [x] Add `src/entities/code-review/` public API:
  - [x] target types
  - [x] review mode types
  - [x] summary/file patch types
  - [x] Zustand model for selected target, mode, selected file, loading/error
        state
- [x] Add renderer API wrapper for future `codeReview:*` IPC calls.
- [x] Add backend `electron/backend/code-review/` service shell.
- [x] Move reusable working-tree/base-branch file loading behind the new
      service while preserving existing `git:*` IPC until consumers migrate.
- [x] Add pure helpers for:
  - [x] target identity
  - [x] mode labels
  - [x] status counts
  - [x] selected-file retention after reload
- [x] Refactor compact `ChangedFilesPanel` to consume shared helpers/store
      where practical.
- [x] Tests:
  - [x] pure helper coverage
  - [x] store loading/error behavior with mocked API
  - [x] compact panel regression for current working-tree/base-branch flows

Note: the compact panel now reuses shared Code Review pure helpers. It still
uses the legacy `gitApi` fetch path intentionally; the new `codeReview:*` IPC
and store are available for the first full review surface or a later compact
panel fetch-path migration.

## Phase R2 - Review Targets And Code Entry Points

Goal: Code has a first-class way to choose what to review.

- [x] Add backend target discovery:
  - [x] active project repository
  - [x] project workspaces
  - [x] session-backed workspaces
  - [x] cached Pull Request review workspaces
- [x] Add `codeReview:listTargets` IPC/preload/API.
- [x] Add target dashboard UI inside the Code surface.
- [x] Add command palette item: `Open Code Review`.
- [x] Add sidebar Code affordance for review.
- [x] Add `Open full review` action from compact Changed Files panel.
- [x] Opening from compact panel preselects:
  - [x] target
  - [x] mode
  - [x] selected file
- [x] Tests:
  - [x] target discovery service tests
  - [x] target dashboard render/selection tests
  - [x] command palette index tests

Note: the R2 dashboard is a target-selection workspace only. It intentionally
does not render the full Pierre diff surface; that remains Phase R3.

## Phase R3 - Full Review Surface

Goal: build the large review workspace over the shared domain and Pierre
primitives.

- [x] Add `src/widgets/code-review-surface/`.
- [x] Layout:
  - [x] top target/mode/status bar
  - [x] left file tree rail
  - [x] main selected-file diff pane
  - [x] right review notes rail
- [x] Reuse `@pierre/trees` changed-files tree adapter.
- [x] Reuse `@pierre/diffs` patch viewer adapter.
- [x] Support `working-tree` and `base-branch` modes.
- [ ] Preserve review-note annotations and line selection.
- [x] Add file search and status filters.
- [x] Tests:
  - [x] mode switching calls the shared API
  - [x] file selection lazy-loads only the selected patch
  - [x] selected line range enables note preparation
  - [ ] notes render as annotations

Note: R3 now provides the full target/file/diff workspace and carries selected
line state into the notes rail. Durable note creation, annotation rendering, and
agent handoff remain Phase R4 where the existing compact-panel note workflow
will be extracted into shared primitives.

## Phase R4 - Review Notes And Agent Handoff

Goal: make the full review surface equal or better than the compact panel for
the existing local review-note workflow.

- [x] Extract note tray behavior from compact panel into
      `src/features/code-review-notes/`.
- [x] Support:
  - [x] line notes
  - [x] file-level notes
  - [x] draft/sent/resolved filters
  - [x] packet preview
  - [x] `Ask AI`
- [x] If target has a linked session, send packets to that session.
- [x] If target has no linked session, show explicit actions:
  - [x] attach to existing session
  - [x] start review session
  - [x] keep notes local
- [x] Keep compact panel using the same note feature primitives.
- [x] Tests:
  - [x] note creation/edit/delete flow
  - [x] packet preview from full surface
  - [x] send blocked clearly when no session is linked

## Phase R5 - Performance And Caching

Goal: remove unnecessary repeated live Git and diff-rendering work.

- [x] Add summary-first backend APIs:
  - [x] `codeReview:getSummary`
  - [x] `codeReview:getFilePatch`
- [x] Cache summary and patch results by:
  - [x] target id
  - [x] mode
  - [x] comparison ref / merge base
  - [x] file path
  - [x] short-lived working-tree version token
- [x] Add explicit refresh invalidation.
- [x] Keep selected-file patch loading lazy.
- [x] Tune Pierre diff virtualization and worker pool thresholds in the full
      surface.
- [x] Add slow-loading feedback that preserves current visible diff until the
      replacement patch is ready.
- [x] Tests:
  - [x] cache key coverage
  - [x] stale result prevention
  - [x] refresh invalidates active target/mode

## Phase R6 - Optional Forge Provider

Goal: add GitHub/forge data where it helps without replacing local review.

- [ ] Add provider interface under `electron/backend/code-review/`.
- [ ] GitHub provider can supply:
  - [ ] PR metadata refresh
  - [ ] remote PR patch/file list by head SHA
  - [ ] review/check metadata
- [ ] Surface remote-vs-local mismatch clearly when local workspace differs
      from remote PR head.
- [ ] Keep `working-tree` and `base-branch` local Git-backed.
- [ ] Tests:
  - [ ] provider mapping tests
  - [ ] no-network/fallback behavior
  - [ ] remote metadata does not hide local dirty changes

## Phase R7 - Hardening And Persistence

Goal: make review feel like a durable workspace.

- [ ] Persist last selected review target per project.
- [ ] Persist selected mode and file per target.
- [ ] Preserve panel scroll positions when switching notes/files where
      practical.
- [ ] Add keyboard shortcuts for:
  - [ ] next/previous file
  - [ ] next/previous note
  - [ ] toggle notes rail
  - [ ] refresh
- [ ] Manual verification:
  - [ ] large PR / large generated diff
  - [ ] many changed files
  - [ ] renamed/deleted/binary files
  - [ ] untracked files
  - [ ] no PR metadata
  - [ ] no linked session
  - [ ] base branch differs from project default

## Linear Ticket Breakdown

Parent:

- `MAR-1212` - Design and build full-screen AI code review experience

Recommended child issues:

1. Shared code-review domain and compact panel extraction
2. Review target discovery and Code entry points
3. Full-screen Code review surface
4. Review notes and agent handoff in full review
5. Review summary/file-patch performance layer
6. Optional GitHub/forge review provider
7. Durable review workspace hardening

Dependency order:

- R1 before R2/R3
- R2 before global entry points are complete
- R3 before R4 full-surface parity
- R5 can begin after R1, but should land after R3 clarifies real access
  patterns
- R6 is optional and should not block local review
- R7 follows the first usable full review surface
