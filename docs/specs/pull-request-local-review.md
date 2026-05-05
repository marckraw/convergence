# Pull Request Local Review

## Goal

Let a user give Convergence a Pull Request reference and have the app prepare a
local review environment for an Agent Session.

The intended V1 flow:

1. User selects an active Project.
2. User enters a Pull Request URL, number, or repository-qualified reference.
3. Convergence resolves the Pull Request through GitHub CLI.
4. Convergence fetches the Pull Request head into a local Branch.
5. Convergence creates or reuses a Workspace backed by a Git Worktree for that
   Branch.
6. Convergence caches the Workspace Pull Request metadata.
7. Convergence creates and starts an Agent Session in that Workspace with a
   review prompt.

The user outcome is: "Review this Pull Request locally with an agent" without
manually running `gh pr checkout`, creating a worktree, copying PR metadata, or
writing the review prompt.

## Product intent

- Pull Request local review is a Workspace-first flow. The durable local unit is
  still a Workspace; the Pull Request is the external artifact the Workspace was
  prepared from.
- The Agent Session should run in an isolated Worktree, not in the Project
  Repository Root.
- The feature should produce a normal Convergence Session. It should work with
  existing provider selection, context injection, transcript, Changed Files,
  attention, and archive behavior.
- The feature should not make Pull Requests a top-level Convergence object. The
  external artifact remains a Pull Request; Convergence stores a Workspace Pull
  Request cache row for the Workspace.
- The first implementation is GitHub-only and may depend on `gh`, matching the
  current Pull Request lookup implementation.
- Initiative integration should be designed in, but not required for V1. A
  later step can link the created Session as an Attempt with role `review` and
  add the Pull Request as an Output.

## Current state

Already implemented:

- Projects have one Repository Root.
- Workspaces are backed by Git Worktrees and are created through
  `WorkspaceService.create`.
- Sessions can bind to a Workspace and use its Worktree path as
  `workingDirectory`.
- `GitService` centralizes branch, worktree, status, and diff operations.
- Workspace Pull Request lookup exists:
  - `workspace_pull_requests` table
  - `PullRequestService.refreshForSession(sessionId)`
  - GitHub CLI lookup through `gh pr list --head <branch>`
  - renderer `src/entities/pull-request`
  - session header Pull Request badge
  - Pull Request side panel
  - sidebar merged badge from cached Pull Request state

Missing:

- Input flow for "review this Pull Request."
- Parser for Pull Request URL / number / repository-qualified reference.
- Backend service that resolves a Pull Request before a Workspace exists.
- Git fetch/checkout support for GitHub Pull Request refs.
- Deterministic Workspace creation/reuse for Pull Request review.
- Base-vs-head diff support for clean Pull Request worktrees.
- Agent review prompt generation.
- Command Center and dialog entry points.

## Terminology

### Pull Request Review Workspace

A Workspace prepared from a Pull Request head Branch for local review.

This is not a new persisted Workspace type in V1. It is a normal Workspace with
an associated Workspace Pull Request cache row.

### Pull Request Review Session

An Agent Session created in a Pull Request Review Workspace with an initial
review prompt.

This is not a new Session type in V1. It is a normal Agent Session whose name,
initial message, and working directory are created by this flow.

### Workspace Pull Request

Existing term from `CONTEXT.md`: Convergence's cached association between a
Workspace and a Pull Request.

## Non-goals

- No generic Git provider support in V1. GitLab, Bitbucket, self-hosted GitHub,
  and custom forge support are deferred.
- No cloud API integration. V1 uses local Git plus GitHub CLI.
- No writing Pull Request comments back to GitHub.
- No automatic approval or merge recommendation.
- No auto-fixing review findings in the same flow. The created Session can
  produce findings; follow-up fix work should remain explicit user input.
- No multi-repository Pull Request orchestration in V1.
- No support for Pull Requests whose base repository does not match the active
  Project's GitHub remote.
- No restoration of removed Worktrees.
- No duplicate Pull Request review Workspaces by default. Re-review should reuse
  the existing Workspace for that Project and Pull Request unless a later
  product decision adds "new review copy."

## V1 behavior

### Entry points

