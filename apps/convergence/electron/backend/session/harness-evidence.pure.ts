import type {
  AgentRunFact,
  SessionAgentRun,
  SessionTask,
  TaskFact,
} from './harness-evidence.types'

export function foldAgentRuns(
  runs: SessionAgentRun[],
  fact: AgentRunFact,
  sessionId: string,
): SessionAgentRun[] {
  if (fact.kind === 'agent.started') {
    if (runs.some((run) => run.spawnedByItemId === fact.run.spawnedByItemId))
      return runs
    return [
      ...runs,
      {
        isBackgrounded: null,
        lastToolName: null,
        usageJson: null,
        updatedAt: null,
        ...fact.run,
        sessionId,
        status: 'running',
        endedAt: null,
      },
    ]
  }
  return runs.map((run) => {
    if (fact.kind === 'process.ended')
      return run.status === 'running'
        ? { ...run, status: 'unknown', endedAt: fact.at }
        : run
    if (run.spawnedByItemId !== fact.spawnedByItemId) return run
    if (fact.kind === 'agent.changed') return { ...run, ...fact.patch }
    if (fact.kind === 'agent.ended')
      return {
        ...run,
        ...(run.status === 'running' || run.status === 'unknown'
          ? { status: fact.status, endedAt: fact.at }
          : {}),
        model: fact.model ?? run.model,
      }
    return {
      ...run,
      id: fact.id,
      agentType: fact.agentType ?? run.agentType,
      description: fact.description ?? run.description,
      depth: fact.depth ?? run.depth,
      transcriptPath: fact.transcriptPath ?? run.transcriptPath,
    }
  })
}
export function foldTasks(
  tasks: SessionTask[],
  fact: TaskFact | Extract<AgentRunFact, { kind: 'process.ended' }>,
  sessionId: string,
): SessionTask[] {
  if (fact.kind === 'process.ended')
    return tasks.map((task) =>
      task.status === 'running'
        ? { ...task, status: 'unknown', endedAt: fact.at }
        : task,
    )
  const existing = tasks.find((task) => task.taskId === fact.taskId)
  const next: SessionTask = {
    taskId: fact.taskId,
    sessionId,
    toolUseId: null,
    taskType: null,
    description: null,
    status: 'unknown',
    startedAt: null,
    endedAt: null,
    outputFile: null,
    ...existing,
    ...fact.patch,
  }
  if (
    existing &&
    ['completed', 'failed', 'stopped'].includes(existing.status)
  ) {
    next.status = existing.status
    next.endedAt = existing.endedAt
  }
  return existing
    ? tasks.map((task) => (task === existing ? next : task))
    : [...tasks, next]
}

export function boundedHarnessPayload(payload: unknown): string {
  const json = JSON.stringify(payload) ?? 'null'
  const bytes = Buffer.byteLength(json)
  return bytes <= 8192
    ? json
    : JSON.stringify({
        truncated: true,
        bytes,
        preview: Buffer.from(json).subarray(0, 2048).toString('utf8'),
      })
}
