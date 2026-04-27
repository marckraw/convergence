---
'convergence': patch
---

Use the scoped `FEEDBACK_TOKEN` env var when submitting feature requests to Convergence Cloud. The previous `INTERNAL_API_TOKEN` granted access to every protected cloud route; the new token is limited to `/api/feedback/*` so a leaked desktop build can only hit the feedback intake. The release workflow now writes `.env` from a GitHub Actions secret before packaging so signed Mac builds ship with the token bundled.