V1 should expose one primary entry point:

- Command Center action: `Review pull request...`

The action opens a dialog scoped to the active Project.

Secondary entry points can follow after V1:

- Project tree header button.
- Pull Request panel action when no Pull Request is known.
- Initiative Workboard action to create a review Attempt from a Pull Request
  Output.

### Dialog

Fields:

| Field        | Behavior                                                      |
| ------------ | ------------------------------------------------------------- |
| Pull Request | Accept URL, number, or `owner/repo#123` style reference.      |
| Provider     | Defaults from Session Defaults; user can change.              |
| Model        | Defaults from selected Provider; user can change.             |
| Effort       | Defaults from selected Model; user can change when available. |
| Session name | Defaults after lookup: `Review PR #123: <title>`. Editable.   |

Dialog states:

1. Empty input.
2. Resolving Pull Request.
3. Resolved preview with repository, number, title, author if available,
   head Branch, Base Branch, state, draft flag, and URL.
4. Checkout/Workspace preparation in progress.
5. Session creation/start in progress.
6. Error state with actionable copy.

The submit button should not start a Session until Pull Request metadata is
resolved and the user confirms.

### Accepted Pull Request references

For active Project remote `https://github.com/acme/app.git`:

- `https://github.com/acme/app/pull/123`
- `github.com/acme/app/pull/123`
- `acme/app#123`
- `#123`
- `123`

Rules:

- Bare `123` and `#123` resolve against the active Project's GitHub remote.
- Repository-qualified references must match the active Project remote owner and
  repository in V1.
- The parser is pure and should not shell out.
- Invalid references should fail before calling `gh`.

### Pull Request resolution

Backend uses `gh pr view`:

```text
gh pr view <number-or-url> --repo <owner>/<repo> --json number,title,url,state,isDraft,mergedAt,headRefName,headRepositoryOwner,headRepository,baseRefName,author
```

The exact JSON fields can be adjusted to match GitHub CLI support, but V1 must
capture at least:

- provider
- repository owner/name
- number
- title
- URL
- state
- draft flag
- head Branch
- Base Branch
- merged timestamp if any
- lookup status
- error if resolution fails

Resolution failure states should reuse the existing lookup vocabulary where it
fits:

- `unsupported-remote`
- `gh-unavailable`
- `gh-auth-required`
- `not-found`
- `error`

If `gh` is unavailable or unauthenticated, the dialog should say so directly.

### Git checkout model

V1 should fetch from the active Project Repository Root's `origin` remote using
GitHub Pull Request refs:

```text
git fetch origin pull/<number>/head:<local-branch>
```

Local Branch naming:

```text
convergence/pr-<number>
```

Examples:

- PR #123 -> `convergence/pr-123`
- PR #42 -> `convergence/pr-42`

Branch naming is deterministic so Convergence can find and reuse an existing
Workspace for the same Pull Request.

Safety rules:

- Only create or update branches with the `convergence/pr-` prefix.
- Never delete user branches in this flow.
- If the target local Branch exists and is checked out by an existing
  Workspace, reuse that Workspace.
- If the target local Branch exists but is not associated with a Workspace,
  create a Workspace from the existing Branch.
- If the target local Branch exists and has local changes in its Worktree,
  do not force-update it. Show a blocking error and let the user choose a later
  "refresh after cleaning workspace" action.
- If the Pull Request state is `closed` or `merged`, allow checkout but surface
  the state in the preview.

Implementation note: current `GitService.addWorktree` supports creating a
Worktree from an existing local Branch. Add a separate `fetchPullRequestHead`
method rather than overloading Workspace creation with forge behavior.

### Workspace reuse

The backend should find an existing Workspace by:

1. active Project id
2. deterministic Branch name `convergence/pr-<number>`

If found:

- return that Workspace
- refresh the Workspace Pull Request cache
- create the review Session in that Workspace

If not found:

- fetch the Pull Request head into the deterministic Branch
- create the Workspace for that Branch
- cache Workspace Pull Request metadata
- create the review Session in that Workspace

The DB already enforces `UNIQUE(project_id, branch_name)` on `workspaces`, which
supports this one-Workspace-per-PR default.

