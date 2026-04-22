import type { AttentionState } from '../provider/provider.types'
import type { NotificationEventKind } from './notifications.types'

export function detectEvent(
  prev: AttentionState,
  next: AttentionState,
): NotificationEventKind | null {
  if (prev === next) return null
  switch (next) {
    case 'finished':
      return 'agent.finished'
    case 'failed':
      return 'agent.errored'
    case 'needs-input':
      return 'agent.needs_input'
    case 'needs-approval':
      return 'agent.needs_approval'
    case 'none':
      return null
  }
}
