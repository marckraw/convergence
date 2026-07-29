---
'convergence': patch
---

Fixes Pi sessions hanging forever on older Pi installs. Convergence marks a Pi run finished when Pi reports it has fully settled, but that signal only exists in Pi 0.80.4 and later — on anything older the session sat "running" indefinitely. Convergence now checks the detected Pi version and falls back to the previous completion behaviour below that floor, so sessions always finish.

The provider status panel now flags a Pi install that is too old to report completion accurately, and explains why an installed provider is degraded instead of only showing a badge.
