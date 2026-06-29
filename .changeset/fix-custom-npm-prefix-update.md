---
'convergence': patch
---

Fix provider updates (e.g. Codex) failing with "Could not find npm for the detected install" when global packages are installed under a custom npm prefix such as `~/.npm-global`. The updater now resolves npm from the prefix-local path with a PATH fallback and pins the install to the owning prefix with `--prefix`.
