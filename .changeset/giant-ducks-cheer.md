---
'convergence': patch
---

Fix remote session starts for repositories with SSH origin remotes: the workspace source sent to the remote execution host now normalizes git@github.com and ssh:// GitHub remotes to the https form the daemon clones with. Non-GitHub origins fail upfront with the clear "requires a repository the daemon can clone" error instead of a daemon-side failure.
