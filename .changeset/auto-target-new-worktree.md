---
'convergence': patch
---

Fix: creating a worktree via the New Workspace dialog now auto-targets
that worktree for the next session. The empty session screen also shows
a chip indicating which worktree (or the main repo) the next session
will start in, with a one-click toggle back to the main repo.

Previously the dialog closed silently and the next session ran against
the root repo, causing users to repeat the action and accumulate orphan
worktrees.
