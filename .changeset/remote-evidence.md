---
'convergence': patch
'backpack-studio': patch
---

Remote sessions speak execution-host protocol 0.31, and a remote Claude session's subagents and background tasks now show up like a local one's. When it spawns an agent, the agent's tool calls carry "↳ description (type)", and the parallel-work panel lists the session's agent runs and tasks, from the host's own record of them. Its counts still hold after Convergence restarts. On a host that takes it, Stop on one task stops just that task; on one that does not, Stop says the remote host cannot, instead of blaming a Claude Code version.
