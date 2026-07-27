---
'convergence': patch
---

Pi sessions now report "done" only when Pi is actually done. Completion is keyed on Pi's `agent_settled` signal instead of `agent_end`, so a session no longer shows as finished while Pi is still auto-retrying, re-prompting after an overflow compaction, or draining a queued follow-up. Pi extension failures surface as warning notes instead of passing silently.

Pi thinking levels now come from each model's own gating rather than a guess: Anthropic models expose `xhigh` and `max` when they support them, and selecting `max` sends `max` to Pi instead of being silently downgraded to `high`.
