---
'convergence': patch
---

Stop killing Codex sessions that were about to recover (MAR-2315, MAR-2316,
MAR-2317). "Reconnecting... 2/5" is Codex's own retry notice, not a death
rattle — Convergence used to treat it as fatal and shut the process down
mid-retry, which is why a network blip so often ended in "Process exited with
code 1". A retry now leaves a warning note and the turn carries on.

Nothing sits on "running" forever any more. Every request to the Codex
app-server has a patient budget measured in silence rather than total time, so
a stalled server is noticed while a long turn is left alone, and a connection
that dies takes the session back to a clean respawn instead of leaving the
composer blocked with nowhere to write.

When a Codex process does die, the session says why: the exit note now quotes
what the process printed on its way out instead of showing a bare exit code, a
process that vanishes mid-turn is reported instead of ignored, and an approval
that was waiting on you ends with the process rather than staying stuck on
"needs approval" with a button that does nothing. A resumed session also
resumes its thread properly after a respawn, instead of asking a fresh process
to continue a conversation it has never seen.
