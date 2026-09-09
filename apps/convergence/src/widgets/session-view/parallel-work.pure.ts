import type { ParallelWorkRow } from '@/shared/lib/parallel-work.pure'
import type { ConversationItem } from '@/entities/session'

export interface ParallelWorkMarker {
  agentId: string
  label: string
  replace: boolean
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
    rows.filter((row) => row.run).map((row) => [row.id, row]),
  )
  const returned = new Set<string>()
  for (const item of items) {
    const spawn = runsBySpawn.get(item.id)
    if (spawn && item.kind === 'tool-call') {
      const parent = spawn.parentId ? runsById.get(spawn.parentId) : null
      markers.set(item.id, {
        agentId: spawn.id,
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
        agentId: row.id,
        replace: true,
        label: `launched · ${workTitle(row)}`,
      })
    } else if (
      !returned.has(row.id) &&
      [
        'tool_result.completed',
        'tool_result.failed',
        'harness.task.terminal',
      ].includes(eventType ?? '')
    ) {
      returned.add(row.id)
      const outcome =
        eventType === 'tool_result.failed'
          ? 'failed'
          : eventType === 'tool_result.completed'
            ? 'completed'
            : row.run!.status
      markers.set(item.id, {
        agentId: row.id,
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
  const fact = row.run ?? row.task
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
  if (fact?.status === 'unknown')
    return `Unknown · last seen ${fact.endedAt ?? 'Not reported'}`
  return fact?.status === 'running'
    ? 'Running'
    : fact?.status === 'failed'
      ? 'Failed'
      : 'Completed'
}

export function workElapsed(row: ParallelWorkRow, now: number): string {
  const fact = row.run ?? row.task
  const start = fact?.startedAt ? Date.parse(fact.startedAt) : NaN
  const end =
    fact?.status === 'running'
      ? now
      : fact?.endedAt
        ? Date.parse(fact.endedAt)
        : NaN
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start)
    return '—'
  const seconds = Math.floor((end - start) / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export function descendantActivity(
  rows: ParallelWorkRow[],
  id: string,
): number {
  const visited = new Set([id])
  let count = 0
  const visit = (parent: string) => {
    for (const row of rows)
      if (row.parentId === parent && !visited.has(row.id)) {
        visited.add(row.id)
        if ((row.run ?? row.task)?.status === 'running') count++
        visit(row.id)
      }
  }
  visit(id)
  return count
}
