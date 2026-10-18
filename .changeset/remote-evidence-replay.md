---
'convergence': patch
---

A remote session no longer records a hook, retry or other harness event twice when Convergence quits or crashes right after the event arrives. The event and the point the stream resumes from are now saved together, so the host does not send it again on the next start.
