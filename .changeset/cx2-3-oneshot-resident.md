---
'convergence': patch
---

Codex session naming and fork extraction now run as ephemeral threads on the account's resident Codex server instead of spawning a `codex exec` process per call: a read-only, no-approvals helper turn, one at a time per account, that leaves no rollout and interrupts itself when its budget runs out. Every helper states the provider account it spends, and the provider no longer knows a binary path at all.
