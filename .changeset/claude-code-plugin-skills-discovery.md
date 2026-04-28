---
'convergence': patch
---

Claude Code skills picker now lists plugin skills installed via `/plugin install`. Discovery reads `~/.claude/plugins/installed_plugins.json` for authoritative install paths and falls back to a depth-bounded walk of `~/.claude/plugins/cache/` when no manifest is present, so plugins like `agent-skills`, `caveman`, and `frontend-design` surface in the picker just like in the real Claude Code harness.
