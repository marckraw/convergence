# Command Center (Cmd+K Palette)

## Objective

Provide a global, keyboard-first command palette that lets a user jump across
every project, workspace, and session in the app — and open the handful of
dialogs that live behind footer buttons — without touching the mouse.

Convergence is designed for an "agents everywhere" workflow. In the target
usage pattern, a single user runs ~20 projects with 1-2 concurrent agent
sessions each (~40 live sessions). At that scale the sidebar tree is no longer
a realistic navigation surface; the user needs a single global entry point
that understands every destination in the app.

`Cmd+K` (mac) / `Ctrl+K` (other platforms) opens the palette from anywhere in
the app. The palette supports fuzzy search across projects, workspaces, and
sessions, surfaces "Needs You" attention items by default, and dispatches
intent actions (activate project, switch to session, open dialog, start a new
session in a workspace).

This spec is scoped to v1. The palette is navigation + two creation intents
only. Destructive and stateful commands, favorites, command history, and a
`>` command mode are explicitly out of scope and reserved for v2.

## Product behavior

### Entry point

- `Cmd+K` on macOS, `Ctrl+K` on other platforms opens the palette.
- The shortcut is in-app only. We do not use Electron `globalShortcut` (OS-wide
  scope is wrong for this feature).
- The shortcut must be active everywhere in the renderer, including when a
  session view is focused, the sidebar is focused, or a dialog is open over
  another surface. The one exception is the terminal dock — see the terminal
  conflict section below.
- While the palette is open, `Cmd+K` toggles it closed. `Escape` also closes.
- Opening the palette clears any previous query and resets the cursor to the
  first result.

### Empty-query layout

When the input is empty, results are presented as curated sections in a fixed
order:

1. `Waiting on You` — sessions with `attention = 'needs-input'` or
   `'needs-approval'`, excluding archived and excluding items already
   dismissed in `needsYouDismissals`. Priority ordering matches the sidebar's
   existing `buildNeedsYouSummary` logic.
2. `Needs Review` — sessions with `attention = 'finished'` or `'failed'`,
   same filter rules.
3. `Recent Sessions` — the most recent 5 entries from the new
   `recentSessionIds` list (see **Recency**), excluding any session already
   shown in sections 1 or 2.
4. `Projects` — all projects.
5. `Workspaces` — all workspaces across all projects (see
   **Global workspace loading**).
6. `Dialogs` — App Settings, Project Settings, Providers, MCP Servers,
   What's New.

Each section caps at a reasonable length (5-8 items) in v1 so the palette
stays scannable without a virtualised list. Keyboard navigation crosses
section boundaries.

### Typed-query layout

When the user types anything, curated sections collapse into a single
ranked result list driven by Fuse.js. The `Waiting on You` and `Needs Review`
attention boosts are **not** applied to typed queries: a user typing a
specific session name expects that session to win, not attention state to
hijack ranking. Each result row shows its entity type via a small leading
icon/badge so the user can still disambiguate across kinds.

### Result rendering

Each result row has:

- Primary line: `{session name} · {project} · {branch}` for sessions,
  `{project name}` for projects, `{branch} · {project}` for workspaces, the
  dialog title for dialogs, the action label for creation actions.
- Secondary line: attention badge + provider for sessions, repository path
  for projects, worktree path for workspaces, short description for dialogs
  and creation actions.
- Leading icon indicating entity kind.

The display format is deliberately project-first for sessions because in a
cross-project world the project name is the disambiguator, not the session
name.

### Indexed entities and intents

| Entity kind                | Intent when selected                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------- |
| Project                    | `activateProject(projectId)`                                                          |
| Workspace                  | `activateProject(workspace.projectId)` then expand that workspace in the sidebar tree |
| Session                    | `switchToSession(sessionId)` (cross-project hop if needed)                            |
| Dialog                     | `openDialog(dialogKind)`                                                              |
| "New session in workspace" | `beginSessionDraft(workspaceId)` after activating the owning project                  |
| "New workspace in project" | `beginWorkspaceDraft(projectId)` after activating that project                        |

Creation actions appear only under typed queries (e.g. typing `new` or a
workspace branch name surfaces `New session in feat/x`). They do not appear
in the empty-query layout in v1 to avoid crowding the default view.

### Cross-project hop

Selecting a session from another project must perform the exact same hop the
sidebar's NeedsYou click performs today
(`src/widgets/sidebar/sidebar.container.tsx:138`): prepare the session store
for the target project, set the active project, reload workspaces, current
branch, and sessions for that project, then set the active session.

