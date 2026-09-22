---
'convergence': patch
---

If Convergence restarts while a queued `/clear` is running, the message waiting behind it is failed with a reason and Loom offers the retry, instead of waiting for ever on a failed seat. Deliveries that a restart ends are now reported to Loom and the relay ledger once they start listening, instead of being marked as told to nobody.
