---
'convergence': patch
---

Claude's own rate-limit signal now reaches the usage surfaces (MAR-2206, PA8).
Convergence used to discard the `rate_limit_event` Claude sends on every turn,
so the app could sit at a weekly limit without being able to say so. The reading
is now filed against the account that served the turn — keyed by execution host
and account, so two accounts never read each other's numbers — and shown on the
composer usage pill and in Settings → Usage. It reports the state, the window
and the reset time in words: the event carries no utilization percentage, and
none is invented. Display only; nothing rotates accounts on your behalf.
