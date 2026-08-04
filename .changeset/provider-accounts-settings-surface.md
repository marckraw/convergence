---
'convergence': patch
---

Provider accounts get a settings surface (MAR-2204, PA6). Enrol, rename, set
default, reconnect and remove Claude Code accounts from Settings → Accounts
instead of the developer console, listed by identity — email and organization —
with the attestation net's verdicts shown on the account they concern. The
stored plan now reads the subscription tier only: it used to fall back to
`organizationRole`, which reported "admin" for a Max account, and a verified
attestation refreshes it so an already-enrolled account heals itself.
