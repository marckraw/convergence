# Terminal Idle Notifications — Implementation Plan

Companion to `docs/specs/terminal-idle-notifications.md`.

## Phase TIN1 — Backend terminal activity events

- Add `TerminalActivityStatus` and `TerminalIdleEvent` types.
- Extend `TerminalService` with a polling activity monitor:
  - track per-terminal status, last foreground process, and busy start time
  - start polling when the first PTY is created
  - stop polling when no PTYs remain
  - emit `TerminalIdleEvent` on busy -> idle transitions
- Keep existing session-exit behavior intact.
- Add unit tests with fake timers and fake `ps` output.

## Phase TIN2 — Notification pipeline support

- Add `terminal.idle` to backend and renderer notification event unions.
- Add `terminalIdle` to notification preferences and defaults.
- Update app-settings parsing to hydrate older settings.
- Format terminal idle notifications with terminal-specific copy.
- Treat `terminal.idle` as informational severity.
- Add pure policy tests for event enable/disable and formatting.

## Phase TIN3 — IPC and renderer terminal notice state

- Broadcast `terminal:idle` from main to renderers.
- Expose `window.electronAPI.terminal.onIdle`.
- Add `terminalApi.onIdle`.
- Add live terminal idle notices to `useTerminalStore`.
- Add `focusTerminalTab(sessionId, terminalId)` to activate the correct split
  leaf/tab and reveal the dock.
- Add store tests for ingest, dismiss, and focus routing.

## Phase TIN4 — Sidebar UI and routing

- Add a `Terminals Idle` sidebar section.
- Thread notices from `useTerminalStore` through `Sidebar`.
- On select, switch to the owning session/project using the same cross-project
  routing shape as agent attention rows, then focus the terminal tab.
- Add presentational tests for rendering/dismissal and container coverage for
  routing where practical.

## Phase TIN5 — Settings UI and verification

- Add a "Terminal idle" event toggle in notification settings.
- Update unit tests for settings.
- Run:
  - `npm install`
  - `npm run typecheck`
  - `npm run test:pure`
  - `npm run test:unit`
  - `chaperone check --fix`
