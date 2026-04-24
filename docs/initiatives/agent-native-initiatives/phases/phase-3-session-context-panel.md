# Phase 3: Session View Initiative Context Panel

## Product Goal

When a linked session is selected, show the session as a focused Attempt inside
the larger Initiative context.

The sidebar remains normal project/workspace/session navigation. The change is
inside the main session view only.

## Current Repo State

Phase 2 added:

- session-to-Initiative linking from the session action menu
- `attemptsBySessionId` in `useInitiativeStore`
- Attempt rows in the Workboard with session/project context

The current session view is `src/widgets/session-view/session-view.container.tsx`.
It already owns the conversation layout, changed files side panel, and session
header actions. Phase 3 should extend that layout rather than introducing a
new route or sidebar structure.

External pattern check: contextual side panels are a good fit when a primary
record or workspace needs related context without changing the navigation
model. For Convergence, the left sidebar remains source navigation and the
right panel is contextual Initiative information for the selected session.

## Implementation Plan

Add a presentational Initiative context panel under `src/widgets/session-view`.

The `SessionView` container will:

- load Attempts for the active session
- load Initiatives when a session is selected
- choose the first linked Initiative for the active session in V1
- load Attempts and Outputs for that Initiative
- render the panel on the right when a linked Initiative exists
- keep unlinked sessions on the existing layout

The panel will show:

- Initiative title and status
- current understanding
- linked Attempts with role, primary marker, project/session context
- Outputs if any exist
- action to open the full Workboard focused on the Initiative

## Contracts

No backend contract changes are expected.

Renderer behavior:

- `openDialog('initiative-workboard', { initiativeId })` opens the Workboard
  focused on the Initiative from the panel.
- standalone sessions render without the panel.
- linked sessions render `conversation | Initiative panel`.

## Out Of Scope

- terminal-primary layout work
- editing inside the side panel
- output CRUD
- AI synthesis
- multiple linked Initiative selection UI
- sidebar Initiative tree state

## Tests

Add or update tests for:

- unlinked session does not render the Initiative context panel
- linked session renders the panel
- panel opens the Workboard focused on the Initiative
- panel reflects current understanding from store state

## Manual Checks

Run `npm run dev`, then verify:

1. Open an unlinked session and confirm the session view looks unchanged.
2. Open a linked session and confirm the Initiative context panel appears on
   the right.
3. Confirm the sidebar is still only project/workspace/session navigation.
4. Open the Workboard from the panel.
5. Edit current understanding in the Workboard, save, and confirm the panel
   reflects the updated text.
6. Switch between linked and unlinked sessions and confirm the layout updates.
7. Confirm the composer remains usable in the linked layout.

## Risks

The right-side panel shares space with the existing changed-files drawer. In
V1 this is acceptable as a pragmatic layout; a later phase may consolidate
right-side surfaces if they compete too much.
