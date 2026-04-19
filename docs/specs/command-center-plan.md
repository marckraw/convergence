# Implementation Plan: Command Center (Cmd+K Palette)

Companion plan for `docs/specs/command-center.md`. Read the spec first — this
document only refines the spec's 8-slice outline into verifiable tasks.

## Overview

Ship a global Cmd+K command palette that lets the user jump across projects,
workspaces, and sessions, plus open the five footer dialogs, without the
mouse. Ranking is fuzzy-weighted via Fuse.js; UI shell is cmdk wrapped in the
existing Radix Dialog. The palette's target scale is ~20 projects × ~40 live
sessions, so the plan lands two structural substrates **before** the palette
feature itself: a shared dialog store, and a cross-project workspace index.

## Architecture decisions (locked by the spec)

- **cmdk + Fuse.js**, not a home-grown matcher. `shouldFilter={false}` on
  cmdk; Fuse does the ranking.
- **In-app keyboard handler**, not Electron `globalShortcut`.
- **Global workspaces** = new `listAll` IPC + `globalWorkspaces` field on
  `useWorkspaceStore` (mirror of the existing `globalSessions` pattern).
- **Shared dialog store** = new `src/entities/dialog/` slice replaces local
  `useState` in all five dialog containers.
- **`switchToSession` intent** = single cross-project hop function, reused by
  both palette and the existing sidebar NeedsYou click.
- **Terminal Cmd+K** keeps its existing shortcut (`kind: 'clear'`) but the
  handler is scoped to terminal focus. Behaviour change is deliberate and
  called out in release notes.
- **Vertical slicing**. Each phase ends with a user-observable checkpoint.
  Substrate phases (dialog store, global workspaces) are themselves
  shippable as standalone refactors with no palette dependency.

## Dependency graph

```
                                                  ┌── T11 polish / a11y / release notes
                                                  │
T4 pure modules ──┐                               │
                  │                               │
T1 dialog slice ──┤                               │
                  ├── T7 palette feature (nav) ──┬┴── T9 creation intents
T2 globalWSes ────┤                              │
                  │                              │
T3 recency ───────┘                              │
                                                 │
                              T8 sidebar intent refactor
                              (depends on T7's intents file)

T10 terminal focus guard — independent, lands any time after T7 lands
                           (or before, as a standalone fix)

T0 add libs (cmdk, fuse.js) — prerequisite for T4 and T7
```

T0 is trivial and should run first. T1, T2, T3 are independent substrate
refactors that can be picked up in parallel. T4 (pure modules) is
independent of T1-T3 since it operates on in-memory inputs. T7 needs
T1+T2+T3+T4. T10 is independent — can land before or after T7.

---

## Task list

### Phase 0 — Dependencies

#### Task 0: Add `cmdk` and `fuse.js` to package.json

**Description:** Install the two runtime libraries required by later phases.
No code that uses them yet. Separate from the feature slice so the diff is
small and reviewable in isolation.

**Acceptance criteria:**

- [ ] `cmdk` added to `dependencies` at a currently-maintained version.
- [ ] `fuse.js` added to `dependencies` at a currently-maintained version.
- [ ] `npm install` completes clean with an updated `package-lock.json`.
- [ ] No import of either library exists in source yet (grep-verified).
- [ ] Changeset entry if the repo requires one for dependency bumps.

**Verification:**

- [ ] `npm install`
- [ ] `npm run test:pure`
- [ ] `npm run test:unit`
- [ ] `npm run typecheck`
- [ ] `chaperone check --fix`

**Dependencies:** None.

**Files touched:**

- `package.json`
- `package-lock.json`

**Scope:** XS.

---

### Phase 1 — Dialog entity slice (substrate)

#### Task 1: Introduce `src/entities/dialog/` slice

**Description:** Create a tiny Zustand slice that owns the identity of the
currently-open dialog. Replaces per-container `useState` in five feature
containers. Atomic — no palette code yet.

**Acceptance criteria:**

