# Terminal as a First-Class Citizen

## Goal

Promote the terminal from a dock-only, conversation-scoped surface to a
first-class session surface. A user can create a session whose primary
view is the terminal pane tree (with conversation hidden by default), or
flip an existing conversation-primary session to terminal-primary. PTY
layout (split tree, tab CWDs) survives app restart by replaying as
freshly-spawned shells in the saved working directories.

This work makes the terminal a peer of the conversation as the central
surface a user lives in, without restructuring sessions, sidebar
navigation, or the workspace model.

## Product intent

- A user can pick "Terminal" as the intent for a new session at creation
  time. The session's main view becomes the pane tree; the conversation
  is hidden by default and can be toggled visible.
- Terminal-primary sessions do not bind to a real AI provider. They use
  a synthetic `shell` provider so the rest of the app (sidebar, recents,
  Cmd+K, fork-not-applicable, status bar) keeps working unchanged.
- Conversation-primary sessions retain today's behavior unchanged. Cmd+T
  still opens a terminal dock at the bottom; splits/tabs work as today.
- The user can swap which surface is primary at any time on any session
  (a session with conversation can become terminal-primary; a
  terminal-primary session can be flipped if a provider is set).
- Terminal pane layout (tree shape, split sizes, tabs, CWDs, titles)
  persists across app restarts. PTYs are reborn fresh in the saved CWDs
  on session reactivation. No scrollback restoration in V1 — that is
  future tmux-backed work.
- Sidebar shows a small icon distinguishing session kind. No structural
  changes to the sidebar list, grouping, or filtering. Cross-project
  switching stays via Cmd+K.
- Workspace handling unchanged: optional. CWD resolution unchanged:
  `workspace.path ?? project.repositoryPath`.

## Non-goals

- No live PTY state preservation across restarts. Buffer/scrollback is
  lost; processes are killed on quit and reborn fresh on next launch.
  Future work behind `tmux` integration.
- No auto-naming of terminal sessions. There is no signal source we will
  read (terminal output is not parsed). Users name sessions manually.
- No new sidebar grouping, no terminal-only top-level surface, no
  workspace-rooted navigation. Sidebar list shape and behavior unchanged.
- No top-level "Open terminal on workspace" entry point. Terminal access
  is always through a session.
- No removal of the existing dock terminal on conversation-primary
  sessions. Both modes coexist.
- No notifications / attention signals from terminal-primary sessions.
  These sessions are user-driven; nothing watches them.
- No fork support for terminal-primary sessions in V1. Fork dialog hides
  the action when parent is terminal-primary (no transcript to extract).
- No multi-window terminal popouts. Same single-window dock-or-main
  layout.
- No remote/SSH terminals. Same local-only PTY as today.
- No Windows parity work — terminal V1 already deferred Windows; this
  spec inherits that constraint.

## V1 behavior

### Session kinds

A session has a new field, `primarySurface: 'conversation' | 'terminal'`.

- `'conversation'` (default for all existing sessions and new
  conversation-intent sessions): main view is `SessionView` (transcript),
  optional terminal dock at the bottom. Today's behavior.
- `'terminal'` (new): main view is the terminal pane tree (full height,
  full width of the main pane). Conversation is hidden by default and
  toggleable.

`primarySurface` is independent of `providerId`. A conversation-primary
session always has a real provider. A terminal-primary session has the
synthetic `'shell'` provider unless the user explicitly attached a real
provider via the swap action (deferred — V1 only allows
`shell` ↔ `conversation` if the session has a provider; flipping a
shell-only session to conversation requires picking a real provider).

### Synthetic shell provider

Add a new provider with `id: 'shell'`, registered in the provider
registry alongside Claude Code, Codex, and Pi.

The shell provider:

- Is hidden from provider selectors used by conversation-intent flows
  (it is selected implicitly by the terminal-intent flow, never by the
  user directly).
- `descriptor.kind = 'shell'` — a new discriminator that lets the
  provider registry mark this provider as non-conversational.
