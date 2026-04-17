# Phase 4: Session Attention Surface and Archive Lifecycle — Detailed Spec

> Parent: `docs/specs/project-spec.md`
> Builds on: Phase 3 (provider-neutral runtime), current sidebar/session surface implementation

## Objective

Convergence already has the basic sidebar, transcript, composer, and multi-session navigation. Phase 4 is no longer about inventing that surface from scratch. It is about making the surface operationally correct:

- the app must clearly separate what is waiting on the user from what is merely ready for review
- terminal sessions must be manageable without deleting them
- the working set must stay small through archive, not through destructive delete

This phase defines the durable attention model for the session surface and introduces archive as a first-class session lifecycle action.

## Current Baseline

The app already ships the following baseline:

- sidebar with a cross-project attention panel
- project/workspace/session tree
- dedicated session view with transcript and composer
- persisted needs-panel dismissals keyed by `session.updatedAt`
- delete session from the project tree

The current gaps are semantic, not structural:

1. actionable attention and review attention are mixed together in one flat list
2. acknowledge only hides an item from the queue; it does not reduce the session working set
3. delete is overloaded as the only durable cleanup action
4. there is no durable distinction between "I saw this" and "I am done with this session"

## Product Principles

1. **Attention is a routing system**. The app should tell the user where they are the bottleneck.
2. **Review is not the same as response**. A finished session can matter without blocking anything.
3. **Archive beats delete**. Most completed work should leave the working set without leaving history.
4. **Dismissal is queue state, not domain state**. Snooze and acknowledge belong to the attention surface, not to the session record.
5. **Archive is domain state**. It changes how the session participates in the default working set until explicitly or automatically reversed.

## Success Criteria

1. The attention panel visually separates "waiting on you" from "needs review"
2. `needs-approval` and `needs-input` can be snoozed without losing the session
3. `finished` and `failed` can be acknowledged without losing the session
4. Sessions can be archived from the attention panel and from session rows in the project tree
5. Archived sessions disappear from the default working set and from the attention panel
6. Archived sessions remain recoverable from an archived section in the UI
7. Delete remains available but clearly destructive and secondary to archive
8. If an archived session later needs user input or approval, it automatically re-enters the working set
9. All verification gates continue to pass once the implementation lands

## Scope

### In scope

- attention panel restructuring
- clear semantics for snooze, acknowledge, archive, unarchive, delete
- session schema update for archive metadata
- archive and unarchive actions in backend, preload, renderer API, store, and UI
- project tree support for archived sessions
- tests covering archive behavior and attention resurfacing
- spec cleanup to reflect the implemented sidebar/session surface baseline

### Out of scope

- redesigning the transcript/composer layout from scratch
- search and filtering across sessions
- bulk archive or bulk delete
- cross-device sync
- persisting the active session selection across refresh/restart
- changed-files or project metadata work beyond what already exists

## Terminology

### Attention kinds

- **Waiting on you**: `needs-approval`, `needs-input`
- **Needs review**: `finished`, `failed`
- **Not in attention queue**: `none`

### Queue actions

- **Snooze**: hide a waiting-on-you item until the session updates again
- **Acknowledge**: hide a needs-review item until the session updates again

These are persisted queue dismissals keyed to the session's current `updatedAt`. They do not alter the session record itself.

### Session lifecycle actions

- **Archive**: remove a session from the default working set while keeping transcript and history
- **Unarchive**: restore an archived session to the default working set
- **Delete**: permanently remove a session and its transcript data

Archive and unarchive are durable session state changes. Delete is destructive.

## UX Model

### Attention Panel

The sidebar keeps one attention surface, but it is split into two sections:

1. **Waiting on You**
2. **Needs Review**

### Waiting on You

Contains sessions with:

- `needs-approval`
- `needs-input`

Sorting:

- `needs-approval` before `needs-input`
- then newest `updatedAt` first

Primary row actions:

- open session
- snooze

### Needs Review

Contains sessions with:

- `failed`
- `finished`

Sorting:

- `failed` before `finished`
- then newest `updatedAt` first

Primary row actions:

- open session
- acknowledge
- archive

### Visibility rules

- archived sessions never appear in the attention panel
- snoozed and acknowledged items stay hidden until `updatedAt` changes
- if a session changes after being snoozed or acknowledged, it must be eligible for attention again

### Project Tree

The default project tree shows only unarchived sessions in:

- project-root sessions
- workspace session lists

An additional collapsed section appears at the bottom:

- `Archived (n)`

The archived section is per active project. It may be flat rather than grouped by workspace if that keeps the UI simpler and easier to scan.

