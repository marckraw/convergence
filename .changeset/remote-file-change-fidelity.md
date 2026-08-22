---
'convergence': patch
---

A truncated diff stops rendering as if it were whole (MAR-2577).

The turn record kept a diff and nothing about what that diff _meant_. Two facts
were always known and always thrown away: whether the diff had been cut short,
and whether the file was binary and so had no textual diff at all. Local capture
computed both and spent them on marker strings buried in the diff body; a remote
host reports both as fields, and the mapping had nowhere to put them, so a diff
the daemon cut arrived indistinguishable from a complete one.

`truncated` and `binary` are now fields on the turn file-change record, carried
from the wire and recorded by local capture, and the Turns view says so above
the diff — _"Diff truncated — this is a fragment, not the whole change"_ and
_"Binary file — there is no textual diff to show"_. The notice names no cutter,
because the same flag covers Convergence's own 200 KB cap and whatever cap a
daemon keeps.

`repoRoot` is carried too: which repository inside a multi-repo workspace a
change belongs to, so identical paths in two repositories stop collapsing into
one row. Nothing renders it yet.

Stored diffs are byte-for-byte unchanged, existing rows read back as untruncated
and non-binary — which is what they are — and the columns are added in place,
so no database is rebuilt.

Honest limit: for a **remote** session none of this is visible yet, because a
remote turn record does not reach the session at all — `applyDelta` has no
branch for the turn deltas the wire sends. That is a separate defect, found
while doing this one and filed; this change is what makes the facts survive the
boundary once it is repaired.
