# Phase 9: Terminal Surface — Detailed Spec

> Parent: `docs/specs/project-spec.md`
> Builds on: Phase 2 (workspaces/worktrees), Phase 5 (real providers with `session.workingDirectory` resolved)

## Objective

Give Convergence a real embedded terminal so engineers can run commands against the same working directory the active agent is editing, without switching to an external terminal. The dock sits between the session view and the global status bar, supports recursive splits and tabs, and opens new panes in the active session's `workingDirectory` (worktree path if the session has a workspace, repo root otherwise).

Terminal is a convenience surface next to agents — not a replacement for iTerm or a full terminal-multiplexer competitor. Emulation quality must be high enough to run any standard dev workflow (build scripts, git, interactive tools, `npm run dev`, `vim`), but configuration surface stays minimal.

## Success Criteria

1. User can open a terminal pane from the session view; it opens in the active session's `workingDirectory`.
2. Commands run correctly: build scripts, `git`, interactive tools (`vim`, `less`, `top`), ANSI color output, Unicode, ligature-aware fonts.
3. Panes can be split horizontally and vertically to arbitrary depth.
4. Each split group can have multiple tabs; only the focused tab in each pane runs in the foreground.
5. Closing a pane kills its PTY; closing the last pane collapses the split tree. If the pane has a running foreground child process, a confirmation modal gates the close.
6. Resizing a pane resizes the underlying PTY (`cols`/`rows`) without garbling output.
7. Dock height is user-resizable via a top edge handle; remembered in-memory per session while the app runs.
8. Switching the active session swaps the dock contents — each session has its own pane tree. Background-session PTYs keep running. Dock occupies zero space when the active session has no panes.
9. Copy (Cmd-C), paste (Cmd-V), and clear (Cmd-K) work with standard mac-native conventions.
10. Rendering uses the xterm WebGL renderer; no visible tearing at 60Hz during heavy log output.
11. PTY dies cleanly when the Electron window closes — no orphaned shell processes.
12. All verification gates continue to pass: `npm run test:pure`, `npm run test:unit`, `chaperone check --fix`.

## Scope

### In scope

- `node-pty` backend service, per-pane PTY spawn with session-resolved cwd
- Electron main-process IPC: `terminal.create`, `terminal.write`, `terminal.resize`, `terminal.dispose`, events `terminal.data`, `terminal.exit`
- Preload bridge exposing a narrow `window.electronAPI.terminal.*` API
- Renderer entity (`src/entities/terminal/`) for types, API wrapper, pane-tree store
- Renderer feature (`src/features/terminal-pane/`) — single xterm.js instance wired to one PTY
- Renderer widget (`src/widgets/terminal-dock/`) — recursive split tree + tabs + dock top-edge resize
- Integration into `src/app/App.layout.tsx`: dock slot between `SessionView` and `GlobalStatusBar`
- Keyboard shortcuts: toggle dock, new tab, split H/V, close pane, focus next/previous pane
- `electron-rebuild -o node-pty` wired into `npm run dev` and `npm run build` alongside existing better-sqlite3 rebuild
- Test coverage for pane-tree model (pure), IPC contract (unit), and container wiring (unit)

### Out of scope

- Terminal themes / color schemes beyond a single dark theme matching app chrome
- Font selection UI (ships with one bundled monospace font)
- Search within terminal scrollback (add `addon-search` later if requested)
- Persistence of pane layout or scrollback across app restarts (ephemeral v1)
- Shell integration (marks, prompt tracking) — not needed for v1
- Terminal profiles (different shells/cwds per pane beyond defaults)
- Per-session terminal presets / "saved layouts"
- Remote / SSH / container terminals
- Drag-to-reorder tabs or drag panes between splits (keyboard-only rearrange in v1; see §Open Questions)
- Windows platform (deferred — `feat/phase-7-windows-support` branch handles OS parity separately; node-pty on Windows uses ConPTY but UI testing waits for that phase)

## Tech Stack Additions