- [ ] `src/entities/dialog/dialog.types.ts` exports a `DialogKind` union with exactly: `'app-settings' | 'project-settings' | 'providers' | 'mcp-servers' | 'release-notes'`.
- [ ] `src/entities/dialog/dialog.model.ts` exports `useDialogStore` with state `{ openDialog: DialogKind | null }` and actions `open(kind)`, `close()`. Opening a new kind while one is already open replaces it.
- [ ] `src/entities/dialog/index.ts` re-exports the store and types.
- [ ] Each of the five dialog containers (`app-settings`, `project-settings`, `mcp-servers`, `provider-status`, `release-notes`) replaces its local `useState` pair with selectors on `useDialogStore`. The trigger button calls `useDialogStore.getState().open('<kind>')`.
- [ ] `McpServersDialogContainer` stops accepting `projectId` / `projectName` props and instead subscribes to `useProjectStore` for the active project. The sidebar trigger button mounts the container without props.
- [ ] Every dialog still opens via its existing button and still closes via Esc / outside-click / explicit close button. No observable behaviour change.
- [ ] Unit tests:
  - [ ] `dialog.model.test.ts` — open, close, open-replaces-open.
  - [ ] At least one dialog container test updated to verify it subscribes to the store and opens on store mutation.

**Verification:**

- [ ] `npm run test:pure`
- [ ] `npm run test:unit`
- [ ] `npm run typecheck`
- [ ] `chaperone check --fix`
- [ ] Manual: click every footer dialog button in the sidebar. Each opens, Esc closes. MCP dialog shows the current active project.

**Dependencies:** None.

**Files touched:**

- `src/entities/dialog/dialog.types.ts` (new)
- `src/entities/dialog/dialog.model.ts` (new)
- `src/entities/dialog/dialog.model.test.ts` (new)
- `src/entities/dialog/index.ts` (new)
- `src/features/app-settings/app-settings.container.tsx`
- `src/features/project-settings/project-settings.container.tsx`
- `src/features/mcp-servers/mcp-servers.container.tsx`
- `src/features/provider-status/provider-status.container.tsx`
- `src/features/release-notes/release-notes.container.tsx`
- `src/widgets/sidebar/sidebar.container.tsx` (MCP dialog no longer takes props)
- Existing container tests for any of the five dialogs (update as needed)

**Scope:** M.

---

### Checkpoint A — Dialog store live

- [ ] All five footer dialogs open/close unchanged for the user.
- [ ] Tests + typecheck + chaperone green.
- [ ] No component outside `src/entities/dialog/` owns dialog-open boolean state for these five dialogs.

---

### Phase 2 — Global workspaces (substrate)

#### Task 2a: Backend `workspace:listAll` + IPC + preload

**Description:** Extend the backend workspace service with a list-everything
endpoint, expose it over IPC, bridge through preload. Pure plumbing; no
renderer consumer yet.

**Acceptance criteria:**

- [ ] `WorkspaceService.listAll()` returns every row in the workspaces table without project filtering.
- [ ] `workspace:getAll` IPC handler registered in `electron/main/ipc.ts` returning `listAll()`'s result.
- [ ] `electron/preload/index.ts` exposes `window.electronAPI.workspace.getAll(): Promise<Workspace[]>`.
- [ ] Unit test in `workspace.service.test.ts` covers: returns empty when no workspaces; returns rows from multiple projects in a single call.
- [ ] Devtools smoke: `await window.electronAPI.workspace.getAll()` returns an array whose length equals the sum of per-project lists.

**Verification:**

- [ ] `npm run test:unit -- workspace`
- [ ] `npm run typecheck`
- [ ] `chaperone check --fix`
- [ ] Manual devtools smoke described above.

**Dependencies:** None.

**Files touched:**

- `electron/backend/workspace/workspace.service.ts`
- `electron/backend/workspace/workspace.service.test.ts`
- `electron/main/ipc.ts`
- `electron/preload/index.ts`

**Scope:** S.

---