The current inline logic in `handleSelectNeedsYouSession` must be extracted
into the new `switchToSession` intent so both call sites go through the same
code path. Observable behavior for NeedsYou must not change.

### Keyboard interaction

- Arrow keys move the cursor up/down through results across sections.
- `Enter` activates the highlighted result.
- `Escape` closes the palette.
- `Cmd+K` toggles the palette closed.
- While the palette is open, the terminal dock's key handler must not fire
  (see **Terminal conflict**).

### Focus and accessibility

- The palette modal uses the existing Radix Dialog primitive for focus trap
  and backdrop dismissal.
- Result list follows the WAI combobox with listbox popup pattern.
- Results have stable `aria-activedescendant` tracking.
- Every result has an accessible label that includes entity kind so screen
  reader users get the same disambiguation as sighted users.

## Architecture

### New feature slice: `src/features/command-center/`

Follows FSD-lite structure:

- `command-center.container.tsx` — owns open state subscription, keydown
  listener registration, index rebuild triggers, intent dispatch, focus
  management. Contains no render logic beyond composing children.
- `command-center.presentational.tsx` — pure render: input + results list.
  Props in, JSX out. No side effects.
- `command-palette-trigger.ts` — pure function that matches the open/close
  shortcut from a `KeyboardEvent` (mirror of `keymap.pure.ts`).
- `command-palette-index.pure.ts` — pure function that turns
  `{ projects, workspaces, sessions, recents, dismissals }` into a typed
  array of `PaletteItem` records suitable for Fuse.
- `command-palette-ranking.pure.ts` — pure functions for curated-section
  assembly (empty query) and Fuse-based ranking (typed query). Includes the
  "boost only on empty query" rule.
- `intents.ts` — exports `switchToSession`, `activateProject`, `openDialog`,
  `beginSessionDraft`, `beginWorkspaceDraft`. Each is a thin wrapper over
  store actions. No React imports.
- `command-center.types.ts` — `PaletteItem` discriminated union, section id
  enums, intent signatures.
- `index.ts` — public API.

Tests per FSD-lite conventions: `*.pure.test.ts` for pure modules under
`vitest.pure.config.ts`; container-level behaviour tested via the
`vitest.unit.config.ts` project with a fake store wiring.

### New entity slice: `src/entities/dialog/`

Today dialog open state is local `useState` in each of:

- `src/features/app-settings/app-settings.container.tsx`
- `src/features/project-settings/project-settings.container.tsx`
- `src/features/mcp-servers/mcp-servers.container.tsx`
- `src/features/provider-status/provider-status.container.tsx`
- `src/features/release-notes/release-notes.container.tsx`

The palette cannot open these from outside without a shared controller, so
introduce a thin Zustand slice:

```ts
type DialogKind =
  | 'app-settings'
  | 'project-settings'
  | 'providers'
  | 'mcp-servers'
  | 'release-notes'

interface DialogState {
  openDialog: DialogKind | null
  open: (kind: DialogKind) => void
  close: () => void
}
```

Migration: each dialog container replaces its `useState` pair with two store
selectors (`isOpen = useDialogStore(s => s.openDialog === 'kind')`,
`close = useDialogStore(s => s.close)`) and the existing trigger button calls
`useDialogStore.getState().open('kind')`. Only one dialog can be open at a
time in v1; this matches today's effective behaviour (there is no current
flow that opens two at once).

`McpServersDialogContainer` currently takes `projectId` and `projectName`
props passed from the sidebar (`sidebar.container.tsx:287`). After the
migration, the dialog container subscribes to `useProjectStore.activeProject`
directly rather than receiving props. The sidebar trigger button remains in
place and still passes nothing; open state flows through the store. This
keeps the palette's `openDialog('mcp-servers')` call site simple and makes
the dialog surface context-aware.

### Global workspace loading

The key structural gap today: `useWorkspaceStore.workspaces` holds only the
active project's workspaces
(`src/entities/workspace/workspace.model.ts:28`). The palette needs a
cross-project index.

Changes:

- `electron/backend/workspace/workspace.service.ts` gains `listAll()` that
  returns all workspaces across all projects.
