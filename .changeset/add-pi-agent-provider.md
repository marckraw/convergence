---
'convergence': minor
---

Add Pi Agent (by Mario Zechner) as a third first-class provider alongside Claude Code and Codex. Convergence detects the `pi` binary on PATH, registers a `PiProvider` that drives `pi --mode rpc` via its custom JSONL protocol, and maps pi's streaming events (message_update text/tool-call deltas, tool_execution_end, turn_end stats, agent_end stop reasons, compaction/auto-retry) onto the existing transcript model. Auth is delegated to the CLI — when `pi` is installed but `~/.pi/agent/auth.json` is empty or missing, the provider status dialog shows "Needs login" with guidance to run `pi /login` in a terminal. Effort levels map to pi's thinking ladder (off/minimal/low/medium/high/xhigh). The default model descriptor is a single "Pi default" entry; dynamic model enumeration is deferred to a follow-up.
