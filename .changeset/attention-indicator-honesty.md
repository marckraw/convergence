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

An attention value this build has no branch for is quiet too, rather than
claiming "Running": a false spinner sends you to look at a session that needs
nothing from you. And the label map is now exhaustive over `AttentionState` at
the type level, so a new attention state is a compile error instead of a silent
spinner.

**Remote sessions can finally report that they finished.** The remote execution
host forwarded the daemon's `attention` events to a callback nothing in
Convergence subscribes to — the same vestigial-callback loss MAR-2582 found for
`status` and `continuation-token`. So a remote session's attention never
reached the session record and sat at `'none'` for its whole life: it could not
report that it had finished, and an approval prompt raised on the far side
never reached the row a human reads. Wire `attention` events now patch the
session as well as firing the callback, through the same handle-scoped dispatch
the status bridge uses.

Still callback-only and still dropped, on purpose and filed rather than widened
here: the wire's `context-window` and `activity` events.
