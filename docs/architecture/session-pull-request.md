# Session pull request fact

`sessions.pull_request_json` holds the last verified PR number, URL, state,
head branch, check time and source. `PullRequestService` is its only writer;
session summaries expose it as `pullRequest`. Existing workspace caches remain
available to workspace consumers.

The lookup starts from the session's workspace branch or a branch recorded on
the session. For remote sessions it uses the daemon's reported workspace branch
and repository. **The GitHub CLI lookup runs on the Mac**, using the Mac's GitHub
authentication, with explicit `--repo` and `--head` arguments. It never runs a
git command in a remote filesystem path. A session without a recorded branch
says `no branch recorded for this session`; the current checkout's HEAD is not
a substitute.

A daemon `prUrl` patch is an ephemeral hint: it triggers the same lookup, and
the URL itself is never persisted. Accepted patches emit the session id after
the ownership/replay guards. Observer failures are logged with that id while
other listeners and the session pipeline continue.

Session details, the PR drawer's Refresh action and session settle request a
refresh. One unref'd ten-minute timer refreshes only facts whose state is `open`.
A merged or closed PR leaves the polling set. App shutdown removes the timer
and settle subscription. The drawer, header and Needs Review chip read the
same session fact. A missing GitHub CLI is shown as `PR unknown — gh not found`.
