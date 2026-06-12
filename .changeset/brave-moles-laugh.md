---
'convergence': patch
---

Remote sessions now tolerate roughly 2.5 minutes of daemon/gateway outage before the event stream is declared lost (previously ~30 seconds), pairing with the daemon's new SSE keepalives so idle sessions waiting on approvals survive reverse-proxy timeouts.
