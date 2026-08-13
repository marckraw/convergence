import type { ActivitySignal, SessionStatus } from '@/entities/session'

export interface SessionCardActivityInput {
  activity: ActivitySignal | undefined
  status: SessionStatus
}

/**
 * The Session Card's live line: what this agent is doing right now.
 *
 * Deliberately distinct from `formatActivityLabel` in the session entity. That
 * one decorates a transcript header and may return null when nothing is
 * streaming; a card must always say something, so this one falls back to the
 * Session's status and speaks in the room's voice ("running tool: Bash").
 */
export function formatSessionCardActivity({
  activity,
  status,
}: SessionCardActivityInput): string {
  if (activity) {
    if (activity === 'streaming') return 'writing response…'
    if (activity === 'thinking') return 'thinking…'
    if (activity === 'compacting') return 'compacting context…'
    if (activity === 'waiting-approval') return 'waiting for approval'
    if (activity.startsWith('tool:')) {
      const toolName = activity.slice('tool:'.length).trim()
      return toolName ? `running tool: ${toolName}` : 'running tool'
    }
  }

  switch (status) {
    case 'running':
      return 'working…'
    case 'idle':
      return 'idle'
    case 'completed':
      return 'finished'
    case 'failed':
      return 'failed'
  }
}
