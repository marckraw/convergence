---
'convergence': patch
---

Use the scoped `FEEDBACK_TOKEN` env var when submitting feature requests to Convergence Cloud. The previous `INTERNAL_API_TOKEN` granted access to every protected cloud route; the new token is limited to `/api/feedback/*` so a leaked desktop build can only hit the feedback intake.
