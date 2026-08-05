---
'convergence': patch
---

Local model tunnels no longer lose a start failure, or take it out on the
main process (MAR-2250). Starting a tunnel keeps working in the background
after the UI gets its "starting" snapshot, and that background work held no
failure handler: anything it threw became an unhandled rejection while the
profile sat on "starting" forever. It now lands in the profile's status,
named. Health probes answer "I could not tell" instead of throwing when their
transport fails, and a monitor pass that overlaps a status change no longer
writes its stale view back over it — a failure recorded mid-probe used to
come back as a bare "stopped" with no error at all.
