# Space Is The Chat Context Container

Convergence uses **Space** as the user-facing name for a durable context
container above chat Sessions. A Space groups related Attempts, sources,
memory, artifacts, and current understanding without pretending to be a code
Project, repository, Workspace, branch, or worktree.

This supersedes the earlier **Initiative** product language for the chat-first
workflow. The existing Initiative implementation is close to the needed domain
shape, but the broader name fits non-code use cases better and avoids reducing
the concept to software delivery.

## Decision

- Keep `Code` and `Chat` as app surfaces.
- Introduce Spaces inside the Chat surface first.
- A Space contains Attempts; an Attempt is a provider Session linked to the
  Space.
- A Space can later reference Projects and code Sessions, but V1 focuses on
  global chat Sessions only.
- A Space is not a Project and does not own a repository.
- A Space is not a Workspace; Workspace remains the code worktree/copy concept.
- Provider-visible Space context must be explicit and inspectable before it is
  injected into a Session.

## Domain Boundary

```text
Project: where the code lives
Workspace: which code working copy or worktree
Session: one provider conversation/runtime
Attempt: a Session inside a Space
Space: durable context container above Sessions
```

## Filesystem Boundary

Space files live in app-owned user data and are tracked by the database:

```text
{userData}/spaces/{spaceId}/
  sources/
  memory/
  artifacts/
  attempts/{sessionId}/
  scratch/
```

Conversation items, provider events, queue state, and runtime snapshots remain
database records. Files that should be useful outside Convergence can live on
disk and be referenced by Space metadata.

## Consequences

- The current Initiative Workboard should become a first-class Space view in
  the Chat surface, not a modal-only management UI.
- Existing `initiative_*` storage and services may be renamed to `space_*`
  because little user data depends on the old name.
- Code-surface Project and Workspace flows must not regress while Chat gains
  Space grouping.