#### Task 2b: `useWorkspaceStore.globalWorkspaces` + `loadGlobalWorkspaces`

**Description:** Add the cross-project workspace state to the renderer store
and keep it fresh on create/delete. Mirrors the existing `globalSessions`
pattern in `useSessionStore`.

**Acceptance criteria:**

- [ ] `workspace.api.ts` gains `getAll(): Promise<Workspace[]>`.
- [ ] `useWorkspaceStore` gains `globalWorkspaces: Workspace[]` (default `[]`) and `loadGlobalWorkspaces(): Promise<void>`.
- [ ] `createWorkspace(projectId, branchName)` and `deleteWorkspace(id, projectId)` both refresh `globalWorkspaces` in addition to the project-scoped `workspaces` list.
- [ ] `App.container.tsx` calls `loadGlobalWorkspaces` on mount alongside the existing `loadGlobalSessions` call. Failure toasts through the existing error channel.
- [ ] Unit test in `workspace.model.test.ts`:
  - [ ] `loadGlobalWorkspaces` populates `globalWorkspaces`.
  - [ ] `createWorkspace` updates both lists.
  - [ ] `deleteWorkspace` removes from both lists.

**Verification:**

- [ ] `npm run test:unit -- workspace`
- [ ] `npm run typecheck`
- [ ] `chaperone check --fix`
- [ ] Manual: create a workspace in project A, switch to project B, inspect `useWorkspaceStore.getState().globalWorkspaces` in devtools — workspace from A is visible.

**Dependencies:** T2a.

**Files touched:**

- `src/entities/workspace/workspace.api.ts`
- `src/entities/workspace/workspace.model.ts`
- `src/entities/workspace/workspace.model.test.ts`
- `src/app/App.container.tsx`

**Scope:** S-M.

---

### Checkpoint B — Global workspace index live

- [ ] `globalWorkspaces` contains every workspace across every project on app boot.
- [ ] Create/delete keeps it in sync.
- [ ] No UI consumer yet.

---

### Phase 3 — Recency (substrate)

#### Task 3: `recentSessionIds` on `useSessionStore` with persistence

**Description:** Track the last 10 sessions the user has activated or
created. Persist to the existing `app_state` KV table under key
`recent_session_ids`. No UI consumer yet.

**Acceptance criteria:**

- [ ] `electron/backend/session/session.service.ts` (or a thin new helper) exposes `getRecentSessionIds()` and `setRecentSessionIds(ids: string[])` using `StateService` under key `recent_session_ids`. Values stored as JSON string.
- [ ] IPC handlers `session:getRecentIds` and `session:setRecentIds` added to `electron/main/ipc.ts`.
- [ ] Preload exposes `session.getRecentIds` and `session.setRecentIds`.
- [ ] `session.api.ts` wraps the preload calls.
- [ ] `useSessionStore` gains:
  - [ ] `recentSessionIds: string[]` (default `[]`).
  - [ ] `loadRecents(): Promise<void>` — reads from backend, prunes ids missing from `globalSessions`.
  - [ ] `recordRecentSession(id: string)` — prepends id, dedupes, caps at 10, schedules a persist.
- [ ] `setActiveSession(id)` calls `recordRecentSession(id)` when id is non-null.
- [ ] `createAndStartSession` calls `recordRecentSession(session.id)` on success.
- [ ] `deleteSession` removes the id from `recentSessionIds` and persists.
- [ ] `App.container.tsx` calls `loadRecents()` in the same effect that calls `loadGlobalSessions()` (and after it, so pruning sees fresh sessions).
- [ ] Unit tests in `session.model.test.ts`:
  - [ ] Recording a new id prepends and dedupes.
  - [ ] Cap at 10 enforced.
  - [ ] Pruning drops ids missing from `globalSessions` on load.
  - [ ] Delete removes from recents.
- [ ] Unit test for the backend recency getter/setter round-trip.

**Verification:**