- `descriptor.models = []` — no model selection needed.
- `descriptor.start({ workingDirectory })` — creates a `SessionHandle`
  with `status: 'idle'`, `attention: 'none'`, `activity: null`. Never
  emits conversation patches. Never receives `sendMessage`.
- `descriptor.oneShot` — throws `UnsupportedProviderOperation`. Used
  only by fork extraction and naming, which the shell provider opts out
  of (see "Service guards" below).

The shell provider exists so that `SessionService.create` and
`SessionService.start` work uniformly for both kinds without branching
on `primarySurface`. The session row carries `provider_id = 'shell'`.

### Service guards

Several services must opt out of operating on shell-provider sessions:

- `SessionNamingService` — skip rename for shell sessions; the auto-name
  pipeline never fires.
- `SessionForkService` — `previewSummary`, `forkFull`, `forkSummary` all
  reject with `ForkNotSupportedForShellSession` when parent's provider is
  `'shell'`. Fork menu item is hidden in the renderer for these sessions
  (see "Renderer architecture" below).
- `NotificationsService` / attention observer — shell sessions never
  fire attention transitions, so nothing observes them. No guard needed,
  but document the invariant in the observer's contract.
- `SessionService.sendMessage` — guard that rejects calls against shell
  sessions (`ConversationDisabledForProvider`). Renderer does not call
  this for terminal-primary sessions, but the guard prevents misuse.

### Layout model

The renderer computes the layout from the active session's
`primarySurface`:

| primarySurface | Main pane           | Secondary surface       | Toggle                            |
| -------------- | ------------------- | ----------------------- | --------------------------------- |
| `conversation` | `SessionView`       | TerminalDock at bottom  | `Cmd+`` (existing dock toggle)    |
| `terminal`     | TerminalDock (full) | `SessionView` at bottom | `Cmd+J` (new conversation toggle) |

The "secondary surface" slot is the same dock chrome, mounted at the
bottom of the layout, with the same resize handle and per-session height
persistence. In `terminal` mode, the dock contains the conversation
view; in `conversation` mode, the dock contains the terminal pane tree.

This is implemented by a single `WorkspaceLayout` component that reads
`activeSession.primarySurface` and renders one of two arrangements:

```
conversation-primary:                terminal-primary:
┌────────────────────┐               ┌────────────────────┐
│   SessionView      │               │  TerminalDock      │
│   (transcript)     │               │  (pane tree)       │
│                    │               │                    │
├────────────────────┤  toggle Cmd+` ├────────────────────┤  toggle Cmd+J
│  TerminalDock      │               │   SessionView      │
│  (pane tree)       │               │   (transcript)     │
└────────────────────┘               └────────────────────┘
```

The bottom slot is hidden by default in `terminal-primary` (the dock
visibility map already supports this — initial value for terminal-primary
sessions is `false`).

### Terminal pane tree behavior

When terminal is the main surface:

- All existing pane tree behavior applies: split horizontally, split
  vertically, tabs per leaf, focus management, resize.
- Existing keyboard shortcuts work as today inside the main pane:
  `Cmd+T` (new tab), `Cmd+D` / `Cmd+Shift+D` (splits), `Cmd+W` (close
  tab), arrows for focus.
- Initial state on first activation of a never-used terminal-primary
  session: a single leaf with one tab spawned in the session's
  `workingDirectory`. The user does not have to press `Cmd+T` to get
  started.
- All PTYs continue to live in the main process and survive session
  switches, exactly as today.

### Conversation toggle in terminal-primary

`Cmd+J` toggles the bottom conversation dock visible/hidden. Conversation
content for a `'shell'`-provider session is empty; the dock surfaces a
small "This terminal session has no conversation history. Convert to a
conversation session…" message with an action that opens a future
"convert kind" dialog (the action is shown but disabled in V1, with a
tooltip explaining it is planned).

