# Main View Routing Plan

Companion to `docs/specs/main-view-routing.md`.

Execution tracking lives in Linear under the `convergence` project. Keep this
plan focused on durable sequencing and resume context. Mark checkboxes as work
lands.

Each phase ends with the repo-required gates:

- `npm install`
- `npm run typecheck`
- `npm run test:pure`
- `npm run test:unit`
- `chaperone check --fix`

Use the Node version from `.nvmrc` for all Node-backed commands.

## Phase V0 - Decision And Planning

Goal: record the product language, router decision, and migration plan.

- [x] Add Main View routing glossary terms to `CONTEXT.md`.
- [x] Add ADR for TanStack Router and hash history.
- [x] Add durable Main View routing spec.
- [x] Add this implementation plan.
- [x] Create Linear issues for the implementation slices.

Verification: docs and Linear tasks exist. Full repo gates run once after the
docs land.

## Phase V1 - Router Bootstrap With Behavior Parity

Goal: TanStack Router exists in the renderer, but visible behavior stays the
same.

- [x] Install `@tanstack/react-router` and `@tanstack/router-plugin`.
- [x] Configure the Electron Vite renderer build to generate the route tree.
- [x] Configure hash history.
- [x] Add `src/app/routes/__root.tsx`.
- [x] Add initial routes that render the current app shell without changing
      navigation behavior.
- [x] Add a route-aware test harness for component tests.
- [x] Keep existing `useAppSurfaceStore` callers working during the bridge.
- [x] Keep the default database location unchanged while allowing an explicit
      `CONVERGENCE_USER_DATA_DIR` override for alternate local app data.
- [x] Tests:
  - [x] app shell renders from the router root
  - [x] default route preserves current startup behavior
  - [x] generated route tree is included in typecheck and formatting
  - [x] explicit `CONVERGENCE_USER_DATA_DIR` override is covered by a pure test

Verification: existing app behavior remains visually unchanged.

## Phase V2 - Code Session Routes

Goal: Code Session navigation flows through routes.

- [x] Add `/code/sessions/$sessionId`.
- [x] Add `/code/sessions/new?workspaceId=`.
- [x] Route loader/effect activates the correct Project when a Session belongs
      to another Project.
- [x] Sidebar code Session rows navigate to `/code/sessions/$sessionId`.
- [x] Command Center Session selection navigates to the Session route when
      mounted through the routed app shell.
- [x] Command Center new-session entry points navigate to the new-session route
      while preserving the existing wizard behind that route.
- [x] `WorkspaceLayout` reads the active route and Session instead of relying
      on app-wide active-surface conditionals where practical.
- [ ] Tests:
  - [x] direct route opens the expected Session
  - [ ] cross-project Session route loads the Project and Session
  - [ ] terminal-primary Session still renders terminal as the primary view
  - [ ] back/forward returns between recent Code Session routes

Verification: Code Session and terminal-primary workflows behave as before,
but route history now reflects the selected Session.

## Phase V3 - Chat Session And Space Routes

Goal: Chat Session and Space selection moves out of `AppShell` local state.

- [x] Add `/chat/session/$sessionId`.
- [x] Add `/chat/space/$spaceId`.
- [x] Add `/chat` for the route-owned empty/new global chat view.
- [x] Move `selectedChatSpaceId` and `draftChatSpaceId` route state out of
      `AppShell`.
- [x] Chat sidebar rows navigate to Chat routes.
- [x] Command Center global Session selection navigates to
      `/chat/session/$sessionId`.
- [x] Space home and Space attempt entry points navigate through the router.
- [ ] Tests:
  - [x] direct Chat Session route renders the correct conversation
  - [x] direct Space route is wired into the app shell
  - [x] New chat clears Space route state through navigation
  - [ ] Chat route back/forward preserves expected selected Space or Session

Verification: Chat Surface behavior is unchanged, but selected Session/Space is
recoverable from the route.

