---
'convergence': patch
---

The test suites that drive a real `git` now spend a named time budget instead of
vitest's 5s default (MAR-2130, MAR-2248). They init bare repositories, fetch
between them and create worktrees on disk — which is exactly what they exist to
verify — so their wall-clock time depends on machine load rather than on the
code under test, and under the full suite they periodically timed out with a red
that said nothing about the product. Internal only; no behaviour change.