For terminal-primary sessions that _do_ have a real provider (deferred
V2 case), the dock shows the actual transcript.

### Session creation flow

Replace the current `+ New session` action that opens straight into the
provider/model picker. Instead:

1. User clicks `+ New session` in the sidebar (or invokes the Cmd+K
   intent).
2. A small **Intent dialog** appears with two large cards:
   - **Conversation** — "Talk to an AI agent in this workspace."
   - **Terminal** — "Open a shell-only session in this workspace."
3. Selecting Conversation routes to the existing
   provider/model/effort/workspace/initial-message wizard, unchanged.
4. Selecting Terminal routes to a smaller wizard:
   - **Name** (free text, required)
   - **Workspace** (optional, defaults to project root) — same picker
     as the conversation wizard, no provider/model fields
   - **Create** button
5. On create, a new session row is written with
   `provider_id = 'shell'`, `primary_surface = 'terminal'`,
   `name = <user input>`, `workspace_id = <picked or null>`,
   `working_directory = <resolved>`, no initial message.
6. The session is set as active. The main pane mounts the terminal pane
   tree, automatically opens the first leaf+tab in the working
   directory, and focuses the new pane.

Cmd+K gains a new top-level intent `new-terminal-session` for
keyboard-first creation, alongside the existing `new-session`.

### Sidebar visual distinction

Each session row in the sidebar shows a small leading icon:

- Conversation sessions: the existing provider icon (Claude / Codex / Pi).
- Terminal sessions: a `>_` shell glyph.

No grouping change, no section split. Sort order, recents behavior,
archived behavior all unchanged. Filter by kind is deferred.

### Pane layout persistence

A new table `session_terminal_layout` stores the snapshot of the pane
tree per session:

```sql
CREATE TABLE session_terminal_layout (
  session_id   TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  layout_json  TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
```

`layout_json` is a serialized `PersistedPaneTree`:

```ts
type PersistedPaneTree = PersistedLeaf | PersistedSplit

interface PersistedLeaf {
  kind: 'leaf'
  id: string
  tabs: Array<{
    id: string // stable identifier; PTY id on next spawn is fresh
    cwd: string
    title: string // user-visible title (shell name or last-set title)
  }>
  activeTabId: string
}

interface PersistedSplit {
  kind: 'split'
  id: string
  direction: 'horizontal' | 'vertical'
  children: PersistedPaneTree[]
  sizes: number[]
}
```

Runtime fields (`pid`, `status`, `exitCode`, `shell`) are NOT persisted —
they belong to the live PTY which does not survive restart.

#### Save triggers

The renderer persists the snapshot whenever the in-memory pane tree
changes meaningfully:

- After `splitLeaf`, `removeTab`, `insertTab`, `updateSizes`,
  `setFocusedLeaf` (focus is not persisted — only structural changes
  trigger a save).
- Debounced 300ms to coalesce rapid resize-drag events.
- On app `before-quit`, a synchronous final flush via IPC.

#### Restore triggers

When a session becomes active and `treesBySessionId[sessionId]` is
`undefined` (not just `null`):

1. Renderer issues `terminal-layout:get(sessionId)`.
2. Backend returns the persisted `PersistedPaneTree` or `null`.
3. If non-null, the renderer rebuilds the live `PaneTree` by walking the
   persisted tree depth-first and calling `terminalApi.create` for each
   leaf tab to spawn fresh PTYs in the saved CWDs. New PTY ids replace
   the persisted tab ids in-memory but the persisted ids remain on disk
   until the next save (so the layout snapshot is stable).
4. Splits are reconstructed with the saved sizes and direction.
5. The originally-focused leaf id is restored if present in the rebuilt
   tree.

If the persisted CWD no longer exists on disk (workspace deleted, repo
moved), the spawn falls back to `session.workingDirectory`. If that also
fails, the tab is rendered with a small error state and a "Reopen in
project root" action.

#### Conversation-primary persistence

