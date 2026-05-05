# Pull Request Local Review Plan

## Objective

Implement the `pull-request-local-review.md` V1 flow in small, reviewable
phases. Each phase should leave the app in a coherent state and should run the
repo-required verification before hand-off.

## Existing anchors

- `electron/backend/git/git.service.ts`
- `electron/backend/workspace/workspace.service.ts`
- `electron/backend/pull-request/pull-request.service.ts`
- `electron/backend/pull-request/github-cli.pure.ts`
- `electron/backend/session/session.service.ts`
- `electron/main/ipc.ts`
- `electron/preload/index.ts`
- `src/entities/pull-request/`
- `src/entities/workspace/`
- `src/entities/session/`
- `src/features/command-center/`
- `src/widgets/session-view/pull-request-panel.presentational.tsx`

## Phase PRR0 - Domain helpers

Goal: add pure, tested building blocks with no IPC or UI.

Tasks:

- [ ] Add `electron/backend/pull-request/pull-request-reference.pure.ts`.
- [ ] Support references:
  - [ ] full GitHub Pull Request URL
  - [ ] hostless GitHub Pull Request URL
  - [ ] `owner/repo#123`
  - [ ] `#123`
  - [ ] `123`
- [ ] Add deterministic Branch helper:
  - [ ] `buildPullRequestReviewBranchName(number) -> convergence/pr-<number>`
  - [ ] reject invalid/non-positive numbers
- [ ] Add repository match helper for active Project GitHub remote vs reference.
- [ ] Add `electron/backend/pull-request/pull-request-review-prompt.pure.ts`.
- [ ] Add tests for parsing, branch naming, repo matching, and prompt rendering.

Acceptance:

- [ ] Invalid references fail before any shell command.
- [ ] Bare references require an active Project GitHub remote.
- [ ] Prompt includes repository, PR number, title, URL, Base Branch, head
      Branch, local Workspace path, and review instructions.

Verification:

- [ ] `npm install`
- [ ] `npm run typecheck`
- [ ] `npm run test:pure`
- [ ] `npm run test:unit`
- [ ] `chaperone check --fix`

## Phase PRR1 - Git and Workspace primitives

Goal: teach backend services how to fetch PR heads and reuse deterministic
review Workspaces.

Tasks:

- [ ] Extend `GitService`:
  - [ ] `fetchPullRequestHead({ repoPath, remoteName, number, localBranch })`
  - [ ] `getPullRequestDiff({ repoPath, baseBranch, headBranch })`
  - [ ] fetch Base Branch before base-vs-head diff
  - [ ] only allow local Branch names with `convergence/pr-` for PR fetch
- [ ] Extend `WorkspaceService`:
  - [ ] `getByProjectIdAndBranch(projectId, branchName)`
  - [ ] tests for found/missing Workspace lookup
- [ ] Add Git tests using temporary repos:
  - [ ] fetches `refs/pull/<number>/head` into deterministic Branch
  - [ ] refuses unsafe local Branch names
  - [ ] computes base-vs-head diff
  - [ ] falls back cleanly when Base Branch cannot be fetched

Acceptance:

- [ ] Existing normal Workspace creation behavior remains unchanged.
- [ ] PR fetch never writes to user-named Branches outside the reserved prefix.
- [ ] Existing review Workspace can be found by Project and Branch.

Verification:

- [ ] `npm install`
- [ ] `npm run typecheck`
- [ ] `npm run test:pure`
- [ ] `npm run test:unit`
- [ ] `chaperone check --fix`

## Phase PRR2 - Pull Request review backend service

Goal: add orchestration that can preview and prepare a Pull Request Review
Session.

Tasks:

- [ ] Add `electron/backend/pull-request/pull-request-review.types.ts`.
- [ ] Add `electron/backend/pull-request/pull-request-review.service.ts`.
- [ ] Add `previewReview({ projectId, reference })`.
- [ ] Add `prepareReviewSession(...)`.
- [ ] Convert `PullRequestService` private upsert into public
      `upsertForWorkspace`.
