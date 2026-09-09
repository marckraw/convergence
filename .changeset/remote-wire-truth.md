---
'convergence': patch
'backpack-studio': patch
---

Remote sessions never skip an event, and a stream that has stopped delivering
gives up instead of re-dialling forever; the connection test counts only
available providers