### Workspace Pull Request cache

The flow should write the `workspace_pull_requests` row immediately from the
resolved Pull Request metadata. It should not require a later
`refreshForSession` call.

Potential schema additions:

```sql
ALTER TABLE workspace_pull_requests ADD COLUMN head_sha TEXT;
ALTER TABLE workspace_pull_requests ADD COLUMN base_sha TEXT;
ALTER TABLE workspace_pull_requests ADD COLUMN source_kind TEXT;
ALTER TABLE workspace_pull_requests ADD COLUMN source_ref TEXT;
```

V1 can ship without SHA columns if GitHub CLI resolution does not provide them
cleanly, but the service boundary should leave room for them. Base/head SHAs
become important for stable base-vs-head diff review.

### Base-vs-head diff

The current Changed Files compact view reads `git status` and `git diff`.
After checking out a Pull Request head, the Worktree is usually clean, so that
surface will show no changes.

V1 should add a Pull Request diff primitive:

```ts
git.getPullRequestDiff(repoPath, baseBranch, headBranch): Promise<string>
```

Recommended Git command shape:

```text
git diff --no-color origin/<baseBranch>...<headBranch>
```

Before diffing, fetch the Base Branch from origin. If the remote Base Branch is
unavailable, fall back to local Base Branch if present and mark the diff source
as degraded.

The Pull Request panel should show a "PR diff" section, separate from current
working tree changes. A follow-up phase can split this into file-level review
cards.

### Review prompt

The created Pull Request Review Session starts with a generated user message.

V1 prompt shape:

```text
Please review Pull Request #<number>: <title>

Repository: <owner>/<repo>
URL: <url>
Base branch: <baseBranch>
Head branch: <headBranch>
Local workspace: <workspace.path>

Review the code locally. Focus on correctness, regressions, missing tests,
edge cases, maintainability, and risky behavior changes. Do not make code
changes unless I explicitly ask for fixes. Return findings first, ordered by
severity, with file and line references where possible. If there are no
findings, say that clearly and mention any residual test or verification risk.
```

This mirrors Convergence's code-review stance for agents: findings first,
summary second.

Prompt generation should live in a pure helper so it is testable and reusable
from future Initiative flows.

### Session creation

The backend can either expose one coarse orchestration IPC or compose existing
renderer calls. Prefer backend orchestration for V1:

```ts
pullRequest.prepareReviewSession(input): Promise<{
  workspace: Workspace
  pullRequest: WorkspacePullRequest
  session: SessionSummary
}>
```

Backend orchestration keeps Git checkout, Workspace creation, Pull Request
cache write, Session creation, and Session start in one failure boundary.

If Session start fails after Workspace creation, keep the Workspace and cached
Pull Request. Return the created Session with failure details if possible.

### Initiative integration

Not required for V1, but the shape should support it:

- If the dialog is launched from an Initiative Output, link the created Session
  as an Attempt with role `review`.
- If the Pull Request was not already an Output, offer to add it as an Output
  of kind `pull-request`.
- The Pull Request Review Session remains a normal Session. The Initiative link
  is additive.

## Backend architecture

Add a focused service:

```text
electron/backend/pull-request/pull-request-review.service.ts
```

Responsibilities:

- Parse and validate Pull Request reference input.
- Resolve Pull Request metadata through `gh`.
- Validate active Project remote matches the Pull Request repository.
- Ask `GitService` to fetch the Pull Request head.
- Ask `WorkspaceService` to create or find the Workspace.
- Ask `PullRequestService` to upsert the Workspace Pull Request cache.
- Ask `SessionService` to create and start the review Session.

Supporting pure files:

```text
electron/backend/pull-request/pull-request-reference.pure.ts
electron/backend/pull-request/pull-request-review-prompt.pure.ts
```

Git additions:

```ts
class GitService {
  fetchPullRequestHead(input: {
    repoPath: string
    remoteName?: string
    number: number
    localBranch: string
  }): Promise<void>

  getPullRequestDiff(input: {
    repoPath: string
    baseBranch: string
    headBranch: string
  }): Promise<string>
}
```

Workspace additions:

