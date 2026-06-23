---
'convergence': minor
---

Persist the skill catalog so opening the Skills dialog and the composer skill picker is instant after the first scan. Each provider adapter is now wrapped in a SQLite-backed cache-aside decorator: filesystem providers (Claude Code, Pi, Antigravity) invalidate by a cheap content fingerprint that detects added, removed, or edited skills on the next open, while RPC providers (Codex, Cursor) cache for a 5-minute TTL instead of re-spawning on every open. The dialog's Refresh action force-bypasses the cache, and only successful scans are cached so a transient failure never sticks.
