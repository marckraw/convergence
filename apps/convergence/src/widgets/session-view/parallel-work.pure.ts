import {
  parallelWorkParents,
  parallelWorkRowState,
  type ParallelWorkRow,
} from '@/shared/lib/parallel-work.pure'
import type { ConversationItem } from '@/entities/session'

export interface ParallelWorkMarker {
  /**
   * The row the marker points at, as `${kind}:${id}` — the same key every
   * per-row surface in the panel uses. A marker is the only other place a
   * selection is born, and a bare id here would resolve to whichever of a
   * same-id agent and task came first in the list (MAR-2902).
   */
  rowKey: string
  label: string
  replace: boolean
}

/**
 * The identity of a row in the panel, and the only key any per-row surface may
 * use: collapse, select, confirm, stop state, the ancestor walk and
 * `data-work-id`.
 *
 * A row's `id` is the harness's own — a run id for an agent row, a task id for
 * a task row — and the two namespaces are not disjoint: a non-`local_agent`
 * task whose id equals a run id produces two rows that a bare-id key cannot
 * tell apart. Collapsing one collapsed both, and a selection resolved to
 * whichever row `find` reached first (MAR-2902).
 */
export function workRowKey(row: ParallelWorkRow): string {
  return `${row.kind}:${row.id}`
}

export function parallelWorkMarkers(
  items: ConversationItem[],
  rows: ParallelWorkRow[],
): Map<string, ParallelWorkMarker> {
  const markers = new Map<string, ParallelWorkMarker>()
  const runsBySpawn = new Map(
    rows.filter((row) => row.run).map((row) => [row.run!.spawnedByItemId, row]),
  )
  const runsById = new Map(
    rows
      .filter((row) => row.run)
      .flatMap((row) =>
        parallelWorkRowState(row).ids.map((id) => [id, row] as const),
      ),
  )
  const returned = new Set<string>()
  for (const item of items) {
    const spawn = runsBySpawn.get(item.id)
    if (spawn && item.kind === 'tool-call') {
      const parent = spawn.parentId ? runsById.get(spawn.parentId) : null
      markers.set(item.id, {
        rowKey: workRowKey(spawn),
        replace: true,
        label: `Started ${spawn.run!.agentType ?? 'Subagent'} · ${workTitle(spawn)}${parent ? ` · from ${workTitle(parent)}` : ''}`,
      })
      continue
    }
    const row =
      item.kind === 'tool-result' && item.relatedItemId
        ? runsBySpawn.get(item.relatedItemId)
        : item.kind === 'note' && item.taskId
          ? runsById.get(item.taskId)
          : null
    if (!row) continue
    const eventType = item.providerMeta.providerEventType
    if (eventType === 'tool_result.async_launched') {
      markers.set(item.id, {
        rowKey: workRowKey(row),
        replace: true,
        label: `launched · ${workTitle(row)}`,
      })
    } else if (
      !returned.has(workRowKey(row)) &&
      [
        'tool_result.completed',
        'tool_result.failed',
        'harness.task.terminal',
      ].includes(eventType ?? '')
    ) {
      returned.add(workRowKey(row))
      const outcome =
        eventType === 'tool_result.failed'
          ? 'failed'
          : eventType === 'tool_result.completed'
            ? 'completed'
            : parallelWorkRowState(row).fact?.status
      markers.set(item.id, {
        rowKey: workRowKey(row),
        replace: item.kind !== 'note',
        label: `Result returned · ${workTitle(row)} · ${outcome}`,
      })
    }
  }
  return markers
}

export function workTitle(row: ParallelWorkRow): string {
  return (
    row.run?.description ||
    row.task?.description ||
    (row.kind === 'agent' ? 'Subagent' : 'Background task')
  )
}

export function workStatus(row: ParallelWorkRow): string {
  const fact = parallelWorkRowState(row).fact
  if (fact?.status === 'stopped') {
    switch (fact.stopReason) {
      case 'quit':
        return 'Stopped by quit'
      case 'idle':
        return 'Stopped after idle timeout'
      case 'account':
        return 'Stopped by account change'
      case 'stop':
        return 'Stopped by you'
      default:
        return 'Stopped'
    }
  }
  if (fact?.status === 'unknown') return 'Unknown'
  return fact?.status === 'running'
    ? 'Running'
    : fact?.status === 'failed'
      ? 'Failed'
      : 'Completed'
}

/**
 * How many running rows hang below this one.
 *
 * The walk takes a ROW rather than an id, and resolves each child's `parentId`
 * through `parallelWorkParents` — the same resolution the panel uses to build
 * its tree, so the collapsed count and the branch it decorates cannot disagree.
 * A bare-id walk could not tell a task row from an agent row sharing its id,
 * and handed the task the agent's descendants (MAR-2902).
 */
export function descendantActivity(
  rows: ParallelWorkRow[],
  row: ParallelWorkRow,
): number {
  const parents = parallelWorkParents(rows)
  const visited = new Set([workRowKey(row)])
  let count = 0
  const visit = (parent: ParallelWorkRow) => {
    for (const child of rows) {
      if (!child.parentId || parents.get(child.parentId) !== parent) continue
      const key = workRowKey(child)
      if (visited.has(key)) continue
      visited.add(key)
      if (parallelWorkRowState(child).fact?.status === 'running') count++
      visit(child)
    }
  }
  visit(row)
  return count
}

export function parallelWorkRefusal(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(
    /^Error invoking remote method ['"]session:stopTask['"]: (?:Error: )?/,
    '',
  )
}
