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
    // Not the agent's news: the run is unchanged and this app has lost sight
    // of it, so there is nothing to tell the person that the card does not
    // already show (MAR-3051).
    case 'host-unreachable':
    case 'none':
      return null
  }
}
