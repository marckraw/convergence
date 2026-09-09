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

export function isSubagentWork(item: AttributedWorkItem): boolean {
  return (
    Boolean(item.agentRunId) &&
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

export function countParallelWork(rows: ParallelWorkRow[]): ParallelWorkCounts {
  const counts = { running: 0, unknown: 0, failed: 0, stopped: 0 }
  for (const row of rows) {
    const status = row.run?.status ?? row.task?.status
    if (status && status !== 'completed') counts[status]++
  }
  return counts
}

export function buildParallelWork(
  runs: SessionAgentRun[],
  tasks: SessionTask[],
  items: { id: string; agentRunId?: string | null }[],
): ParallelWorkRow[] {
  const runIds = new Set(runs.map((run) => run.id))
  const parents = new Map(items.map((item) => [item.id, item.agentRunId]))
  const agentTasks = new Map(
    tasks
      .filter((task) => task.taskType === 'local_agent')
      .map((task) => [task.taskId, task]),
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
      .filter(
        (task) => !(task.taskType === 'local_agent' && runIds.has(task.taskId)),
      )
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
