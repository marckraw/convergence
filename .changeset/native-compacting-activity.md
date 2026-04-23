---
'convergence': minor
---

feat(activity): surface native provider auto-compaction as a `compacting` activity state in the session header and status bar. Pi maps `compaction_start`/`compaction_end`, Codex maps `contextCompaction` item lifecycle events, and Claude Code maps best-effort stream-json hook/compaction shapes, so users can see when the underlying CLI is auto-compacting instead of guessing during slower turns.
