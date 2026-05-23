---
'convergence': patch
---

Fix provider update detection so Pi, Codex, and Claude Code can compare the installed CLI version against the latest npm version when version output is emitted on stderr or mixed with other CLI output.
