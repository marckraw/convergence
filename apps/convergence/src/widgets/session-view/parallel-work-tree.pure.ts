import {
  countParallelWork,
  parallelWorkParents,
  parallelWorkRowState,
  pendingAgentDecision,
  type AttributedWorkItem,
  type ParallelWorkRow,
} from '@/shared/lib/parallel-work.pure'
import { descendantActivity, workRowKey } from './parallel-work.pure'

/**
 * What the Parallel work panel derives from its rows before it draws
 * (CONV-30). Each piece is its own function so the panel's container can
 * keep each one only as long as what it reads: a tick of the clock must not
 * rescan the tree, and a streamed token must not recount a folded branch.
 */

/** The panel's tree: each row's children, and the rows nothing in the list parents. */
export interface ParallelWorkStructure {
  childrenById: Map<ParallelWorkRow, ParallelWorkRow[]>
  roots: ParallelWorkRow[]
}

/**
 * The tree, in the panel's order: a row nests under the row its `parentId`
 * resolves to (the panel's one resolution, `parallelWorkParents`); a row
 * whose parent is not in the list is a root.
 */
export function parallelWorkStructure(
  rows: ParallelWorkRow[],
  ordered: ParallelWorkRow[],
): ParallelWorkStructure {
  const parents = parallelWorkParents(rows)
  const childrenById = new Map<ParallelWorkRow, ParallelWorkRow[]>()
  for (const row of ordered) {
    const parent = row.parentId ? parents.get(row.parentId) : undefined
    if (parent) {
      const children = childrenById.get(parent) ?? []
      children.push(row)
      childrenById.set(parent, children)
    }
  }
  return {
    childrenById,
    roots: ordered.filter((row) => !row.parentId || !parents.has(row.parentId)),
  }
}

/**
 * The inventory line over the tree (CONV-23): this session, how many are
 * running and completed, and the unknown, failed and stopped counts only when
 * there are some.
 */
export function parallelWorkInventory(rows: ParallelWorkRow[]): string[] {
  const counts = countParallelWork(rows)
  const completed = rows.filter(
    (row) => parallelWorkRowState(row).fact?.status === 'completed',
  ).length
  return [
    'This session',
    `${counts.running} running`,
    `${completed} completed`,
    ...(counts.unknown ? [`${counts.unknown} unknown`] : []),
    ...(counts.failed ? [`${counts.failed} failed`] : []),
    ...(counts.stopped ? [`${counts.stopped} stopped`] : []),
  ]
}

/**
 * How many descendants are running under each folded branch, by row key.
 * Only folded rows are counted: an open branch shows its children instead.
 */
export function parallelWorkDescendantCounts(
  rows: ParallelWorkRow[],
  collapsed: ReadonlySet<string>,
): Map<string, number> {
  return new Map(
    rows
      .filter((row) => collapsed.has(workRowKey(row)))
      .map((row) => [workRowKey(row), descendantActivity(rows, row)]),
  )
}

/** For each row's key, the conversation item waiting on your decision, if any. */
export function parallelWorkDecisionIds(
  rows: ParallelWorkRow[],
  items: AttributedWorkItem[],
): Map<string, string | undefined> {
  return new Map(
    rows.map((row) => [
      workRowKey(row),
      parallelWorkRowState(row)
        .ids.map((id) => pendingAgentDecision(items, id))
        .find(Boolean) ?? undefined,
    ]),
  )
}
