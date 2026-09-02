---
'convergence': patch
---

The baton loop: a crew can close its own loop safely (MAR-2759). A relay may
now wait for a declared route — it fires only when the source session's last
message ends with the wire's condition, `BATON: <name>` by convention, matched
as one exact line and never sniffed out of prose. Wires without a condition are
untouched and fire exactly as they always did.

Five ways a loop can stop are now loud instead of silent. `BATON: marcin` parks
the loop at Marcin's chair, and it outranks every wire including the ones drawn
before conditions existed; a baton no armed wire answers to is an unrouted
hand-off and hails too, even from a station with no outgoing wire at all, and
each crew answers for itself so one crew's wire matching can never swallow
another's call; a lap that closes with a baton still riding hails rather than
stopping quietly; a per-crew round cap (12 by default) holds the wire and hails
rather than spending another turn; and a station that takes the work and goes
quiet raises a stall hail naming itself — while a station that came back is
left alone, which is what makes the alarm worth reading.

A crew that loops back on itself closes one lap per flow run: the round cap
governs a chain of distinct wires inside a run, and unattended second laps are
not part of this change.

A relay's first send (`/clear`) is now always quiet, structurally — an opener
finishes nothing, and a wire that treated its completion as a finish could
cascade into the next station. It is also always a turn of its own: fired at
a station that is mid-turn, the opener waits in the queue behind that turn
(on every provider, Pi included) instead of joining it, so a running station's
real work can never be mistaken for the loop's own plumbing — not even after a
restart has lost track of which inputs that turn carried.

Every relayed input now reaches exactly one ending. Cancelling a queued relay
input, or deleting a session with relay work queued or in flight, ends that
work's receipt explicitly: the loop lets go of it, the trail marks the hop
`cancelled` or `abandoned`, and the stall clock stays quiet about a station
that never took the work — while any other input still queued into the same
station stays owed. Work Convergence could not run — a send refused by the
provider with inputs queued behind it, a run found stale, a turn that failed
with inputs waiting, a queue that could not be drained — is marked `failed`
instead of waiting forever, and that one is loud: the stall hail names the
station at once rather than after the quiet window. Deleting a session lets go
of its receipts only once the delete has actually happened, so a delete that
fails leaves nothing half-forgotten.

Every delivery now carries a receipt: the session layer mints an id per
dispatched input and names it back on the settle that consumed it, so the
stall clock knows exactly which settle answered which delivered work — a
follow-up joined into a running turn is answered by that turn, two payloads
queued behind one turn are answered one by one, and an opener's own finish can
never mark the payload behind it as done. Acknowledging a stall hail now
silences that debt for good; the alarm re-arms only when a new hop lands in
the station.

Mission Control: crews get baton names and two loop knobs per crew, the canvas
draws Marcin's chair with real terminal arrows and one dashed
`otherwise · budget · stall` edge, a parked crew goes amber, and the hop trail
records the baton the message handed on together with the round each wire
belonged to. The round travels to the next station inside the wire's standing
instructions, so a wire nobody briefed still carries the message untouched.
