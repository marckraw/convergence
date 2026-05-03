---
'convergence': patch
---

Fix transcript scroll fighting the user. The virtualized transcript no longer re-anchors to the bottom on every render of the last row, so scrolling up stays where you left it. Auto-follow still re-engages while you're near the bottom (including streaming size growth) and resets on session switch.
