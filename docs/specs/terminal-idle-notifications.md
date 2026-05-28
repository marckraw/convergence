# Terminal Idle Notifications

## Goal

Notify the user when a terminal that was doing work becomes idle again, whether
that terminal is the primary surface of a shell session or a docked terminal
inside an agent/conversation session.

The feature treats terminals as first-class runtime surfaces without forcing
them into the agent attention model. A terminal becoming idle is informational:
it does not mean "needs input", "needs review", or "approval required".

## Product intent

- A user can start a long-running command in any terminal tab, move elsewhere in
  Convergence, and learn when that terminal returns to idle.
- The unit of tracking is the PTY-backed terminal tab, not the owning session.
  Split panes and tab groups are handled naturally because each tab owns one
  PTY.
- The same behavior applies to:
  - terminal-primary sessions, where the terminal pane tree is the main surface
  - conversation-primary sessions, where the terminal pane tree is a dock opened
    with Cmd+T
- The first version is deliberately pragmatic. It detects long-running foreground
  child processes and emits a notification when the shell is foreground again.
  It does not parse shell prompts or invent terminal-specific "needs input"
  states.

## Non-goals

- No terminal `needs-input` taxonomy.
- No parsing terminal output for semantic task names, failures, prompts, or test
  results.
- No shell integration such as OSC 133 prompt markers in V1.
- No persistent terminal notification inbox. Notices are live renderer state.
- No terminal auto-naming from command output.
- No quick actions from system notifications beyond opening the owning session.

## Behavior

### Activity detection

The backend tracks each PTY as one of:

- `idle`: the shell itself is the foreground process
- `busy`: a foreground descendant process exists, such as `npm`, `git`, `node`,
  `vim`, or `python`
- `exited`: the PTY has exited

Detection uses the existing foreground-process helper in
`electron/backend/terminal/foreground-process.pure.ts`.

The backend polls active PTYs on a short interval. A transition only emits an
idle event after the PTY has first been observed as busy. Initial shell idle does
not notify.

### Idle event

When a PTY transitions from busy back to idle, the backend emits:

```ts
type TerminalIdleEvent = {
  sessionId: string
  terminalId: string
  processName: string
  busySince: string
  idleAt: string
}
```

`processName` is the last observed foreground child process.

### Notification channels

`terminal.idle` is added to the existing notification pipeline. It reuses:

- toast
- soft sound
- dock badge
- dock bounce info
- system notification

The event is informational, like `agent.finished`.

The existing notification preferences gain a `terminalIdle` event toggle.

### Sidebar surface

The sidebar gains a separate live section:

```txt
Terminals Idle
  Terminal - Convergence · npm
  How Skills Work · test
```

This section is separate from "Waiting on You" and "Needs Review".

Each row can be:

- selected: opens the owning session and focuses the exact terminal tab
- dismissed: removes the live notice

### Click-through routing

Selecting a notice does this:

1. Switch to the owning project/session.
2. If the terminal is docked inside a conversation-primary session, ensure the
   terminal dock is visible.
3. Focus the owning leaf and activate the tab for the terminal id.

If the terminal tree no longer contains the tab, the app still opens the owning
session and dismisses or leaves the notice depending on the caller's choice.

## Data model

Backend runtime state lives in `TerminalService` and is not persisted.

Renderer live notice state lives in `src/entities/terminal/terminal.model.ts`:

```ts
type TerminalIdleNotice = TerminalIdleEvent & {
  id: string
  sessionName: string
  projectName: string
  receivedAt: string
}
```

`id` is stable for a terminal idle transition and can be the terminal id for V1.
The latest idle event for a terminal replaces the previous one.

## Architecture

- Backend terminal activity detection stays under `electron/backend/terminal/`.
- Notification formatting and policy stay under `electron/backend/notifications/`.
- Renderer state stays under `src/entities/terminal/`.
- Sidebar rendering stays under `src/widgets/sidebar/`.
- Cross-slice imports use public `index.ts` barrels.
