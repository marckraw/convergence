---
'convergence': patch
---

Add the RemoteExecutionHost adapter: runs Providers on an agents-daemon over the execution host wire protocol (POST start, SSE events with sequence-resumed reconnects, posted command envelopes), passing the same contract suite as the local adapter. Not yet wired into session flows.
