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

**The Execution Bar** — a new tier beneath the composer's option row names the
machine a session will run on. This machine first and by default, then each
configured endpoint. It is a chooser while a session is being born and a
statement of fact once the session is live, because the daemon owns a running
session and its machine cannot change underneath it. A live session whose
endpoint has since been removed says so rather than appearing to run here.

The "Remote" toggle is gone. It was a yes/no in a world that now has several
machines, and it always resolved to whichever endpoint happened to be first —
so picking the second one was not something it could express. The strip records
which machine, and when the machine picked stops being reachable (its endpoint
removed, or a provider selected that the daemon cannot run) the strip shows this
machine and the session starts here, rather than sending to a machine that has
gone. The tier stays hidden entirely when no endpoint is configured.

The strip does **not** yet change the provider and model list above it: picking
a remote machine still shows this machine's provider catalog, exactly as the old
toggle did. That is MAR-2583 and it is fixed next.
