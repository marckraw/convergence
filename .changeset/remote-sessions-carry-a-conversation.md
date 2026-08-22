---
'convergence': patch
---

Remote sessions stop being one-shot (MAR-2582).

**A remote session could carry exactly one turn.** It started, streamed, and
the agent answered — and then the header kept spinning forever and every
follow-up died with _"Session cannot be resumed: missing continuation state.
Start a new session."_ That made the whole remote path a demo rather than a
place to work.

**Two facts were arriving and being thrown away.** The daemon reports a turn
ending and the continuation to resume it as dedicated wire events. Convergence
handed both to callbacks — `onStatusChange` and `onContinuationToken` — that
nothing in the app has ever subscribed to. Every provider implements the pair;
no caller reads it. The live path is a session patch, which is what the local
adapters send alongside the callback, and the remote adapter was the one that
only did the dead half. It patched the session when a run _failed_ and never
when one succeeded.

Both events now patch the session as well as firing the callback, so a remote
turn settles and its continuation is stored — on a fresh start and on a session
reattached after a restart alike, since both go through the same event handler.
The next message resumes the remote run on that continuation instead of being
refused.

**What this does not claim.** The bridge is correct whatever the daemon sends:
an event we were handed and discarded was a defect on its own terms. Whether it
is _sufficient_ depends on the daemon actually emitting those kinds, which the
wire trace shipped alongside this change is there to show. If the daemon
reports completion some other way, this repair holds and a further one is
needed.

Still callback-only and still dropped, on purpose and filed rather than
widened here: the wire's `attention`, `context-window` and `activity` events.
