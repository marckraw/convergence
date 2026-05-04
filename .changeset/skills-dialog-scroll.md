---
'convergence': patch
---

Fix the Skills dialog so the right details pane scrolls all the way to
the bottom on large screens. The middle grid had no row track, so the
inner `overflow-y-auto` had no resolved height and the SKILL.md card got
clipped behind the footer.
