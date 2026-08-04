---
'convergence': patch
---

The Authorize button on a connector now works (MAR-2251, PA11.1). Claude Code
refuses to authenticate over piped input — "stdin isn't a terminal" — so
Settings → Accounts → Connectors ran a ceremony that could never finish. The
authorization now runs on a real terminal, still under the selected account's
own environment, so the browser opens, the tokens land in that account's slot,
and the row is re-read from the provider afterwards rather than assumed. A
login that prints a refusal is reported as a failure even when it exits
cleanly, and one nobody finishes is stopped after five minutes with the
connector named.
