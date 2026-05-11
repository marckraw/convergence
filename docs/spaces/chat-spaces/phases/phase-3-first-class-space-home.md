# Phase 3: First-Class Space Home

## Product Goal

Make clicking a Space open a first-class main Chat view with tabs and a new
attempt path.

## Current Repo State

- Chat Surface can render either a new global chat composer or a selected
  Session conversation.
- Initiative Workboard currently holds most detail UI in a dialog.
- The reusable conversation surface is already shared by Chat and Code.

## Contracts To Introduce

- `SpaceHome` widget in the Chat surface.
- Tabs: Chats, Sources, Memory, Artifacts, Brief.
- New attempt creation path that links the created global Session to the Space.

## Out Of Scope

- Deep Sources/Memory/Artifacts behavior.
- Moving existing chats into Spaces.
- Automatic context injection.

## Tests

- Space home empty state and tab rendering.
- New attempt creation orchestration.
- Attempt list rendering and reopen behavior.

## Manual Checks

1. Open a Space from Chat sidebar.
2. Start a new attempt in the Space.
3. Send a message.
4. Confirm the attempt appears in the Space home and sidebar expansion.

## Known Risks

- The Space home should not become a modal inside the transcript; it is a main
  Chat view.
