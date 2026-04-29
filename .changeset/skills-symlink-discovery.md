---
'convergence': patch
---

Discover skills exposed as symlinked directories under `~/.claude/skills/` and project skill roots. The filesystem skill scanner previously dropped symlinks because `Dirent.isDirectory()` reports `false` for them, so externally managed skill collections (e.g. Matt Pocock's installer) never appeared in the composer skill picker.
