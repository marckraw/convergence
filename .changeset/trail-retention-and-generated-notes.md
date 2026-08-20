---
'convergence': patch
---

The relay hop trail can now be read further back and emptied safely, and the
generated release-notes file stops living in git (MAR-2440, MAR-2408).

**A trail you can read to the end.** A crew's Flow section showed the newest
fifty firings and nothing else — everything older was in the database with no
way to reach it. Open the trail and a **Load older** button now walks back
through it fifty at a time, and it disappears the moment there is genuinely
nothing behind it rather than showing you one last empty page. Paging older
rows no longer costs you them: a wire firing while you read keeps the newest
row at the top without throwing away history you deliberately loaded.

**A trail you can empty.** **Clear trail** sits beside the hop count, and the
first press only asks. The confirm says exactly what it is agreeing to —
"Clear every hop? The wires and sessions stay." — because "clear" a few pixels
from a switchboard could plausibly mean unwiring something. If the red ⚠ badge
is up, the confirm adds "This also dismisses 2 alerts", so the one thing a wipe
destroys unread is named before it goes. Clearing in one window clears it in
every window.

**Except what a running flow needs.** A flow still in flight keeps its rows,
and the trail says so: "Kept 1 hop from a flow that is still running." That is
not politeness. Convergence uses the ledger to know a wire already fired this
run — it is what ends A → B → A at two hops instead of ping-ponging — so
deleting a live run's rows would tell a wire it never fired and reopen the loop.
The engine names the runs it is still carrying and the clear leaves those
alone.

**And the papercut behind the scenes.** `release-notes.generated.json` was a
generated file that was also tracked in git, so every build rewrote it and left
the tree dirty. It is a build artifact now, regenerated on demand by the
commands that need it. Nothing user-visible changes; the release-notes dialog
still shows the version you are on.
