---
'convergence': patch
---

Sessions record which machine they ran on (MAR-2620).

Internal only — nothing in the UI looks or behaves differently. A session used
to say `local` or `remote`, and `remote` meant "the one configured daemon".
It now names an execution host Endpoint by id, and the single remote base URL
in Settings has become the first Endpoint. The Remote toggle and the Execution
host URL field work exactly as before; the toggle simply writes that Endpoint's
id instead of the word `remote`.

Opening the database migrates in one transaction: the Endpoint is created from
the base URL still in Settings, the sessions that ran on it are moved onto it,
and the base URL leaves the settings blob so it lives in exactly one place. A
session whose Endpoint is no longer configured now refuses to start and says
which one is missing, rather than quietly running on a different machine.
