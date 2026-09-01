---
'convergence': patch
---

Extract the daemon client core into `@convergence/execution-host-client`
(MAR-2737). Internal only — Convergence's behaviour is unchanged: the same
functions run, from a workspace package instead of from
`electron/backend/provider/execution-host/`, and the app's own host, registry
and wire mapping stay exactly where they were and import the package. The
extraction is what lets a second app (Backpack Studio) talk to an
agents-daemon without inheriting Convergence's session runtime.
