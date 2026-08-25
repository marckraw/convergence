---
'convergence': patch
---

A file change's identity now includes the repository it lives in (MAR-2589).

**Mostly invisible, and that is the point.** A turn's file changes were keyed
by `(turn, path)`, so two repositories of one workspace changing the same path
in one turn collided. Not a merge — a broken turn: the second insert raised
`UNIQUE constraint failed`, and because turn capture writes the file changes
and stamps the turn's `ended_at` in a single transaction, the rollback cost
that turn every file change and left it `running` forever. Two repos with a
`README.md` each is enough. No turn can reach that state today — local capture
reads one working tree, and remote turn records do not reach the database yet
(MAR-2584) — which is exactly why this lands first, so the feature that makes
it reachable does not ship the broken turn along with it.

**The migration is the real cargo.** SQLite cannot drop a table-level `UNIQUE`,
so `session_turn_file_changes` is rebuilt: create, copy, drop, rename, on a
table that holds diff bodies up to 200 KB a row. The whole rebuild, the new
index included, is one transaction. Between dropping the old table and renaming
the new one into its place there is no table by that name at all, and a process
killed in that gap would boot next time into a fresh empty table with every
real row stranded in a scratch table nothing knows to look at. Foreign keys are
off for the copy, the same way the sessions rebuild turns them off for its own:
the copy has to be verbatim, and a row whose parent went missing at some point
in this database's history should not turn a migration into a failed boot.

On the seeded sandbox database — 5,726 file changes, 27.97 MB of diff bytes,
203 KB in the largest row — the migrating boot took 376 ms and every row, every
diff byte and every count came through unchanged. Boots after it: 2 ms.

**The new key is a unique expression index, not a wider `UNIQUE`.** The obvious
`UNIQUE (turn_id, repo_root, file_path)` looks right and is wrong: SQL treats
two NULLs as distinct, and `repo_root` is null for every row local capture has
ever written, so it would have traded a rare collision for losing today's
guarantee on the common case. The index folds null to `''` instead — one row
per turn+path within a repository, one row per repository — and keeps "null
means the working-directory root", the design the type and the wire mapping
both document, rather than encoding the root as a magic empty string in the
data.

**And the repository is carried the rest of the way.** `getFileDiff` takes the
repository alongside the path, through preload and the renderer's selection, so
the diff you get is the one you clicked. Asking without a repository still
means what it always meant — by turn and path alone, which is the whole answer
for a turn that touched one repository. The changed-files tree shows a
repository prefix only when the turn actually spans more than one, so a
single-repository turn renders exactly as it did before.

Where the prefix is not enough, the rows say so themselves. A file tree
addresses a row by the path it draws, so two rows that agree on that path are
one row and one of the two diffs cannot be opened at all — and a prefix does
not separate one repository nested inside another (`a` + `b/c.ts` against `a/b`

- `c.ts` join to the same path), nor a repository whose name is the label the
  workspace root gets. Those rows now each name the repository they came from,
  the way an editor labels two tabs called `index.ts`, and only those rows do.
