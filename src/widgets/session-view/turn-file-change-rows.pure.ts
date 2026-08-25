import type { TurnFileChange, TurnFileChangeStatus } from '@/entities/turn'
import { normalizeChangedFilePath } from './changed-files-tree.pure'

/**
 * Which repository of a turn a change belongs to, plus its path. This pair is
 * the change's identity since MAR-2589 — `filePath` alone stopped being enough
 * the moment a workspace could hold two repositories with a `README.md` each.
 *
 * `repoRoot` is compared folded the way storage folds it: the unique index is
 * over `(turn_id, COALESCE(repo_root, ''), file_path)` and `getFileDiff` folds
 * `repoRoot ?? ''` to match, so `null` and `''` name one repository here too
 * rather than two the database could never hold apart.
 */
export interface TurnFileChangeSelection {
  /** Workspace-relative repository root; null is the working-directory root. */
  repoRoot: string | null
  filePath: string
}

export interface TurnFileChangeRow extends TurnFileChangeSelection {
  /**
   * What the changed-files tree keys, selects and shows — one string, because
   * the tree is a file tree: `@pierre/trees` addresses a node by its path and
   * draws that same path, with no separate id to hand it. So this is not a
   * label that happens to be unique; it is built to be unique across a turn's
   * rows (see `buildTurnFileChangeRows`), which is what makes it safe for
   * `findTurnFileChangeRow` to resolve a click back to one repository and one
   * path. `filePath` stays raw, because that is what the stored row is keyed
   * by.
   */
  treePath: string
  status: TurnFileChangeStatus
}

/**
 * The label a change's repository gets in the tree when the change belongs to
 * the working-directory root and something else in the same turn does not.
 * Parenthesised because it is a statement about the workspace rather than a
 * directory in it — a workspace that really does hold a directory of this name
 * is a collision, and the collision is resolved rather than assumed away.
 */
export const TURN_ROOT_REPO_LABEL = '(workspace root)'

/**
 * The rows a turn's changed-files tree renders, each with a tree path no other
 * row in the turn shares.
 *
 * Uniqueness is the whole job. The tree keys rows by the path it draws, so two
 * rows that agree on that path are one row, and one of the two diffs becomes
 * unreachable from the UI. Three things can make two identities agree:
 *
 * - the same path in two repositories (`apps/web` and `apps/api`, both
 *   `README.md`) — the repository prefix separates them, and it appears only
 *   when the turn actually spans more than one repository, so a single-repo
 *   turn (every local turn) renders the bare paths it always did;
 * - one repository nested inside another (`a` + `b/c.ts` against `a/b` +
 *   `c.ts`), where the prefix joins to the same path — prefixing cannot help,
 *   because the join is where the ambiguity is;
 * - a repository named exactly like the root label above.
 *
 * The last two are settled the way an editor settles two tabs called
 * `index.ts`: the rows that share a path each say which repository they came
 * from, and only those rows do. `claimTreePath` is the backstop for the
 * pathological remainder — a file whose real name is the disambiguated form of
 * another row — so the result is unique by construction rather than by
 * argument.
 */
export function buildTurnFileChangeRows(
  changes: readonly TurnFileChange[],
): TurnFileChangeRow[] {
  const multiRepo =
    new Set(changes.map((change) => repositoryKey(change.repoRoot))).size > 1

  const drafts = changes.map((change) => {
    const path = normalizeChangedFilePath(change.filePath)
    return {
      change,
      basePath: multiRepo
        ? `${repositoryPrefix(change.repoRoot)}/${path}`
        : path,
    }
  })

  const basePathCounts = new Map<string, number>()
  for (const draft of drafts) {
    basePathCounts.set(
      draft.basePath,
      (basePathCounts.get(draft.basePath) ?? 0) + 1,
    )
  }

  const taken = new Set<string>()
  return drafts.map(({ change, basePath }) => ({
    repoRoot: change.repoRoot,
    filePath: change.filePath,
    treePath: claimTreePath(
      (basePathCounts.get(basePath) ?? 0) > 1
        ? `${basePath} (${describeRepository(change.repoRoot)})`
        : basePath,
      taken,
    ),
    status: change.status,
  }))
}

/**
 * The row a tree path came from.
 *
 * Safe because `buildTurnFileChangeRows` hands out no path twice: the click
 * resolves to the one row the tree drew that path for. Null is unreachable
 * while the tree is built from these same rows — it is here because a lookup
 * cannot promise what its caller's data promises, and a caller that gets null
 * should show nothing rather than keep pointing at whatever was selected
 * before.
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
  const repository = repositoryKey(selection.repoRoot)
  return (
    rows.find(
      (row) =>
        repositoryKey(row.repoRoot) === repository &&
        row.filePath === selection.filePath,
    ) ?? null
  )
}

/** The repository a change belongs to, folded the way storage folds it. */
function repositoryKey(repoRoot: string | null): string {
  return repoRoot ?? ''
}

/** The directory a repository's changes hang under in a multi-repo turn. */
function repositoryPrefix(repoRoot: string | null): string {
  return repositoryKey(repoRoot) || TURN_ROOT_REPO_LABEL
}

/**
 * How a row names its repository when it has to say which one it is. Not the
 * prefix: this one has to tell the working-directory root apart from a
 * repository whose root is spelled like the root label, so the root says what
 * it is and every other repository says the path it lives at.
 */
function describeRepository(repoRoot: string | null): string {
  const repository = repositoryKey(repoRoot)
  return repository === '' ? 'workspace root' : `repository ${repository}`
}

/** The first unclaimed spelling of a preferred path, and it is now claimed. */
function claimTreePath(preferred: string, taken: Set<string>): string {
  let candidate = preferred
  for (let attempt = 2; taken.has(candidate); attempt += 1) {
    candidate = `${preferred} [${attempt}]`
  }
  taken.add(candidate)
  return candidate
}
