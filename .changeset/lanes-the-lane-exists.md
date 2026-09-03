---
'convergence': patch
---

Lanes, slice L1 — the lane exists (MAR-2783). A project can now spawn a lane:
a copy of itself with its own git and its own sessions, tied to its root by
name. _Create lane…_ in the project actions menu asks for a lane name and a
branch; the app clones the root's folder (ignored files included — `.env`,
`node_modules` in full — minus the checkout's own build output `out/`,
`release/`, `dist/` outside `node_modules`, git's lock files and worktree
metadata, and anything that is not a file, folder or symlink), resets the
copy to the last commit (the root's uncommitted edits stay the root's),
fetches, checks the branch out from the base (or, when the branch already
exists, adopts the tip that contains the other — the root's unpushed commits
are never thrown away, a stale local never wins over origin, and a divergence
between the two is taken from the root and said out loud), and records the
lane as a project. On macOS the copy is `cp -c` (APFS `clonefile`), so a lane of a
multi-gigabyte checkout takes seconds and no disk; whether the volume really
cloned is read off its free space before and after, never off a flag. A
socket in the tree (git's own file-monitor daemon leaves one) is left behind
and named on the done screen, never a reason to refuse the lane. A failed step
removes the folder and records nothing; an unreachable origin is reported, not
fatal.
Refused up front: a branch name git would refuse, a lanes root inside the
project (or the reverse), a root that is a linked worktree, and a second
creation of the same lane racing the first. A root that still has lanes
cannot be deleted until they are.

Lanes render nested under their root in the project switcher with a `lane`
badge, and selecting one selects it as a project — sessions, crews and relays
work in it unchanged. A lane's actions menu can reveal its folder in Finder.
The lanes root defaults to the app's data folder (`<userData>/lanes`) and is
stored as a setting for the Lanes settings section to come (L2). When a volume
did not clone, the dialog says so.
