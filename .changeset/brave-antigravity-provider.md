---
'convergence': minor
---

Add Antigravity CLI as a Google provider with Gemini model presets, native skill invocation, continuation support, settings guidance, and post-run tool timeline recovery from Antigravity conversation data, including a fallback for print turns where status-line telemetry does not expose the conversation id. Antigravity interactive turns no longer have a hard 5-minute Convergence watchdog, and temporary settings injection now queues concurrent turns and recovers stale Convergence locks after crashes without overwriting user-edited settings.
