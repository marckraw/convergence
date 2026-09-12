---
'convergence': patch
---

The remote resume cursor moves only after an event has actually been delivered
(MAR-2901).

A remote run's wire adapter marked an envelope as seen before handing it to the
session's listeners. A listener that throws escapes into the stream reader's
catch, which was already the right shape in two ways — the frame is not counted
toward the reconnect budget, and the durable cursor is never told about it, so a
restart replays it. But this run's in-memory cursor had already moved past the
event, so the reconnect asked the daemon for everything _after_ the one frame
the session never received. The failed event was the single event no resume
could bring back.

The cursor is now assigned after the listeners return, beside the durable write,
so the two "seen" facts move together or neither moves: a throwing listener
leaves both where the last delivered event was, and the reconnect replays the
frame it failed on. The throw is still not swallowed — a listener that keeps
throwing spends the reconnect budget and fails the session out loud rather than
spinning on a replay it cannot finish.
