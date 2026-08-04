---
'convergence': patch
---

Connectors follow the account (MAR-2249, PA11). Each Claude account now has a
Connectors panel in Settings → Accounts that asks _that account_ what it can
reach and authorizes an MCP server through its own credential slot — so the
tokens land where the account will actually look for them, once, and survive
every later swap. When a turn hits a connector the running account has not
authorized, the transcript no longer shrugs: it names the server and the
account and offers a control to fix it, and says plainly when the session
cannot open a browser instead of pretending an action will work.
