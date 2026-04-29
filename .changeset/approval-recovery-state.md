---
'convergence': patch
---

Fix stuck approval recovery in session conversations. Approval cards remain actionable even if later transcript items arrive after the request, and Codex sessions now fail cleanly with an error note if the provider exits before the active turn completes.
