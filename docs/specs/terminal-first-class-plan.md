# Terminal as a First-Class Citizen — Implementation Plan

Companion to `docs/specs/terminal-first-class.md`. Work is sliced into
seven phases, each independently shippable and verified before the next
begins. After each phase, run the four gates: `npm install`,
`npm run test:pure`, `npm run test:unit`, `npm run typecheck`, and
`chaperone check --fix`.

## Phase T1 — Schema, types, shell provider scaffold

Goal: the data model and the synthetic provider exist, with no UI
changes and no behavior changes for existing sessions.

- [x] Migration: add `primary_surface TEXT NOT NULL DEFAULT 'conversation'`
      to `sessions`. Schema lives in `electron/backend/database/database.ts`
      (no separate migration files in this codebase).
- [x] Migration: create `session_terminal_layout` table per spec
      (same file).
- [x] Extend `SessionRow` in `electron/backend/database/database.types.ts`
      and `Session` in `electron/backend/session/session.types.ts` with
      `primarySurface`. Update `sessionSummaryFromRow`.
- [x] Extend renderer `Session` in `src/entities/session/session.types.ts`
      with `primarySurface`.
- [x] Add `kind: 'conversation' | 'shell'` to `ProviderDescriptor` in
      the provider type module. Default existing descriptors to
      `'conversation'`.
- [x] Add `isConversationalProvider(descriptor): boolean` helper in
      `electron/backend/provider/provider.pure.ts` (and a renderer-side
      helper in `src/entities/session/session.types.ts`); unit-tested.
- [x] Create `electron/backend/provider/shell/`:
  - [x] `shell-provider.ts` — `ShellProvider` exporting a
        `ProviderDescriptor` with `id: 'shell'`, `kind: 'shell'`,
        empty models, no-op `start`, throwing `sendMessage`.
  - [x] `shell-provider.test.ts` — asserts the throwing behavior and
        the idle session handle shape.
  - [x] `index.ts`.
- [x] Register the shell provider in the provider registry bootstrap
      (`electron/main/index.ts`).
- [x] Filter shell out of provider pickers used by conversation flows
      (filter at `session.model.ts` `loadProviders` — single funnel into
      the renderer store).

Verification: four gates pass. Existing sessions still load, render,
and behave identically. The shell provider is registered but unused.

## Phase T2 — Terminal layout persistence backend

Goal: pane-tree snapshots can be persisted and restored end-to-end via
IPC. No renderer behavior change yet.

- [x] Create `electron/backend/terminal/layout/`:
  - [x] `terminal-layout.types.ts` — `PersistedPaneTree`,
        `PersistedLeaf`, `PersistedSplit` per spec.
  - [x] `terminal-layout.pure.ts`:
    - [x] `validatePersistedTree(input: unknown): PersistedPaneTree` —
          type-validates, throws on malformed input, enforces invariants
          in-line (split has ≥2 children, sizes sum to ~100, leaf has
          ≥1 tab, activeTabId in tabs, all ids unique, ≤20 depth).
    - [x] `tryValidatePersistedTree` — safe variant returning a
          structured `{ tree, error }` object.
    - Note: shape validation is folded into `validatePersistedTree`
      rather than a separate helper — keeps a single parse entry point.
  - [x] `terminal-layout.pure.test.ts` — positive + every validation
        branch.
  - [x] `terminal-layout.repository.ts` — better-sqlite3 prepared
        statements for `get`, `upsert`, `delete`.
  - [x] `terminal-layout.service.ts` — `TerminalLayoutService` exposing
        `getLayout`, `saveLayout`, `clearLayout`. Validates input and
        drops corrupt stored rows silently.
  - [x] `terminal-layout.service.test.ts` — round-trip against an
        in-memory database, cascade on session delete, corrupt-row
        recovery.
- [x] IPC handlers in `electron/backend/terminal/terminal.ipc.ts`:
  - [x] `terminalLayout:get(sessionId)`
  - [x] `terminalLayout:save(sessionId, tree)`
  - [x] `terminalLayout:clear(sessionId)` — renamed from `flush`; a
        synchronous coalescing flush would require a main-side buffer
        that does not exist in V1.
