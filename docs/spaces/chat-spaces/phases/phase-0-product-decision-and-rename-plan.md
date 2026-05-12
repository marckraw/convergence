# Phase 0: Product Decision And Rename Plan

## Product Goal

Record the product decision that **Space** is the chat-first context container
above Sessions, replacing the earlier Initiative naming. Publish the
implementation plan into Linear so future agents can pick up one phase at a
time without losing the full product picture.

## Current Repo State

- Global chat Sessions already exist via `Session.contextKind = 'global'`.
- Chat currently shows a flat global Session list.
- The Initiative domain already persists a global container, linked Sessions as
  Attempts, and Outputs.
- Initiative UI exists mainly as a dialog/workboard, not as a first-class Chat
  destination.
- Code surface Project/Workspace behavior is separate and must not regress.

## Contracts Introduced

- ADR: Space is the Chat context container.
- Product spec: `docs/spaces/chat-spaces/product-spec.md`.
- Implementation plan: `docs/spaces/chat-spaces/implementation-plan.md`.
- Linear parent and child issues in the `convergence` project.

## Out Of Scope

- No app code changes.
- No database migrations.
- No UI rename yet.
- No filesystem service implementation.

## Tests

No new automated tests are expected in this phase.

## Manual Checks

None.

## Known Risks

- Existing docs still use Initiative language. That is acceptable until Phase 1
  begins the implementation rename.
- The plan intentionally keeps Spaces inside Chat for V1; future cross-surface
  Space support is deferred.
