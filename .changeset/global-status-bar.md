---
'convergence': minor
---

Add a global status bar across the bottom of the app that surfaces agent activity across every project.

- Aggregate counters for running sessions and sessions that need the user, with a popover grouped by project.
- Per-project chips for projects with active or attention-needing sessions, clickable to switch project.
- Recency badge for the most recently completed or failed session.
- New `activity` signal on sessions (`streaming`, `thinking`, `tool:<name>`, `waiting-approval`, or `null`) derived from provider events for Claude Code, Codex, and Pi, persisted on the session row and shown per-session in the project popover.
