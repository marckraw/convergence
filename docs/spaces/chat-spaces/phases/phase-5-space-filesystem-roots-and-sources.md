# Phase 5: Space Filesystem Roots And Sources

## Product Goal

Establish the local file model for Spaces and support file-backed Sources.

## Current Repo State

- Attachments already use app-owned `userData` storage and can provide storage
  patterns.
- Space/Initiative outputs exist but are not a general source system.

## Contracts To Introduce

```text
{userData}/spaces/{spaceId}/
  sources/
  memory/
  artifacts/
  attempts/{sessionId}/
  scratch/
```

- Backend service for ensuring Space roots and copying/removing source files.
- Source metadata API and renderer store/UI.

## Out Of Scope

- Source indexing and retrieval augmentation.
- Provider context inclusion of sources beyond metadata/selection wiring.

## Tests

- Root creation and idempotency.
- Source add/list/remove cleanup.
- Space deletion cleanup.

## Manual Checks

1. Add a small source file.
2. Confirm it appears in Sources.
3. Confirm the file exists under app-owned Space storage.
4. Remove it and confirm cleanup.

## Known Risks

- Keep user-selected source files copied into app-owned storage; do not mutate
  originals.
