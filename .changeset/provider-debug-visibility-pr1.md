---
'convergence': minor
---

Add provider debug visibility. Long-running Codex/Pi/Claude sessions now emit a transcript note after 60 seconds of silence from the provider subprocess and a warning after 3 minutes, so it's clear whether a turn is reasoning or genuinely stuck. Codex `item/started` notifications with `reasoning`/`agentReasoning` item types map to the `thinking` activity. A new "Capture provider debug logs" setting writes every captured event (notifications, server requests, stdout/stderr chunks, lifecycle) to a per-session JSONL file under the app data directory; files rotate at 10 MB and are cleaned up after 30 days. When the toggle is on, the session view exposes a Provider debug log drawer with copy-to-clipboard and "Open log folder" actions. Production builds default to the toggle being off; dev builds additionally tee everything to stderr.
