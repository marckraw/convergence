---
'convergence': patch
---

A remote session says which branch it works on, and the daemon says back which one it made (MAR-2694, MAR-2718).

**The branch field.** In the composer strip, a session bound for a remote machine in Repository mode now has a text field beside the place picker. Whatever you type is sent to the daemon exactly as typed — nothing is derived from a ticket id, a project, or git, because a dispatch may come from Linear, from Jira, or from no tracker at all. Leave it empty and the strip says `branch: daemon-named` rather than pretending a name was chosen; the daemon then picks its own. A Project on the machine gets no field: a residency runs on the checkout's own HEAD.

**The record holds the daemon's own answer.** Convergence now speaks execution-host protocol 0.14, in which the daemon returns the workspace it actually materialised — the repository, the branch it cut, the worktree path, and for a Project the checkout's origin and its real HEAD. That answer is written onto the session the moment the daemon accepts the start, so the session details panel no longer has to go ask; a session started against an older daemon fills the same record from the first fetch instead. Where the daemon's branch differs from the one that was asked for, both are shown — never quietly reconciled into one.

**Session details stops describing the wrong machine.** On a remote session the panel used to print the _local_ checkout's branch and the _local_ worktree's pull request underneath the daemon's rows — `Branch — master` for a session running somewhere else, and `Pull request — No workspace` sitting two rows below a daemon-reported workspace. Those rows now carry the remote facts, and a local session's rows are unchanged. The pull request row says which of four things is true rather than one: `Asking…` while the daemon has not answered, `Could not read: …` when the daemon could not be reached — or answered with something that is not a pull request — `None yet` only when the daemon itself said it has opened none, and otherwise the pull request itself.

One workspace decoder throughout, the protocol's own: a daemon echo that this build cannot read is refused out loud rather than reported as "no workspace". `environment` and `automation` stay off the wire entirely, each pinned by a test.
