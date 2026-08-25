---
'convergence': patch
---

Remote sessions stop being one-shot (MAR-2582).

**A remote session could carry exactly one turn.** It started, streamed, and
the agent answered — and then every follow-up died with _"Session cannot be
resumed: missing continuation state. Start a new session."_ That made the whole
remote path a demo rather than a place to work.

**Two defects, one symptom.**

_The turn never ended._ The daemon reports a turn ending and the continuation
to resume it as dedicated wire events. Convergence handed both to callbacks —
`onStatusChange` and `onContinuationToken` — that nothing in the app has ever
subscribed to. Every provider implements the pair; no caller reads it. The
live path is a session patch, which is what the local adapters send alongside
the callback, and the remote adapter was the one that only did the dead half.
It patched the session when a run _failed_ and never when one succeeded. Both
kinds now patch the session as well as firing the callback, so a remote turn
comes to rest in the record and the next message is treated as a new turn
rather than as input to a run that never finished.

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

**A settle now ends the run of the handle that began it, and no other.**
Resuming a stream means asking the daemon for everything after the last
sequence the record kept, so a cursor sitting behind the record hands the
terminal event back — and applying it a second time released the handle the
_new_ turn was streaming on: the message reached the daemon and the answer
never reached the app.

Sequence numbers cannot pick that event out. The same settle can arrive
through both encodings the wire supports — a dedicated status event and a
session patch carrying one — and the duplicate lands at a _higher_ sequence,
which is exactly what a genuinely new settle looks like. And a session that
came to rest under an earlier build carries a cursor one event short of its
own settle, so the replay sits above any marker derived from it. Those rows
already exist; nothing can repair them after the fact.

So a terminal event is attributed to the handle it arrived on, and read for
where it came from. A handle that attached to a session the app already had at
rest inherits no run of its own until the daemon reports that session moving
again, so a settle the daemon replays from the stream cursor changes nothing —
but a failure the handle raises about _itself_ never came off the wire, and it
always ends the run it belongs to. That includes an attach that died before it
ever began: the run failed, the record said so, and the dead handle stayed
installed as the session's live one, quietly eating every message sent after
it. A handle the app has released says nothing about the session at all, and a
disposed run stops dispatching the events already buffered behind it, for the
same reason: they belong to a handle nobody is listening to any more.

**A message the app cannot deliver says so.** A remote run that has died still
answers when it is handed a message, and there is nothing else to notice: the
daemon is what echoes a user's turn back, so a message that never left leaves
no turn, no error, and no trace. Sends, approvals and denials that reach a run
that can no longer carry them now surface the same "was not delivered" note as
a command the daemon refuses.

The session also records which event settled it, in the same write as the
status and the stream cursor, so an interruption can no longer leave a session
recorded as settled with a cursor pointing at the event before the settle.
That is defence in depth rather than the fix — closing the window stops new
rows entering it and heals none of the rows already in it.

**In the debug log**, an attach that never reached the daemon is recorded as an
attach that could not resolve a connection. It used to be recorded as a
refused start, which is evidence of a second start on a wire that permits
exactly one.

Still callback-only and still dropped, on purpose and filed rather than
widened here: the wire's `attention`, `context-window` and `activity` events.
So the header keeps spinning even once a remote turn has come to rest: the pill
is drawn from `attention`, and it renders a spinning _Running_ for every value
it has no label for — including the `none` a remote session never leaves. That
is MAR-2590, a separate defect this release does not touch.
