import type {
  SessionAgentRun,
  SessionTask,
} from '../types/harness-evidence.types'

export interface ParallelWorkRow {
  id: string
  kind: 'agent' | 'task'
  parentId: string | null
  run?: SessionAgentRun
  task?: SessionTask
}

export interface AttributedWorkItem {
  id: string
  kind: string
  actor?: string
  agentRunId?: string | null
  resolution?: string
}

export function isSubagentWork(
  item: AttributedWorkItem,
  knownAgentIds?: ReadonlySet<string>,
): boolean {
  return (
    Boolean(item.agentRunId) &&
    (!knownAgentIds || knownAgentIds.has(item.agentRunId!)) &&
    (['tool-call', 'tool-result', 'thinking'].includes(item.kind) ||
      (item.kind === 'message' && item.actor === 'assistant'))
  )
}

export function pendingAgentDecision(
  items: AttributedWorkItem[],
  agentId: string,
): string | null {
  return (
    items.find(
      (item) =>
        item.agentRunId === agentId &&
        ['approval-request', 'input-request'].includes(item.kind) &&
        item.resolution === 'pending',
    )?.id ?? null
  )
}

export interface ParallelWorkCounts {
  running: number
  unknown: number
  failed: number
  stopped: number
}

export function parallelWorkStatus(session: {
  status: string
  attention: string
  parallelWork?: ParallelWorkCounts
}): string | null {
  if (
    session.status === 'running' ||
    session.status === 'failed' ||
    ['needs-approval', 'needs-input', 'failed'].includes(session.attention)
  )
    return null
  const counts = session.parallelWork
  if (!counts) return null
  const parts: string[] = []
  if (counts.running) parts.push(`${counts.running} tasks running`)
  if (counts.unknown) parts.push(`${counts.unknown} unknown`)
  if (!counts.running) {
    if (counts.failed) parts.push(`${counts.failed} failed`)
    if (counts.stopped) parts.push(`${counts.stopped} stopped`)
  }
  return parts.length ? `answered · ${parts.join(' · ')}` : null
}

export function parallelWorkRowState(row: ParallelWorkRow) {
  const fact =
    row.task &&
    row.task.status !== 'running' &&
    (row.run?.status === 'running' || row.run?.status === 'unknown')
      ? row.task
      : (row.run ?? row.task)
  return {
    fact: fact
      ? { ...fact, startedAt: fact.startedAt ?? row.run?.startedAt ?? null }
      : undefined,
    stopId: row.task?.taskId ?? row.run?.id ?? row.id,
    ids: [
      ...new Set(
        [row.id, row.run?.id, row.task?.taskId].filter((id): id is string =>
          Boolean(id),
        ),
      ),
    ],
  }
}

export function countParallelWork(rows: ParallelWorkRow[]): ParallelWorkCounts {
  const counts = { running: 0, unknown: 0, failed: 0, stopped: 0 }
  for (const row of rows) {
    const status = parallelWorkRowState(row).fact?.status
    if (status && status !== 'completed') counts[status]++
  }
  return counts
}

export function buildParallelWork(
  runs: SessionAgentRun[],
  tasks: SessionTask[],
  items: {
    id: string
    agentRunId?: string | null
    providerMeta?: { providerItemId?: string | null }
  }[],
): ParallelWorkRow[] {
  const runIds = new Set(runs.map((run) => run.id))
  const parents = new Map(items.map((item) => [item.id, item.agentRunId]))
  const tasksById = new Map(
    tasks
      .filter((task) => task.taskType === 'local_agent')
      .map((task) => [task.taskId, task]),
  )
  const agentTasks = new Map(
    runs.flatMap((run) => {
      const task = tasksById.get(run.taskId ?? run.id)
      return task ? [[run.id, task] as const] : []
    }),
  )
  const mergedTaskIds = new Set(
    [...agentTasks.values()].map((task) => task.taskId),
  )
  return [
    ...runs.map((run): ParallelWorkRow => {
      const parent = parents.get(run.spawnedByItemId)
      return {
        id: run.id,
        kind: 'agent',
        run,
        task: agentTasks.get(run.id),
        parentId:
          parent && parent !== run.id && runIds.has(parent) ? parent : null,
      }
    }),
    ...tasks
      .filter((task) => !mergedTaskIds.has(task.taskId))
      .map(
        (task): ParallelWorkRow => ({
          id: task.taskId,
          kind: 'task',
          parentId: null,
          task,
        }),
      ),
  ]
}

