# Global Chat Sessions Plan

Parent spec: `docs/specs/global-chat-sessions.md`

## Agent Process Rules

- Treat this as a domain-model change, not a screen-only feature.
- Preserve Project Session Context behavior while adding Global Session Context.
- Do not create hidden Projects or a parallel `chat_sessions` runtime.
- Keep each implementation slice demoable end to end.
- Update Linear issues as implementation details change.

## Linear Breakdown

The Linear project is `convergence`. Use one parent feature issue and child
issues for the vertical slices below. Blockers should be represented with
Linear issue relations, not only prose.

## Vertical Slices

### 1. Decide Session Context contract

Type: HITL

Blocked by: None.

What to build:

- Land this spec and ADR.
- Confirm naming: Session Context, Project Session Context, Global Session
  Context, Chat Surface, Code Surface.
- Confirm that global sessions use an app-owned `userData` working directory.

Acceptance criteria:

- ADR exists in `docs/adr/`.
- Spec and plan exist in `docs/specs/`.
- Linear parent issue links or embeds the docs.

### 2. Add Global Session Context to persistence and backend creation

Type: AFK

Blocked by: Slice 1.

What to build:

- Add `context_kind` to `sessions`.
- Rebuild/migrate the sessions table so `project_id` can be nullable for global
  sessions.
- Add backend create and list paths for global sessions.
- Use app-owned global working directory for provider cwd.

Acceptance criteria:

- Existing sessions migrate to `context_kind = 'project'`.
- Global sessions can be created and read without a Project row.
- Invalid combinations are rejected or impossible through service APIs.
- Backend tests cover migration, project creation, and global creation.

### 3. Generalize renderer Session types, API, and store

Type: AFK

Blocked by: Slice 2.

What to build:

- Add `contextKind` to renderer session types and preload API types.
- Add store state/actions for global session summaries and active global
  session selection.
- Update attention/recents handling so global sessions do not render as
  "Unknown project".

Acceptance criteria:

- Renderer can load global and project sessions independently.
- Existing project session flows still select/load conversations correctly.
- Global attention rows have a global/chat label instead of a missing Project
  label.
- Unit tests cover selector/store behavior.

### 4. Refactor ComposerContainer around ComposerSessionContext

Type: AFK

Blocked by: Slice 3.

What to build:

- Replace raw `projectId`/`workspaceId` composer props with
  `ComposerSessionContext`.
- Keep Project Context picker and mentions only in project context.
- Preserve provider/model/effort, attachments, selected skills, queued inputs,
  and mid-run input behavior.

Acceptance criteria:

- Project composer behavior is unchanged.
- Global composer can create/start a global session.
- Global composer hides Project Context controls.
- Component tests cover project and global modes.

### 5. Extract reusable Session Conversation surface

Type: AFK

Blocked by: Slice 3.

What to build:

- Extract transcript, shared header state, stop action, approvals, input
  requests, context window, archive/debug hooks, and composer slot from the
  current Session View.
- Compose the existing coding view from the shared surface plus code-specific
  side panels.

Acceptance criteria:

- Code Session View still shows Changed Files, Pull Request, branch/worktree,
  Terminal, and Initiative panels.
- Shared surface has no Git/Pull Request/Workspace imports.
- Existing session view tests are updated or split.

### 6. Add Chat Surface shell and global session list

Type: AFK

Blocked by: Slices 3, 4, and 5.

What to build:

- Add top-level `AppSurface = 'code' | 'chat'`.
- Add a Chat Surface reachable without an active Project.
- Add global session list, new chat empty state, and global session selection.

Acceptance criteria:

- App can start in Chat Surface with no active Project.
- Switching between Code and Chat preserves the active session per surface.
- New global sessions appear in the chat list and can be reopened.
- No project/workspace controls appear in Chat Surface.

### 7. Wire global sessions into attention, notifications, and archive

Type: AFK

Blocked by: Slice 6.

What to build:

- Include global sessions in Needs You / Needs Review.
- Support snooze, acknowledge, archive, unarchive, delete for global sessions.
- Ensure notifications can focus a global session and switch to Chat Surface.

Acceptance criteria:

- Global sessions needing input/approval appear in the attention surface.
- Finished/failed global sessions can be acknowledged or archived.
- Notification focus opens the correct Chat Surface session.
- Existing project attention behavior is unchanged.

### 8. Add global capability catalogs for skills/MCP readiness

Type: AFK

Blocked by: Slice 6.

What to build:

- Add a context-aware capability lookup for skills and MCP visibility.
- Support global/provider skill catalogs where providers can list without a
  Project root.
- Keep unsupported catalogs explicit instead of failing the composer.

Acceptance criteria:

- Global composer can show supported global/provider skills.
- Unsupported provider catalogs show an empty or unavailable state.
- Project skill catalog behavior is unchanged.

### 9. Harden global chat MVP and document follow-up roadmap

Type: HITL

Blocked by: Slices 6, 7, and 8.

What to build:

- Run full verification.
- Review UX copy and empty states.
- Document follow-up phases for global memory, image generation, OS/web tools,
  and multi-provider delegation.

Acceptance criteria:

- Full verification status is recorded.
- Follow-up roadmap is captured in docs and Linear.
- User signs off that the MVP architecture is ready for iterative feature work.
