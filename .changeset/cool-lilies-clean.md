---
'convergence': patch
---

Fix OpenAI account identity parsing and reconnect through Codex. Reconnect discards an unexpected account login instead of leaving its credentials behind. Account reconnect and removal now wait for the account server to stop and refuse changes while its work or helper requests are active.
