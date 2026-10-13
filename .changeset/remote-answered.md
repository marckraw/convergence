---
'convergence': patch
'backpack-studio': patch
---

Remote sessions speak execution-host protocol 0.23. A remote Claude session whose answer leaves background work running now reads "answered · N tasks running" in the sidebar and Mission Control, like a local one, instead of having its state refused. When Claude Code reports back on that work by itself, the turn counts as part of the same answer, and the session settles to completed only once the work ends. Stop or an approval on an answered remote session that Convergence no longer follows now ends it instead of refusing. Backpack Studio keeps following an answered conversation until it settles.