- [ ] `npm run test:pure`
- [ ] `npm run test:unit`
- [ ] `npm run typecheck`
- [ ] `chaperone check --fix`
- [ ] Manual: activate a few sessions, quit app, relaunch. Devtools `useSessionStore.getState().recentSessionIds` returns them in activation order.

**Dependencies:** None (but ordering-wise land after T2b to keep store diffs isolated).

**Files touched:**

- `electron/backend/session/session.service.ts` (extend) or new helper file
- `electron/backend/session/session.service.test.ts` (extend)
- `electron/main/ipc.ts`
- `electron/preload/index.ts`
- `src/entities/session/session.api.ts`
- `src/entities/session/session.model.ts`
- `src/entities/session/session.model.test.ts`
- `src/app/App.container.tsx`

**Scope:** M.

---

### Checkpoint C — All substrates live

- [ ] Dialog store, global workspaces, recency all shipped and stable.
- [ ] No user-visible feature yet.
- [ ] Zero regressions in existing flows: sidebar navigation, project switching, dialog open/close, workspace create/delete, session create/activate.
- [ ] All gates green (`test:pure`, `test:unit`, `typecheck`, `chaperone check --fix`).

---

### Phase 4 — Pure palette modules

#### Task 4: `command-palette-trigger.pure.ts`, `command-palette-index.pure.ts`, `command-palette-ranking.pure.ts`

**Description:** Pure functions that the container will compose. No React,
no Zustand imports, no Electron. Covers shortcut matching, palette item
composition, curated sections, and Fuse ranking glue.

**Acceptance criteria:**

- [ ] `src/features/command-center/command-palette-trigger.pure.ts` exports `matchPaletteShortcut(event: KeyEventLike, platform: 'mac' | 'other'): boolean`. Returns true only for bare `Cmd+K` on mac and bare `Ctrl+K` on other. Rejects shift/alt/opposite-modifier variants. `KeyEventLike` mirrors the one in `keymap.pure.ts`.
- [ ] `src/features/command-center/command-palette-index.pure.ts` exports `buildPaletteIndex(input): PaletteItem[]` where `input = { projects, workspaces, sessions, recentSessionIds, dismissals }` and `PaletteItem` is a discriminated union with kinds `'project' | 'workspace' | 'session' | 'dialog' | 'new-session' | 'new-workspace'`. Filters archived sessions; does not filter dismissed sessions at the index level (section builder handles that).
- [ ] `src/features/command-center/command-palette-ranking.pure.ts` exports:
  - [ ] `buildCuratedSections(items, dismissals, recents): CuratedSections` — returns the six empty-query sections in the spec's order with the caps described.
  - [ ] `rankForQuery(items, query, fuse): RankedItem[]` — takes a Fuse instance (constructed by the caller with the weights from the spec) and returns sorted hits. Attention boost deliberately not applied here.
- [ ] Pure unit tests:
  - [ ] `command-palette-trigger.pure.test.ts` — mac vs other, modifier variants, non-K keys.
  - [ ] `command-palette-index.pure.test.ts` — archived filtered; all five dialog kinds emitted; workspace + project creation actions emitted per project and per workspace; recent sessions surface in the index exactly once.
  - [ ] `command-palette-ranking.pure.test.ts` — section ordering; NeedsYou priority; recents exclude sessions already in attention sections; Fuse weights produce `session.name` matches ranked above `provider.id` matches for a given fixture.

**Verification:**

- [ ] `npm run test:pure`
- [ ] `npm run typecheck`
- [ ] `chaperone check --fix`

**Dependencies:** T0 (for Fuse import in the ranking module).

**Files touched:**

- `src/features/command-center/command-palette-trigger.pure.ts` (new)
- `src/features/command-center/command-palette-index.pure.ts` (new)
- `src/features/command-center/command-palette-ranking.pure.ts` (new)
- `src/features/command-center/command-center.types.ts` (new — `PaletteItem`, `CuratedSections`, `RankedItem`)
- Pure test files for each of the three modules
- `src/features/command-center/index.ts` (new — re-exports the pure API for later phases)

**Scope:** M.

---

### Checkpoint D — Pure core proven

