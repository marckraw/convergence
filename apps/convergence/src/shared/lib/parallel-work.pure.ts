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
    row.task && row.task.status !== 'running' && row.run?.status === 'running'
      ? row.task
      : (row.run ?? row.task)
  return {
    fact,
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
