---
'convergence': patch
'backpack-studio': patch
---

Remote sessions never skip an event, and a stream that has stopped delivering
gives up instead of re-dialling forever; a stream that gives up while frames
are still missing says where the hole is, whether it stopped mid-read or could
not be re-opened at all, and a healed gap no longer erases a frame nobody could
read; the connection test counts only available providers
