# Phase 4: UI-First Session Surface — Detailed Spec

> Parent: `docs/specs/project-spec.md`
> Builds on: Phase 3 (provider system, session service, fake provider)
> Design references: Divergence (attention model), T3 Code (thread grouping), Codex (clean minimal aesthetic)

## Objective

Replace the single-page project view with a proper app layout: resizable sidebar with "needs you" attention panel and project/workspace/session tree, plus a dedicated session view with scrollable transcript and composer. This is where Convergence starts feeling like a real product.

## Design Principles

1. **Clean over complex** — closer to Codex than Divergence. No multi-pane, no tabs, no drag-reorder.
2. **Attention-first** — "Needs You" at the top of the sidebar, always visible. The app tells you what to do.
3. **Click to switch** — one session active at a time. Click sidebar item → main area loads that session.
4. **Workspace hierarchy visible** — Project → Workspaces → Sessions in a tree. Unique to Convergence.
5. **Dark mode default** — with light/system options via shadcn class strategy.

## Success Criteria

1. App has resizable sidebar + main content layout
2. Sidebar shows "Needs You" section with attention-prioritized sessions
3. Sidebar shows project tree: project → workspaces → sessions
4. Clicking a session loads its transcript in the main area
5. Transcript scrolls, auto-scrolls on new entries, renders all entry types
6. Inline approval/input cards in transcript with action buttons
7. Composer at bottom with text input + send
8. Session header shows name, status badge, provider, stop button
9. Theme toggle (dark/light/system) works
10. All Phase 0-3 verification commands still pass

## Scope

### In scope

- App layout: sidebar + main content with resizable divider
- Sidebar "Needs You" panel with prioritized sessions
- Sidebar project tree with workspace/session hierarchy
- Session view: header + transcript + composer
- Transcript rendering for all entry types (user, assistant, tool-use, tool-result, approval-request, input-request, system)
- Inline approval/deny buttons in transcript
- Auto-scroll on new transcript entries
- Theme toggle (dark/light/system)
- Create session from sidebar (per workspace or project root)
- Create workspace from sidebar
- Empty states (no project, no sessions)

### Out of scope

- Multi-pane/tab layout (Phase 6+)
- Rich Lexical editor for composer (future)
- Virtualized transcript (add when profiling shows need)
- File change panels (Phase 6)
- Drag-reorder projects/sessions
- Search/filter sessions

## Layout Spec

```
┌──────────────────────────────────────────────────────────────────┐
│ Convergence                                              _ □ x  │
├─────────────────────┬────────────────────────────────────────────┤
│                     │                                            │
│  NEEDS YOU (n)      │  Session Header                            │
│  [attention items]  │  ──────────────────────────────────────    │
│                     │                                            │
│  ───────────────    │  Transcript (scrollable)                   │
│                     │                                            │
│  PROJECT TREE       │  [entries...]                               │
│  ▼ project-name     │                                            │
│    main (n)         │  [inline approval cards]                   │
│    ▼ workspace (n)  │                                            │
│      ● session      │  ──────────────────────────────────────    │
│      ● session      │  Composer                                  │
│    ▶ workspace (n)  │  [input + send]                            │
│                     │                                            │
│  + New Project      │                                            │
│  ☀/🌙 Theme        │                                            │
└─────────────────────┴────────────────────────────────────────────┘
```

**Sidebar:** ~260px default, resizable. Two sections stacked:

- "Needs You" — sessions with `needs-approval` or `needs-input`, sorted by priority
- Project tree — expandable workspaces with session lists and count badges

**Main area:** Fills remaining width.

- Header: session name, attention badge, provider, stop button
- Transcript: full-height scroll container
- Composer: fixed at bottom

**No session selected:** Show empty state with prompt to start a session.

## Attention Priority (from Divergence)

| Priority    | State            | Visual      | Action        |
| ----------- | ---------------- | ----------- | ------------- |
| 1 (highest) | `needs-approval` | Amber badge | Approve/Deny  |
| 2           | `needs-input`    | Blue badge  | Type response |
| 3           | `failed`         | Red badge   | Inspect       |
| 4           | `finished`       | Green badge | Review        |
| 5 (lowest)  | `none` (running) | Spinner     | Monitor       |

"Needs You" panel shows only priority 1-2 items. Badges show on all sessions in the tree.

## Deliverables

### App layout

