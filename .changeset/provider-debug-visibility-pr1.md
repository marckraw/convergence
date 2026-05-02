---
'convergence': minor
---

Add provider liveness clock and always-on debug capture. Long-running sessions now emit a transcript note after 60 seconds of silence from the provider subprocess, and a warning after 3 minutes, so users can tell whether a Codex/Pi/Claude turn is genuinely working (e.g. reasoning before tool output) or stuck. Codex `item/started` notifications with `reasoning`/`agentReasoning` item types now map to the `thinking` activity. In dev builds, every provider event including previously-dropped unknown methods is logged to stderr as JSONL.
