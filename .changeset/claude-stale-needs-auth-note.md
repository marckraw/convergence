---
'convergence': patch
---

A Claude account's Connectors no longer say "Connected" for a server every conversation silently skips. Claude Code keeps a "needs sign-in" note for up to 4 hours and never removes it when the server works again, for example after connecting Figma on claude.ai. When the panel sees such a server connected, it now clears the note and says so, and conversations started from then on can use it.
