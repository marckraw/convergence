import type { TurnFileChange, TurnFileChangeStatus } from '@/entities/turn'
import { normalizeChangedFilePath } from './changed-files-tree.pure'

/**
 * Which repository of a turn a change belongs to, plus its path. This pair is
 * the change's identity since MAR-2589 — `filePath` alone stopped being enough
 * the moment a workspace could hold two repositories with a `README.md` each.
 */
export interface TurnFileChangeSelection {
  /** Workspace-relative repository root; null is the working-directory root. */
  repoRoot: string | null
  filePath: string
}

export interface TurnFileChangeRow extends TurnFileChangeSelection {
  /**
   * What the changed-files tree keys and shows. Equal to `filePath` for a turn
   * that touched one repository, which is every local turn. Normalised the way
   * the tree normalises, so the path it hands back on a click matches this one
   * and the row is always findable; `filePath` stays raw, because that is what
   * the stored row is keyed by.
   */
  treePath: string
  status: TurnFileChangeStatus
}

/**
 * The label a change's repository gets in the tree when the change belongs to
 * the working-directory root and something else in the same turn does not.
 * Parenthesised because it is a statement about the workspace rather than a
 * directory in it.
 */
export const TURN_ROOT_REPO_LABEL = '(workspace root)'

/**
 * The rows a turn's changed-files tree renders.
 *
 * A repository prefix appears only when the turn actually spans more than one
 * repository. That is not decoration: the tree keys rows by the path it shows,
 * so without the prefix two repositories' `README.md` would collapse into one
 * row and one of the two diffs would be unreachable. When the turn touched a
 * single repository there is nothing to disambiguate and nothing to say, so the
 * rows are the bare paths — exactly what every turn rendered before MAR-2589.
 *
 * Two different identities can still produce the same `treePath` when one
 * repository sits inside another (`a` + `b/c.ts` against `a/b` + `c.ts`). The
 * tree shows them as one row because they read as one path to a human, and
 * `findTurnFileChangeRow` resolves it to the first of the two — the same row
 * the tree drew.
 */
export function buildTurnFileChangeRows(
  changes: readonly TurnFileChange[],
): TurnFileChangeRow[] {
  const multiRepo =
    new Set(changes.map((change) => change.repoRoot ?? '')).size > 1

  return changes.map((change) => ({
    repoRoot: change.repoRoot,
    filePath: change.filePath,
    treePath: normalizeChangedFilePath(
      multiRepo
        ? `${change.repoRoot ?? TURN_ROOT_REPO_LABEL}/${change.filePath}`
        : change.filePath,
    ),
    status: change.status,
  }))
}

/**
 * The row a tree path came from.
 *
 * Null is unreachable while the tree is built from these same rows and both
 * sides normalise identically — it is here because a lookup cannot promise what
 * its caller's data promises, and a caller that gets null should show nothing
 * rather than keep pointing at whatever was selected before.
 */
export function findTurnFileChangeRow(
  rows: readonly TurnFileChangeRow[],
  treePath: string,
): TurnFileChangeRow | null {
  return rows.find((row) => row.treePath === treePath) ?? null
}

/** The row a selection points at within one turn's rows. */
export function findTurnFileChangeRowForSelection(
  rows: readonly TurnFileChangeRow[],
  selection: TurnFileChangeSelection | null,
): TurnFileChangeRow | null {
  if (!selection) return null
  return (
    rows.find(
      (row) =>
        row.repoRoot === selection.repoRoot &&
        row.filePath === selection.filePath,
    ) ?? null
  )
}
