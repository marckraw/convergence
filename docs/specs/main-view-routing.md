# Main View Routing

## Goal

Make Convergence Main Views route-driven so persistent screens are easy to
understand, navigate, test, and extend.

The immediate product fix is Code Review: it should be a real Code Main View,
not a global overlay flag that survives Session navigation. The broader product
outcome is a stable way to introduce future full-window screens without adding
ad hoc conditionals in `AppShell`, `WorkspaceLayout`, entity stores, and
Command Center.

## Source Of Truth

- ADR: `docs/adr/0005-use-tanstack-router-for-main-view-navigation.md`
- Glossary: `CONTEXT.md`
- Existing architecture: `docs/architecture/quick-reference.md`
- First-class Code Review: `docs/specs/first-class-code-review.md`
- Terminal-first layout: `docs/specs/terminal-first-class.md`
- Chat Spaces: `docs/spaces/chat-spaces/`

## Current Baseline

The renderer previously decided visible Main Views through multiple unrelated
state seams. Some compatibility seams remain during the migration:

- `src/entities/app-surface/app-surface.model.ts`
  - `activeSurface: 'code' | 'chat'`
- `src/widgets/workspace-layout/workspace-layout.container.tsx`
  - conditional layout for conversation-primary, terminal-primary, and Code
    Review
- `src/entities/code-review/code-review.model.ts`
  - `isReviewOpen` remains for compatibility, but route state controls whether
    Code Review replaces the normal Session view
- `src/app/App.layout.tsx`
  - receives route-owned Chat Space state from `App.container`; local fallback
    state exists only for non-routed test/legacy mounting
- `src/entities/dialog/`
  - modal state for many product areas, some of which are durable enough to
    become Main Views later

This works for a small app, but it has poor locality. Adding a new full-window
view requires touching unrelated conditionals and remembering cleanup rules
across callers.

## Product Model

Convergence keeps two top-level app surfaces:

- **Code Surface**: Project-oriented work: Projects, Workspaces, Sessions,
  terminal affordances, Pull Requests, Changed Files, Code Review, Project
  Settings.
- **Chat Surface**: global Agent Sessions, Spaces, Space home, attempts,
  sources, memory, artifacts.

Inside those surfaces, persistent screens are Main Views.

Examples:

- Session conversation Main View
- terminal-primary Session Main View
- Code Review Main View
- Chat Space Main View
- future Settings or Insights Main View

Temporary workflows remain Modal Tasks.

Examples:

- destructive confirmation
- short create wizard
- file picker
- transient provider status check
- small editor that should return to the exact current Main View

## Router Decision

Use TanStack Router with hash history.

The router owns Main View visibility and durable route parameters. Entity
stores own data, loading, errors, mutations, and cached selections that are not
part of navigation.

Hash history is the default implementation target because packaged Electron
loads local files and should not require a custom protocol or server rewrite
for every route.

## Route Shape

Initial route map:

```text
/
/code/sessions/$sessionId
/code/sessions/new?workspaceId=
/code/review?projectId=&targetId=&mode=&file=
/chat
/chat/session/$sessionId
/chat/space/$spaceId?draft=
```

Future route candidates:

```text
/code/workspace/$workspaceId
/code/project-settings
/code/pull-request/$pullRequestId/review
/chat/space/$spaceId/source/$sourceId
/settings?section=
/insights
```

## Route State Policy

Route params and search params should hold state that must survive refresh,
back/forward navigation, or Command Center opening:

- active Session id
- active Space id
- Code Review target id
- Code Review mode
- selected review file
- Settings section when Settings becomes a Main View
- selected Project when a route can outlive the current active Project

Entity stores should hold:

- loaded Session summaries and conversations
- Code Review targets, summaries, and patches
- Review Notes and packet previews
- Workspace lists
- provider state
- transient loading and error state

Component-local state is still appropriate for ephemeral UI details:

- popover open state
- hover state
- input drafts before submit
- local filter text that does not need history

## FSD-Lite Placement

Routes live in `src/app/routes` because they compose application-level Main
Views.

Route files must be thin:

