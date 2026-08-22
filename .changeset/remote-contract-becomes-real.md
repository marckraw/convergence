---
'convergence': patch
---

The remote execution host speaks the daemon's real contract (MAR-2576).

**Remote sessions can start again.** Against agents-daemon 0.26.1, starting a
session on a remote host failed outright with HTTP 400: _"A session cannot use
both a Project working directory and a target repository."_ Convergence was
sending the daemon two contradictory instructions in one request — a working
directory (a path on your Mac, which since `projects.v1` the daemon reads as a
Project) and a repository for it to clone. Older daemons ignored the first;
0.26.1 refuses the pair. The start request now sends the working directory only
when there is no repository to clone, so the remote path works against the
current fleet. This was not introduced by the rewrite below — the previous code
sent both fields too — but it is fixed here.

**The rest of this change is meant to be invisible**, and that is the point:
what changed is what Convergence is standing on when it talks to a daemon.

**The wire types are no longer a hand-copy.** Convergence's remote path carried
a frozen transcription of the daemon's protocol — the same version number, and
no way to notice when the daemon moved past it. It now depends on the published
`@mrck-labs/execution-host-protocol` (0.13.0), the same package the daemon and
Emergence speak, with a mapping layer between that wire shape and Convergence's
own session model.

**Every dropped field is now named.** Start config to start request, wire delta
to local delta and back, the four commands, send-message options: anything the
wire carries that Convergence has no reader for is listed in a constant that
says why. The start request used to hand the daemon Convergence's local config
object whole and let it silently discard whatever it did not recognise —
including a provider-account id that was never the daemon's business. It is now
built field by field; round-trip tests pin the fields that are mapped today,
byte-for-byte, and the losses are the named constants above. What those tests
cannot do is see a field the protocol has not grown yet: a later version that
adds one would still be dropped until someone maps it.

**The daemon says who it is before we trust it.** Every provider refresh now
also asks `GET /health` — unauthenticated, and run concurrently with the
listing, so it usually adds no wall-clock at all; when the daemon is slower to
introduce itself than to list its providers, the refresh waits for the slower
of the two. That cost is bounded by a 15s cap — 15 rather than something
tighter because a cold daemon takes seconds to answer, and a cap at all because
a proxy that swallows the route would otherwise hang the whole refresh.
Providers and handshake commit together in one step, so two overlapping
refreshes can never pair one daemon's providers with another daemon's identity.

**The one thing you can see:** Settings → Remote execution host → Test
connection now reports the daemon version and API version, and the execution
protocol capabilities it advertises. A daemon that serves no `/health` connects
exactly as before, with those lines simply absent — an unknown version is not
dressed up as an answer. A daemon speaking a protocol this build cannot read is
now refused out loud as incompatible rather than half-working.

Known and filed, not fixed here: a truncated remote diff still renders on the
review surface as if it were whole (MAR-2577).
