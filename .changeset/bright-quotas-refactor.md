---
'convergence': patch
---

Refactor provider quota and session runtime boundaries by routing quota reads through a unified provider source facade, migrating usage UI to the unified snapshot API, and extracting queued input and liveness responsibilities out of `SessionService`.
