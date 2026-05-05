# Session Context Is Explicit

Convergence treats **Session Context** as an explicit parent context for a
Session instead of assuming every Session belongs to a Project or Workspace.

The first context kinds are:

- **Project Session Context**: a Session rooted in a Project and optionally a
  Workspace. This is the existing coding flow with repository, worktree, Git,
  Changed Files, Pull Request, Terminal, and Project Context behavior.
- **Global Session Context**: a Session rooted in the user's Convergence app
  context rather than a repository. This supports general agent conversation
  and co-work without requiring a Project, Workspace, or working tree.

We will reuse the existing provider-neutral Session runtime for both context
kinds: Conversation Items, Provider Continuation, attachments, skills,
approvals, input requests, queued input, naming, notifications, and transcript
rendering. We will not create a parallel `chat_sessions` table or a separate
chat runtime.

The database and API must represent the context kind directly. Code must not
infer a global session from `projectId === null` without checking the context
kind. A nullable `project_id` is an implementation detail of Global Session
Context, not the domain model.

Global sessions receive an app-owned working directory under Electron
`userData`, not `$HOME` and not a synthetic repository. This gives providers a
stable process cwd while preserving the product truth that general chat is not
Git-backed work.

This avoids the hidden "Personal Project" shortcut. A hidden Project would
preserve old assumptions in the short term but leak false repository semantics
into future features such as memory, image generation, OS tools, and
multi-provider delegation.
