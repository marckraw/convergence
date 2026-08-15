---
'convergence': patch
---

Mission Control has a third view: the Canvas, where a crew's Flow is drawn
rather than listed (MAR-2441).

Flat lays every session in one grid, Crews groups them into their containers,
and Canvas draws the crews that have wires. Sessions appear as live nodes
wearing the same attention colours and status dots they wear on their cards, so
one session reads the same whichever view you are in. Crews are boxes around
them, carrying their emoji and their accent. Sessions in no crew are not on the
canvas at all — the canvas is about flows, and a session in no crew is not in
one.

Relays are drawn as arrows from the session that finishes to the session that
receives. A live wire takes its crew's accent colour, or emerald if the crew
never chose one; a disarmed wire is grey and dashed, always, so switched-off can
never be mistaken for a crew that simply picked a quiet colour. A wire that
starts a new session points at a dashed chip naming what it will open — which
provider, which model — because a wire has to end somewhere and the session it
promises does not exist yet. Once it fires for real, the session it made appears
as an ordinary node.

Loops are drawn as loops. The layout runs left to right along the wires, and the
returning half of a review loop leaves and arrives along the underside instead
of lying on top of the wire it answers.

The canvas is live. When a wire fires, it thickens and its dashes march for a
moment, so you can watch work being handed along from across the room. A firing
that errored or burned its hop budget flashes red instead, overriding the crew's
own colour — a crew that picked a pretty accent cannot make its failures subtle.
Clicking a wire opens what it is, in the same sentence the crew container uses,
with its recent hops underneath in the same rows the trail uses. Clicking a
session opens it, exactly as clicking its card does.

This view reads and never writes. There is no connecting, no dragging wires into
place, no editing a relay from the canvas — wires are drawn where they are
authored, in the crew. Node positions are computed from the data rather than
stored, so two windows showing the same crew always agree.

Also: a disarmed wire whose session finishes no longer writes a ledger row. "No
silent hops" was always about firings you cannot see, not about a switch at rest,
and journalling every session that finished near a switched-off wire buried the
rows that mattered (MAR-2437, MAR-2438). Trails recorded by earlier versions
still read: an outcome this build does not recognise shows as a neutral "unknown
outcome" with the original word on hover, rather than going blank or raising a
false alarm.

Adds `@xyflow/react` (React Flow v12) as a dependency, used only by the canvas.
