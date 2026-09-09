import type {
  AgentRunStatus,
  SessionTask,
  TaskFact,
} from '../../session/harness-evidence.types'

export function claudeRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}
export function claudeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

export function claudeContentText(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return null
  const blocks = value.flatMap((value) => {
    const block = claudeRecord(value)
    return block?.type === 'text' && typeof block.text === 'string'
      ? [block.text]
      : []
  })
  return blocks.length ? blocks.join('\n') : null
}

function taskStatus(value: unknown): AgentRunStatus {
  if (value === 'killed' || value === 'stopped') return 'stopped'
  return value === 'running' || value === 'completed' || value === 'failed'
    ? value
    : 'unknown'
}

/** Null means unconsumed; an empty list is a consumed empty task snapshot. */
export function readClaudeTaskFacts(
  data: unknown,
  at: string,
): TaskFact[] | null {
  const event = claudeRecord(data)
  if (event?.type !== 'system') return null
  const subtype = event.subtype
  if (
    ![
      'task_started',
      'task_progress',
      'task_updated',
      'task_notification',
      'background_tasks_changed',
    ].includes(String(subtype))
  )
    return null
  const entries =
    subtype === 'background_tasks_changed'
      ? Array.isArray(event.tasks)
        ? event.tasks
        : []
      : [event]
  return entries.flatMap((value) => {
    const item = claudeRecord(value)
    const taskId = claudeString(item?.task_id)
    if (!item || !taskId) return []
    const input = { ...item, ...claudeRecord(item.patch) }
    const patch: Partial<Omit<SessionTask, 'taskId' | 'sessionId'>> = {}
    for (const [wire, key] of [
      ['tool_use_id', 'toolUseId'],
      ['task_type', 'taskType'],
      ['description', 'description'],
      ['output_file', 'outputFile'],
    ] as const) {
      const text = claudeString(input[wire])
      if (text) patch[key] = text
    }
    if (subtype === 'task_started') {
      patch.startedAt = at
      patch.status = 'running'
    } else if (subtype === 'background_tasks_changed') patch.status = 'running'
    if (input.status !== undefined) patch.status = taskStatus(input.status)
    if (
      patch.status &&
      ['completed', 'failed', 'stopped'].includes(patch.status)
    ) {
      if (typeof input.summary === 'string') patch.endedSummary = input.summary
      const ended =
        typeof input.end_time === 'number' ? new Date(input.end_time) : null
      patch.endedAt =
        ended && Number.isFinite(ended.getTime()) ? ended.toISOString() : at
    }
    return [{ kind: 'task.changed', taskId, at, patch }]
  })
}
