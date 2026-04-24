# Phase 4: Initiative Detail View And Manual Outputs

## Product Goal

Make an Initiative useful as a durable delivery record by showing and editing
manual Outputs alongside the existing overview, current understanding, and
Attempts.

## Current Repo State

Phase 3 added the read-only Initiative context panel in the session view and
deep-link opening of the Workboard focused on a specific Initiative.

The Phase 0 backend, preload, renderer API, and Initiative store already
support Output CRUD:

- `listOutputs`
- `addOutput`
- `updateOutput`
- `deleteOutput`

The current Workboard dialog already acts as the Initiative detail surface:
left side for global Initiative selection, right side for selected Initiative
details. Phase 4 should deepen this surface instead of introducing another
route.

External research is not needed for this phase. Manual Output CRUD uses local
contracts and existing app UI patterns. Current external research becomes more
important in Phase 5 output discovery and Phase 6 provider-backed synthesis.

## Implementation Plan

Extend the selected Initiative detail area with an Outputs section.

The section will support:

- creating a manual Output with kind, label, value, status, and optional source
  Attempt/session through an Add Output modal
- editing existing Output fields inline
- removing an Output
- keeping Output counts in the list and metrics in sync

Use compact controls that fit the existing dialog. Do not add Decisions or Open
Questions forms in this phase.

## Contracts

No backend contract changes are expected.

Renderer additions:

- expose Output kind/status labels and option arrays from
  `src/entities/initiative`
- pass selected Initiative Outputs and Output handlers from the Workboard
  container to the presentational component
- use existing store actions:
  - `addOutput`
  - `updateOutput`
  - `deleteOutput`

## Out Of Scope

- automatic Output discovery
- GitHub API integration
- PR lifecycle tracking
- AI synthesis or suggested updates
- dedicated full-screen Initiative route
- activity history beyond existing updated timestamps

## Tests

Add or update tests for:

- rendering manual Output rows
- creating an Output
- editing Output kind, label, value, status, and source session
- deleting an Output
- container orchestration through existing store/API actions

## Manual Checks

Run `npm run dev`, then verify:

1. Open an Initiative detail view from the Workboard or session side panel.
2. Add manual Outputs:
   - one pull request URL
   - one documentation or spec file path
   - one branch name
3. Edit Output labels and statuses.
4. Attach an Output to a linked Attempt if available.
5. Remove an Output.
6. Restart the app and confirm remaining Outputs persist.
7. Open a linked session and confirm the side panel shows the current Outputs.

## Risks

The Workboard dialog is doing both list and detail work. This remains
acceptable for V1, but if Outputs make the right side too dense, a later phase
can split the detail surface into tabs or a dedicated route.
