---
'convergence': patch
---

Fix Codex provider update command in the Providers panel. The previous `codex --upgrade` flag does not exist in the Codex CLI; replaced it with `npm install -g @openai/codex@latest`, matching the install command and reliably upgrading any npm-managed installation.
