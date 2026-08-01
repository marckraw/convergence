---
'convergence': patch
---

Codex usage limits are now fetched once even when several parts of the app ask at the same time. Each cold read spawns a Codex app-server and can take up to half a minute, so concurrent requests previously meant several processes and several round trips for the same answer.

When the usage RPC fails and Convergence falls back to the older path, the RPC's own error is now recorded in provider debug logs instead of being discarded, so a broken quota path can be diagnosed.
