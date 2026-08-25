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

Existing turns get the same treatment: the columns are added in place, and the
values are recovered from the markers the old capture path left in the diff body,
so a diff that was cut two months ago now says so. Stored diffs are byte-for-byte
unchanged and no database is rebuilt. What a migration cannot bring back is the
cut content itself — that was replaced by the marker the day it was written. The
columns and the backfill go in as one transaction, because a column's presence is
also the flag that says the backfill is still owed: interrupted between the two,
the next boot would see the columns and skip the repair for good.

`repoRoot` is carried too: which repository inside a multi-repo workspace a
change belongs to. Nothing renders it yet, and it is **not** yet part of a
change's identity — the stored uniqueness is still one row per turn and path. The
same path in two repositories does not quietly merge into one change; it breaks
the turn. The second insert raises `UNIQUE constraint failed`, and that insert
shares a transaction with the update that stamps the turn's end, so the rollback
costs the turn every file change and leaves it `running`. Filed as MAR-2589; it
needs a table rebuild and a decision this change does not make.

Honest limit: for a **remote** session none of this is visible yet, because a
remote turn record does not reach the session at all — `applyDelta` has no
branch for the turn deltas the wire sends. That is a separate defect, found
while doing this one and filed as MAR-2584; this change is what makes the facts
survive the boundary once it is repaired. MAR-2589 has to land first: remote
turn persistence is what makes a multi-repo path collision reachable, so
repairing the boundary before identity would ship the broken turn rather than
prevent it.
