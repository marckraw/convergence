export interface ClaudeTaskNote {
  taskId: string | null
  notification: boolean
  text: string
}

function record(data: unknown): Record<string, unknown> | null {
  return data !== null && typeof data === 'object' && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : null
}

export function readClaudeResultOriginKind(data: unknown): string | null {
  const event = record(data)
  const origin = record(event?.origin)
  return event?.type === 'result' && typeof origin?.kind === 'string'
    ? origin.kind
    : null
}

function taskFacts(
  data: Record<string, unknown>,
): Record<string, string | boolean> {
  const facts: Record<string, string | boolean> = {}
  for (const key of [
    'task_id',
    'tool_use_id',
    'description',
    'status',
    'task_type',
  ]) {
    if (typeof data[key] === 'string') facts[key] = data[key]
  }
  if (typeof data.is_backgrounded === 'boolean')
    facts.is_backgrounded = data.is_backgrounded
  return facts
}

/** The hotfix records task facts as notes; CC2-1 owns structured projections. */
export function readClaudeTaskNote(data: unknown): ClaudeTaskNote | null {
  const event = record(data)
  if (event?.type !== 'system') return null
  const taskId = typeof event.task_id === 'string' ? event.task_id : null
  if (event.subtype === 'task_notification') {
    const summary =
      typeof event.summary === 'string' && event.summary.trim()
        ? event.summary
        : 'No task summary was supplied.'
    return {
      taskId,
      notification: true,
      text: `A background task from an earlier turn was stopped: ${summary}`,
    }
  }
  if (event.subtype === 'task_started' || event.subtype === 'task_updated') {
    const facts = taskFacts(event)
    const patch = record(event.patch)
    if (typeof patch?.status === 'string') facts.status = patch.status
    return {
      taskId,
      notification: false,
      text: `${event.subtype}: ${JSON.stringify(facts)}`,
    }
  }
  if (
    event.subtype === 'background_tasks_changed' &&
    Array.isArray(event.tasks)
  ) {
    const tasks = event.tasks.flatMap((task) => {
      const item = record(task)
      return item ? [taskFacts(item)] : []
    })
    return {
      taskId: null,
      notification: false,
      text: `background_tasks_changed: ${JSON.stringify(tasks)}`,
    }
  }
  return null
}
