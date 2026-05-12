# Phase 1: Rename Initiative Domain To Space

## Product Goal

Make Space the real implementation language before building more Chat UI on top
of the old Initiative naming.

## Current Repo State

- Initiative storage, services, IPC, renderer entity, Workboard, linking, and
  output handling already exist.
- User data in these tables is not considered critical, but preserving it where
  practical is still preferable.
- The old Initiative model is close to the desired Space model.

## Contracts To Introduce

- `spaces`, `space_attempts`, and `space_artifacts` tables.
- `electron/backend/space/*`.
- `src/entities/space/*`.
- `window.electronAPI.space`.
- User-facing Space copy in active UI.

## Out Of Scope

- First-class Space home.
- Sources/memory/artifacts filesystem behavior.
- Project references from Spaces.

## Tests

- Rename and update existing Initiative service/model/component tests.
- Add migration coverage for old `initiative_*` tables to new `space_*` tables.
- Confirm project Session and global Session tests still pass.

## Manual Checks

1. Start the app.
2. Confirm Code sidebar Project/Workspace behavior is unchanged.
3. Confirm the old Initiative entry uses Space language.

## Known Risks

- Mechanical rename can touch many files. Keep behavior changes minimal in this
  phase.
