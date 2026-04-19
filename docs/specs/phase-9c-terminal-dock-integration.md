# Phase 9c: Terminal Dock Integration and Polish — Detailed Spec

> Parent: `docs/specs/phase-9-terminal-surface.md`
> Builds on: Phase 9b (recursive pane tree + tabs rendered via buttons)
> Final phase of the Phase 9 sequence

## Objective

Turn the terminal feature from "works via buttons" into "feels native." After this phase:

- keyboard shortcuts drive every pane/tab operation
- a confirmation modal gates closing panes with running processes
- the dock has a top-edge resize handle with sensible min/max bounds
- Cmd-` toggles dock visibility per-session
- Cmd-K clears scrollback without killing the shell
- all success criteria 1–12 in the parent spec are verified

This phase is about UX density. No new backend, minor renderer additions, focused polish.

## Success Criteria

1. Cmd-T opens a new tab in the focused leaf (inherits leaf cwd).
2. Cmd-D splits the focused leaf vertically (new pane to the right).
3. Cmd-Shift-D splits the focused leaf horizontally (new pane below).
4. Cmd-W closes the focused tab. If the tab's foreground process is the shell itself, close immediately. If a child process is running, a confirmation modal blocks close until the user confirms or cancels.
5. Cmd-Shift-[ / Cmd-Shift-] navigates the focused leaf's tabs backward / forward.
6. Cmd-Alt-←/→/↑/↓ moves focus to the adjacent leaf in the tree.
7. Cmd-K clears the visible scrollback of the focused tab (xterm `clear()`), but the shell process and history remain untouched.
8. Cmd-` toggles dock visibility for the current session. When hidden, dock takes zero height; PTYs keep running in the background.
9. The dock has a top-edge resize handle. Dragging up/down resizes the dock between 120px and 60% of window height. Double-click resets to 280px default.
10. Dock height is remembered in the store per session and persists across session switches within the app's lifetime.
11. When the Electron window closes, all PTYs across all sessions are disposed (no orphan shell processes — verifiable with `ps aux | grep zsh`).
12. All success criteria (1–12) from `phase-9-terminal-surface.md` pass manual verification.
13. `npm run test:pure`, `npm run test:unit`, `chaperone check --fix` pass.

## Scope

### In scope

