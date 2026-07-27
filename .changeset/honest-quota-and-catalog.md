---
'convergence': patch
---

Codex usage limits now come from Codex's own `account/rateLimits/read`, which answers from the CLI's authenticated session, instead of reading your access token out of `~/.codex/auth.json` and calling an undocumented chatgpt.com endpoint with it. The old path remains only as a fallback for Codex builds that do not support the method.

Pi sessions no longer display the Codex usage pill — Pi bills through its own credentials, so Codex's quota was never that session's quota.

The Claude model picker no longer shows two rows both labelled "Claude Fable 5"; the alias now reads "Claude Fable", matching how the Opus, Sonnet, and Haiku aliases are already named.