- [ ] Use `gh pr view` for metadata resolution.
- [ ] Validate Project remote repository matches resolved Pull Request.
- [ ] Fetch PR head into `convergence/pr-<number>`.
- [ ] Reuse existing Workspace if present.
- [ ] Create Workspace if missing.
- [ ] Upsert Workspace Pull Request cache immediately.
- [ ] Create and start Agent Session with generated prompt.
- [ ] Add service tests for success, reuse, cache write, session creation,
      mismatch, `gh` unavailable/auth, and git fetch failure.

Acceptance:

- [ ] Backend can create a review Workspace and running Session from a PR
      reference in one call.
- [ ] If Session start fails after Workspace creation, Workspace and cache are
      preserved and the error is reported.
- [ ] Existing `refreshForSession` behavior still passes tests.

Verification:

- [ ] `npm install`
- [ ] `npm run typecheck`
- [ ] `npm run test:pure`
- [ ] `npm run test:unit`
- [ ] `chaperone check --fix`

## Phase PRR3 - IPC, preload, and renderer entity API

Goal: expose the backend flow safely to the renderer.

Tasks:

- [ ] Register IPC handlers in `electron/main/ipc.ts`:
  - [ ] `pullRequest:previewReview`
  - [ ] `pullRequest:prepareReviewSession`
- [ ] Wire `PullRequestReviewService` in `electron/main/index.ts`.
- [ ] Extend preload `electronAPI.pullRequest`.
- [ ] Add renderer types:
  - [ ] `src/entities/pull-request/pull-request-review.types.ts`
  - [ ] export through `src/entities/pull-request/index.ts`
- [ ] Add renderer API:
  - [ ] `src/entities/pull-request/pull-request-review.api.ts`
- [ ] Add focused API tests where current patterns support it.

Acceptance:

- [ ] Renderer can preview without creating a Workspace.
- [ ] Renderer can prepare review Session and receive Workspace, Workspace Pull
      Request, and Session Summary.
- [ ] No renderer code imports Electron directly outside API boundary files.

Verification:

- [ ] `npm install`
- [ ] `npm run typecheck`
- [ ] `npm run test:pure`
- [ ] `npm run test:unit`
- [ ] `chaperone check --fix`

## Phase PRR4 - Review start dialog and Command Center entry

Goal: give users a first usable UI path.

Tasks:

- [ ] Add feature slice `src/features/pull-request-review-start/`.
- [ ] Implement container:
  - [ ] reads active Project
  - [ ] loads providers and Session Defaults
  - [ ] owns reference input
  - [ ] calls preview on explicit action or debounced submit
  - [ ] calls prepare on confirmation
  - [ ] refreshes Workspace, Pull Request, and Session stores
  - [ ] navigates/selects created Session
- [ ] Implement presentational dialog:
  - [ ] reference input
  - [ ] provider/model/effort controls
  - [ ] preview summary
  - [ ] editable Session name
  - [ ] loading and error states
- [ ] Add dialog store key if needed.
- [ ] Add Command Center action `Review pull request...`.
- [ ] Add tests for validation, preview success, submit success, and error
      states.

Acceptance:

- [ ] User can start from Command Center and end in a running review Session.
- [ ] Error copy is visible and actionable.
- [ ] Existing Session Start and Workspace Create flows are unchanged.

Verification:

- [ ] `npm install`
- [ ] `npm run typecheck`
- [ ] `npm run test:pure`
- [ ] `npm run test:unit`
- [ ] `chaperone check --fix`

## Phase PRR5 - Pull Request diff surface

Goal: make the review useful even when the checked-out Pull Request Worktree is
clean.

Tasks:

- [ ] Add backend API for PR diff:
  - [ ] `pullRequest:getDiffByWorkspaceId`
  - [ ] or `git:getPullRequestDiff` with explicit base/head
- [ ] Use cached Workspace Pull Request metadata to identify Base Branch and
      head Branch.