export const PARALLEL_WORK_ARCHIVE_AFTER_MS = 60 * 60 * 1000

export function formatRelativeTime(from: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(from)) / 60000))
  if (minutes < 1) return '< 1 m'
  if (minutes < 60) return `${minutes} m`
  if (minutes < 1440) return `${Math.floor(minutes / 60)} h`
  return `${Math.floor(minutes / 1440)} d`
}

export function parallelWorkTime(
  row: ParallelWorkRow,
  now: number,
): { at: string | null; label: string } {
  const fact = parallelWorkRowState(row).fact
  const running = fact?.status === 'running'
  const reported = running ? fact?.startedAt : fact?.endedAt
  const at = reported ?? row.task?.observedAt ?? null
  return {
    at,
    label: at
      ? `${reported ? '' : 'seen '}${formatRelativeTime(at, now)}${running && reported ? '' : ' ago'}`
      : 'time not reported',
  }
}

export function orderParallelWork(
  rows: ParallelWorkRow[],
  _now?: number,
): ParallelWorkRow[] {
  const active = (row: ParallelWorkRow) =>
    ['running', 'unknown'].includes(
      parallelWorkRowState(row).fact?.status ?? '',
    )
  const time = (row: ParallelWorkRow) => {
    const fact = parallelWorkRowState(row).fact
    return (
      (active(row) ? fact?.startedAt : fact?.endedAt) ??
      row.task?.observedAt ??
      null
    )
  }
  const sorted = [...rows].sort((a, b) => {
    if (active(a) !== active(b)) return active(a) ? -1 : 1
    const left = time(a),
      right = time(b)
    if (!left || !right) return left ? -1 : right ? 1 : 0
    return (Date.parse(left) - Date.parse(right)) * (active(a) ? 1 : -1)
  })
  const children = new Map<string | null, ParallelWorkRow[]>()
  const ids = new Set(rows.map((row) => row.id))
  for (const row of sorted) {
    const parent = row.parentId && ids.has(row.parentId) ? row.parentId : null
    children.set(parent, [...(children.get(parent) ?? []), row])
  }
  const result: ParallelWorkRow[] = [],
    visited = new Set<string>()
  const visit = (row: ParallelWorkRow) => {
    if (visited.has(row.id)) return
    visited.add(row.id)
    result.push(row)
    for (const child of children.get(row.id) ?? []) visit(child)
  }
  for (const row of children.get(null) ?? []) visit(row)
  for (const row of sorted) visit(row)
  return result
}

export function archiveParallelWork(
  rows: ParallelWorkRow[],
  now: number,
): { visible: ParallelWorkRow[]; older: ParallelWorkRow[] } {
  const old = new Set(
    rows
      .filter((row) => {
        const fact = parallelWorkRowState(row).fact
        return (
          fact?.status !== 'running' &&
          fact?.endedAt &&
          now - Date.parse(fact.endedAt) > PARALLEL_WORK_ARCHIVE_AFTER_MS
        )
      })
      .map((row) => row.id),
  )
  const byId = new Map(rows.map((row) => [row.id, row]))
  // Keep the parent context of work that must remain visible.
  for (const row of rows)
    if (!old.has(row.id)) {
      const visited = new Set<string>()
      let parent = row.parentId
      while (parent && !visited.has(parent)) {
        visited.add(parent)
        old.delete(parent)
        parent = byId.get(parent)?.parentId ?? null
      }
    }
  return {
    visible: rows.filter((row) => !old.has(row.id)),
    older: rows.filter((row) => old.has(row.id)),
  }
}
