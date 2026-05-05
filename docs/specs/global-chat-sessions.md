# Global Chat Sessions

> **Implementing agent**: companion plan lives at
> `docs/specs/global-chat-sessions-plan.md`. Re-read both files in full before
> implementing a phase. This feature changes the Session domain shape, so
> schema, API, renderer, and Linear tickets must stay aligned.

## Objective

Convergence is coding-first, but the same provider harness is useful beyond
coding. Users should be able to start a general agent conversation without
creating or selecting a Git Project, Workspace, branch, or worktree.

The first release adds a **Chat Surface** backed by the existing Session
runtime. It should feel like a simpler co-work conversation app: choose
provider/model/effort, attach files, select skills where available, send
messages, receive streaming output, answer input requests, approve actions, and
continue or archive conversations.

The first release intentionally removes coding-specific surfaces from this
mode: Changed Files, Pull Request state, branch/worktree labels, terminal dock,
workspace tree, and Project Settings.

## Product Principles

1. **Reuse the Session runtime.** Global chat is a new context for Agent
   Sessions, not a second conversation system.
2. **Do not pretend chat is a repo.** Avoid hidden Projects or synthetic Git
   roots. A global Session has no repository semantics.
3. **Keep coding excellent.** Project Session Context remains the default
   coding workflow and must not regress.
4. **Design for later breadth.** The architecture should leave room for global
   memory/context, image generation, web/OS tools, and provider delegation.
5. **Make provider-visible context explicit.** Context and skills must remain
   visible/selectable before affecting provider input.

## Domain Model

### Session Context

Add an explicit context kind to Session:

```ts
type SessionContextKind = 'project' | 'global'
```

**Project Session Context** is the current behavior:

```ts
{
  contextKind: 'project'
  projectId: string
  workspaceId: string | null
}
```

**Global Session Context** is new:

```ts
{
  contextKind: 'global'
  projectId: null
  workspaceId: null
}
```

`projectId` and `workspaceId` are nullable for global sessions, but all code
must branch on `contextKind` first. Null checks alone are not a domain model.

### Working Directory

Provider processes still need a cwd. Global sessions use an app-owned directory
under Electron `userData`, for example:

```txt
{userData}/global-sessions
```

This directory is not a Project, not shown as a repository, and not used for
Changed Files or Pull Request features.

### Session Summary

Extend `SessionSummary` and backend row mapping with:

```ts
contextKind: SessionContextKind
```

Project sessions continue to expose `projectId`, `workspaceId`, and
`workingDirectory` exactly as today.

Global sessions expose:

```ts
projectId: null
workspaceId: null
workingDirectory: string // app-owned global cwd
contextKind: 'global'
```

## Product Behavior

### Chat Surface

Add a top-level app surface for global chat. It should be reachable even when no
Project exists.

The Chat Surface contains:

- a list of global Agent Sessions,
- a "New chat" empty/new-session state,
- the reusable transcript,
- the reusable composer,
- simple session actions: stop, archive, unarchive, delete, fork if supported,
  debug log if enabled,
- provider/model/effort selection before the first send,
- attachment support gated by provider capability,
- skill selection where a global/provider catalog exists.

The Chat Surface omits:

- Project switcher and Workspace tree,
- Changed Files panel,
- Pull Request status/panel,
- branch and worktree labels,
- terminal dock and terminal primary surface,
- Project Settings and Project Context picker.

### Code Surface

The current Project/Workspace app remains the Code Surface. Its session view
keeps all coding-specific affordances.

The app shell should choose between:

```ts
type AppSurface = 'code' | 'chat'
```

No active Project blocks only the Code Surface. It must not block the Chat
Surface.

### Composer Context

Refactor `ComposerContainer` to accept a context object instead of raw
`projectId` and `workspaceId`:

```ts
type ComposerSessionContext =
  | { kind: 'project'; projectId: string; workspaceId: string | null }
  | { kind: 'global' }
```