- `electron/main/ipc.ts` exposes `workspace:getAll`.
- `electron/preload/index.ts` exposes `workspace.getAll`.
- `src/entities/workspace/workspace.api.ts` exposes `getAll()`.
- `src/entities/workspace/workspace.model.ts` adds:
  - `globalWorkspaces: Workspace[]`
  - `loadGlobalWorkspaces(): Promise<void>`
    Mirror the `globalSessions` / `loadGlobalSessions` pattern in
    `useSessionStore`.
- `src/app/App.container.tsx` calls `loadGlobalWorkspaces` on mount alongside
  the existing `loadGlobalSessions` flow.

Scale note: 20 projects × ~3-5 worktrees ≈ 100 rows. Cheap to load eagerly.
No pagination or backend search needed in v1.

Stale-state handling: workspaces are reloaded when created or deleted
(`createWorkspace` / `deleteWorkspace` in the store must also refresh
`globalWorkspaces`). IPC broadcasts for workspace lifecycle are already in
place for the active-project flow; extending them to update
`globalWorkspaces` is part of the first task slice.

### Recency tracking

Sessions are the only entity kind with recency in v1.

- `src/entities/session/session.model.ts` adds `recentSessionIds: string[]`
  (newest first, max 10, deduplicated).
- `setActiveSession(id)` prepends the id (if non-null) and trims to 10.
- `createAndStartSession` also prepends the new session id.
- `deleteSession` removes the id from the list.
- Persistence: the list is stored in the existing app state via a new
  `state.service.ts` key `recent_session_ids`. Wrap reads/writes in a small
  method on the session store (`loadRecents`, `persistRecents`) to keep
  components unaware of the storage layer.
  - Reads: `App.container.tsx` calls `loadRecents` on mount (same useEffect
    as `loadGlobalSessions`).
  - Writes: each mutation of `recentSessionIds` schedules an async
    `persistRecents` call. Failures log; they do not block the UI.
- Pruning: on load, any id not present in `globalSessions` is dropped.

### App-level keyboard handler

A new pure module `src/features/command-center/command-palette-trigger.ts`
exports `matchPaletteShortcut(event, platform): boolean`. The container
registers a `window.addEventListener('keydown', handler, true)` on mount and
calls the matcher.

Behaviour:

- If the matcher returns true and the palette is closed, open it.
  `event.preventDefault()` + `event.stopPropagation()`.
- If the matcher returns true and the palette is open, close it. Same.
- Otherwise pass through (no stopPropagation).

Ordering vs other handlers is controlled by the capture phase flag and by
mount order. The palette listener mounts at the `App.container.tsx` level so
it is active from app boot.

### Terminal conflict — regression guardrail

Today, `src/widgets/terminal-dock/terminal-dock.container.tsx:254-268` binds
a `window keydown` listener at capture phase that calls `matchShortcut` from
`src/entities/terminal/keymap.pure.ts`. That matcher returns
`{ kind: 'clear' }` on bare `Cmd+K`
(`src/entities/terminal/keymap.pure.ts:60`). The handler has no focus guard,
so today `Cmd+K` clears the terminal from anywhere in the app whenever a
session with a terminal dock is active.

This conflicts with the palette. The palette must win when the user's focus
is NOT in the terminal.

Resolution (chosen approach):

- Scope the terminal's keydown handler to terminal focus. Before calling
  `matchShortcut`, the handler checks whether
  `document.activeElement` is contained within the terminal dock root
  (or is the xterm textarea). If not, the handler returns without calling
  `matchShortcut` or stopping propagation. The palette listener then fires
  normally.
- This is implemented by attaching a ref to the terminal dock root and
  gating the handler on `dockRootRef.current?.contains(document.activeElement)`.
- Behavioural change for users: `Cmd+K` no longer clears the terminal when
  focus is in the sidebar or session view. To clear from outside the terminal,
  the user must click into the terminal first. This is the industry-standard
  behaviour for focus-scoped shortcuts and matches how VS Code, iTerm, and
  Warp route terminal keys.
- This change is the only user-visible behaviour regression introduced by
  this spec. It is called out explicitly so it can be listed in the release
  notes.

Keymap constants and terminal shortcut handlers are otherwise untouched.

### Intent dispatch details

**`switchToSession(sessionId)`** — lifts the body of
`handleSelectNeedsYouSession` out of `sidebar.container.tsx`. Lives in
`src/features/command-center/intents.ts`. NeedsYou click is refactored to call
this intent. Signature:

```ts
async function switchToSession(sessionId: string): Promise<void>
```