- [x] Preload expose these handlers under
      `window.electronAPI.terminalLayout` in `electron/preload/index.ts`.
- [x] Wire `TerminalLayoutService` into `electron/main/index.ts`.

Verification: four gates pass. Devtools console can call
`window.electronAPI.terminalLayout.save(...)` and `.get(...)` against a
real session and see the JSON round-trip in the database.

## Phase T3 — Renderer persistence: save scheduler + restore

Goal: terminal pane trees auto-save on change and auto-restore on
session activation. Applies to both conversation-primary and (future)
terminal-primary sessions.

- [x] Create `src/entities/terminal/terminal-layout.api.ts` —
      preload-exposed wrappers for `get`, `save`, `clear`.
- [x] Create `src/entities/terminal/terminal-layout.pure.ts` —
      `serializePaneTree` strips runtime tab fields (pid, shell,
      status, exitCode).
- [x] Create `src/entities/terminal/terminal-layout.types.ts` —
      renderer-side `PersistedPaneTree` types mirroring the backend
      contract.
- [x] Re-export from `src/entities/terminal/index.ts`.
- [x] Extend `terminal.model.ts`:
  - [x] `restoreFromPersisted({ sessionId, persisted, cols, rows })` —
        walks the persisted tree, calls `terminalApi.create` for each
        leaf tab to spawn a fresh PTY, builds the live `PaneTree`,
        sets it in `treesBySessionId`. No-op when a live tree already
        exists.
  - [x] `loadPersistedLayout(sessionId)` — fetches via API; returns
        the persisted tree or null (callers pair with
        `restoreFromPersisted` when they have cols/rows).
  - [x] Save scheduler: after each tree-mutating action, schedule a
        300ms-debounced call. Per-session debounce. Null tree issues
        `clearLayout` instead of `saveLayout`.
  - [x] `flushPersistedSaves` action drains pending timers and
        persists immediately; app shell can call it on unload.
- [x] Tests in `terminal.model.test.ts` — restore spawns one PTY per
      tab and builds matching shape, restore is a no-op when a tree
      already exists, save scheduler debounces, multiple rapid
      mutations collapse to one save, closeAll triggers clear, flush
      drains pending timers.
- Deferred to T4: triggering restore from `session.model.setActiveSession`
  (widgets own cols/rows; the `TerminalDock mode="main"` container in
  T4 reads cwd/cols/rows and calls `openFirstPane` which will adopt
  the persisted-layout branch in a future iteration).

Verification: four gates pass. Manual: create dock terminal in a
conversation session, split it, quit and relaunch — dock appears with
same tree shape, fresh shells in correct CWDs.

## Phase T4 — Layout flip: WorkspaceLayout widget

Goal: a session whose `primarySurface` is `'terminal'` renders the
terminal pane tree in the main slot and the SessionView in the dock
slot. No new sessions can yet be created with `primarySurface: 'terminal'`
(blocked until T6 wizard); test by manually toggling a row in dev DB.

- [x] Add `mode?: 'main' | 'dock'` prop to existing `TerminalDock`.
      `'main'`: borderless, fills parent, no resize handle, no
      dockVisible gating; auto-opens first pane when the session has
      no tree yet. `'dock'`: unchanged.
- Deferred — `SessionView` does not get a `mode` prop in V1. The
  conversation slot for terminal-primary sessions is a placeholder
  card; shell sessions have no transcript to render at the bottom.
- [x] Create `src/widgets/workspace-layout/`:
  - [x] `workspace-layout.container.tsx` — reads
        `activeSession.primarySurface`, picks the arrangement, and
        owns the `Cmd+J` handler for toggling the conversation dock in
        terminal-primary sessions.
  - [x] `workspace-layout.presentational.tsx` — pure layout: takes
        `mainSlot`, optional `dockSlot`, and `dockVisible` flag.
  - [x] `conversation-dock-placeholder.presentational.tsx` — the
        terminal-primary empty-state companion (chaperone enforces one
        component per presentational file, hence the split).
  - [x] `workspace-layout.styles.ts`.
  - [x] `workspace-layout.container.test.tsx` — conversation-primary
        renders SessionView main + TerminalDock dock; terminal-primary
        renders TerminalDock main and shows the placeholder only after
        `Cmd+J`; `Cmd+J` is a no-op in conversation-primary mode.
  - [x] `index.ts`.
