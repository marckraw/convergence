---
'convergence': patch
---

Codex accounts ride the same rails as Claude ones (MAR-2207, PA9). Enrol a Codex
account and it gets its own `CODEX_HOME` with a `0600` `auth.json` inside it,
the same domain model, the same fail-closed identity attestation, and the same
allowlisted child environment — an inherited `OPENAI_API_KEY` can no longer
outrank the account you picked. Codex quota is now read from the selected
account's own home and cached per account and host. The composer only offers
accounts belonging to the session's provider. Because Codex holds one
`app-server` for a whole session rather than spawning per turn, changing account
mid-session is refused with an explanation instead of being silently served by
the account already running.