Reads stores via `.getState()` calls and `await`s store actions. Emits no
events; caller is responsible for any post-switch UI concerns (the palette
closes itself on successful intent dispatch).

**`activateProject(projectId)`** — wraps `prepareForProject` +
`setActiveProject` + reload of workspaces, current branch, sessions. Same
sequence the sidebar uses. Does not change `activeSessionId`.

**`openDialog(kind)`** — single line: `useDialogStore.getState().open(kind)`.

**`beginSessionDraft(workspaceId)`** — looks up the workspace's project,
calls `activateProject(projectId)` if not already active, then
`useSessionStore.getState().beginSessionDraft(workspaceId)`.

**`beginWorkspaceDraft(projectId)`** — calls `activateProject(projectId)`
first; the sidebar already exposes the "new workspace" inline UI within a
project tree. The intent surfaces that same inline form by setting a new
transient field on the workspace store or a local bus signal. Detail to be
finalised during task slice 6 — acceptable minimum in v1 is that the user
lands on the project with the tree expanded and a visible affordance.

### Data-flow summary

Opening the palette:

1. User presses `Cmd+K`.
2. App-level capture handler matches the shortcut, calls
   `useCommandCenterStore.getState().open()`.
3. Container reads `globalSessions`, `globalWorkspaces`, `projects`,
   `needsYouDismissals`, `recentSessionIds` via Zustand selectors.
4. Pure `buildPaletteIndex` composes a `PaletteItem[]`.
5. Empty query → pure `buildCuratedSections` groups items.
6. Typed query → Fuse.js (created once per open with the current index)
   scores items; `shouldFilter={false}` on the cmdk `Command` component.
7. `Enter` on a highlighted result dispatches its intent.
8. Intent resolves; container calls `close()`.

### Dependencies to add

