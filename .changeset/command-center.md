---
'convergence': minor
---

Add a global Cmd+K command palette for cross-project navigation.

- `Cmd+K` (macOS) / `Ctrl+K` (other platforms) opens a global palette from
  anywhere in the app. An empty query shows curated sections — **Waiting on
  You**, **Needs Review**, **Recent Sessions**, **Projects**, **Workspaces**,
  **Dialogs** — in that order. Typing ranks projects, workspaces, sessions,
  dialogs, and "New session in <branch>" / "New workspace in <project>"
  affordances via Fuse.js weighted over session name, project name, branch
  name, provider, and dialog title.
- Selecting a session in another project performs a single cross-project hop
  (`switchToSession`) that preserves the existing sidebar **Waiting on You**
  click behaviour. Selecting a workspace activates its owning project;
  selecting a dialog routes through the shared `useDialogStore`.
- **Behaviour change:** the terminal `Cmd+K` (clear) shortcut is now scoped
  to terminal-dock focus. When your focus is outside the dock, `Cmd+K` opens
  the palette; click into a terminal pane first to clear it. All other
  terminal shortcuts (`Cmd+T`, splits, focus-adjacent, toggle-dock) are
  unchanged and still fire from anywhere.
