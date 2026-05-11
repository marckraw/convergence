# Phase 7: Space Artifacts

## Product Goal

Make durable outputs first-class under a Space.

## Current Repo State

- Initiative Outputs already support kind, label, value, source Session, and
  status.
- Output suggestions exist for code-oriented branch/PR cases.

## Contracts To Introduce

- `SpaceArtifact` model and UI.
- Manual artifact create/edit/delete.
- File-backed artifacts under `artifacts/`.
- Optional source Attempt reference.

## Out Of Scope

- Automatic artifact extraction unless existing code can be reused cheaply.
- Artifact versioning.
- External sync.

## Tests

- Artifact CRUD.
- File-backed artifact storage.
- Source Attempt reference handling.

## Manual Checks

1. Add a manual artifact.
2. Add a file-backed artifact.
3. Link artifact to an Attempt.
4. Reopen the Space and confirm persistence.

## Known Risks

- Keep code-specific PR/branch output suggestions from leaking into generic
  Chat Spaces unless intentionally exposed.
