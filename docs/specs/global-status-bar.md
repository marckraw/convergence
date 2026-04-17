# Global Status Bar

## Goal

Give the user an at-a-glance, always-visible overview of agent activity across
all projects in the app. The sidebar already shows sessions for the currently
selected project; this feature raises the scope to the whole app so the user
can see everything that is working or needs attention without switching
projects.

## Product intent

- The bar is a read-only informational surface. It is not a control surface.
- It shows only sessions that are in progress or need attention. Idle and
  finished sessions are not listed, so scanning stays fast.
- It is provider-aware. Claude Code, Codex, and Pi are all first class, and
  new providers plug in without bespoke UI.
- It answers, at a glance: how many agents are currently working, how many
  need me, and which projects they belong to.
- Acting on a session still happens through the sidebar `Needs You` list and
  the session view. The bar is the map, not the cockpit.

## V1 behavior

### Mount

A single `GlobalStatusBar` renders as a thin fixed bar at the bottom of the
app shell, below the split between sidebar and main content. It is full app
width and always visible.

### Zones

The bar has three zones, left to right.

1. Aggregate
   - Shows two counters:
     - `N running` — sessions with `status = 'running'`
     - `N need you` — sessions with `attention` in `needs-input` or
       `needs-approval`, respecting existing `needsYouDismissals`
   - Hovering shows a popover with a cross-project summary grouped by
     project, listing only running + attention sessions (not full session
     lists).
2. Project chips
   - One chip per project that currently has at least one running or
     attention-needing session. No chip for idle-only or finished-only
     projects.
   - Chip shows project name, provider icons for the session(s) it hosts,
     and the running and attention counts for that project.
   - Clicking a chip switches the active project. It does not auto-select a
     specific session.
   - Hovering shows a popover listing that project's active sessions with
     their provider, model, and current `activity`.
3. Recency
   - Shows the single most-recently-completed or most-recently-failed
     session in the app, as a passive badge (provider icon, project name,
     relative time, ok/fail state).
   - Clicking switches to that project. It does not auto-open the session.

### Hover / click rules

- Hover is informational. Click navigates. Neither dismisses, approves,
  denies, nor sends input.
- Dismissals for `needs-you` continue to live in the sidebar. The bar reads
  the same dismissal state so its counter stays consistent.

### Empty state

When no sessions are running and none need attention, the bar shows
`No agents running` with no chips. It does not hide itself, to avoid layout
shifts.

## Data model

Add a new session field, `activity`, that represents what the agent is
currently doing within an active turn. It is derived from provider events
and is orthogonal to `status` and `attention`.

### Type

```
type ActivitySignal =
  | null                   // no turn active
  | 'streaming'            // generating text
  | 'thinking'             // generating a thinking / reasoning block
  | `tool:${string}`       // executing a named tool
  | 'waiting-approval'     // an approval gate is open
```

Rules:

- `activity = null` whenever `status !== 'running'`.
- `activity` is best-effort. A session can be `running` with
  `activity = null` if the provider has not emitted a signal yet.
- `activity` is additive next to `status` and `attention`. It does not
  replace either.

### Persistence

Add a nullable `activity TEXT` column on the `sessions` table and extend
`Session` / `sessionFromRow`. Migrate via the existing
`ensureSessionColumns` pattern in `electron/backend/database/database.ts`.
The column stores the literal string form of `ActivitySignal` or `NULL`.

### Provider interface

Extend `SessionHandle` in
`electron/backend/provider/provider.types.ts` with:

```
onActivityChange: (callback: (activity: ActivitySignal) => void) => void
```

All three providers must implement it. Providers that cannot emit a given
signal are free to skip it; the default is `null`.

### Session service

Wire `handle.onActivityChange` in
`electron/backend/session/session.service.ts` next to
`onStatusChange`. On activity change:

- update the `activity` field on the session row
- broadcast via the existing `session:updated` IPC event
- on `status` transitions away from `running`, force `activity = null`

## Provider strategy

Activity coverage is not uniform across providers. We accept the asymmetry
and keep the vocabulary shared. Unsupported signals are simply never emitted
by that provider.

### Claude Code

- `stream_event` + `content_block_delta` → `streaming`
- `assistant` event with a `tool_use` block → `tool:<block.name>`
- `result` event → `null` (turn ended)
- no `thinking` signal in v1 (the headless stream does not emit explicit
  reasoning blocks today)
- approval flow is not currently wired; `waiting-approval` may be emitted
  later if/when Claude Code approvals land

### Codex

- `item/agentMessage/delta` → `streaming`
- `item/commandExecution/requestApproval` / `item/mcpToolCall/requestApproval`
  → `waiting-approval`, and track the tool name in a pending-request map
  keyed by RPC id so the next phase can emit `tool:<name>` on approval