- read params/search
- call app-level navigation helpers when needed
- compose widgets
- provide route loader glue only when it improves route locality

Routes must not become feature implementations. Durable behavior belongs in:

- `src/widgets` for composed Main Views
- `src/features` for user-facing workflows
- `src/entities` for domain state and IO wrappers
- `src/shared` for primitives and utilities

## Navigation API

Create a shared app-layer navigation interface instead of letting callers call
router APIs directly everywhere.

Suggested module:

```text
src/app/navigation/
  app-navigation.types.ts
  app-navigation.service.ts
  app-navigation.test.ts
```

Initial helpers:

- `navigateToCodeSession(sessionId)`
- `navigateToNewCodeSession(workspaceId?)`
- `navigateToCodeReview(input?)`
- `navigateToChatSession(sessionId)`
- `navigateToChatSpace(spaceId)`
- `replaceWithWelcome()`

Command Center, sidebar, notifications, and feature actions use these helpers.
The helpers may delegate to TanStack Router internally.

## Code Review Migration

Code Review becomes `/code/review`.

Rules:

- `isReviewOpen` no longer controls rendering.
- `openReview()` should either disappear or become a data-preparation helper
  that does not own visibility.
- Opening from Command Center navigates to `/code/review`.
- Opening from compact Changed Files navigates to `/code/review` with target,
  mode, and file search params.
- Selecting a Session navigates to `/code/sessions/$sessionId`, naturally
  replacing Code Review.
- The sidebar Code Review affordance moves out of the Code/Chat surface switch
  cluster. It can live in Tools or rely on Command Center.

## Terminal And Session Layout

Terminal-primary remains Session-owned through `session.primarySurface`.

The route chooses the Session:

```text
/code/sessions/$sessionId
```

`WorkspaceLayout` chooses conversation-primary or terminal-primary for that
Session. This keeps terminal as a first-class Session surface without making it
a separate top-level app surface.

## Chat Migration

Chat routes replace `AppShell` local state for:

- selected global Session
- selected Space
- draft Space attempt

The Chat sidebar should navigate to `/chat`, `/chat/session/$sessionId`, or
`/chat/space/$spaceId?draft=`. `ChatSurface` receives route-derived params from
`AppShell`; local AppShell fallback state is retained only for non-routed
legacy/test mounting.

## Dialog Promotion Policy

Before adding a new dialog, ask whether the workflow is a Main View or a Modal
Task.

Promote to Main View when:

- the user may spend more than a short moment there
- the screen has internal tabs, filters, or durable selections
- the screen should be reachable from Command Center
- back/forward should return to it
- it benefits from deep linking or route restoration

Keep as Modal Task when:

- it blocks a single action
- it should return to the current Main View immediately
- it is a confirmation or short wizard
- it has no meaningful history destination

Likely future promotions:

- App Settings
- Insights
- Space Workboard or Space home
- Project Settings
- Prompt Library

## Testing Strategy

Each migration slice must cover:

- direct route render
- sidebar navigation
- Command Center navigation where applicable
- back/forward behavior where applicable
- refresh or remount behavior with route params
- entity stores no longer owning Main View visibility

Router tests should avoid over-mocking the route seam. The useful seam is:

- route input -> rendered Main View
- navigation helper -> expected route
- route params/search -> expected widget props or store action

## Acceptance Criteria

- TanStack Router is installed and configured with hash history.
- The existing Code and Chat visible behavior remains intact after router
  bootstrap.
- Code Session, Chat Session, and Space navigation use routes.
- Code Review is addressable as a Code Main View route.
- Selecting a Session while Code Review is visible replaces Code Review without
  caller-specific cleanup.
- Command Center routes persistent destinations through the shared navigation
  interface.
- Dialog usage is documented as Modal Task usage, not a default for persistent
  screens.
- Required verification gates pass after each phase.

## Non-Goals

- No SSR or server rendering.
- No custom Electron protocol for clean browser-history URLs in V1.
- No wholesale rewrite of entity stores.
- No conversion of every dialog in the first migration.
- No URL compatibility promise for pre-router app states.