- [ ] All three pure modules have green tests exercising the edge cases above.
- [ ] No React, Zustand, or Electron imports in any `.pure.ts` file (grep-verified).

---

### Phase 5 — Palette feature (navigation)

#### Task 5: Intents module + `switchToSession` extraction

**Description:** Create `src/features/command-center/intents.ts` with the
navigation intents. Extract the cross-project hop currently inlined in
`sidebar.container.tsx:handleSelectNeedsYouSession` into `switchToSession`.
NeedsYou click refactor is a separate task (T8) to keep the diffs small.

**Acceptance criteria:**

- [ ] `intents.ts` exports `switchToSession(sessionId)`, `activateProject(projectId)`, `openDialog(kind)`. Each uses `useXxxStore.getState()` calls + awaited actions. No React imports.
- [ ] `switchToSession` reproduces today's NeedsYou hop exactly: `prepareForProject` → `setActiveProject` → parallel load workspaces, current branch, sessions → `setActiveSession`.
- [ ] `activateProject` does the same sequence but leaves `activeSessionId` null.
- [ ] `openDialog(kind)` is a one-liner over `useDialogStore`.
- [ ] Unit test for intents using fake store implementations:
  - [ ] `switchToSession` calls the four loads in parallel and sets active session last.
  - [ ] `switchToSession` short-circuits when session's project is already active.
  - [ ] `activateProject` does not touch `activeSessionId`.

**Verification:**

- [ ] `npm run test:unit -- command-center`
- [ ] `npm run typecheck`
- [ ] `chaperone check --fix`