In global mode:

- Project Context picker is hidden.
- Project Context mentions are disabled.
- provider/model/effort, attachments, queued input, and selected skills remain
  active.
- skill catalog loads from a global/provider-aware path when supported.

### Skills And MCP

V1 can ship global chat without full global MCP configuration. The composer
should keep skill selection available only for providers where the catalog can
be loaded without a Project root, or show an empty/unsupported catalog.

Follow-up work should generalize project-scoped skills and MCP visibility into
context-scoped visibility:

```ts
type CapabilityContext =
  | { kind: 'project'; projectId: string; repositoryPath: string }
  | { kind: 'global'; workingDirectory: string }
```

### Context And Memory

V1 does not need global memory. It should not overload Project Context Items
for global chat.

Follow-up work should introduce global Context Items or a generalized Context
Item scope:

```ts
type ContextItemScope = 'project' | 'global'
```

Global memory must be explicit and inspectable before provider-visible
injection.

## Architecture

### Database

Add `context_kind` to `sessions`, defaulting existing rows to `project`.

Relax `sessions.project_id` from `NOT NULL` to nullable. Preserve the foreign
key for non-null project ids.

Rules:

- `context_kind = 'project'` requires `project_id IS NOT NULL`.
- `context_kind = 'global'` requires `project_id IS NULL` and
  `workspace_id IS NULL`.
- `working_directory` remains non-null for both context kinds.

SQLite cannot add these checks in place cleanly; use the existing table rebuild
style in `electron/backend/database/database.ts`.

### Backend Session Service

Session creation should accept either context kind:

```ts
type CreateSessionInput =
  | {
      contextKind: 'project'
      projectId: string
      workspaceId: string | null
      providerId: string
      model: string | null
      effort: ReasoningEffort | null
      name: string
      primarySurface?: 'conversation' | 'terminal'
    }
  | {
      contextKind: 'global'
      providerId: string
      model: string | null
      effort: ReasoningEffort | null
      name: string
    }
```

Keep a compatibility path while migrating call sites, but new code should pass
`contextKind`.

Add read APIs for global sessions:

- `getGlobalSummaries()`
- or a generalized `getSummaries({ contextKind })`

### Renderer Session Store

The session store should track:

- active global session id for Chat Surface,
- active project session id for Code Surface,
- global session summaries,
- project session summaries scoped to active Project,
- global recents and attention participation.

Existing global attention can include both context kinds, but row labels must
not show "Unknown project" for global sessions.

### View Composition

Extract reusable conversation pieces from `SessionView`:

```txt
src/widgets/session-conversation/
  session-conversation.container.tsx
  session-conversation.presentational.tsx
```

Then compose:

```txt
src/widgets/code-session-view/
  code-session-view.container.tsx

src/widgets/chat-session-view/
  chat-session-view.container.tsx
```

The Code Session View keeps Changed Files, Pull Request, branch/worktree,
terminal, and Initiative panels.

The Chat Session View uses the shared conversation surface with a simpler
header and global composer context.

## Out Of Scope For V1

- Image generation UI and provider selection.
- Web search UI.
- OS automation UI.
- Multi-agent delegation.
- Global memory beyond explicit manual context.
- Rich folders/tags for chat history.
- Sync across devices.
- Turning chat sessions into coding sessions.

## Success Criteria

1. A user can open Convergence with no active Project and start a global Agent
   Session.
2. Global sessions persist, stream, continue, archive, and appear in attention
   surfaces.
3. Project sessions behave as before.
4. Global chat UI has no Changed Files, Pull Request, branch/worktree, terminal,
   or Project Settings affordances.
5. The implementation reuses Conversation Items, provider runtime, attachments,
   selected skills where supported, approvals, input requests, queued input,
   and notifications.
6. Existing post-task verification gates pass on a machine with native
   dependencies built.