```ts
class WorkspaceService {
  getByProjectIdAndBranch(
    projectId: string,
    branchName: string,
  ): Workspace | null
}
```

Pull Request additions:

```ts
class PullRequestService {
  upsertForWorkspace(input: {
    projectId: string
    workspaceId: string
    result: PullRequestLookupResult
  }): WorkspacePullRequest
}
```

The existing private upsert helper should become a public method instead of
duplicating SQL.

## Renderer architecture

Add a feature slice:

```text
src/features/pull-request-review-start/
```

Suggested files:

```text
pull-request-review-start.container.tsx
pull-request-review-start.presentational.tsx
pull-request-review-start.pure.ts
index.ts
```

Renderer entity additions:

```text
src/entities/pull-request/pull-request-review.api.ts
src/entities/pull-request/pull-request-review.types.ts
```

The feature should consume:

- `entities/project`
- `entities/session`
- `entities/pull-request`
- `entities/workspace`
- `shared/ui`

It must not import backend or Electron directly.

## IPC and preload API

Add:

```ts
pullRequest: {
  prepareReviewSession(input: {
    projectId: string
    reference: string
    providerId: string
    model: string | null
    effort: ReasoningEffort | null
    sessionName?: string
  }): Promise<PullRequestReviewSessionResult>

  previewReview(input: {
    projectId: string
    reference: string
  }): Promise<PullRequestReviewPreview>
}
```

`previewReview` resolves metadata without creating a Workspace or Session.

## Error handling

Errors should be actionable:

- Unsupported remote: "This Project's origin remote is not a github.com
  repository."
- Repository mismatch: "This Pull Request belongs to <owner>/<repo>, but the
  active Project uses <owner>/<repo>."
- `gh` missing: "GitHub CLI is not available on PATH."
- `gh` auth: "GitHub CLI is not authenticated. Run gh auth login."
- PR not found: "Pull Request #123 was not found in <owner>/<repo>."
- Dirty existing review Workspace: "The existing review Workspace has local
  changes. Clean or archive it before refreshing this Pull Request."

## Testing strategy

Pure tests:

- Parse Pull Request references.
- Reject invalid references.
- Validate repository matching.
- Generate deterministic Branch names.
- Generate review prompt.
- Map GitHub CLI JSON to domain metadata.
- Classify GitHub CLI errors.

Backend unit tests:

- `PullRequestReviewService.previewReview` resolves metadata.
- `prepareReviewSession` creates a Workspace from a new PR.
- Existing review Workspace is reused.
- Workspace Pull Request cache is written immediately.
- Session is created in the Workspace path.
- `gh` unavailable/auth errors are surfaced.
- Repository mismatch blocks checkout.
- Git fetch failure blocks Workspace creation.

Renderer unit tests:

- Dialog validates empty and malformed references.
- Preview state renders resolved metadata.
- Submit calls `prepareReviewSession`.
- Success selects or navigates to the created Session.
- Error states render actionable copy.

Manual smoke:

1. Create/open a Project whose `origin` is GitHub.
2. Run `Review pull request...`.
3. Enter a PR number.
4. Confirm preview shows title, Base Branch, head Branch, state, and URL.
5. Start review.
6. Confirm a Workspace exists on `convergence/pr-<number>`.
7. Confirm a Session starts in that Workspace.
8. Confirm Pull Request panel shows cached metadata without manual refresh.
9. Confirm current working tree changes can remain empty while PR diff is still
   available.

## Open decisions

1. Should V1 allow multiple review Workspaces for the same Pull Request?
   Current decision: no. Reuse one deterministic Workspace.
2. Should V1 check out fork Pull Requests through `refs/pull/<number>/head` or
   the contributor remote? Current decision: use `refs/pull/<number>/head` from
   the base repository's `origin`.
3. Should the review Session start automatically after checkout, or stop at a
   prepared Workspace? Current decision: start automatically after user confirms
   the resolved preview.
4. Should Pull Request review attach to Initiatives in V1? Current decision: no,
   but leave the result shape ready for an Initiative caller.
5. Should the agent be allowed to modify code in the review Workspace? Current
   decision: prompt says review only; providers are not technically blocked from
   edits in V1.
