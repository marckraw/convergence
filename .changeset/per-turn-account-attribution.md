---
'convergence': patch
---

Every Claude turn now records which provider account served it, and holds that
account for the whole logical turn — including deferred-tool answers and
recovery restarts, which continue on the account that started the work rather
than whatever is selected when they happen. Turns taken with no account
selected behave exactly as before and are recorded as the default account. An
account that identity attestation disabled stops receiving turns instead of
being spent silently.