| Concern           | Choice                   | Why                                                                 |
| ----------------- | ------------------------ | ------------------------------------------------------------------- |
| PTY host          | `node-pty`               | Standard Node PTY lib; rebuild per Electron ABI like better-sqlite3 |
| Terminal emulator | `@xterm/xterm`           | VS Code / Codespaces standard; scoped modern package                |
| Fit-to-container  | `@xterm/addon-fit`       | Computes cols/rows from pixel size                                  |
| GPU renderer      | `@xterm/addon-webgl`     | Replaces deprecated canvas renderer; 60Hz under heavy log load      |
| Links             | `@xterm/addon-web-links` | Cmd-click URLs in output                                            |
| Clipboard         | `@xterm/addon-clipboard` | OSC 52 clipboard pass-through                                       |
| Unicode           | `@xterm/addon-unicode11` | Correct width tables for emoji / CJK                                |
| Splits            | `react-resizable-panels` | SOTA recursive split primitive, keyboard-accessible                 |
| Tabs              | `@radix-ui/react-tabs`   | Matches existing Radix usage                                        |

No new state library — pane tree lives in a zustand store under `src/entities/terminal/`.

## Architecture

### Process split

```
renderer (React + xterm.js)
  └─ features/terminal-pane
       onData(bytes) ──► window.electronAPI.terminal.write(id, bytes) ──► preload ──► ipcRenderer.invoke

preload
  └─ window.electronAPI.terminal = {
       create(opts): Promise<{ id, pid }>
       write(id, data): void
       resize(id, cols, rows): void
       dispose(id): void
       onData(id, cb): Unsubscribe
       onExit(id, cb): Unsubscribe
     }

electron/main
  └─ ipc handlers delegate to backend/terminal/service.ts

electron/backend/terminal
  ├─ service.ts   // spawns node-pty, pipes data events to main → renderer
  ├─ state.ts     // Map<id, IPty> with ownership per BrowserWindow
  ├─ ipc.ts       // handler registration
  └─ types.ts
```

### Renderer slice layout

```
src/entities/terminal/
  index.ts
  terminal.api.ts           // preload wrapper, typed calls
  terminal.model.ts         // zustand: pane tree, active tab, dock height, focus
  terminal.types.ts         // PaneNode = Leaf | Split { direction, children, sizes }
  pane-tree.pure.ts         // tree ops: splitLeaf, closeLeaf, findPath, rebalance
  pane-tree.pure.test.ts

src/features/terminal-pane/
  index.ts
  terminal-pane.container.tsx      // owns xterm instance lifecycle, IPC subs
  terminal-pane.presentational.tsx // xterm mount div + tab header
  xterm-setup.pure.ts              // addon wiring, theme mapping, cols/rows calc

src/widgets/terminal-dock/
  index.ts
  terminal-dock.container.tsx      // reads pane tree from store, renders SplitNode
  terminal-dock.container.test.tsx
  split-node.presentational.tsx    // recursive: Leaf → TerminalPane, Split → PanelGroup
  tab-group.presentational.tsx     // Radix Tabs over leaf's tabs
  dock-resize.container.tsx        // top-edge drag handle for dock height
  terminal-dock.styles.ts
```

### Pane tree model

```ts
type PaneTree = SplitNode | LeafNode

interface SplitNode {
  kind: 'split'
  id: string
  direction: 'horizontal' | 'vertical'
  children: PaneTree[] // ≥2
  sizes: number[] // percentages, sum ≈ 100
}

interface LeafNode {
  kind: 'leaf'
  id: string
  tabs: TerminalTab[] // ≥1
  activeTabId: string
}

interface TerminalTab {
  id: string // matches PTY id in backend
  title: string // defaults to shell basename
  cwd: string // frozen at create time
  pid: number | null // null until backend returns
}
```

All tree mutations happen via pure functions in `pane-tree.pure.ts` and are tested in isolation. Store actions are thin wrappers.

### CWD resolution

```ts
// src/entities/terminal/terminal.api.ts
createPane(opts: { sessionId: string | null }) {
  const session = useSessionStore.getState().sessions[opts.sessionId]
  const cwd = session?.workingDirectory ?? project.repositoryPath
  return window.electronAPI.terminal.create({ cwd, shell: null /* backend picks */ })
}
```

Backend picks shell: `process.env.SHELL || '/bin/zsh'` on macOS/Linux. Never accepts shell override from renderer in v1 (reduces attack surface, no user-facing knob yet).