Archived session rows must support:

- open session
- unarchive
- delete

Unarchived session rows must support:

- open session
- archive
- delete

Delete should move behind a lower-emphasis affordance than archive. An overflow menu is preferred over multiple hover icons.

### Session View

The session view remains the main inspection and response surface.

Requirements:

- opening an archived session is allowed
- archived sessions remain readable
- if the user explicitly continues an archived session, the app should unarchive it before or as part of the continuation flow
- archive state should be visible somewhere in the header or surrounding controls when an archived session is open

## Behavioral Rules

### Snooze

- valid only for `needs-approval` and `needs-input`
- persisted in the dismissal map with disposition `snoozed`
- hides the item until `session.updatedAt` changes

### Acknowledge

- valid only for `finished` and `failed`
- persisted in the dismissal map with disposition `acknowledged`
- hides the item until `session.updatedAt` changes

### Archive

- valid for terminal sessions immediately
- may also be allowed for non-terminal sessions from the project tree, but only if product behavior is clearly defined
- removes the session from the default project tree and the attention panel
- clears any dismissal entry for that session, since archive becomes the governing visibility rule

### Auto-unarchive

An archived session must automatically unarchive if either of these happens:

- its attention changes to `needs-approval`
- its attention changes to `needs-input`

It should also unarchive on explicit user continuation of the session from the archived state.

Passive terminal updates do not require auto-unarchive.

### Delete

- permanently removes the session record and transcript data
- remains available from session-row actions
- should be treated as secondary to archive in copy, placement, and styling

## Data Model

Add archive metadata to `sessions`.

### SQLite

```sql
ALTER TABLE sessions ADD COLUMN archived_at TEXT;
```

Rules:

- `archived_at IS NULL` means active working-set session
- non-null `archived_at` means archived session

No separate archive table is needed for this phase.

## Renderer and Backend Types

Add:

```ts
interface Session {
  archivedAt: string | null
}
```

## Persistence Boundaries

### Session table

Owns durable lifecycle state:

- transcript
- status
- attention
- archive state

### App state

Owns attention-surface dismissals:

- snoozed items
- acknowledged items

The dismissal map remains ephemeral relative to session domain state. It should stay keyed by session id plus `updatedAt`.

## API Changes

Add session APIs for:

- `archive(id)`
- `unarchive(id)`

Existing reads may continue returning all sessions, including archived ones, with the renderer deriving:

- working set
- attention sections
- archived section

If implementation pressure suggests filtering in the service layer, that is acceptable, but the renderer must still be able to show archived sessions when needed.

## Deliverables

### Backend

- update session schema migration in `electron/backend/database/database.ts`
- extend session row typing and `sessionFromRow`
- add archive and unarchive methods in `electron/backend/session/session.service.ts`
- expose IPC handlers in `electron/main/ipc.ts`
- expose preload bridge methods in `electron/preload/index.ts`

### Renderer entity layer

- extend `Session` types with `archivedAt`
- add `archiveSession` and `unarchiveSession` actions in `src/entities/session/session.model.ts`
- ensure archive clears dismissal entries for the session
- ensure session updates can auto-unarchive when attention becomes actionable

### Sidebar / session UI

- split the attention panel into "Waiting on You" and "Needs Review"
- add archive action in the needs-review rows
- replace delete-only session-row affordances with archive-first session actions
- add an archived section to the project tree
- support unarchive from archived session rows

### Tests

- session store tests for archive, unarchive, dismissal clearing, and auto-unarchive
- sidebar tests for the two attention sections
- project tree tests for archive/unarchive actions and archived section rendering

## Implementation Order

1. Update schema, backend types, service methods, IPC, and preload
2. Extend renderer session types and store actions
3. Split the attention panel into response vs review sections
4. Add archive-first actions to session rows
5. Add archived section and unarchive flow
6. Add auto-unarchive handling for actionable attention
7. Update tests and verify behavior end to end

## Verification Gate

```bash
npm install
npm run test:pure
npm run test:unit
npm run lint
npm run typecheck
npm run build
chaperone check --fix
```

Manual verification:

- a `needs-input` or `needs-approval` session appears under "Waiting on You"
- a `finished` or `failed` session appears under "Needs Review"
- snooze hides an actionable item until the next session update
- acknowledge hides a review item until the next session update
- archive removes a session from both attention and the default project tree
- archived sessions appear under `Archived (n)`
- unarchive restores the session to the working set
- delete still removes the session entirely
- an archived session that later needs approval or input returns to the active working set automatically
