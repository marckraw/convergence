---
'convergence': patch
---

Add agent task progress primitive and wire fork-preview + auto-naming
to it. Long-running one-shot provider calls now stream `started`,
`stdout-chunk`, `stderr-chunk`, and `settled` events over a dedicated
IPC channel. The fork dialog's summary extraction shows a live elapsed
counter, a "still working" hint past 45s, and a stale warning when the
provider has produced no output for 30s beyond the extended threshold.
Session auto-naming uses the same primitive, surfacing its progress
to the dev-mode console subscriber without any visible UI yet.