## IPC Contract

```ts
// preload → main
invoke('terminal.create', {
  cwd: string
  cols: number
  rows: number
}): Promise<{ id: string; pid: number; shell: string }>

invoke('terminal.write', { id: string; data: string }): Promise<void>

invoke('terminal.resize', {
  id: string
  cols: number
  rows: number
}): Promise<void>

invoke('terminal.dispose', { id: string }): Promise<void>

// main → renderer (per-id channels)
on('terminal.data:{id}', (data: string) => void)
on('terminal.exit:{id}', ({ exitCode: number; signal: number | null }) => void)
```

Id validation: backend generates `id` with `randomUUID()`, stores in `state.ts`. Every `write`/`resize`/`dispose` validates id is in the map before touching any PTY. Unknown id = no-op + warn log (not throw — avoids crashing renderer on a stale subscription).

## Keyboard Shortcuts

| Shortcut        | Action                                                              |
| --------------- | ------------------------------------------------------------------- |
| Cmd-`           | Toggle dock visibility                                              |
| Cmd-T           | New tab in focused leaf                                             |
| Cmd-D           | Split focused leaf vertically                                       |
| Cmd-Shift-D     | Split focused leaf horizontally                                     |
| Cmd-W           | Close focused tab (last tab in leaf → collapse leaf)                |
| Cmd-Shift-[ / ] | Previous / next tab                                                 |
| Cmd-Alt-←/→/↑/↓ | Focus adjacent pane                                                 |
| Cmd-K           | Clear visible scrollback                                            |
| Cmd-C           | Copy (if selection; otherwise fall through to xterm default SIGINT) |
| Cmd-V           | Paste                                                               |

Shortcuts registered in `terminal-dock.container.tsx` at the dock level so they don't conflict with session-view shortcuts when dock is unfocused.

## Security (Electron Hardening)

1. `contextIsolation: true`, `nodeIntegration: false` — already set; do not regress.
2. Preload exposes only the narrow `terminal.*` API; no PTY object, no shell path, no env dump.
3. Backend validates terminal id on every write/resize/dispose — renderer cannot forge ids for PTYs it didn't create.
4. PTY env = Electron main's `process.env`. No user-configurable env in v1.
5. Scrollback stays in memory. If/when `addon-serialize` is added for persistence, write to `userData/terminal-sessions/` which is OS-protected per-user.
6. No PTY byte logging to app log files — scrollback contains secrets (pastes, env dumps).
7. Cmd-V paste: we pass clipboard text through as bytes. Bracketed-paste mode is enabled by default in xterm, so shells receive `ESC [ 200 ~ ... ESC [ 201 ~` — prevents pasted control sequences from executing commands. Good hygiene; keep on.

## Commands

Adds one rebuild target to existing scripts:

```bash
# package.json excerpt
"dev":   "... && electron-rebuild --force -o better-sqlite3 node-pty && electron-vite dev",
"build": "... && electron-rebuild --force -o better-sqlite3 node-pty && electron-vite build",
"test":      "npm rebuild better-sqlite3 node-pty > /dev/null 2>&1; vitest run",
"test:pure": "npm rebuild better-sqlite3 node-pty > /dev/null 2>&1; vitest run --config vitest.pure.config.ts",
"test:unit": "npm rebuild better-sqlite3 node-pty > /dev/null 2>&1; vitest run --config vitest.unit.config.ts",
```

## Testing Strategy

- **Pure**: `pane-tree.pure.ts` — split/close/rebalance tree ops, tab ordering, focus navigation, sizes normalization.
- **Pure**: `xterm-setup.pure.ts` — cols/rows calc from pixel size + font metrics.
- **Unit**: backend `service.ts` — creates PTY, writes data, resizes, disposes; uses a fake pty factory behind an interface to avoid spawning a real shell in CI.
- **Unit**: `terminal-dock.container.test.tsx` — renders split tree, triggers store actions, verifies layout.
- **Unit**: keyboard shortcut dispatching (pure handler + container smoke test).
- **Manual verification**: run `npm run dev`, open a terminal in a workspace session, execute `pwd` (must match `session.workingDirectory`), run `npm run dev` from inside the embedded terminal in a sub-worktree, split horizontally, run `vim`, confirm rendering + resize + Cmd-K clear.

E2E (Playwright) deferred — the E2E harness isn't in the repo yet per `project-spec.md`.

## Project Structure Additions

```
docs/specs/
  phase-9-terminal-surface.md              # this file
  phase-9a-terminal-pty-foundation.md      # backend + single pane (next)
  phase-9b-terminal-splits-tabs.md         # pane tree + tabs model
  phase-9c-terminal-dock-integration.md    # AppShell slot, shortcuts, polish

electron/backend/terminal/                 # see Architecture
src/entities/terminal/                     # see Architecture
src/features/terminal-pane/                # see Architecture
src/widgets/terminal-dock/                 # see Architecture
```

## Boundaries

### Always do

- spawn PTYs in the active session's `session.workingDirectory` (worktree path if workspace exists, repo root otherwise)
- rebuild `node-pty` for Electron ABI via `electron-rebuild` in `dev`/`build`; rebuild for Node ABI via `npm rebuild` in test scripts
- validate terminal id on every backend call
- dispose PTYs on window close and pane close
- keep the pane-tree mutations pure and tested in isolation

### Ask first

- exposing PTY env manipulation to the renderer
- adding terminal persistence across restarts (`addon-serialize` + disk writes)
- adding a settings UI for fonts/themes (should go through global app settings spec first)
- supporting Windows (needs `feat/phase-7-windows-support` to land; ConPTY behavior needs its own verification)

### Never do

- expose raw `IPty` object through preload
- log PTY stdin/stdout bytes to app log files
- accept shell path from renderer in v1
- construct shell commands by string concatenation on the backend (we pipe bytes, never `exec(userString)`)
- skip `electron-rebuild` in dev/build scripts — ABI mismatch will crash on startup

## Delivery Phases

Split into three mergeable slices. Each slice is a PR with its own changeset and post-task verification.

### Phase 9a — PTY Foundation (single pane, no splits)

- `node-pty` install + rebuild wiring
- `electron/backend/terminal/` service, state, ipc
- preload bridge
- `src/entities/terminal/` types + api + tiny store (one pane, no tree)
- `src/features/terminal-pane/` with xterm.js + addons, full single-pane terminal working end to end
- Placeholder dock widget: fixed-height strip showing one terminal below SessionView

**Gate:** can run `pwd`, `git status`, `npm run dev` inside embedded terminal in a workspace session; resize of window propagates to PTY cols/rows.

### Phase 9b — Splits + Tabs

- pane-tree types + pure ops + tests
- zustand store actions
- recursive `split-node.presentational.tsx` using `react-resizable-panels`
- `tab-group.presentational.tsx` using Radix Tabs
- dock container wires tree → rendered splits
- keyboard shortcuts: Cmd-T, Cmd-D, Cmd-Shift-D, Cmd-W, Cmd-Shift-[/], Cmd-Alt-arrows

**Gate:** split vertical + horizontal to depth 3, each pane runs an independent shell, close-pane collapses tree correctly.

### Phase 9c — Dock Integration + Polish

- top-edge dock resize handle
- Cmd-` toggle dock visibility
- Cmd-K clear
- session-switch behavior (see Open Questions — assumption is swap dock contents per session)
- dispose-on-window-close cleanup verification
- theming to match app chrome
- changeset + merge

**Gate:** full verification suite passes; manual run-through of success criteria 1–12.

## Resolved Decisions

1. **Terminal scope:** session-tied. Each session owns its pane tree. Session switch swaps rendered dock; PTYs in background sessions keep running.
2. **Cmd-W close with running process:** confirmation modal. If the PTY's foreground child is not the shell itself, show a modal "Close terminal running `<procname>`?" with Cancel / Close. Cmd-W on an idle shell closes immediately.
3. **Dock visibility when no terminal opened in active session:** dock takes zero space. Dock only mounts when the active session has ≥1 pane. First "Open Terminal" action in a session spawns the dock.
4. **Tab/pane rearrange:** keyboard-only in v1 (Cmd-Shift-[/]). Drag support deferred.
