# Use TanStack Router For Main View Navigation

## Status

Accepted.

## Context

Convergence has outgrown hand-rolled main view selection.

The renderer currently has several separate mechanisms for deciding what the
user sees in the Main View:

- `activeSurface` chooses between Code and Chat.
- `WorkspaceLayout` chooses conversation, terminal-primary, or Code Review
  with local conditionals and entity-store flags.
- Chat Space and draft state live as local `AppShell` state.
- Many persistent product areas still start as dialogs because there is no
  shared route seam for new Main Views.

This made first-class Code Review behave like a layer. Opening Code Review set
a global `isReviewOpen` flag, and selecting a Session changed
`activeSessionId` without replacing the Code Review Main View.

The product model is clearer:

- Code and Chat remain top-level app surfaces.
- Persistent screens inside those surfaces are Main Views.
- Temporary workflows remain Modal Tasks.
- Entity stores own data, loading, and mutations. Routes own visibility and
  durable view parameters.

## Decision

Use TanStack Router for renderer Main View navigation.

Convergence will use:

- `@tanstack/react-router`
- `@tanstack/router-plugin` for file-based route generation
- hash history for packaged Electron builds

Route files live under `src/app/routes`. They are thin app-layer adapters that
compose widgets and features from the existing FSD-lite layers. Product logic
must stay in widgets, features, entities, and shared modules.

## Why TanStack Router

TanStack Router is a better fit for Convergence than React Router for this
decision because:

- It has first-class type-safe route params and search params.
- It treats search params as structured, validated state, which matches
  Convergence views like Code Review with target, mode, selected file, and
  filters.
- It supports hash history and memory history, both suitable for Electron.
- Its route tree gives a single seam for navigation while preserving FSD-lite
  locality through thin route adapters.
- It avoids inventing a custom router while still keeping persistent view state
  outside entity stores.

React Router remains a mature option, but its strongest mode for modern type
safety is Framework Mode, which brings more full-stack and deployment
machinery than this Electron renderer needs. React Router Data Mode would work,
but it offers less leverage for Convergence's typed search-parameter-heavy
navigation model.

## Route Ownership Rules

- Routes decide which Main View is visible.
- Entity stores decide what data exists and how it loads or mutates.
- Command Center, sidebar rows, notification toasts, and feature actions must
  navigate through shared route helpers instead of setting independent view
  flags.
- Persistent product areas should become Main View Routes by default.
- Dialogs are reserved for Modal Tasks.

## Initial Route Shape

The initial route tree should model existing product areas without changing
visible behavior:

```text
/
/code/session/$sessionId
/code/session/new?workspaceId=
/code/review?projectId=&targetId=&mode=&file=
/chat/session/$sessionId
/chat/space/$spaceId
```

Exact route names may change during implementation if a thinner migration path
requires it, but the ownership rule should not change.

## Consequences

- `isReviewOpen` stops being a rendering control flag.
- Selecting a Session replaces the Code Review Main View by navigating to a
  Session route.
- Command Center and sidebar navigation gain one shared route seam.
- Browser-style back and forward navigation become meaningful inside the
  Electron window.
- Future Main Views, such as Settings, Insights, Space home, Pull Request
  review, or Project dashboards, can be introduced without adding new global
  booleans to entity stores.
- Some generated router files will appear in the repository. Formatting and
  verification must treat them as normal source artifacts.

## References

- TanStack Router route trees: https://tanstack.com/router/latest/docs/routing/route-trees
- TanStack Router history types: https://tanstack.com/router/latest/docs/guide/history-types
- TanStack Router search params: https://tanstack.com/router/latest/docs/guide/search-params
- React Router modes: https://reactrouter.com/start/modes
- React Router type safety: https://reactrouter.com/explanation/type-safety