- [x] Update `src/app/App.layout.tsx` to mount `<WorkspaceLayout />`
      inside the main panel; the separate bottom-edge `<TerminalDock />`
      sibling is gone (the workspace layout owns the dock slot now).
- [x] `Cmd+J` shortcut lives in `workspace-layout.container.tsx` —
      toggles the conversation dock for terminal-primary sessions and
      is ignored otherwise.
- [x] TerminalDock drops the `toggle-dock` (`Cmd+`) shortcut in
      `'main'` mode so nothing can hide the terminal when it is the
      main surface.
- [x] Auto-opening the first pane lives inside
      `TerminalDockContainer` when mounted with `mode="main"` — the
      first mount for a fresh terminal-primary session spawns a single
      leaf+tab in `session.workingDirectory`.

Verification: four gates pass. Manual: with a hand-edited DB row
(`UPDATE sessions SET primary_surface='terminal' WHERE id=...`), the
session renders with the terminal as main, conversation hidden, `Cmd+J`
reveals the empty conversation dock.

## Phase T5 — Service guards + setPrimarySurface IPC

Goal: backend services correctly handle shell-provider sessions and
support flipping `primarySurface` at runtime.

- [x] Extend `SessionService`:
  - [x] Accept `primarySurface` on `create` (landed in T1, default
        `'conversation'`).
  - [x] New `setPrimarySurface(id, surface)` — mutates row, broadcasts
        `session:summaryUpdated`, rejects flipping shell sessions to
        conversation.
  - [x] Guard `sendMessage(id, ...)` — throws when the session's
        provider is `'shell'`.
- [x] Extend `SessionNamingService` — early-return for shell-provider
      sessions; unit-tested.
- [x] Extend `SessionForkService` — `previewSummary`, `forkFull`,
      `forkSummary` throw `SessionForkUnsupportedError` when the parent
      uses the shell provider; unit-tested.
- [x] IPC handler `session:setPrimarySurface` in
      `electron/main/ipc.ts`.
- [x] Preload exposes `window.electronAPI.session.setPrimarySurface`.
- [x] Renderer: extend `src/entities/session/session.api.ts` and add a
      `setPrimarySurface` action to the session store; the action
      applies the returned summary synchronously and relies on the
      broadcast for other consumers.

Verification: four gates pass. Devtools: flip an existing session's
primary surface via the new IPC, observe the layout switch.

## Phase T6 — Intent dialog + terminal-session-create wizard

Goal: a user can create a terminal-primary session through the UI.

- [x] Create `src/features/session-intent-dialog/`:
  - [x] `session-intent-dialog.container.tsx` — two-card chooser that
        closes itself and either calls `beginSessionDraft` (inline
        conversation flow) or opens the terminal-session-create dialog.
  - [x] `session-intent-dialog.presentational.tsx` — Conversation card + Terminal card, both keyed for automated tests.
  - [x] `session-intent-dialog.container.test.tsx` — both cards route
        correctly; cancel closes.
  - [x] `index.ts`.
  - Styles file intentionally skipped — the dialog reuses shared
    primitives; no local `*.styles.ts` earns its place yet.
- [x] Create `src/features/terminal-session-create/`:
  - [x] `terminal-session-create.container.tsx` — orchestrates name +
        workspace picker, on submit calls
        `sessionApi.create({ providerId: 'shell',
primarySurface: 'terminal', name, workspaceId })` and activates
        the new session.
  - [x] `terminal-session-create.presentational.tsx` — minimal form
        rendered through the shared `Dialog` primitives.
  - [x] `terminal-session-create.container.test.tsx` — submit creates
        with the right shape, empty-name validation surfaces an inline
        error, workspace options render.
  - [x] `index.ts`.
- [x] Extend `DialogKind` with `'session-intent'` and
      `'terminal-session-create'`; extend `DialogPayload` to include
      `{ workspaceId }`.
