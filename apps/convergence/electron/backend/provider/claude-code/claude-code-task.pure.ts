export interface ClaudeTaskNote {
  taskId: string | null
  notification: boolean
  moment: 'started' | 'terminal'
  description: string
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

export const CLAUDE_TASK_NOTIFICATION_FALLBACK =
  'Claude Code closed a background-task turn without a notification.'

/** The hotfix records lifecycle notes; CC2-1 owns structured projections. */
export function readClaudeTaskNote(
  data: unknown,
  descriptions?: ReadonlyMap<string, string>,
): ClaudeTaskNote | null {
  const event = record(data)
  if (event?.type !== 'system') return null
  const notification = event.subtype === 'task_notification'
  const started = event.subtype === 'task_started'
  if (!started && !notification && event.subtype !== 'task_updated') return null
  const status = record(event.patch)?.status ?? event.status
  const ending =
    status === 'completed'
      ? 'finished'
      : status === 'failed'
        ? 'failed'
        : status === 'killed' || status === 'stopped'
          ? 'was stopped'
          : null
  if (!started && !ending) return null
  const taskId = typeof event.task_id === 'string' ? event.task_id : null
  const description =
    (typeof event.description === 'string' && event.description.trim()) ||
    (taskId && descriptions?.get(taskId)) ||
    taskId ||
    'without an id'
  return {
    taskId,
    notification,
    moment: started ? 'started' : 'terminal',
    description,
    text: started
      ? `Background task started: ${description}`
      : `Background task ${description} ${ending}`,
  }
}
