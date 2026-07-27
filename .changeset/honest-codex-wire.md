---
'convergence': patch
---

Codex sessions survive unrecognised app-server requests instead of dying: Convergence still declines the request, but now logs a warning note in the transcript and keeps the session running. Codex handshakes also report the real app version rather than `0.0.0`.

Codex's `ultra` reasoning effort (the multi-agent switch on GPT-5.6 Sol and Terra) is now selectable in the composer, and the fallback model catalog matches what codex 0.145 actually serves — real 272k context windows, no models OpenAI has retired.
