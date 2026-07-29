---
'convergence': patch
---

Guided reviews and remote daemon reviews now prefer the current GPT-5.6 Codex models instead of naming retired ones. The preferences pointed at `gpt-5.6` (an alias OpenAI no longer serves) and `gpt-5.3-codex`, so Convergence quietly fell back to whatever was listed first rather than picking the intended flagship.

The last two provider handshakes that still identified Convergence as version `0.0.0` — the Codex app-server used for skill discovery, and Cursor's ACP connection — now report the real app version.
