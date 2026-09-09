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
  const { at, phase } = parallelWorkAnchor(row)
  const prefix =
    phase === 'lastSeen' ? 'last seen ' : phase === 'seen' ? 'seen ' : ''
  return {
    at,
    label: at
      ? `${prefix}${formatRelativeTime(at, now)}${phase === 'started' ? '' : ' ago'}`
      : 'time not reported',
  }
}

export function parallelWorkParents(
  rows: ParallelWorkRow[],
): Map<string, ParallelWorkRow> {
  return new Map(
    [
      ...rows.filter((row) => row.kind === 'task'),
      ...rows.filter((row) => row.kind === 'agent'),
    ].map((row) => [row.id, row]),
  )
}

export function orderParallelWork(rows: ParallelWorkRow[]): ParallelWorkRow[] {
  const active = (row: ParallelWorkRow) =>
    ['running', 'unknown'].includes(
      parallelWorkRowState(row).fact?.status ?? '',
    )
  const time = (row: ParallelWorkRow) => parallelWorkAnchor(row).at
  const sorted = [...rows].sort((a, b) => {
    if (active(a) !== active(b)) return active(a) ? -1 : 1
    const left = time(a),
      right = time(b)
    if (!left || !right) return left ? -1 : right ? 1 : 0
    return (Date.parse(left) - Date.parse(right)) * (active(a) ? 1 : -1)
  })
  const children = new Map<ParallelWorkRow | null, ParallelWorkRow[]>()
  const parents = parallelWorkParents(rows)
  for (const row of sorted) {
    const parent = row.parentId ? (parents.get(row.parentId) ?? null) : null
    children.set(parent, [...(children.get(parent) ?? []), row])
  }
  const result: ParallelWorkRow[] = [],
    visited = new Set<string>()
  const visit = (row: ParallelWorkRow) => {
    const key = `${row.kind}:${row.id}`
    if (visited.has(key)) return
    visited.add(key)
    result.push(row)
    for (const child of children.get(row) ?? []) visit(child)
  }
  for (const row of children.get(null) ?? []) visit(row)
  for (const row of sorted) visit(row)
  return result
}

export function archiveParallelWork(
  rows: ParallelWorkRow[],
  now: number,
): {
  visible: ParallelWorkRow[]
  older: ParallelWorkRow[]
  newest: string | null
} {
  const parents = parallelWorkParents(rows)
  const children = new Map<ParallelWorkRow, ParallelWorkRow[]>()
  for (const row of rows) {
    const parent = row.parentId ? parents.get(row.parentId) : undefined
    if (parent) children.set(parent, [...(children.get(parent) ?? []), row])
  }
  const roots = rows.filter(
    (row) => !row.parentId || !parents.has(row.parentId),
  )
  const old = new Set<ParallelWorkRow>()
  for (const root of roots) {
    const branch = new Set<ParallelWorkRow>()
    const collect = (row: ParallelWorkRow) => {
      if (branch.has(row)) return
      branch.add(row)
      for (const child of children.get(row) ?? []) collect(child)
    }
    collect(root)
    const eligible = [...branch].every((row) => {
      const anchor = parallelWorkAnchor(row)
      const status = parallelWorkRowState(row).fact?.status
      if (status === 'running' || status === 'unknown') return false
      return (
        anchor.phase === 'none' ||
        (anchor.at !== null &&
          now - Date.parse(anchor.at) > PARALLEL_WORK_ARCHIVE_AFTER_MS)
      )
    })
    if (eligible) for (const row of branch) old.add(row)
  }
  const newest = [...old].reduce<string | null>((latest, row) => {
    const { at } = parallelWorkAnchor(row)
    return at && (!latest || Date.parse(at) > Date.parse(latest)) ? at : latest
  }, null)
  return {
    newest,
    visible: rows.filter((row) => !old.has(row)),
    older: rows.filter((row) => old.has(row)),
  }
}

export function parallelWorkAnchor(row: ParallelWorkRow): {
  at: string | null
  phase: 'started' | 'lastSeen' | 'ended' | 'seen' | 'none'
} {
  const fact = parallelWorkRowState(row).fact
  const phase =
    fact?.status === 'running'
      ? 'started'
      : fact?.status === 'unknown'
        ? 'lastSeen'
        : 'ended'
  const reported = phase === 'started' ? fact?.startedAt : fact?.endedAt
  const at = reported ?? row.task?.observedAt ?? null
  if (!at || !Number.isFinite(Date.parse(at)))
    return { at: null, phase: 'none' }
  return { at, phase: reported ? phase : 'seen' }
}
