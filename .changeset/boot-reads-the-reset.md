---
'convergence': patch
---

If Convergence restarts in the middle of a `/clear`, the message queued behind it is failed with a reason and Loom offers the retry, instead of waiting for ever on a failed seat. Deliveries that a restart ends are now reported to Loom and the relay ledger once they start listening, instead of being marked as told to nobody. A `/clear` that waited behind a busy seat and then failed now delivers the message behind it, as one sent to an idle seat already did.
