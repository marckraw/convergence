---
'convergence': patch
---

The session header stops saying "Running" about sessions that are not (MAR-2590).

**Idle sessions no longer show a spinning "Running" pill.** The header's state
pill read `attention` alone and rendered a spinner for any value it had no
label for. `'none'` is a perfectly ordinary attention state — it is where every
session comes to rest, and it means "nothing needs you" — so it fell into that
gap. In the seeded sandbox database that is 41 of 545 sessions, every one of
them claiming to be working while sitting still.

The pill now reads `status` and `attention` together. The spinner is decided by
`status === 'running'` and nothing else; `'none'` renders nothing at all,
because silence is the honest rendering of "nothing needs you". A session
blocked on you still shows its own pill even while the turn is technically
running — an approval prompt arrives mid-turn, and the pill you have to act on
outranks the one that tells you the machine is busy.

On a session that is not running, an attention value this build has no branch
for is quiet too: a pill nobody can explain is not worth sending you to look at
a session for. A running session still shows "Running" — the spinner is the
status's to give, and an unreadable attention takes nothing away from what the
status plainly says. And the label map is now exhaustive over `AttentionState`
at the type level, so a new attention state is a compile error rather than a
value that renders as nothing.

That quiet fallback is now actually reachable. The label lookup ran straight
through a plain object, which resolves inherited properties: an attention value
of `'toString'` — and the session record holds whatever the wire sent it, not
only what the type allows — returned `Object.prototype.toString`, a function,
which is truthy, so the fallback never fired and React was handed a function to
render. The lookup now asks `Object.hasOwn` first, which is the question it
always meant.

**Remote sessions can finally report that they finished.** The remote execution
host forwarded the daemon's `attention` events to a callback nothing in
Convergence subscribes to — the same vestigial-callback loss MAR-2582 found for
`status` and `continuation-token`. So a remote session's attention never
reached the session record and sat at `'none'` for its whole life: it could not
report that it had finished, and an approval prompt raised on the far side
never reached the row a human reads. Wire `attention` events now patch the
session as well as firing the callback, through the same handle-scoped dispatch
the status bridge uses.

And a _finished_ remote turn now says so. The daemon splits a settle across two
wire events — `status: completed`, then `attention: finished` — and the second
arrives after the settle has already released the handle, so it is dropped, as
a released handle's claims about a run must be. A terminal status and the
attention it means are one fact, so they are now one write, exactly as the
local path has always written them: `completed` settles as `finished`, `failed`
settles as `failed`. The daemon's trailing frame still arrives, now carrying a
value the row already holds, and loses nothing when it is dropped.

A settle can reach the record two ways — the dedicated `status` event, and a
session patch carrying a terminal status — and Convergence ends the turn on
either, so both now carry the outcome, from one derivation that cannot drift
between them. A host that states an attention of its own alongside the status
keeps it: it is the authority on what its own run needs.

Still callback-only and still dropped, on purpose and filed rather than widened
here: the wire's `context-window` and `activity` events.
