---
'convergence': patch
---

Fix OpenAI account identity parsing and reconnect through Codex. Account reconnect and removal now wait for the account server to stop and refuse changes while its work or helper requests are active.
