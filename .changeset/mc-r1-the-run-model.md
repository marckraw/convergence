---
'convergence': patch
---

Mission Control: a crew run can now go round more than once (MAR-2833).

A wire that already carried a run used to refuse the second time, so a review
loop closed after exactly one pass and an unattended correction cycle was not
something Convergence could do. It now carries again, one lap higher, and the
lap is recorded on every delivery — so history can show a run as the several
correction cycles it really was.

Nothing was loosened to make room for it. The crew's delivery limit is spent
across the whole run, so coming back to the first station refills nothing, and
a run that ends badly now says so out loud: a delivery that failed and the
20-hop runaway backstop both call you, where before they stopped the run in
silence. A turn that finishes without anything to say is not one of those: the
wire holds quietly and nobody is called, so a crewed conversation you are
driving by hand never files a delivery failure just for ending on a tool call.
In the crew panel, "round cap" now reads "Delivery limit … per run" and the
stall box reads "Ask for attention after … minutes" — the same two numbers,
named for what they actually do.
