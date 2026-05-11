# Phase 6: Space Brief, Memory, And Context Preview

## Product Goal

Make Space context useful while keeping provider-visible injection explicit.

## Current Repo State

- Project context injection exists and should stay project-scoped.
- ADR 0002 requires explicit Initiative/Space context injection.
- Composer already has context-aware behavior for project vs global sessions.

## Contracts To Introduce

- Editable Space brief.
- Editable Space memory/instructions.
- Optional markdown-backed memory file under `memory/`.
- New attempt context preview and toggles.

## Out Of Scope

- Automatic memory synthesis.
- Semantic retrieval from sources.
- Hidden default injection.

## Tests

- Brief/memory persistence.
- Context selection model.
- Provider start receives only selected context.
- Project context behavior unchanged.

## Manual Checks

1. Add brief and instructions.
2. Start an attempt with Space context included.
3. Start another attempt with Space context disabled.
4. Confirm the UI previews the difference before send.

## Known Risks

- Do not overload Project Context Items for Space memory.