## Phase V4 - Code Review Main View Route

Goal: Code Review becomes a Code Main View instead of an overlay flag.

- [x] Add `/code/review?projectId=&targetId=&mode=&file=`.
- [x] Route search validates Code Review mode and optional file/target ids.
- [x] Command Center `Open Code Review` navigates to `/code/review`.
- [x] Compact Changed Files `Open full review` navigates with target, mode, and
      selected file search params.
- [x] Remove `isReviewOpen` as a rendering control.
- [x] Keep Code Review store responsible for targets, summaries, patches,
      loading, errors, and selected data only when not route-owned.
- [x] Move or remove the sidebar Code Review icon from the Code/Chat surface
      switch cluster. If retained, place it in Tools.
- [x] Tests:
  - [x] direct Code Review route is wired into the app shell
  - [x] route search preselects target, mode, and file
    - [x] mode and file are applied through the compatibility store
    - [x] target id selects the matching target after target loading
  - [x] selecting a Session while on Code Review navigates away and clears the
        temporary review overlay flag
  - [x] Code Review no longer suppresses terminal docks or Session views except
        when its route is active

Verification: the original bug is fixed by route replacement, not by extra
cleanup conditionals.

## Phase V5 - Central Navigation Interface

Goal: callers use one app-layer navigation seam instead of mixing router calls,
store flags, and local state mutations.

- [x] Add `src/app/navigation/`.
- [x] Implement typed helpers:
  - [x] `navigateToCodeSession`
  - [x] `navigateToNewCodeSession`
  - [x] `navigateToCodeReview`
  - [x] `navigateToChatSession`
  - [x] `navigateToChatSpace`
  - [x] `replaceWithWelcome`
- [x] Refactor Command Center intents to use the helper interface.
- [x] Refactor notification click routing to use the helper interface.
- [x] Refactor sidebar route-producing handlers to use the helper interface.
- [x] Remove obsolete app-surface setters from callers that only navigate.
- [x] Tests:
  - [x] helper input maps to expected routes
  - [x] Command Center no longer sets independent surface state for routed
        destinations
  - [x] notification routes preserve existing cross-project behavior

Verification: adding a future Main View requires adding a route and helper, not
touching unrelated store booleans.

## Phase V6 - Hardening And Follow-Up Promotions

Goal: make route-driven Main Views durable and document the next promotions.

- [x] Audit remaining dialogs and classify each as Main View candidate or Modal
      Task.
- [x] Add route restoration behavior for startup, invalid Session ids, missing
      Projects, archived Sessions, and removed Worktrees.
- [x] Add route-level not-found and empty-state handling.
- [x] Add user-facing fallback for stale Code Review target ids.
- [x] Remove obsolete `activeSurface` or narrow it to a derived compatibility
      helper if possible.
- [x] Update specs that mention dialog-vs-route assumptions:
  - [x] `docs/specs/global-app-settings.md`
  - [x] `docs/specs/local-analytics-insights.md`
  - [x] `docs/specs/first-class-code-review.md`
- [x] Tests:
  - [x] invalid route fallbacks
  - [x] app restart/remount with hash route
  - [x] route docs stay consistent with app navigation helpers

Verification: router architecture is stable enough for future Settings,
Insights, Project Settings, and Space home promotion work.

## Linear Ticket Breakdown

Parent:

- `MAR-1266` - Router feature: route-driven Main Views

Child issues:

1. `MAR-1267` - Bootstrap TanStack Router with behavior parity.
2. `MAR-1268` - Route Code Session and terminal-primary Main Views.
3. `MAR-1269` - Route Chat Sessions and Spaces.
4. `MAR-1270` - Promote Code Review to a Code Main View route.
5. `MAR-1271` - Centralize Command Center, sidebar, and notification
   navigation.
6. `MAR-1272` - Harden route fallbacks and document future Main View
   promotions.