Conversation-primary sessions also persist their pane layout when the
user has opened a terminal dock (`Cmd+T`). The persistence and restore
mechanism is identical; only the layout slot (main vs dock) differs by
`primarySurface` at render time.

### Status bar

The global status bar (today: provider chip + status) is unchanged for
terminal-primary sessions but the provider chip displays "Terminal
session" instead of a model name. No background activity indicators are
expected to fire (shell provider is silent).

### Cmd+K and command center

- New intent: `new-terminal-session` — opens the terminal-intent wizard
  directly (skipping the intent dialog).
- Existing `new-session` intent now opens the intent dialog.
- Intent visibility for terminal-primary sessions in Cmd+K:
  - Hidden: `fork-current-session`, `change-model`, `change-effort`,
    `rename-via-llm` (if such an intent exists).
  - Visible: `rename-session`, `archive-session`, `delete-session`,
    `switch-to-session`, `swap-primary-surface` (new).

### Swap primary surface

A new session-header action and Cmd+K intent: `swap-primary-surface`.

- For conversation-primary sessions: swaps to terminal-primary. If the
  session does not yet have a pane tree, an empty leaf is auto-created
  in the working directory.
- For terminal-primary sessions: swaps back to conversation-primary
  _only if_ the session's provider is not `'shell'`. For shell sessions,
  the action is hidden in V1 (V2 will offer "promote to conversation
  session" with a provider picker).

The swap mutates `session.primarySurface` via a new IPC handler
`session:setPrimarySurface(sessionId, surface)`. Persistence is
immediate. The layout re-renders on the next React update.

## Data model

### Schema migration

Add one column to `sessions` and one new table:

```sql
ALTER TABLE sessions ADD COLUMN primary_surface TEXT NOT NULL DEFAULT 'conversation';

CREATE TABLE session_terminal_layout (
  session_id   TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  layout_json  TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
```

`primary_surface` is `NOT NULL` with a default so existing sessions
auto-migrate to `'conversation'`. No CHECK constraint — renderer and
IPC enforce the enum.

### Session shape

Extend `Session` in `electron/backend/session/session.types.ts` and
`src/entities/session/session.types.ts`:

```ts
interface Session {
  // existing fields...
  primarySurface: 'conversation' | 'terminal'
}
```

## Backend architecture

### Shell provider

New module `electron/backend/provider/shell/`:

```
electron/backend/provider/shell/
├── shell.provider.ts        # ProviderDescriptor + factory
├── shell.provider.test.ts
└── index.ts
```

The `ShellProvider` exports a `ProviderDescriptor` that:

- Reports `id: 'shell'`, `kind: 'shell'`, `models: []`,
  `defaultModelId: null`, `fastModelId: null`.
- `start(config)` returns a `SessionHandle` with no streaming. The
  handle simply marks the session `status: 'idle'`, `attention: 'none'`.
- `oneShot()` throws `UnsupportedProviderOperation`.
- `sendMessage()` throws `UnsupportedProviderOperation`.
- Registers no IPC of its own.

The provider registry adds a `kind` field to `ProviderDescriptor` and a
helper `isConversationalProvider(descriptor): boolean` used by the
provider picker (filters out `shell`) and by service guards.

### Terminal layout service

New module `electron/backend/terminal/layout/`:

```
electron/backend/terminal/layout/
├── terminal-layout.types.ts        # PersistedPaneTree types
├── terminal-layout.pure.ts         # serialize / deserialize / validate
├── terminal-layout.pure.test.ts
├── terminal-layout.repository.ts   # better-sqlite3 prepared statements
├── terminal-layout.service.ts      # get / save / clear, used by IPC
└── terminal-layout.service.test.ts
```

Service surface:

- `getLayout(sessionId): PersistedPaneTree | null`
- `saveLayout(sessionId, tree: PersistedPaneTree): void`
- `clearLayout(sessionId): void` (called on session delete via cascade,
  but exposed for explicit reset action — V2)

Pure helpers:

- `serializePaneTree(tree: PaneTree): PersistedPaneTree` — strips
  runtime fields.
- `deserializePaneTree(persisted: PersistedPaneTree): PersistedPaneTree`
  — type-validates the JSON shape, throws on malformed input.
- `validateTreeShape(tree: PersistedPaneTree): ValidationError | null`
  — checks invariants: split has ≥2 children, sizes sum ~100, leaf has
  ≥1 tab, activeTabId is in tabs, all ids unique within tree.

### IPC

Three new handlers, in `electron/backend/terminal/terminal.ipc.ts`:

- `terminal-layout:get(sessionId): PersistedPaneTree | null`
- `terminal-layout:save(sessionId, tree)` (debounced upstream by renderer)
- `terminal-layout:flush()` — synchronous flush of the most recent save
  buffer; called on `before-quit` to guarantee durability.

One new handler in `electron/backend/session/session.ipc.ts`:

- `session:setPrimarySurface(sessionId, surface): void`

Existing `session:create` extends to accept `primarySurface` (default
`'conversation'`). The conversation wizard always sends
`'conversation'`; the terminal wizard always sends `'terminal'`.

### SessionService changes

- Accept `primarySurface` on `create`, default `'conversation'`.
- New method `setPrimarySurface(id, surface)` mutates the row, broadcasts
  `session:summaryUpdated` so all renderers re-render.
- Guard `sendMessage` against shell-provider sessions
  (`ConversationDisabledForProvider`).

### TerminalService changes

No structural changes. The service continues to spawn PTYs by id and
broadcast data/exit events. It does not know about the layout
persistence (that lives in the renderer + layout service).

## Renderer architecture

### Entity layer

Extend `Session` type in `src/entities/session/session.types.ts` with
`primarySurface`.

`src/entities/session/session.api.ts` — wrap the new
`session:setPrimarySurface` IPC.

New module `src/entities/terminal/terminal-layout.api.ts`:

- `getLayout(sessionId)` → `Promise<PersistedPaneTree | null>`
- `saveLayout(sessionId, tree)` → `Promise<void>` (renderer-side
  debouncer wraps this)
- `flush()` → `Promise<void>` (called on app close hook from main, but
  also from window beforeunload as a best-effort backup)

### Store layer

`session.model.ts`:

- Add `setPrimarySurface(id, surface)` action.
- On `setActiveSession(id)`, after loading conversation, also trigger
  `loadActiveTerminalLayout(id)` if the session has not been activated
  before in this app run.

`terminal.model.ts`:

- Add internal `restoreFromPersisted(sessionId, persisted)` action that
  walks the persisted tree, calls `terminalApi.create` for each leaf
  tab, builds the live `PaneTree`, sets it in `treesBySessionId`.
- Add internal save scheduler: subscribes to `treesBySessionId`
  changes, debounces 300ms, calls `terminalLayoutApi.saveLayout`.
- Add `loadActiveTerminalLayout(sessionId)` orchestration action that
  fetches the persisted tree and dispatches `restoreFromPersisted` if
  found.

### Feature layer

New feature slice `src/features/session-intent-dialog/`:

```
src/features/session-intent-dialog/
├── session-intent-dialog.container.tsx
├── session-intent-dialog.presentational.tsx
├── session-intent-dialog.styles.ts
├── session-intent-dialog.container.test.tsx
└── index.ts
```

- Two-card chooser: Conversation / Terminal.
- On Conversation: closes self, opens the existing
  `session-create` dialog.
- On Terminal: closes self, opens the new `terminal-session-create`
  dialog.

New feature slice `src/features/terminal-session-create/`:

```
src/features/terminal-session-create/
├── terminal-session-create.container.tsx
├── terminal-session-create.presentational.tsx
├── terminal-session-create.styles.ts
├── terminal-session-create.container.test.tsx
└── index.ts
```

- Fields: `name`, `workspace` (optional, picker reused from existing
  session-create).
- On submit: calls `sessionStore.create({ ..., providerId: 'shell',
primarySurface: 'terminal' })`, sets active, returns.

### Widget layer

`src/widgets/workspace-layout/` (new) replaces the slot inside
`App.layout.tsx`:

```
src/widgets/workspace-layout/
├── workspace-layout.container.tsx     # reads activeSession.primarySurface
├── workspace-layout.presentational.tsx # arranges main + dock per surface
├── workspace-layout.styles.ts
└── index.ts
```

The widget mounts:

- Main slot: `SessionView` if conversation-primary, `TerminalDock` if
  terminal-primary.
- Dock slot: the other one.

The existing `TerminalDock` widget gains a `mode: 'main' | 'dock'` prop
that adjusts only its chrome (main mode is borderless and fills the
parent; dock mode keeps the resize handle and per-session height).

`SessionView` similarly gains a `mode: 'main' | 'dock'` prop.

The existing `App.layout.tsx` is simplified to mount
`<WorkspaceLayout />` instead of inlining `<SessionView />` and
`<TerminalDock />`.

### Sidebar

`src/widgets/sidebar/` — extend the session-row presentational to
display a `>_` icon when `session.providerId === 'shell'` (or when
`session.primarySurface === 'terminal'` — the two are equivalent in V1).
No layout changes; only the leading-icon swap.

### Session header

- New "Swap primary surface" menu item in the kebab. Calls
  `setPrimarySurface(id, opposite)`. Hidden when the session is
  shell-provider and would swap to conversation-primary (V1
  restriction).
- Existing "Fork session…" item is hidden for shell-provider sessions.

### Command center

Extend `src/features/command-center/intents.ts`:

- Add `new-terminal-session` intent — opens the terminal-session-create
  dialog directly.
- Modify existing `new-session` intent — now opens the intent dialog.
- Add `swap-primary-surface` intent — visible when a session is focused.

## Keyboard shortcuts

| Shortcut        | Conversation-primary           | Terminal-primary                                |
| --------------- | ------------------------------ | ----------------------------------------------- |
| `Cmd+T`         | Open dock + new tab in focused | New tab in focused leaf                         |
| `Cmd+D`         | Split horizontally             | Split horizontally                              |
| `Cmd+Shift+D`   | Split vertically               | Split vertically                                |
| `Cmd+W`         | Close focused tab              | Close focused tab                               |
| `Cmd+\`` (tick) | Toggle terminal dock           | Toggle terminal dock (no-op — terminal is main) |
| `Cmd+J`         | (unused — passed through)      | Toggle conversation dock                        |
| `Cmd+K`         | Open command center            | Open command center                             |

## Testing strategy

### Pure-layer tests

- `terminal-layout.pure.test.ts` — serialize/deserialize round-trip,
  validate accepts good shapes and rejects bad ones (split with one
  child, sizes summing to 50, leaf with no tabs, activeTabId not in
  tabs, duplicate ids).
- Existing `pane-tree.pure.test.ts` is unchanged; layout serialization
  is a sibling concern.

### Service-layer tests

- `terminal-layout.service.test.ts` — get/save/clear round-trip against
  in-memory better-sqlite3, cascade on session delete.
- `shell.provider.test.ts` — `start` returns idle handle, `oneShot` and
  `sendMessage` throw.
- `session.service.test.ts` (extension) — `create` accepts
  `primarySurface`, `setPrimarySurface` mutates and broadcasts,
  `sendMessage` rejects shell sessions.

### Renderer unit tests

- `session-intent-dialog.container.test.tsx` — Conversation routes to
  existing wizard, Terminal routes to terminal wizard, cancel closes.
- `terminal-session-create.container.test.tsx` — submit creates session
  with `providerId: 'shell'`, `primarySurface: 'terminal'`; workspace
  picker round-trips; name validation.
- `workspace-layout.container.test.tsx` — primarySurface=conversation
  renders SessionView main / TerminalDock dock; primarySurface=terminal
  renders TerminalDock main / SessionView dock.
- `terminal.model.test.ts` (extension) — `restoreFromPersisted` rebuilds
  tree calling `terminalApi.create` once per leaf tab; save scheduler
  debounces and persists.

### Manual QA checklist

- Create new session → intent dialog appears with two cards.
- Pick Conversation → existing wizard, existing behavior.
- Pick Terminal → minimal wizard, on create the terminal pane tree
  fills the main area with one shell in the workspace path (or project
  root if no workspace).
- Split the terminal vertically and horizontally; open multiple tabs;
  resize; close tabs.
- Switch to a different session, switch back: pane tree still present,
  same shape (PTYs are fresh — that is expected).
- Quit and relaunch the app: the terminal-primary session restores its
  pane tree shape; running processes are gone; CWDs are correct.
- Press `Cmd+J` in a terminal-primary session: empty conversation dock
  with the placeholder message appears at the bottom; press again to
  hide.
- Press `Cmd+`` in a conversation-primary session: dock toggles; layout
  persists across restart.
- Open a conversation-primary session, press `Cmd+T`, split, quit and
  relaunch: dock layout restores.
- Sidebar: terminal-primary sessions show `>_` icon; conversation
  sessions show provider icons.
- Cmd+K → "Switch to session" lists all sessions across kinds.
- Cmd+K → "New terminal session" routes directly to the terminal
  wizard.
- Session header → "Swap primary surface" works for a conversation
  session that has a terminal pane; reverts cleanly.
- Fork dialog is hidden for terminal-primary sessions.
- Naming pipeline does not run for shell sessions (verify via logs).

## Risks and mitigations

- **Persistence inflation** — pane trees with many tabs across many
  sessions could accumulate. Mitigation: debounced writes, single row
  per session (UPSERT, not append-log), schema cascades on session
  delete. Layout JSON is small (KB, not MB) even for 20-tab trees.
- **Restore performance** — spawning many PTYs synchronously on session
  activation could slow first-render. Mitigation: spawn lazily — only
  for the _visible_ leaves' active tabs first, then background tabs in
  next tick. Acceptable because hidden tabs won't render until clicked
  anyway. (Defer this optimization until measured; V1 spawns
  eagerly and accepts the cost.)
- **Stale CWDs after workspace deletion** — covered: fall back to
  `session.workingDirectory`, then to project root, then surface
  per-tab error.
- **Shell provider leaks into provider pickers** — mitigation:
  `isConversationalProvider` filter in every provider-selection UI;
  unit-test the filter against a mocked registry that includes shell.
- **Cmd+J collision** — `Cmd+J` is currently unused in the app
  (verified during scoping). If a future feature wants it, the
  conversation toggle gets remapped.
- **Existing terminal dock persistence regression** — conversation-primary
  dock layout persistence is _new behavior_. Test that sessions that
  never opened a terminal dock get no layout row written, and that a
  closed dock (`tree === null`) clears the row rather than persisting
  an empty shape.

## Deferred / future work

- **tmux integration** for live state preservation (scrollback,
  running processes survive restart). Separate spec.
- **Convert kind**: promote a shell-provider session to a real
  conversation session by attaching a provider; demote a conversation
  session to shell-only.
- **Terminal session fork**: defer until a useful semantic exists
  (clone the workspace? clone the layout? unclear yet).
- **Sidebar filter by kind** (conversation / terminal toggles).
- **Top-level "Open terminal on workspace"** entry that does not
  materialize a session row — only worth doing if shell sessions feel
  too heavy.
- **Multi-window terminal popouts** — the long-standing iTerm-replacement
  question. Not in scope here.
- **Search across scrollback** — depends on tmux integration.
- **Per-tab shell selection** (zsh vs fish vs bash) — V1 always uses
  the resolved default shell, same as today.
- **Windows parity** — inherited deferral from Phase 9.
