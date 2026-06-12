---
'convergence': patch
---

Sessions can now target an execution host: a new per-session `executionHost` field ('local' default) routes session starts, capability checks, and continuation handling to either the in-process LocalExecutionHost or the remote agents daemon. Remote sessions translate the provider id to the daemon's namespace and send a workspace source derived from the repository's origin remote so the daemon can clone it. Backend only — the session creation UI toggle lands next.