| File                             | What it does                                                    |
| -------------------------------- | --------------------------------------------------------------- |
| `src/app/App.container.tsx`      | Rewritten: manages layout, sidebar state, active session, theme |
| `src/app/App.presentational.tsx` | Rewritten: sidebar + main area resizable layout                 |
| `src/app/layout/`                | Layout primitives if needed (resizable panel)                   |

### Sidebar widgets

| File                                                  | What it does                                    |
| ----------------------------------------------------- | ----------------------------------------------- |
| `src/widgets/sidebar/sidebar.container.tsx`           | Orchestrates needs-you + project tree + actions |
| `src/widgets/sidebar/sidebar.presentational.tsx`      | Sidebar layout shell                            |
| `src/widgets/sidebar/needs-you.presentational.tsx`    | Attention-prioritized session list              |
| `src/widgets/sidebar/project-tree.presentational.tsx` | Project → workspace → session tree              |
| `src/widgets/sidebar/index.ts`                        | Barrel                                          |

### Session view widgets

| File                                                             | What it does                                |
| ---------------------------------------------------------------- | ------------------------------------------- |
| `src/widgets/session-view/session-view.container.tsx`            | Loads active session, subscribes to updates |
| `src/widgets/session-view/session-header.presentational.tsx`     | Name, badge, provider, stop                 |
| `src/widgets/session-view/session-transcript.presentational.tsx` | Scrollable transcript with all entry types  |
| `src/widgets/session-view/transcript-entry.presentational.tsx`   | Single transcript entry renderer            |
| `src/widgets/session-view/approval-card.presentational.tsx`      | Inline approval request with buttons        |
| `src/widgets/session-view/index.ts`                              | Barrel                                      |

### Composer feature

| File                                                | What it does                                |
| --------------------------------------------------- | ------------------------------------------- |
| `src/features/composer/composer.container.tsx`      | Manages input state, sends message          |
| `src/features/composer/composer.presentational.tsx` | Text input + send button + provider display |
| `src/features/composer/index.ts`                    | Barrel                                      |

### Theme feature

| File                                                        | What it does                           |
| ----------------------------------------------------------- | -------------------------------------- |
| `src/features/theme-toggle/theme-toggle.container.tsx`      | Reads/writes theme preference          |
| `src/features/theme-toggle/theme-toggle.presentational.tsx` | Sun/Moon/Monitor toggle button         |
| `src/features/theme-toggle/index.ts`                        | Barrel                                 |
| `src/shared/lib/theme.pure.ts`                              | Theme logic: get/set/apply theme class |

### shadcn components to add

| Component     | Used for                       |
| ------------- | ------------------------------ |
| `scroll-area` | Transcript scrolling           |
| `resizable`   | Sidebar/main split (or custom) |
| `tooltip`     | Button tooltips                |

### Cleanup

- Remove old `src/widgets/welcome/` (absorbed into sidebar empty state)
- Remove old `src/widgets/project-header/` (absorbed into sidebar)
- Remove old `src/widgets/workspace-list/` (absorbed into sidebar tree)
- Remove old `src/widgets/session-list/` (absorbed into sidebar + session view)

## Implementation Order

### Step 1: Theme system

- Create theme toggle feature + pure logic
- Apply dark class on `<html>` element
- Persist preference to localStorage
- **Verify:** dark/light/system toggle works

### Step 2: App layout shell

- Rewrite App container + presentational with sidebar + main split
- Basic resizable divider (CSS or simple drag handler)
- **Verify:** layout renders with placeholder content

### Step 3: Sidebar — project tree

- Build project tree with workspace/session hierarchy
- Session count badges on workspaces
- Create workspace inline
- Create session from workspace or project root
- **Verify:** tree renders, items clickable

### Step 4: Sidebar — "Needs You"

- Compute attention-prioritized list from sessions
- Show top attention items
- Click to select session
- **Verify:** sessions needing attention appear at top

### Step 5: Session view — transcript

- Build scrollable transcript renderer
- Render all entry types with proper styling
- Auto-scroll on new entries
- Inline approval/deny cards
- **Verify:** fake session transcript renders fully

### Step 6: Session view — composer

- Text input + send button
- Provider display
- Start new session flow (if no active session)
- **Verify:** can send messages to active session

### Step 7: Cleanup + integration

- Remove old widgets
- Update barrel exports
- Full flow test: create project → workspace → session → approve → complete
- **Verify:** all gates pass

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

Plus manual verification:

- Dark/light/system theme toggle works
- Sidebar shows "Needs You" with attention items
- Project tree shows workspaces and sessions
- Click session → transcript loads
- Start fake session → watch streaming in transcript
- Approve inline → session completes
- Switch between sessions via sidebar