**Dependencies:** T1 (dialog store for `openDialog`), T2b (global workspaces needed for the palette but intents don't import them directly — order is enforced by the feature as a whole).

**Files touched:**

- `src/features/command-center/intents.ts` (new)
- `src/features/command-center/intents.test.ts` (new)

**Scope:** S-M.

---

#### Task 6: Palette container + presentational + trigger wiring

**Description:** Build the palette UI itself. Container owns open state,
keydown listener, Fuse instance lifecycle, and intent dispatch.
Presentational renders input + sectioned results. Wire the `Cmd+K` listener
in `App.container.tsx`.

**Acceptance criteria:**

- [ ] New Zustand slice `useCommandCenterStore` with `{ isOpen: boolean, query: string, open(), close(), setQuery() }`. Opening clears query.
- [ ] `command-center.presentational.tsx` renders a Radix Dialog wrapping cmdk's `Command` with `shouldFilter={false}`. Props-only; no store imports.
- [ ] `command-center.container.tsx`:
  - [ ] Subscribes to `useCommandCenterStore`, `useProjectStore`, `useWorkspaceStore` (`globalWorkspaces`), `useSessionStore` (`globalSessions`, `recentSessionIds`, `needsYouDismissals`), `useDialogStore`.
  - [ ] Registers a `window.addEventListener('keydown', handler, true)` on mount that calls `matchPaletteShortcut` and toggles open/close. `preventDefault` + `stopPropagation` on match only.
  - [ ] Builds the Fuse index once per open, using the memoised output of `buildPaletteIndex`.
  - [ ] Dispatches `switchToSession`, `activateProject`, or `openDialog` on result select; then closes.
- [ ] `App.container.tsx` mounts `CommandCenterContainer` once at the app shell level.
- [ ] Creation intents and terminal focus guard are **not** wired yet (T9, T10).
- [ ] Results visible in v1 of the palette: projects, workspaces (selecting activates owning project), sessions, dialogs. NeedsYou boosting works for empty query only.
- [ ] Unit tests:
  - [ ] Container test: opening via `open()` renders the sections in the expected order given a fixture store.
  - [ ] Container test: typing a query calls `rankForQuery` and shows the ranked list (single section, no curated headers).
  - [ ] Container test: selecting a session in another project dispatches `switchToSession`.
  - [ ] Container test: `Escape` and re-triggered `Cmd+K` both close.

**Verification:**

- [ ] `npm run test:unit -- command-center`
- [ ] `npm run typecheck`
- [ ] `chaperone check --fix`
- [ ] Manual: `Cmd+K` opens palette from anywhere in the app (outside terminal focus). Arrow keys cross sections. Enter on a session in another project performs the hop and closes the palette.

**Dependencies:** T1, T2b, T3, T4, T5, T0.

**Files touched:**

- `src/features/command-center/command-center.container.tsx` (new)
- `src/features/command-center/command-center.presentational.tsx` (new)
- `src/features/command-center/command-center.model.ts` (new — `useCommandCenterStore`)
- `src/features/command-center/command-center.container.test.tsx` (new)
- `src/features/command-center/command-center.styles.ts` (new, if needed)
- `src/features/command-center/index.ts` (extend — export `CommandCenterContainer`)
- `src/app/App.container.tsx`

**Scope:** L.

**Task 6 is the only "large" task in the plan. If it feels too big at
implementation time, split the container tests from the presentational into
6a (Zustand slice + presentational with fixture props) and 6b (container
wiring + keydown + intent dispatch).**

---

#### Task 7: Refactor sidebar NeedsYou click to call `switchToSession`

**Description:** Replace `sidebar.container.tsx:handleSelectNeedsYouSession`
body with a call to the new intent. Pure refactor; no behaviour change.

**Acceptance criteria:**

- [ ] `handleSelectNeedsYouSession` body reduced to `await switchToSession(sessionId); onSelect(sessionId)` (or collapsed entirely if `onSelect` becomes redundant given the intent sets active session — confirm before collapsing).
- [ ] No functional change observable to users: clicking a NeedsYou item still hops projects and activates the session.
- [ ] Existing sidebar tests still pass, or are updated minimally to reflect the intent call.

**Verification:**

- [ ] `npm run test:unit -- sidebar`
- [ ] `npm run typecheck`
- [ ] `chaperone check --fix`
- [ ] Manual: open NeedsYou section, click an item in a non-active project. Hop behaviour identical to pre-change.

**Dependencies:** T5.

**Files touched:**

- `src/widgets/sidebar/sidebar.container.tsx`
- Existing sidebar tests (minor updates)

**Scope:** XS-S.

---

### Checkpoint E — Palette navigation live

- [ ] `Cmd+K` opens from anywhere outside the terminal. (Terminal conflict handled in T10.)
- [ ] Empty-query view shows curated sections in spec order.
- [ ] Typed-query view is ranked by Fuse.
- [ ] Selecting any result dispatches the correct intent.
- [ ] NeedsYou click still works, now routed through the shared intent.
- [ ] All dialog open via palette.
- [ ] No visible regression in existing flows.
- [ ] Gates green.

---

### Phase 6 — Creation intents

#### Task 8: `beginSessionDraft` and `beginWorkspaceDraft` intents + palette results

**Description:** Surface "New session in `<workspace>`" and "New workspace
in `<project>`" as palette results under typed queries, wire them to the
corresponding draft intents.

**Acceptance criteria:**

- [ ] `intents.ts` gains `beginSessionDraft(workspaceId)` and `beginWorkspaceDraft(projectId)`. Each first calls `activateProject` for the owning project if not active, then sets the corresponding draft state. For `beginWorkspaceDraft`, the minimum v1 outcome is that the user lands on the project with the sidebar tree in a state where the "New workspace" affordance is visible (per spec open question).
- [ ] `buildPaletteIndex` already emits these kinds (verified in T4); wire their presentational rendering and intent dispatch in the container. Creation items appear **only** under typed queries in v1.
- [ ] Typing a workspace branch name or `new` surfaces at least the `beginSessionDraft` actions for matching workspaces.
- [ ] Unit tests for the two intents using fake stores.
- [ ] Container test: typed query shows "New session in `<branch>`" for the matching workspace and dispatches the intent on select.

**Verification:**

- [ ] `npm run test:unit -- command-center`
- [ ] `npm run typecheck`
- [ ] `chaperone check --fix`
- [ ] Manual: with the palette open, type a workspace branch name. Select "New session in `<branch>`". The session-start form opens targeting that workspace.

**Dependencies:** T6.

**Files touched:**

- `src/features/command-center/intents.ts`
- `src/features/command-center/intents.test.ts`
- `src/features/command-center/command-center.container.tsx`
- `src/features/command-center/command-center.container.test.tsx`

**Scope:** M.

---

### Checkpoint F — Creation intents live

- [ ] Palette can start a new session in any workspace from any project.
- [ ] Palette can begin a new workspace in any project.
- [ ] Hopping to the owning project still happens if needed.

---

### Phase 7 — Terminal focus gating (regression guardrail)

#### Task 9: Scope terminal keydown handler to terminal focus

**Description:** Prevent terminal Cmd+K (clear) from firing when the user's
focus is outside the terminal dock. Only user-visible behaviour change in
the plan — calls out in release notes.

**Acceptance criteria:**

- [ ] `terminal-dock.container.tsx` attaches a ref to the dock root div.
- [ ] The existing keydown handler calls `matchShortcut` only if `dockRootRef.current?.contains(document.activeElement)` is true. Otherwise returns without `preventDefault` / `stopPropagation`.
- [ ] Palette Cmd+K now wins whenever focus is outside the terminal dock (verified manually after integration with T6).
- [ ] Cmd+K still clears the terminal when the user has clicked into the xterm pane first.
- [ ] All other terminal shortcuts (`Cmd+T`, splits, focus-adjacent, clear, toggle-dock) still work from terminal focus.
- [ ] Unit test / behaviour test (where practical) asserts the handler's early return when `document.activeElement` is outside the dock root.

**Verification:**

- [ ] `npm run test:unit -- terminal-dock`
- [ ] `npm run typecheck`
- [ ] `chaperone check --fix`
- [ ] Manual:
  - Click sidebar, press `Cmd+K`: palette opens.
  - Click into terminal, press `Cmd+K`: terminal clears, palette does not open.
  - Click terminal, then `Escape` or click into a session message, press `Cmd+K`: palette opens.

**Dependencies:** None formally, but most observable once T6 ships. Can land before T6 if the palette is not yet routed; its effect is only that terminal clear becomes focus-scoped.

**Files touched:**

- `src/widgets/terminal-dock/terminal-dock.container.tsx`
- Existing terminal-dock test (if present) — extend for the focus-guard behaviour
- `CHANGELOG.md` / release notes entry in the `What's New` dialog (handled in T11)

**Scope:** S.

---

### Checkpoint G — Terminal Cmd+K no longer steals the palette

- [ ] Regression guardrails 1 and 4 from the spec validated manually.
- [ ] Terminal clear still reachable by clicking into the terminal first.

---

### Phase 8 — Polish and release

#### Task 10: Accessibility, empty-state copy, release notes, changeset

**Description:** The final polish pass. No new features. Validates
accessibility, finalises copy, documents behaviour changes.

**Acceptance criteria:**

- [ ] Result list follows the WAI combobox + listbox pattern. `aria-activedescendant` tracks the highlighted result. Every result has an accessible label that includes entity kind.
- [ ] Empty-state copy written for:
  - [ ] No results for a query (include a hint: "Try a session name, branch, or project").
  - [ ] No recents yet.
- [ ] Section headers match the spec exactly: `Waiting on You`, `Needs Review`, `Recent Sessions`, `Projects`, `Workspaces`, `Dialogs`.
- [ ] Release notes entry in the `What's New` dialog describing the new palette and the terminal Cmd+K focus-scoping.
- [ ] Changeset file if required by the repo's release flow (see `docs/specs/release-distribution-and-changelog.md`).
- [ ] Keyboard-only QA pass: every palette interaction reachable without the mouse.
- [ ] No `console.log` or dead-code leftovers under `src/features/command-center/`.

**Verification:**

- [ ] `npm run test:pure`
- [ ] `npm run test:unit`
- [ ] `npm run typecheck`
- [ ] `chaperone check --fix`
- [ ] Manual keyboard-only pass.

**Dependencies:** T6, T8, T9.

**Files touched:**

- `src/features/command-center/command-center.presentational.tsx`
- Release notes source (wherever the `What's New` dialog pulls from)
- `CHANGELOG.md` or changeset directory

**Scope:** S-M.

---

### Checkpoint H — Feature complete

- [ ] All task acceptance criteria met.
- [ ] All gates (`test:pure`, `test:unit`, `typecheck`, `chaperone check --fix`) green.
- [ ] Manual end-to-end: from cold app boot, `Cmd+K`, type a session name, hit enter, land on that session across a project hop.
- [ ] Release notes and changeset landed.
- [ ] Spec open questions revisited and noted inline or in a follow-up.

---

## Parallelization opportunities

- **T0** blocks T4 and T6; run first and do not batch with anything else.
- **T1** (dialog slice), **T2a/T2b** (global workspaces), **T3** (recency) are independent substrate refactors. A team of three can land them in parallel. Solo work: do T1 → T2 → T3 in that order to keep store diffs readable.
- **T4** (pure modules) is independent of T1-T3. Can begin immediately after T0.
- **T5** (intents) depends on T1 only for `openDialog` and can otherwise start as soon as T5's signature is decided.
- **T6** (palette) is the integration point: needs T1 + T2b + T3 + T4 + T5.
- **T7** (sidebar NeedsYou refactor) only needs T5. Can land before or after T6.
- **T8** (creation intents) depends on T6.
- **T9** (terminal focus guard) is independent. Can land any time. Earlier is better so Cmd+K is available for palette QA.
- **T10** (polish) depends on T6, T8, T9.

## Risks and mitigations

| Risk                                                                                                            | Impact | Mitigation                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dialog migration lands half-done, one container still owns local state                                          | High   | T1 is atomic — all five containers migrate in the same task. No merge until every dialog is on `useDialogStore`.                                                 |
| Terminal Cmd+K focus gating surprises users                                                                     | Med    | Release notes entry in T10. Early rollout to dogfood users to validate.                                                                                          |
| Fuse weights produce poor ranking in practice                                                                   | Med    | T4 test fixtures include real-looking data; expect a follow-up tune PR once dogfooding feedback arrives.                                                         |
| `globalWorkspaces` stale after IPC-driven mutation outside the active project (e.g. some future broadcast flow) | Low    | T2b refreshes on create/delete from this app. Future IPC broadcasts can call `loadGlobalWorkspaces` the same way `onSessionUpdate` drives `handleSessionUpdate`. |
| Recency persistence races in multi-window futures                                                               | Low    | v1 is single-window. Key structure keeps migration trivial.                                                                                                      |
| Container test complexity for T6 balloons                                                                       | Med    | Pre-approved escape hatch: split T6 into 6a (store + presentational) and 6b (container + keydown + intents) if implementation time exceeds ~1 day.               |
| `switchToSession` drifts from its NeedsYou origin after T7 refactor                                             | Low    | T7 is a minimal-diff refactor. Existing sidebar test suite verifies observable behaviour.                                                                        |

## Open questions (carry over from spec)

- **`beginWorkspaceDraft` surface.** Minimum v1 is "land on project with the affordance visible." If this is too indirect, promote to an explicit prompt in a follow-up.
- **Fuse weight tuning.** Initial weights are in the spec. Expect a tuning PR after real-world usage.
- **`McpServersDialogContainer` prop migration.** Safe today because the dialog only renders for the active project. Flag for reviewers in T1.

## Verification checklist before implementation starts

- [ ] Every task has acceptance criteria and a verification step.
- [ ] Dependencies are explicit and acyclic.
- [ ] Every phase ends with a checkpoint.
- [ ] Only one "L"-sized task (T6); it has a pre-approved split plan.
- [ ] Spec and plan link to each other.
- [ ] Human has reviewed and approved this plan before T0 begins.
