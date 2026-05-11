# Phase 2: Chat Sidebar Spaces

## Product Goal

Make Spaces visible and selectable inside Chat while preserving loose chats.

## Current Repo State

- `GlobalChatSessionList` renders a flat list of global Sessions.
- `Sidebar` switches between Code and Chat behavior.
- Chat surface already has independent active global Session state.

## Contracts To Introduce

- Chat sidebar state for selected Space and expanded Space ids.
- Space list loading in Chat sidebar.
- Ungrouped global chat filtering.
- Space row with expand/collapse and linked Attempt rows.

## Out Of Scope

- Full Space home tabs beyond selecting a placeholder/home route.
- Moving existing chats into Spaces.
- Filesystem sources.

## Tests

- Sidebar rendering tests for Spaces, ungrouped chats, active selection, and
  expanded attempts.
- Store/container tests for selecting Space vs selecting Attempt.

## Manual Checks

1. Switch to Chat.
2. Confirm Spaces render above ungrouped chats.
3. Click a Space and confirm main view changes.
4. Expand a Space and open an Attempt.
5. Switch to Code and confirm the Project tree is unchanged.

## Known Risks

- Do not mix Code workspace tree state with Chat Space expansion state.
