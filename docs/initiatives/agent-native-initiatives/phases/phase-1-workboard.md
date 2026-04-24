# Phase 1: Lightweight Workboard

## Product Goal

Expose global Initiative navigation and creation without changing the existing
project/session sidebar model.

Phase 1 should make the smallest useful version of Initiatives visible:

- open a global Workboard
- create an Initiative with only a title
- view all Initiatives across projects
- edit title, status, and current understanding
- see compact attempt/output counts and updated time

## Current Repo State

Phase 0 added the persisted Initiative domain:

- `electron/backend/initiative`
- `src/entities/initiative`
- preload and IPC methods under `window.electronAPI.initiative`

The current app already has global dialog patterns:

- dialog state lives in `src/entities/dialog`
- global feature dialogs are mounted from `src/app/App.container.tsx`
- command palette dialog entries are built in
  `src/features/command-center/command-palette-index.pure.ts`
- sidebar footer hosts low-noise global surfaces such as Providers, MCP
  Servers, and What's New

Phase 1 should use these patterns. It should not add Initiatives into the
project tree yet, and it should not change session selection behavior.

## Implementation Plan

Add an `initiative-workboard` feature slice with:

- `initiative-workboard.container.tsx`
- `initiative-workboard.presentational.tsx`
- focused tests
- public export from `src/features`

Add a new dialog kind:

```text
initiative-workboard
```

Expose it through:

- the command palette Dialogs section
- a compact sidebar footer row

The container will use `useInitiativeStore` to load Initiatives when the
Workboard opens. It will also load attempts and outputs for visible
Initiatives so the Workboard can show counts without adding a new backend
summary endpoint yet.

The UI will keep one selected Initiative inside the Workboard. Empty state,
list, create form, and edit panel all live in the dialog. Saving is explicit.

## Contracts

No backend schema changes are expected in this phase.

Renderer contracts:

- create: `createInitiative({ title })`
- update: `updateInitiative(id, { title, status, currentUnderstanding })`
- count attempts from `attemptsByInitiativeId[id]`
- count outputs from `outputsByInitiativeId[id]`

## Out Of Scope

- linking sessions as Attempts
- create Initiative from session
- Initiative side panel inside session view
- output creation/editing UI
- AI synthesis or suggested updates
- Workboard filtering, grouping, or kanban states
- archive behavior

## Tests

Add or update tests for:

- command palette exposes the Workboard dialog
- Workboard empty state
- title-only create flow
- selecting and editing title/status/current understanding
- container open/load orchestration

## Manual Checks

Run `npm run dev`, then verify:

1. Open the Workboard from the sidebar footer.
2. Open the Workboard from the command palette.
3. With no Initiatives, the empty state is clear.
4. Create an Initiative with only a title.
5. Confirm the new Initiative appears in the Workboard.
6. Edit title, status, and current understanding, then save.
7. Restart the app and confirm the Initiative persists.
8. Confirm normal project/session sidebar navigation still behaves as before.

## Risks

Attempt/output counts are loaded per Initiative in the renderer for Phase 1.
That is acceptable for the lightweight V1 surface, but a later phase may add a
backend list-summary endpoint if the Workboard becomes large.
