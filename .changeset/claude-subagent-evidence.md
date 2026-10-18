---
'convergence': patch
---

Claude subagents: a finished subagent keeps its last words as its run's summary, a task keeps the description it started with instead of turning into each progress step ("Running …"), and a subagent working in the foreground no longer leaves "Background task started" and "Background task … finished" notes in the transcript. Its "Result returned" marker comes from its own result and says how the run ended, so a stopped subagent reads "stopped" rather than "failed".
