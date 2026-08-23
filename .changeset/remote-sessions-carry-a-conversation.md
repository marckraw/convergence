---
'convergence': patch
---

Remote sessions stop being one-shot (MAR-2582).

**A remote session could carry exactly one turn.** It started, streamed, and
the agent answered — and then the header kept spinning forever and every
follow-up died with _"Session cannot be resumed: missing continuation state.
Start a new session."_ That made the whole remote path a demo rather than a
place to work.

**Two defects, one symptom.**

_The turn never ended._ The daemon reports a turn ending and the continuation
to resume it as dedicated wire events. Convergence handed both to callbacks —
`onStatusChange` and `onContinuationToken` — that nothing in the app has ever
subscribed to. Every provider implements the pair; no caller reads it. The
live path is a session patch, which is what the local adapters send alongside
the callback, and the remote adapter was the one that only did the dead half.
It patched the session when a run _failed_ and never when one succeeded. Both
kinds now patch the session as well as firing the callback, so a remote turn
settles and the header stops spinning.

_The next turn asked for the wrong thing._ Having settled, a follow-up went
down the local-provider path: start the provider again, carrying the
continuation token. On this wire that is not how a conversation continues. A
remote session takes exactly **one** start — the daemon answers a second one
for the same session id with `409 Session already exists` — and every later
turn is a `send-message` command on the run it already has. So a follow-up now
attaches to that run, resuming the event stream after the last sequence
Convergence recorded, and sends the message on it. The continuation token is
still stored, because the daemon reports it and the session record should hold
what the daemon said; it no longer drives a second start.

Attaching happens when a message is sent, not at boot: the database holds
hundreds of remote sessions and each attach is a live connection. Only
sessions that were still running when the app closed are reattached eagerly,
as before.

Still callback-only and still dropped, on purpose and filed rather than
widened here: the wire's `attention`, `context-window` and `activity` events.
