---
'convergence': patch
'backpack-studio': patch
---

Remote sessions never skip an event, and a stream that has stopped delivering
gives up instead of re-dialling forever; a stream that gives up while frames
are still missing says which ones, and a healed gap no longer erases a frame
nobody could read; the connection test counts only available providers
