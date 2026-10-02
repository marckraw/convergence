import { useMemo, type FC } from 'react'
import {
  archiveParallelWork,
  orderParallelWork,
  type AttributedWorkItem,
} from '@/shared/lib/parallel-work.pure'
import {
  parallelWorkDecisionIds,
  parallelWorkDescendantCounts,
  parallelWorkInventory,
  parallelWorkStructure,
} from './parallel-work-tree.pure'
import {
  ParallelWorkPanelView,
  type ParallelWorkPanelProps,
} from './parallel-work.presentational'

const EMPTY_ITEMS: AttributedWorkItem[] = []
const EMPTY_COLLAPSED = new Set<string>()

/**
 * The Parallel work panel's derivations (CONV-30), each kept only as long as
 * what it reads, so a clock tick rescans nothing and a streamed token never
 * recounts a folded branch. The rules are in parallel-work-tree.pure.ts; the
 * drawing is ParallelWorkPanelView.
 */
export const ParallelWorkPanel: FC<ParallelWorkPanelProps> = (props) => {
  const { rows, now, items = EMPTY_ITEMS, collapsed = EMPTY_COLLAPSED } = props
  const ordered = useMemo(() => orderParallelWork(rows), [rows])
  const archive = useMemo(
    () => archiveParallelWork(ordered, now),
    [ordered, now],
  )
  const archived = useMemo(() => new Set(archive.older), [archive])
  const structure = useMemo(
    () => parallelWorkStructure(rows, ordered),
    [rows, ordered],
  )
  const inventory = useMemo(() => parallelWorkInventory(rows), [rows])
  const descendantCounts = useMemo(
    () => parallelWorkDescendantCounts(rows, collapsed),
    [rows, collapsed],
  )
  const decisionIds = useMemo(
    () => parallelWorkDecisionIds(rows, items),
    [rows, items],
  )

  return (
    <ParallelWorkPanelView
      {...props}
      tree={{
        roots: structure.roots,
        childrenById: structure.childrenById,
        older: archive.older,
        newest: archive.newest,
        archived,
        descendantCounts,
        decisionIds,
        inventory,
      }}
    />
  )
}
