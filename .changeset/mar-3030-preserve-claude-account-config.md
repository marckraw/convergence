---
'convergence': patch
---

Fix a Claude account config data-loss bug: a per-account `.claude.json` that could not be read safely (a parse error, a partial read, or JSON that parsed but was not an object) was previously treated the same as a brand-new account and overwritten, dropping its OAuth identity and organization caches. That file is now left untouched when it cannot be trusted, and the reconciled config is written atomically (temp file + rename) so a crash mid-write can no longer corrupt it.