- `cmdk` — palette UI primitives (shadcn's Command component).
- `fuse.js` — fuzzy ranking.

Both added to `package.json` dependencies. No new devDependencies.

### FSD-lite boundary checks

- `src/features/command-center/` depends only on `src/entities/*` and
  `src/shared/*`.
- `src/entities/dialog/` is a new peer entity slice. It depends only on
  `src/shared/*` (types, zustand).
- `src/entities/workspace/`, `src/entities/session/` gain new actions but do
  not take new cross-layer dependencies.
- The `McpServersDialogContainer` migration introduces a new
  `useProjectStore` dependency from the feature to the entity, which is
  already allowed by the layer rules.

## Regression guardrails (explicit)

Every guardrail below must have a passing test or a smoke check in the
task-breakdown phase:

1. Terminal `Cmd+K` clears the terminal when focus is inside the terminal
   (changed behaviour: no longer fires outside).
2. Sidebar NeedsYou click still switches to the target session (same
   observable cross-project hop), implemented via `switchToSession`.
3. Dialog trigger buttons (`AppSettings`, `ProjectSettings`, `Providers`,
   `McpServers`, `ReleaseNotes`) still open their dialog when clicked.
4. All existing shortcuts in `src/entities/terminal/keymap.pure.ts` remain
   functional when terminal is focused.
5. Sidebar project switching from the project switcher is unchanged.
6. Session list regenerate / rename / archive / unarchive / delete actions
   in the sidebar tree still work.
7. Workspace create / delete still work and now also refresh
   `globalWorkspaces` so the palette sees fresh state.
8. `createAndStartSession` sets the created session as the most recent.

## Testing

Minimum required coverage:

- `command-palette-trigger.pure.test.ts` — matches `Cmd+K` on mac,
  `Ctrl+K` on other, ignores shifted/altered variants, ignores `Cmd+K` when
  a non-K key event has the modifier.
- `command-palette-index.pure.test.ts` — composes items from fixture
  projects/workspaces/sessions/recents; filters archived and dismissed
  correctly.
- `command-palette-ranking.pure.test.ts` — curated sections in empty-query
  ordering; Fuse scoring for typed queries with weighted fields; attention
  boost applied only when query is empty.
- `dialog.model.test.ts` (new) — open / close / swap dialog.
- `workspace.model.test.ts` — extend with `loadGlobalWorkspaces` and
  `globalWorkspaces` refresh on create/delete.
- `session.model.test.ts` — extend with `recentSessionIds` behaviour on
  `setActiveSession`, `createAndStartSession`, `deleteSession`; pruning on
  load; persistence through the state bridge.
- `sidebar.container.test.tsx` (if present) — NeedsYou click behaviour after
  refactor to `switchToSession` is unchanged.
- Smoke test: `Cmd+K` opens palette in a running dev build with a mocked
  store; `Escape` closes; keyboard navigation reaches each section.

Post-task commands per `CLAUDE.md`:

- `npm install`
- `npm run test:pure`
- `npm run test:unit`
- `npm run typecheck`
- `chaperone check --fix`

## Risks and open questions

- **Terminal shortcut regression.** Gating terminal `Cmd+K` on focus is a
  behaviour change. It matches industry norms, but a user used to clearing
  from anywhere may be briefly confused. Mitigate with a release-notes entry.
- **Fuse.js ranking tuning.** Weighted fields need empirical tuning against
  real fixtures. First pass: `session.name` weight 1.0, `project.name` 0.8,
  `workspace.branch` 0.7, `provider.id` 0.4, attention aliases 0.3.
  Revisit once dogfooding feedback comes in.
- **`McpServersDialogContainer` prop migration.** Moving from prop-driven
  `projectId` to an `activeProject` subscription is a minor behaviour shift
  if the sidebar ever renders this dialog for a non-active project. Today it
  doesn't, so this is safe; flag it for reviewers.
- **`beginWorkspaceDraft` UX.** The sidebar's new-workspace flow today is an
  inline form. Surfacing that from the palette may need a small signal on
  the workspace store. Final detail deferred to task slice 6. Acceptable
  minimum: palette lands the user on the project with the project tree in a
  state where "new workspace" is one click away.
- **Recency persistence conflict.** If two renderer windows are open (future
  multi-window support), `recent_session_ids` races. Not relevant for v1 but
  flagged so the persistence key is easy to migrate to per-window state
  later.
- **Dialog store migration scope.** Moving every dialog to the shared slice
  in one pass is the riskier path but avoids a half-migrated state. Doing it
  as a preparatory task slice before the palette itself lands means the
  palette ships on an already-verified substrate.

## Non-goals (v1)

- Favorites / pinned items.
- Command history persistence (query cleared on close).
- A `>` mode for destructive or stateful commands.
- Arbitrary keybinding remapping (palette shortcut is fixed).
- Agent-to-agent jumps or in-session navigation (e.g. "scroll to message").
- Backend-side fuzzy search (all indexing is client-side).
- Multi-window palette coordination.
- Cross-palette plugin surface for third-party commands.

## Implementation outline (for planning-and-task-breakdown)

Proposed task slices, each independently shippable and green through the
post-task verification commands:

1. **Dialog entity slice + migration.** Create `src/entities/dialog/`, add
   `useDialogStore`. Migrate all five dialog containers to subscribe to the
   store. Remove local `useState` in each. Verify trigger buttons still
   open dialogs. No palette code yet.
2. **Global workspaces.** Add `workspace:getAll` IPC + preload + api.
   Extend `useWorkspaceStore` with `globalWorkspaces` and
   `loadGlobalWorkspaces`. Wire refreshes into create/delete. Call from
   `App.container.tsx`. No UI consumer yet.
3. **Recency in session store.** Add `recentSessionIds`, update on
   setActive/create/delete, persist via state bridge. Load on app mount.
   Prune on load.
4. **Pure palette modules.** Implement `command-palette-trigger.pure.ts`,
   `command-palette-index.pure.ts`, `command-palette-ranking.pure.ts` with
   full test coverage. No UI yet.
5. **Palette feature slice — navigation intents.** Implement container,
   presentational, `switchToSession`, `activateProject`, `openDialog`. Wire
   `Cmd+K` listener in `App.container.tsx`. Refactor
   `handleSelectNeedsYouSession` to call `switchToSession`. Results include
   projects, workspaces (as activation targets), sessions, dialogs.
6. **Creation intents.** Add `beginSessionDraft` and `beginWorkspaceDraft`
   intent wiring and surface "New session in X" / "New workspace in X"
   results under typed queries.
7. **Terminal focus gating.** Add the focus guard in
   `terminal-dock.container.tsx`. Update tests. Release-notes entry.
8. **Polish.** Result grouping headers, empty-state copy, accessibility pass
   against the WAI combobox pattern, release-notes entry in the `What's New`
   dialog.

Each slice should land green through `npm run test:pure`,
`npm run test:unit`, `npm run typecheck`, and `chaperone check --fix` before
the next begins.
