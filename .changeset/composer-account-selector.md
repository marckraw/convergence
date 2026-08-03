---
'convergence': patch
---

The composer can now pick which Claude account serves the next turn. Accounts
appear beside the model picker by email and organization — an account is
identity and entitlements, not an anonymous slot — and switching mid-session
continues the same conversation on the newly chosen account from the next turn
onward. The picker locks while a turn is still in flight, shows accounts that
identity attestation disabled without offering them, and defaults to the login
this machine already had, which behaves exactly as before.
