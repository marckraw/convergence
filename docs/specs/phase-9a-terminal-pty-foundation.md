# Phase 9a: Terminal PTY Foundation — Detailed Spec

> Parent: `docs/specs/phase-9-terminal-surface.md`
> Builds on: Phase 5 (sessions have resolved `workingDirectory`)
> Next: Phase 9b (splits + tabs)

## Objective

Prove the full PTY-to-renderer pipeline with one terminal pane. After this phase:

- the active session can open a single terminal that runs a real shell in the session's `workingDirectory`
- input, output, resize, and clean disposal work end-to-end
- `node-pty` rebuild is wired into existing dev/build/test scripts the same way `better-sqlite3` is
- no splits, no tabs, no keyboard shortcuts beyond the absolute minimum — those land in 9b/9c

This is the "does the plumbing work" phase. Everything architectural rides on top.

## Success Criteria

1. Clicking a new "Open Terminal" button in the session view spawns a shell in the session's `workingDirectory`.
2. `pwd` inside the terminal returns the session's `workingDirectory`.
3. Running `npm run dev` from inside the embedded terminal works the same as from an external terminal.
4. Interactive programs (`vim`, `less`, `top`) render correctly with cursor positioning and ANSI colors.
5. Typed input reaches the shell with no detectable latency.
6. Resizing the Electron window propagates to PTY `cols`/`rows`; `echo $COLUMNS` reflects the new size.
7. Closing the terminal pane disposes the PTY; no zombie shell process after 2 seconds.
8. Closing the Electron window disposes all PTYs; verified via `ps aux | grep zsh` not showing orphans.
9. Uncaught PTY exit (e.g. typing `exit`) surfaces an "exited with code N" line in the terminal and disables input.
10. Post-task verification passes: `npm install`, `npm run test:pure`, `npm run test:unit`, `chaperone check --fix`.

## Scope

### In scope

- Install and rebuild `node-pty`, `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-webgl`, `@xterm/addon-web-links`, `@xterm/addon-clipboard`, `@xterm/addon-unicode11`
- `electron-rebuild -o node-pty` added to `dev`, `build`; `npm rebuild node-pty` added to `test*` scripts
- Backend module `electron/backend/terminal/` with service, state, ipc, types
- Preload bridge extension under `electron/preload/index.ts` exposing `window.electronAPI.terminal.*`
- Renderer entity `src/entities/terminal/` with types, api, minimal zustand store (single pane per session, no tree)
- Renderer feature `src/features/terminal-pane/` — xterm instance bound to one PTY
- Renderer widget `src/widgets/terminal-dock/` — fixed-height strip (e.g. 280px), single pane, no resize handle yet
- App shell integration: dock renders below `SessionView` and above `GlobalStatusBar` **only when active session has a terminal open**
- "Open Terminal" button in session view header or toolbar
- Tests: backend service (fake pty factory), pane store, xterm setup pure

### Out of scope (deferred to 9b/9c)

