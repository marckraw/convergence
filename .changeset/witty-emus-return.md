---
'convergence': patch
---

Remote sessions now survive app restarts: running remote sessions are no longer marked failed on launch — Convergence reattaches to the daemon's event stream and resumes after the last processed event, replaying anything that happened while the app was closed.
