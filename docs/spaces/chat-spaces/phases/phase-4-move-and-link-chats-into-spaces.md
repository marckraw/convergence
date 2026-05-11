# Phase 4: Move And Link Chats Into Spaces

## Product Goal

Let users organize existing loose chat history into Spaces.

## Current Repo State

- The existing attempt/link model prevents duplicate links.
- Global chats can currently exist without Space/Initiative links.

## Contracts To Introduce

- Move ungrouped chat into Space.
- Detach Attempt back to ungrouped.
- Create Space from chat.
- Clear delete/archive semantics.

## Out Of Scope

- Multi-Space membership for one Session unless already supported and clearly
  useful.
- Project-bound Session linking in Chat V1.

## Tests

- Link, detach, create-from-chat, duplicate prevention.
- Delete/archive edge cases.

## Manual Checks

1. Create a loose chat.
2. Move it into a Space.
3. Detach it.
4. Create a new Space from a loose chat.

## Known Risks

- Avoid deleting Sessions when only removing Space membership.
