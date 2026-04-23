---
'convergence': minor
---

Group the extended Changed Files panel by agent turn. Each round-trip
from user message to agent-idle is now recorded as a turn with its own
per-turn diffs, so reviewers can see what the agent did in each step
rather than a single cumulative working-tree diff. The compact view is
unchanged and continues to show the live git-status list. Existing
sessions show an empty turn list in the extended view — only sessions
started after this release accumulate turn records.