- Keyboard shortcut layer: a pure key-dispatcher + a container that registers global keydown listeners scoped to the dock
- "Close running process?" confirmation modal (Radix Dialog)
- Foreground-process detection on the backend (best-effort via `node-pty`'s child pid + reading `/proc` on Linux or `ps` on macOS)
- Dock top-edge resize handle with drag + double-click-reset
- Per-session dock height state in the store
- Cmd-` dock visibility toggle + visibility state per session
- Cmd-K clear wired to focused tab's xterm instance
- PTY cleanup on `app.before-quit` and `BrowserWindow.close`
- Final polish: app-chrome-matching theme, consistent border/shadow with global status bar, focus ring on focused pane

### Out of scope

- Drag-to-reorder tabs (deferred post-phase-9)
- Drag panes between splits (deferred)
- Customizable shortcuts (deferred to global app settings phase)
- Tab titling from shell OSC title sequences (nice-to-have, deferred)
- Search in scrollback (add `addon-search` later)
- Layout persistence across app restarts (deferred)

## Keyboard Shortcut Layer

### Design

Shortcuts are scoped to the terminal dock. When the dock has focus (any xterm instance is the active element), keyboard events bubble to a dock-level handler that matches known shortcuts. Non-matching events fall through to xterm so the shell receives keystrokes normally.

Critical pattern: **xterm must see all keys except the matched shortcuts.** We use `Terminal.attachCustomKeyEventHandler(ev)` — returning `false` cancels xterm's default handling, `true` lets it through. Dock handler runs first; if it matches a shortcut, it prevents default AND returns false from the custom handler.

### Shortcut table

| Combo           | Action                                          |
| --------------- | ----------------------------------------------- |
| Cmd-T           | `newTab(focusedLeafId)`                         |
| Cmd-D           | `splitLeaf(focusedLeafId, 'vertical')`          |
| Cmd-Shift-D     | `splitLeaf(focusedLeafId, 'horizontal')`        |
| Cmd-W           | `closeTabWithGuard(focusedLeafId, activeTabId)` |
| Cmd-Shift-[     | `prevTab(focusedLeafId)`                        |
| Cmd-Shift-]     | `nextTab(focusedLeafId)`                        |
| Cmd-Alt-←/→/↑/↓ | `focusAdjacent(focusedLeafId, direction)`       |
| Cmd-K           | `clearFocusedTab()`                             |
| Cmd-`           | `toggleDockVisibility(sessionId)`               |

Cross-platform: macOS = Cmd, other platforms = Ctrl. `event.metaKey || event.ctrlKey` with platform check. v1 ships mac-only per parent spec, but the dispatcher is portable.

### Pure dispatcher

```ts
// src/entities/terminal/keymap.pure.ts
export type TerminalShortcut =
  | { kind: 'new-tab' }
  | { kind: 'split'; direction: 'horizontal' | 'vertical' }
  | { kind: 'close-tab' }
  | { kind: 'cycle-tab'; direction: 'prev' | 'next' }
  | { kind: 'focus-adjacent'; direction: 'up' | 'down' | 'left' | 'right' }
  | { kind: 'clear' }
  | { kind: 'toggle-dock' }

export function matchShortcut(
  event: KeyEventLike,
  platform: 'mac' | 'other',
): TerminalShortcut | null
```

Testable in isolation. Container wires matched shortcut → store action.

## Close-With-Running-Process Guard

### Detection

On tab close, read the PTY's foreground process group. If it differs from the shell's PID, there's a running child. Detection is best-effort:

- macOS: `ps -o pid,comm -g <pgid>` from backend
- Linux: read `/proc/<pid>/status` `FDSize` + check if a child exists
- Cross-platform fallback: compare shell start time to current PTY activity — if there's been input/output in the last 2s, assume running

For v1: backend exposes `terminal.getForegroundProcess(id): Promise<{ pid: number; name: string } | null>`. If returns non-null and name !== shell, modal shows.

### Modal

```tsx
// src/features/terminal-pane/close-confirm.container.tsx
<Dialog>
  <DialogContent>
    Close terminal running <strong>{process.name}</strong>?
    <DialogFooter>
      <Button variant="ghost" onClick={cancel}>
        Cancel
      </Button>
      <Button variant="destructive" onClick={confirm}>
        Close
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

Store action `closeTabWithGuard` calls backend to check foreground process. If null or is shell, calls `closeTab` directly. Otherwise opens the modal; on confirm, calls `closeTab`; on cancel, no-op.

## Dock Top-Edge Resize

Between 120px and 60% of window height. Default 280px. Store holds `dockHeightBySessionId: Record<string, number>`. Double-click resets.

```tsx
// src/widgets/terminal-dock/dock-resize.container.tsx
// - renders a 4px horizontal strip at the top of the dock
// - cursor: row-resize
// - on mousedown: start drag, listen to mousemove on window
// - on mousemove: compute new height = windowHeight - mouseY, clamp [120, windowHeight*0.6]
// - on mouseup: commit to store
// - on dblclick: reset to 280
```

Same pattern as existing sidebar resize in `App.layout.tsx`. Model it on that.

## Dock Visibility Toggle

Per session: `dockVisibleBySessionId: Record<string, boolean>`. Defaults to `true` when the session's tree becomes non-null. Cmd-` flips it. When false, dock doesn't render (zero height).

Note: this is **visibility** (dock UI hidden), not **existence** (tree still holds panes, PTYs still run). Toggling back on re-mounts the xterm instances, which re-attach via `terminal.attach(id)` and replay ring buffers.

## Clear Scrollback

Cmd-K on focused tab → container calls `term.clear()` on the focused xterm instance. Does not touch the PTY or shell history. Does not touch the backend ring buffer (intentional — if user switches tabs and back, they see the buffer, not the cleared-only-in-xterm view; acceptable edge case).

## PTY Cleanup on Window/App Close

```ts
// electron/main/index.ts (edit)
app.on('before-quit', () => {
  terminalService.disposeAll()
})

mainWindow.on('close', () => {
  terminalService.disposeAll()
})
```

Already partially in place from 9a; verify both hooks fire on all close paths (quit via Cmd-Q, red X, menu quit).

## Deliverables

### Backend

| File                                                        | What it does                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------------ |
| `electron/backend/terminal/terminal.service.ts` (edit)      | Add `getForegroundProcess(id)` using `ps` on mac             |
| `electron/backend/terminal/foreground-process.pure.ts`      | Pure helper to parse `ps` output                             |
| `electron/backend/terminal/foreground-process.pure.test.ts` | Parses representative `ps` outputs                           |
| `electron/backend/terminal/terminal.ipc.ts` (edit)          | Add `terminal.getForegroundProcess` handler                  |
| `electron/preload/index.ts` (edit)                          | Expose `terminal.getForegroundProcess`                       |
| `src/shared/types/electron-api.d.ts` (edit)                 | Add return type                                              |
| `electron/main/index.ts` (edit)                             | Wire `disposeAll` on `before-quit` + `window.close` (verify) |

### Renderer

| File                                                                | What it does                                                           |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `src/entities/terminal/keymap.pure.ts`                              | Pure shortcut matcher                                                  |
| `src/entities/terminal/keymap.pure.test.ts`                         | Exhaustive shortcut match tests                                        |
| `src/entities/terminal/focus-navigation.pure.ts`                    | Given tree + focused leaf + direction, compute target leaf id          |
| `src/entities/terminal/focus-navigation.pure.test.ts`               | Layout walk + geometry tests                                           |
| `src/entities/terminal/terminal.model.ts` (edit)                    | Add `dockHeightBySessionId`, `dockVisibleBySessionId`, related actions |
| `src/features/terminal-pane/close-confirm.container.tsx`            | Modal for running-process close                                        |
| `src/widgets/terminal-dock/dock-resize.container.tsx`               | Top-edge resize handle                                                 |
| `src/widgets/terminal-dock/terminal-dock.container.tsx` (edit)      | Register keydown listener, dispatch to store; wire visibility + height |
| `src/widgets/terminal-dock/terminal-dock.container.test.tsx` (edit) | Keyboard shortcut dispatch, visibility toggle, resize clamp tests      |

## Testing Strategy

### Pure

- `keymap.pure.test.ts`: every shortcut combo, platform gating, non-match fallthrough
- `focus-navigation.pure.test.ts`: from a given tree, focus → adjacent leaf in each direction; no-op at edges
- `foreground-process.pure.test.ts`: `ps` output → structured result, edge cases (no children, dead process, multiple children)

### Unit

- `terminal.model.test.ts` (expanded): dock height clamping, visibility toggle, shortcut-driven actions dispatch correctly
- `terminal-dock.container.test.tsx`: Cmd-D dispatches split, Cmd-W with guarded process opens modal, modal confirm calls closeTab, Cmd-K calls xterm.clear on focused instance (mock xterm)

### Manual

```
# in running app:
# 1. Open terminal. Cmd-T twice → 3 tabs in one leaf. Cmd-Shift-] → cycles forward. Cmd-Shift-[ → back.
# 2. Cmd-D → vertical split. Cmd-Shift-D in right pane → horizontal split inside right.
# 3. Cmd-Alt-← / → / ↑ / ↓ → focus walks correctly across nested splits.
# 4. In a tab, run `sleep 300`. Cmd-W → modal appears: "Close terminal running sleep?". Cancel → pane stays, process keeps running. Cmd-W again → confirm → pane closes, process killed.
# 5. In a tab running just zsh (no child): Cmd-W → closes immediately, no modal.
# 6. Cmd-K → scrollback clears, shell prompt preserved, typing still works.
# 7. Cmd-` → dock disappears, takes zero height. Cmd-` again → reappears, previous layout + ring-buffered output visible.
# 8. Drag dock top edge up → dock grows. Drag below 120px → clamps. Double-click → resets to 280px.
# 9. Open terminal in session A. Switch to session B. Open terminal in B. Switch back to A → A's tree visible. B's PTYs still alive (background).
# 10. Quit app (Cmd-Q) → `ps aux | grep zsh` shows no orphan shells from Convergence.
```

## Verification Gate

```
npm install
npm run test:pure
npm run test:unit
chaperone check --fix
```

All green. Manual checklist run on macOS. Re-verify every success criterion in the parent spec.

## Risks

- **Shortcut conflicts with OS / Electron:** Cmd-W is already handled by Electron's default "close window" on some menu configs. We need to intercept at the renderer level via `preventDefault` and verify against the app menu (check `electron/main/index.ts` menu template). If a menu item captures Cmd-W first, our handler never fires. Mitigation: register an accelerator-neutral menu item or explicitly override with `role: null`.
- **Cmd-` capture:** backtick is benign but worth testing across international keyboard layouts. If layout issues appear, fall back to Cmd-J or similar.
- **`ps` on macOS permissions:** foreground-process detection may return nothing in sandboxed Mac App Store builds. Our build isn't sandboxed (see `electron-builder.yml`), so should work, but note for the future if distribution changes.
- **`xterm.attachCustomKeyEventHandler` races:** handler runs before xterm's own shortcut handling; make sure we don't leak keys that xterm itself handles (e.g. Cmd-C on selection — xterm copies, we should not fire anything).
- **Dock visibility + pane focus:** when hidden, focus must go somewhere sensible. Move focus to SessionView on dock-hide.

## Boundaries

### Always do

- Let xterm receive every key we don't match as a shortcut.
- Dispose PTYs on both `app.before-quit` and `BrowserWindow.close`.
- Clamp dock height to `[120, windowHeight * 0.6]` — non-negotiable, prevents accidental fullscreen terminals.
- Reset focus to SessionView when dock is hidden or empty.

### Ask first

- Changing the shortcut table (goes through user; parent spec locks these).
- Adding sandboxing to the Electron build (would break `ps`-based detection).
- Persisting dock height/visibility across app restarts (deferred).

### Never do

- Block xterm from seeing arrow keys, control keys, or any non-shortcut input.
- Kill a PTY without calling `terminal.dispose(id)` (leaks handle on the backend map).
- Hardcode assumptions about user's shell name when detecting foreground processes (compare against spawned shell path from create time, not a literal `'zsh'`).
