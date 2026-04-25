---
'convergence': patch
---

Document the Prettier formatting rule in `CLAUDE.md` and `AGENTS.md`. Agents must accept reformatting from `chaperone check --fix` (including diffs to files outside their immediate scope), commit those changes — separately as `chore: prettier` if they're unrelated to the current task — rather than skip them or assume they're someone else's WIP.
