---
'convergence': minor
---

Pi provider now implements the `oneShot` interface used by Claude Code and Codex providers. This unlocks summary-driven flows (session fork, session naming, initiative synthesis) for pi sessions. The implementation spawns the pi binary in `--mode rpc`, sends a `prompt` request, accumulates `text_delta` chunks, and resolves on `agent_end`. Task progress events are emitted when a `TaskProgressService` is wired in.