- [x] Mount the two containers in `src/app/App.container.tsx`
      alongside the other dialog hosts.
- [x] Sidebar `+ New session` button (`session-create-inline`) opens
      the intent dialog instead of going straight into an inline draft.
- [x] Command center intents (`src/features/command-center/intents.ts`):
  - [x] `beginSessionDraft` now opens the `session-intent` dialog
        after project hop.
  - [x] New `beginTerminalSessionDraft` opens
        `terminal-session-create` directly for keyboard-first creation.
- [x] Command center palette emits a `new-terminal-session` item per
      workspace (ranked, alongside `new-session`). Dispatcher routes it
      through `beginTerminalSessionDraft`. Presentational adds the
      describe/label cases.
- [x] Sidebar session-row presentational: shell sessions render an
      inline `TerminalSquare` glyph next to the attention badge.

Verification: four gates pass. Manual: Cmd+K → "New terminal session"
or sidebar `+` → Terminal card → fill name → terminal session created
and active with first shell open.

## Phase T7 — Swap surface + entry-point wiring + cleanup

Goal: round out the affordances and hide actions that don't apply to
shell sessions.

- [x] Session header kebab:
  - [x] Add "Show terminal/conversation as main" menu item that flips
        `primarySurface` via the session store.
  - [x] Hide the "Swap" item and "Fork session…" item entirely for
        shell-provider sessions (promoting shell to conversation is
        deferred).
- [x] Command center:
  - [x] Add `swap-primary-surface` palette item per focused session
        (non-shell); dispatcher calls a new `swapPrimarySurface` intent.
  - [x] Hide `fork-current-session` for the active session when it is
        shell-provider.
  - Deferred — `change-model` / `change-effort` intents do not exist
    as palette items today; no-op for V1.
- [x] Conversation dock placeholder for terminal-primary shell
      sessions (shipped in T4 as the workspace-layout's dock slot).
- [x] Status bar: shell sessions now render "Terminal" for the
      provider label (presentational helper special-cases `'shell'`).
- [x] Service guard tests landed alongside the guards in T5
      (`SessionService`, `SessionNamingService`, `SessionForkService`).
- [ ] Manual QA: full checklist from the spec's Testing strategy
      section. Covered by local dev runs; no automated regression for
      the Electron window itself.

Verification: four gates pass.

## Phase T8 — Changeset, docs, finalization

- [x] Changeset at `.changeset/terminal-first-class.md` describing
      the feature (minor bump).
- README update skipped — the README does not enumerate top-level
  features today. Revisit if user-facing docs are added later.
- [x] Plan boxes ticked off.
- [x] Full verification suite (`npm run typecheck`,
      `npm run test:pure`, `npm run test:unit`, `chaperone check`)
      green after every phase and once more at the end.

## Dependency ordering

- T1 (schema + shell provider) must land first; everything depends on
  the new column and the registered provider.
- T2 (layout persistence backend) and T5 (service guards +
  setPrimarySurface IPC) are independent of each other; either can
  follow T1.
- T3 (renderer persistence) depends on T2.
- T4 (WorkspaceLayout widget) depends on T1 (`primarySurface` field
  visible on `Session`). It does not depend on T3 — the layout flip
  works without persistence; persistence is orthogonal.
- T6 (intent dialog + terminal wizard) depends on T1 (shell provider)
  and T4 (so that newly-created terminal sessions render correctly).
- T7 (entry-point wiring + cleanup) depends on T5 (service guards) and
  T6 (the new flows exist).
- T8 finalizer.

T2 and T5 can be parallelized after T1. T3 and T4 can be parallelized
after T1+T2. T6 should land after T4 to avoid a window where created
terminal sessions render incorrectly.

## Out of scope (explicitly deferred to future specs)

See "Deferred / future work" in `docs/specs/terminal-first-class.md`.
Do not introduce tmux integration, kind conversion, terminal session
fork, sidebar filters, top-level workspace-terminal entry points,
multi-window popouts, scrollback search, per-tab shell selection, or
Windows parity in this feature; each deserves its own spec.
