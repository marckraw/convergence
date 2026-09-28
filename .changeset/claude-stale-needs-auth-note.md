---
'convergence': patch
---

A Claude account's Connectors no longer say "Connected" for a server that new conversations silently skip. Claude Code keeps a "needs sign-in" note for up to 4 hours and never removes it when the server works again, for example after connecting Figma on claude.ai. When the panel sees such a server connected, it now clears that note and says so, so new conversations on the account try the server again. The note also stays per account, so it no longer makes removing a Claude account ask about private data.
