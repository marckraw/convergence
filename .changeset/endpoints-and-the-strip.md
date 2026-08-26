---
'convergence': patch
---

Settings holds many execution host endpoints (MAR-2642, MAR-2629).

The single "Execution host URL" field has become a list. Each endpoint is a
named machine with its own address and its own daemon API token, added and
removed from the Execution host section, and a session runs on the machine it
named or refuses to run at all.

Removing one now says what it costs before it happens. Convergence counts the
sessions that name the endpoint each time Settings opens and warns when any do
— removing an endpoint does not move its sessions to another machine. Remove
waits while that count is still being read rather than treating an unread count
as zero, and says so plainly when the count could not be taken.

A token is filed under the endpoint that owns it and is destroyed when that
endpoint is removed. A cleanup the Keychain refuses is retried on the next
settings load and every time the settings dialog is opened, so a token can no
longer outlive the machine it authenticates. Adding an endpoint always mints a
fresh identity, so a new machine can never inherit a removed one's sessions or
its stored token. When `CONVERGENCE_EXECUTION_HOST_DAEMON_TOKEN` is set but no
endpoint carries the id it serves, Settings now says the variable authenticates
nothing instead of leaving it silently dead.

Pasted tokens no longer travel in a command line where any other process on the
machine could read them, and a "Connected" result disappears once the address
or the token it was about has changed.
