import { parallelWorkStatus } from '@/shared/lib/parallel-work.pure'
import type { SessionSummary } from './session.types'
import {
  COMPACTING_CONTEXT_LABEL,
  isSessionCompacting,
} from './session-compacting.pure'

/**
 * The two facts every card reads first about a session's attention (MC-2):
 * the room has lost sight of the host it runs on, or it waits on you, for an
 * approval or an answer. The Needs-you card and Mission Control's card both
 * start from here, so the two features can't disagree about either.
 */
export interface SessionAttentionSignal {
  hostUnreachable: boolean
  waitingOnYou: boolean
}

export function readSessionAttentionSignal(
  session: Pick<SessionSummary, 'attention'>,
): SessionAttentionSignal {
  return {
    hostUnreachable: session.attention === 'host-unreachable',
    waitingOnYou:
      session.attention === 'needs-approval' ||
      session.attention === 'needs-input',
  }
}

export function formatSessionAttentionLabel(session: SessionSummary): string {
  if (session.attention === 'needs-approval') {
    return 'Approval needed'
  }

  if (session.attention === 'needs-input') {
    switch (session.attentionRequestKind) {
      case 'question':
        return 'Question needs answer'
      case 'plan':
        return 'Plan review needed'
      case 'form':
        return 'Form input needed'
      case 'url':
        return 'URL confirmation needed'
      default:
        return 'Input needed'
    }
  }

  if (session.attention === 'failed') {
    return 'Session failed'
  }

  // The run is somebody else's machine's business; this is about the wire
  // between us and it (MAR-3051).
  if (session.attention === 'host-unreachable') {
    return 'Host unreachable'
  }

  // Busy, and saying so, before a stale `finished` can (MAR-3288 R5).
  if (isSessionCompacting(session)) return COMPACTING_CONTEXT_LABEL

  const parallel = parallelWorkStatus(session)
  if (parallel) return parallel

  if (session.attention === 'finished') {
    return 'Finished'
  }

  return 'No attention'
}

export function summarizeAttentionRequests(sessions: SessionSummary[]): string {
  const counts = new Map<string, number>()
  for (const session of sessions) {
    const label = compactAttentionLabel(session)
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([label, count]) => `${count} ${label}${count === 1 ? '' : 's'}`)
    .join(', ')
}

function compactAttentionLabel(session: SessionSummary): string {
  if (session.attention === 'needs-approval') return 'approval'
  if (session.attention !== 'needs-input') return 'attention item'

  switch (session.attentionRequestKind) {
    case 'question':
      return 'question'
    case 'plan':
      return 'plan'
    case 'form':
      return 'form'
    case 'url':
      return 'URL'
    default:
      return 'input'
  }
}