- Splits of any kind
- Tabs within a pane
- Recursive pane tree
- Dock height resize handle
- Keyboard shortcuts (Cmd-`, Cmd-T, Cmd-D, etc.)
- Close-confirm modal for running processes (pane close just SIGHUPs in 9a; modal lands in 9c)
- Clear shortcut (Cmd-K)
- Cross-session PTY persistence when switching sessions (9a: one session open at a time, switching closes or freezes — see below)

### Session switch behavior in 9a

Simplest thing that is not wrong: when the active session changes, the previous session's PTY is **kept alive in the backend** (its id stays in `state.ts`) but the renderer unmounts its xterm instance. When switching back, a new xterm instance reattaches to the same PTY id and requests a scrollback replay via `addon-serialize`… **no — deferred.** In 9a, simpler: switching sessions unmounts the renderer xterm, but the PTY keeps running in the backend. Switching back re-attaches a fresh xterm — scrollback history is lost in v1. Only currently-rendered data is in xterm's buffer.

To avoid scrollback loss on switch: backend can buffer the last N KB of PTY output per id and replay on reattach. Simple ring buffer, no `addon-serialize` needed.

**Decision for 9a:** backend buffers last 512 KB per PTY. On reattach, renderer calls `terminal.attach(id)` and receives the buffer as a single chunk before live data resumes. If the user finds 512 KB insufficient we tune later.

## Deliverables

### Backend

| File                                                 | What it does                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------------- |
| `electron/backend/terminal/terminal.types.ts`        | `TerminalId`, `CreateTerminalInput`, `TerminalHandle` interface     |
| `electron/backend/terminal/terminal.service.ts`      | Spawns `node-pty`, writes, resizes, disposes. Ring buffer per PTY.  |
| `electron/backend/terminal/terminal.state.ts`        | `Map<id, TerminalHandle>` keyed per-window; cleanup on window close |
| `electron/backend/terminal/terminal.ipc.ts`          | IPC handler registration, calls into service                        |
| `electron/backend/terminal/terminal.service.test.ts` | Unit tests with a fake pty factory injected via constructor param   |
| `electron/backend/terminal/pty-factory.ts`           | Thin wrapper over `node-pty.spawn` so tests can pass a fake         |
| `electron/main/index.ts` (edit)                      | Register terminal IPC handlers at app boot                          |
| `electron/preload/index.ts` (edit)                   | Expose `window.electronAPI.terminal.*` via `contextBridge`          |
| `src/shared/types/electron-api.d.ts` (edit)          | Add `terminal` namespace types to the `ElectronAPI` surface         |

### Renderer

| File                                                          | What it does                                                                |
| ------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `src/entities/terminal/terminal.types.ts`                     | `TerminalPane`, `TerminalState` (single pane per session)                   |
| `src/entities/terminal/terminal.api.ts`                       | Typed wrapper over preload bridge                                           |
| `src/entities/terminal/terminal.model.ts`                     | Zustand store: `panesBySessionId`, open/close actions                       |
| `src/entities/terminal/terminal.model.test.ts`                | Store action tests                                                          |
| `src/entities/terminal/index.ts`                              | Barrel                                                                      |
| `src/features/terminal-pane/xterm-setup.pure.ts`              | Builds `Terminal` + addons, theme, default options                          |
| `src/features/terminal-pane/xterm-setup.pure.test.ts`         | Pure tests for cols/rows derivation                                         |
| `src/features/terminal-pane/terminal-pane.container.tsx`      | Owns xterm lifecycle, wires IPC subs, handles resize                        |
| `src/features/terminal-pane/terminal-pane.presentational.tsx` | Mount `<div ref>` + title bar                                               |
| `src/features/terminal-pane/index.ts`                         | Barrel                                                                      |
| `src/widgets/terminal-dock/terminal-dock.container.tsx`       | Reads active-session pane from store; renders dock or nothing               |
| `src/widgets/terminal-dock/terminal-dock.container.test.tsx`  | Renders when session has pane, collapses when none                          |
| `src/widgets/terminal-dock/terminal-dock.styles.ts`           | Fixed-height dock styles, border, background                                |
| `src/widgets/terminal-dock/index.ts`                          | Barrel                                                                      |
| `src/widgets/session-view/session-view.container.tsx` (edit)  | Add "Open Terminal" button that dispatches store action                     |
| `src/app/App.layout.tsx` (edit)                               | Slot `<TerminalDock />` between `<SessionView />` and `<GlobalStatusBar />` |

### Scripts

`package.json`:

```diff
-  "dev":       "... && electron-rebuild --force -o better-sqlite3 && electron-vite dev",
+  "dev":       "... && electron-rebuild --force -o better-sqlite3 node-pty && electron-vite dev",
-  "build":     "... && electron-rebuild --force -o better-sqlite3 && electron-vite build",
+  "build":     "... && electron-rebuild --force -o better-sqlite3 node-pty && electron-vite build",
-  "test":      "npm rebuild better-sqlite3 > /dev/null 2>&1; vitest run",
+  "test":      "npm rebuild better-sqlite3 node-pty > /dev/null 2>&1; vitest run",
-  "test:pure": "npm rebuild better-sqlite3 > /dev/null 2>&1; vitest run --config vitest.pure.config.ts",
+  "test:pure": "npm rebuild better-sqlite3 node-pty > /dev/null 2>&1; vitest run --config vitest.pure.config.ts",
-  "test:unit": "npm rebuild better-sqlite3 > /dev/null 2>&1; vitest run --config vitest.unit.config.ts",
+  "test:unit": "npm rebuild better-sqlite3 node-pty > /dev/null 2>&1; vitest run --config vitest.unit.config.ts",
-  "rebuild:electron": "electron-rebuild -o better-sqlite3"
+  "rebuild:electron": "electron-rebuild -o better-sqlite3 node-pty"
```

## IPC Contract (9a subset)

```ts
// Renderer → main (request/response)
invoke('terminal.create', {
  sessionId: string
  cwd: string
  cols: number
  rows: number
}): Promise<{ id: string; pid: number; shell: string; initialBuffer: string }>

invoke('terminal.attach', { id: string }): Promise<{ initialBuffer: string }>

invoke('terminal.write', { id: string; data: string }): Promise<void>

invoke('terminal.resize', { id: string; cols: number; rows: number }): Promise<void>

invoke('terminal.dispose', { id: string }): Promise<void>

// Main → renderer (per-id channels)
on(`terminal.data:${id}`, (data: string) => void)
on(`terminal.exit:${id}`, (payload: { exitCode: number; signal: number | null }) => void)
```

`initialBuffer`: concatenated contents of the per-PTY ring buffer (last 512 KB). Renderer writes this into xterm before subscribing to `data` events.

## Backend Service Shape

```ts
// electron/backend/terminal/terminal.service.ts

export interface PtyFactory {
  spawn(shell: string, args: string[], opts: { cwd: string; env: NodeJS.ProcessEnv; cols: number; rows: number }): IPty
}

export class TerminalService {
  private handles = new Map<string, TerminalHandle>()

  constructor(
    private ptyFactory: PtyFactory,
    private emit: (channel: string, payload: unknown) => void,
  ) {}

  create(input: CreateTerminalInput): { id: string; pid: number; shell: string; initialBuffer: string } { ... }
  attach(id: string): { initialBuffer: string } { ... }
  write(id: string, data: string): void { ... }
  resize(id: string, cols: number, rows: number): void { ... }
  dispose(id: string): void { ... }
  disposeAll(): void { ... }  // called on window close
}
```

Ring buffer: simple `string[]` with byte budget, dropped from the front when it exceeds 512 KB. Appended on every `onData` from the PTY.

Shell resolution: `process.env.SHELL ?? '/bin/zsh'`. On macOS, `node-pty` needs a login shell to source `~/.zprofile`; we pass `['-l']` as args. Dev-build this early — PATH issues are common if the shell doesn't source profile.

## Preload Bridge

```ts
// electron/preload/index.ts — excerpt
contextBridge.exposeInMainWorld('electronAPI', {
  // ... existing APIs ...
  terminal: {
    create: (input) => ipcRenderer.invoke('terminal.create', input),
    attach: (id) => ipcRenderer.invoke('terminal.attach', { id }),
    write: (id, data) => ipcRenderer.invoke('terminal.write', { id, data }),
    resize: (id, cols, rows) =>
      ipcRenderer.invoke('terminal.resize', { id, cols, rows }),
    dispose: (id) => ipcRenderer.invoke('terminal.dispose', { id }),
    onData: (id, cb) => {
      const channel = `terminal.data:${id}`
      const handler = (_: unknown, data: string) => cb(data)
      ipcRenderer.on(channel, handler)
      return () => ipcRenderer.removeListener(channel, handler)
    },
    onExit: (id, cb) => {
      /* same shape */
    },
  },
})
```

## Renderer Store Shape (9a)

```ts
// src/entities/terminal/terminal.model.ts
interface TerminalPane {
  id: string // matches backend PTY id
  sessionId: string
  cwd: string
  pid: number | null
  shell: string | null
  status: 'starting' | 'running' | 'exited'
}

interface TerminalState {
  panesBySessionId: Record<string, TerminalPane | null> // one pane per session in 9a
  openPane(sessionId: string, cwd: string): Promise<void>
  closePane(sessionId: string): Promise<void>
}
```

Tree structure comes in 9b — this shape is intentionally temporary.

## Xterm Setup

```ts
// src/features/terminal-pane/xterm-setup.pure.ts
export function buildTerminal(opts: { theme: TerminalTheme }): {
  term: Terminal
  fit: FitAddon
  dispose: () => void
} {
  const term = new Terminal({
    fontFamily: 'JetBrainsMono, Menlo, monospace',
    fontSize: 13,
    lineHeight: 1.2,
    cursorBlink: true,
    allowProposedApi: true,
    theme: opts.theme,
    scrollback: 10_000,
  })
  const fit = new FitAddon()
  term.loadAddon(fit)
  term.loadAddon(new WebglAddon())
  term.loadAddon(new WebLinksAddon())
  term.loadAddon(new ClipboardAddon())
  term.loadAddon(new Unicode11Addon())
  term.unicode.activeVersion = '11'
  return { term, fit, dispose: () => term.dispose() }
}
```

`allowProposedApi: true` is required for WebGL + Unicode11 addons in current xterm versions. Verify against current xterm docs when implementing (source-driven-development applies).

## Testing Strategy

### Pure

- `xterm-setup.pure.test.ts` — terminal options, addon wiring. No real `Terminal` instance (mock the constructor).

### Unit

- `terminal.service.test.ts` — create/write/resize/dispose using a fake `PtyFactory`. Verify ring buffer truncation, emit calls, handle cleanup, dispose idempotency.
- `terminal.model.test.ts` — store actions, session-keyed pane map.
- `terminal-dock.container.test.tsx` — dock renders nothing when no pane, renders pane when store has entry.

### Manual

After implementation:

```
npm run dev
# in the running app:
# 1. select a workspace-backed session
# 2. click Open Terminal
# 3. run `pwd` — expect session.workingDirectory
# 4. run `npm run dev` from inside the embedded terminal (inside a worktree that has node_modules)
# 5. run `vim /tmp/x` — expect full-screen redraw, cursor positioning
# 6. resize window — expect reflow, no corruption
# 7. type `exit` — expect "exited with code 0" line
# 8. close pane — expect shell process gone (`ps aux | grep zsh`)
# 9. close window — expect all PTYs disposed
```

## Verification Gate

Before PR:

```
npm install
npm run test:pure
npm run test:unit
chaperone check --fix
```

All green. Manual checklist above run on macOS.

## Risks

- **node-pty rebuild on clean installs:** first `npm install` by a new contributor won't rebuild until they run `npm run dev` or `npm run rebuild:electron`. Same risk as existing better-sqlite3. Document in README if we haven't.
- **WebGL addon on some macOS configs:** known to fail on specific GPU/driver combos. Fall back to canvas renderer on error — catch `webgl` addon activation and skip. Not blocking for 9a if canvas works.
- **macOS shell profile loading:** without `-l` (login shell), PATH may be missing things users expect (e.g. `nvm`, `brew`). Passing `-l` slows startup slightly but matches iTerm default. Keep it on.
- **Zombie processes on window close:** guard by calling `service.disposeAll()` in `app.on('before-quit')` AND `win.on('close')`. Test both paths manually.

## Boundaries

### Always do

- Route every PTY call through service → handles map → node-pty. Renderer cannot touch node-pty directly.
- Use a login shell (`-l`) so PATH matches what the user sees in iTerm.
- Emit `terminal.exit` on PTY exit so renderer can disable input and show the exit line.
- Dispose PTYs on window close AND app quit.

### Ask first

- Changing the ring buffer size away from 512 KB.
- Exposing env var overrides to the renderer.
- Dropping `-l` from shell args.

### Never do

- Log PTY byte streams to any file.
- Expose the raw `IPty` object via preload.
- Accept shell path from renderer.
- Skip `electron-rebuild -o node-pty` in dev/build scripts.
