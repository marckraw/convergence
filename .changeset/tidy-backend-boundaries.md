---
'convergence': patch
---

Tighten backend service boundaries by routing session app operations through a dedicated application service, isolating session row persistence behind a repository, and moving deterministic service helpers into focused pure modules with tests.
