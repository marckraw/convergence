---
'convergence': patch
---

Internal: `npm run dev:sandbox` starts a dev instance on its own isolated
data directory, so it can run — and restart freely — beside the stable app
without the two marking each other's live sessions as failed (MAR-2426).
`npm run dev:seed` fills that sandbox with a consistent snapshot of the real
app's database and attachments, taken safely while the stable app keeps
running. The two-instance iteration ritual is documented in
`docs/runbook/dev-sandbox.md`.
