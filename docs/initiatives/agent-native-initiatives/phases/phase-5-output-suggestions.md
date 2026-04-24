# Phase 5: Semi-Automatic Output Suggestions

## Product Goal

Help users attach likely Outputs discovered from linked session repositories
without silently mutating stable Initiative state.

## Current Repo State

Phase 4 added manual Output CRUD in the Workboard detail surface. Outputs are
stable records only after the user creates or edits them.

Linked Attempts in the Workboard already include enough session context to map
an Attempt back to a session. Sessions include `workingDirectory`, which points
at either the project repository or a worktree. The existing Git backend
service already reads current branch names and repository status.

Current Git documentation check:

- `git rev-parse --abbrev-ref` is the appropriate local command shape for
  turning refs such as `HEAD` or `@{upstream}` into short names.
- `git remote get-url` reads a configured remote URL without requiring a
  hosting API.

V1 should use those local Git facts and avoid GitHub integration.

## Implementation Plan

Add a refresh/discover action in the Workboard Outputs section.

For each linked Attempt:

- inspect the Attempt session working directory
- read current branch name
- read upstream branch if configured
- read upstream remote URL if available
- produce a transient branch Output suggestion when the branch looks useful

Suggestions are shown separately from saved Outputs. Users can:

- accept a suggestion, which creates a stable Output record
- dismiss a suggestion, which only removes the transient suggestion

Do not add anything automatically.

## Contracts

Backend Git service:

- add a focused `getBranchOutputFacts(repoPath)` method returning:
  - `branchName`
  - `upstreamBranch`
  - `remoteUrl`

Renderer:

- add a small pure helper to convert linked Attempt branch facts into Output
  suggestions and dedupe against existing Outputs
- keep suggestions in Workboard container state only
- accept suggestions through the existing `addOutput` store action

## Out Of Scope

- GitHub API integration
- remote PR lifecycle tracking
- automatic persistence of suggestions
- transcript scanning for PR URLs
- release detection
- commit range suggestions

## Tests

Add or update tests for:

- Git branch output fact discovery
- pure conversion/dedupe of branch facts into Output suggestions
- Workboard suggestion rendering
- accepting a suggestion creates an Output
- dismissing a suggestion does not create an Output

## Manual Checks

Run `npm run dev`, then verify:

1. Link an Initiative to a session in a repository or worktree on a feature
   branch.
2. Open the Initiative Outputs section.
3. Click refresh/discover.
4. Confirm a branch suggestion appears as a suggestion, not a saved Output.
5. Accept the suggestion and confirm it becomes a saved Output.
6. Run refresh/discover again and confirm the accepted Output is not suggested
   again.
7. Dismiss a suggestion and confirm it is not attached.

## Risks

Branch names are not always delivery artifacts. V1 should bias toward
suggesting only non-default-looking branches and leaving the user in control.