- `item/completed` → emit `tool:<name>` retroactively for the item that
  just finished, and then `null` once no more pending items
- `turn/completed` / `turn/interrupt` → `null`
- Known gap: Codex has no mid-execution "this tool is running now" event.
  Between approval and completion the activity is not live. This is
  acceptable for v1 and documented in the UI popover as
  `last tool: <name>` when relevant rather than pretending the run is live.

### Pi

- `message_update` + `text_delta` → `streaming`
- `message_update` + `thinking_delta` → `thinking`
- `toolcall_start` or `tool_execution_start` → `tool:<name>`
- `tool_execution_end` → clear tool activity, fall back to the last
  streaming / thinking state if a turn is still active
- `turn_end` / `agent_end` → `null`
- `extension_ui_request` is auto-cancelled in v1, so `waiting-approval` is
  not emitted by Pi yet. When Pi approvals are wired later, add it.

### Shared rules

- Provider adapters never invent activity strings outside the `ActivitySignal`
  union. Tool names used in `tool:<name>` are lowercased and trimmed.
- On any error path or provider stream close, activity must reset to `null`
  so the bar does not display stale state.

## Architecture

### Backend

- `electron/backend/provider/provider.types.ts`: add `ActivitySignal`,
  extend `SessionHandle`.
- `electron/backend/provider/claude-code/claude-code-provider.ts`: add
  listener array and setter, wire event hooks.
- `electron/backend/provider/codex/codex-provider.ts`: add listener array,
  setter, and pending-request map for approval → completion linkage.
- `electron/backend/provider/pi/pi-provider.ts`: add listener array,
  setter, and hook into the existing `handleEvent` switch.
- `electron/backend/session/session.types.ts`: add `activity` field.
- `electron/backend/session/session.service.ts`: wire `onActivityChange`,
  persist, broadcast, and reset on non-running status.
- `electron/backend/database/database.ts`: add `activity` column via
  `ensureSessionColumns`.

### IPC

No new IPC surface. The existing `session:updated` broadcast already
carries the full `Session` payload, so `activity` rides along with no
additional plumbing. `session:getAll` in the preload is unchanged.

### Renderer

- `src/entities/session/session.types.ts`: add `activity: ActivitySignal`.
- `src/entities/session/session.selectors.pure.ts` (new): selector
  `selectGlobalStatus(globalSessions, dismissals)` returning
  `{ running, needsAttention, byProject, lastCompleted }`.
- `src/widgets/global-status-bar/`:
  - `global-status-bar.container.tsx` — subscribes to
    `useSessionStore(selectGlobalStatus)` and `projectStore`
  - `global-status-bar.presentational.tsx` — three zones, no effects
  - `global-status-bar.styles.ts`
  - `index.ts` public API
- `src/app/App.layout.tsx`: mount the bar below the sidebar+main split.
- Provider icon lookup goes through the existing
  `electron/backend/provider/provider-descriptor.pure.ts` and equivalent
  renderer descriptor, so the bar stays provider-neutral.

## Verification

- `npm run test:pure`
  - selector tests covering: only active projects appear as chips, counts
    respect dismissals, `lastCompleted` picks the latest
    completed-or-failed session only
  - activity mapping pure tests per provider for the event sets above
- `npm run test:unit`
  - session service test: `activity` is set from
    `onActivityChange`, broadcast over `session:updated`, and reset to
    `null` when status leaves `running`
  - container test: `GlobalStatusBar.container` renders three zones,
    shows empty state when no sessions match, and calls
    `setActiveProject` on chip click
- Manual verification
  - run Claude Code, Codex, and Pi sessions concurrently across two
    projects and confirm counters, chips, and hover popovers update live
- `chaperone check --fix` clean

## Out of scope for v1

- Stale-session detection (heartbeat on sessions, `stale` badge, auto
  recovery). Tracked separately.
- Any write actions from the bar (approve, deny, send input, stop,
  dismiss). These stay in the sidebar and session view.
- Listing or badging idle-only projects.
- Codex mid-execution tool activity between approval and completion.
- Pi `waiting-approval` (blocked on Pi approval UI landing first).
- Status-bar-driven focus of a specific session within a project.

## Future follow-up

- Codex item lifecycle parsing to close the approval → completion gap and
  emit live `tool:<name>` between the two.
- Pi approvals once `extension_ui_request` is fully wired.
- A `thinking` signal for Claude Code if the headless stream starts
  surfacing reasoning blocks.
- Stale-session heartbeat and recovery, exposed as a new activity-like
  state or as a distinct badge on the bar.
- Optional filter on the bar to scope to the active project when the user
  wants a quieter view.
