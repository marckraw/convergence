---
'convergence': patch
'backpack-studio': patch
---

Remote sessions speak execution-host protocol 0.23. A remote Claude session whose answer leaves background work running now reads "answered · N tasks running" in the sidebar and Mission Control, like a local one, instead of having its state refused, and still says so after Convergence restarts. When Claude Code reports back on that work by itself, the turn counts as part of the same answer, and the session settles to completed only once the work ends; a plan still waiting for review stays waiting through that settle. Stopping an answered session, local or remote, settles it as completed with its answer delivered. Backpack Studio shows an answered conversation as "Answered, still working", keeps following it until it settles, and lets you send a message meanwhile.
