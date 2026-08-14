---
'convergence': patch
---

The Claude Code usage pill is retired, and the app stops burning CPU to
compute it (MAR-2401).

Convergence had no way to ask Claude Code what your usage was, so it worked it
out the only way available: by re-parsing the transcript store that every
Claude account on the machine shares. On a heavy week that store is enormous,
and the composer asked for a fresh answer every two minutes — which is why the
fans came on and stayed on while a Claude session was open. The numbers were
never worth what they cost to produce, and they were machine-wide rather than
per-account anyway.

So the pill is gone, and with it the whole calculation behind it. Settings →
Usage still lists Claude Code, but now it says plainly that Convergence cannot
read these limits and links to the Claude usage page, the same way Cursor and
Antigravity already did.

Nothing else in that corner of the composer moves. The context-window dot, its
popover, and Compact context are a separate mechanism and behave exactly as
before. Codex usage is untouched: it reads real limits from Codex's own
authenticated endpoint, has never parsed a log, and keeps its pill and popover.