- [ ] Add renderer API.
- [ ] Extend Pull Request panel with a PR diff section.
- [ ] Keep current working tree Changed Files panel unchanged.
- [ ] Add tests for loading, empty diff, error, and unavailable Base Branch.

Acceptance:

- [ ] Pull Request panel can show base-vs-head diff for a clean review
      Worktree.
- [ ] Dirty working tree changes remain separate from PR diff.
- [ ] Missing Base Branch or missing cache degrades with clear copy.

Verification:

- [ ] `npm install`
- [ ] `npm run typecheck`
- [ ] `npm run test:pure`
- [ ] `npm run test:unit`
- [ ] `chaperone check --fix`

## Phase PRR6 - Initiative integration

Goal: connect the review flow to Agent-Native Initiatives without making
Initiatives required.

Tasks:

- [ ] Allow caller to pass `initiativeId` and optional `outputId`.
- [ ] If `initiativeId` is present, link created Session as Attempt role
      `review`.
- [ ] If no matching Pull Request Output exists, offer to create one.
- [ ] Add Initiative Workboard action from Pull Request Output:
      `Review locally...`.
- [ ] Add tests for Attempt link and Output association.

Acceptance:

- [ ] Pull Request local review works without an Initiative.
- [ ] When launched from an Initiative, the review Session appears as a review
      Attempt.
- [ ] Pull Request Output remains the external artifact; Workspace Pull Request
      remains the local cache.

Verification:

- [ ] `npm install`
- [ ] `npm run typecheck`
- [ ] `npm run test:pure`
- [ ] `npm run test:unit`
- [ ] `chaperone check --fix`

## Phase PRR7 - Hardening and manual smoke

Goal: tighten failure modes and document real-world behavior.

Tasks:

- [ ] Test with:
  - [ ] same-repository open PR
  - [ ] draft PR
  - [ ] closed PR
  - [ ] merged PR
  - [ ] fork PR if `refs/pull/<number>/head` works through origin
  - [ ] unauthenticated `gh`
  - [ ] missing `gh`
  - [ ] existing dirty review Workspace
- [ ] Add docs/runbook note if any `gh` setup assumptions are user-facing.
- [ ] Confirm no destructive Git operations are possible outside
      `convergence/pr-` Branches.
- [ ] Confirm app restart preserves Workspace, Session, and Workspace Pull
      Request metadata.
- [ ] Confirm archive/remove Worktree lifecycle still behaves for review
      Workspaces.

Acceptance:

- [ ] Manual smoke checklist from the spec passes.
- [ ] Any known limitations are documented in the spec or runbook.
- [ ] Worktree is clean except intended code/docs changes.

Verification:

- [ ] `npm install`
- [ ] `npm run typecheck`
- [ ] `npm run test:pure`
- [ ] `npm run test:unit`
- [ ] `chaperone check --fix`

## Dependencies and sequencing notes

- PRR0 can be implemented independently.
- PRR1 should land before PRR2 because backend orchestration depends on Git and
  Workspace primitives.
- PRR3 should land after PRR2 to avoid exposing unstable IPC shapes.
- PRR4 creates the first user-visible path.
- PRR5 can land after PRR4, but the product is much more useful when PR diff is
  available.
- PRR6 is intentionally last because Initiative integration should not block the
  core local review workflow.

## Risks

- `gh pr view` field names can differ by GitHub CLI version. Mitigation: keep
  parsing tolerant and covered by tests.
- `refs/pull/<number>/head` behavior should be verified for fork PRs. Mitigation:
  V1 documents GitHub-only behavior and PRR7 includes a fork smoke test.
- Clean Pull Request Worktrees make existing Changed Files look empty.
  Mitigation: PRR5 adds a separate base-vs-head diff surface.
- Deterministic Branch reuse can block if the existing review Worktree is dirty.
  Mitigation: fail safely and show copy; do not force-reset in V1.
- The review prompt asks agents not to edit, but current providers may still
  have write access. Mitigation: treat this as prompt-level behavior in V1;
  consider read-only provider sandboxing later.
