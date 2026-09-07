---
'convergence': patch
---

Mission Control: history under the canvas (MAR-2835).

Press History and the crew's runs appear under the graph, newest first. Pick
one and the diagram shows what that run did — the wires it used wearing their
outcomes, everything else faded, and a line saying plainly that this is your
current layout rather than a reconstruction of what the crew looked like at the
time.

Several correction cycles are one run, with a group per lap, so a run that went
round three times reads as one attempt with nine deliveries instead of three
unrelated things. A delivery that failed says why on the row, without being
clicked. A run that needs you says which of the four ways it needs you, and
never reads as one that was handed back — read off the run's own recorded
events, so a run from before this release whose delivery broke says so too
instead of reading as one that finished quietly. A delivery whose ending was
never written down says that, rather than showing as still running forever.
A turn running longer than an hour reads _Ending not recorded_ until its
settlement receipt lands. Older builds recorded tool-only settles as `error`;
those historical rows now read as failed and retain that recorded outcome.

Crews with a long history load a page at a time, with a _Load older runs_ row
under the list when there are more. If an older page fails to load, the runs
already loaded stay visible with an inline error. _Retry older runs_ retries
that same page without dropping the list.

Picking an event opens what was recorded when it happened — source, recipient,
baton, outcome, timestamp, and whatever reply preview the ledger kept — beside
a separate link to the connection's current settings, because those are two
different questions. For a call, Mark seen acknowledges it and says out loud
that it does not send a reply or restart the run.

Nothing on this surface sends anything. Reloading after a load error reads the
records again; filters change the view, not the record. Both say so.
