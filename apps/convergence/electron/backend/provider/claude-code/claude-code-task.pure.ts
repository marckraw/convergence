export interface ClaudeTaskNote {
  taskId: string | null
  notification: boolean
  moment: 'started' | 'terminal'
  description: string
  text: string
}

export function claudeRootResultClaimsBlock(
  data: unknown,
  block: unknown,
  resolveAgentId: (toolUseId: string) => string | null,
): boolean {
  const event = record(data)
  const structured = record(event?.tool_use_result)
  const content = record(event?.message)?.content
  const results = Array.isArray(content)
    ? content.filter((item) => record(item)?.type === 'tool_result')
    : []
  if (results.length === 1) return true
  const toolUseId = record(block)?.tool_use_id
  return (
    results.length > 1 &&
    typeof toolUseId === 'string' &&
    typeof structured?.agentId === 'string' &&
    resolveAgentId(toolUseId) === structured.agentId
  )
}

export function readClaudeToolResultMoment(
  data: unknown,
  block: unknown,
  resolveAgentId: (toolUseId: string) => string | null,
): 'async_launched' | 'completed' | null {
  const structured = record(record(data)?.tool_use_result)
  if (
    typeof structured?.agentId !== 'string' ||
    !claudeRootResultClaimsBlock(data, block, resolveAgentId)
  )
    return null
  const status = structured.status
  return status === 'async_launched' || status === 'completed' ? status : null
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
