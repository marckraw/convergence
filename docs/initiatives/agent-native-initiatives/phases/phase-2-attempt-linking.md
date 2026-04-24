# Phase 2: Attempt Linking

## Product Goal

Make existing sessions attachable to Initiatives and visible as Attempts.

This phase turns Initiatives from standalone records into real delivery
containers for session work, while preserving the current sidebar model.

## Current Repo State

Phase 0 added Initiative persistence and renderer store actions for Attempts.
Phase 1 added the global Workboard dialog and command/sidebar entry.

Relevant current patterns:

- Session actions live in the session header overflow menu inside
  `src/widgets/session-view/session-view.container.tsx`.
- Dialog state lives in `src/entities/dialog`.
- Workboard UI lives in `src/features/initiative-workboard`.
- Global sessions, projects, and workspaces are already available in renderer
  stores and can provide the context needed for Attempt rows.

No external research is needed for this phase. The work is local product and
repo architecture.

## Implementation Plan

Add an Initiative/session linking dialog:

- open from the active session overflow menu
- create a new Initiative from the current session
- link the current session as a `seed` primary Attempt for create-from-session
- attach the current session to an existing Initiative with a chosen role
- show linked Initiatives for the current session
- allow detaching the current session from an Initiative

Extend Initiative APIs/store with:

- list Attempts by session id
- cache `attemptsBySessionId` in `useInitiativeStore`

Extend the Workboard selected Initiative panel:

- render Attempts with session name, project name, branch/workspace, provider,
  session status/attention, role, and primary marker
- allow role changes
- allow marking one Attempt primary
- allow detaching Attempts

The Workboard remains a dialog in this phase. The session view side panel is
still Phase 3.

## Contracts

Backend/IPC contract:

- `initiative.listAttemptsForSession(sessionId): InitiativeAttempt[]`

Renderer store contracts:

- `loadAttemptsForSession(sessionId)`
- `attemptsBySessionId[sessionId]`

Session link dialog contracts:

- create Initiative title defaults to current session name
- create-from-session links as `seed` and `isPrimary: true`
- attach-existing defaults to `implementation`

## Out Of Scope

- session view Initiative side panel
- AI synthesis
- output discovery
- output CRUD
- navigating directly to an Initiative detail route
- changing sidebar tree structure

## Tests

Add or update tests for:

- store `loadAttemptsForSession`
- session link dialog create-from-session flow
- session link dialog attach-existing flow
- Workboard Attempt list rendering
- Workboard role change, primary change, and detach callbacks
- session view opens the link dialog from the overflow menu

## Manual Checks

Run `npm run dev`, then verify:

1. Open an existing session.
2. Use the session action menu to create an Initiative from that session.
3. Open the Initiative Workboard and confirm the session is listed as an
   Attempt.
4. Confirm the Attempt is marked primary.
5. Create or switch to a session from another project.
6. Attach that second session to the same Initiative.
7. Open the Initiative and confirm both Attempts are visible with project
   context.
8. Mark the second Attempt primary and confirm only one Attempt is primary.
9. Change an Attempt role and confirm it persists.
10. Detach a non-primary Attempt and confirm the Initiative remains valid.

## Risks

Attempt rows depend on global session, project, and workspace stores being
loaded. If a session has been deleted, the Workboard should still render a
fallback Attempt row instead of failing.
