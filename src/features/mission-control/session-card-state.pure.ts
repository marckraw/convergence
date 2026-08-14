import type { SessionCard } from './mission-control.types'

/**
 * The five states a Session Card can be in, as the room reads them.
 *
 * This is the single vocabulary shared by the filter chips and the ordering
 * presets: whenever Mission Control says "working", it means this.
 *
 * Distinct from `getSessionCardGroup` in `session-card-order.pure.ts`, which
 * answers a different question — what the room *owes Marcin* (unread outcomes
 * float up) rather than what a Session is *doing right now*. A failed Session
 * he has already looked at is still `failed` here, but no longer sits in the
 * review band there.
 */
export type SessionCardState =
  | 'working'
  | 'needs-you'
  | 'idle'
  | 'finished'
  | 'failed'

export const SESSION_CARD_STATES: readonly SessionCardState[] = [
  'working',
  'needs-you',
  'idle',
  'finished',
  'failed',
]

const SESSION_CARD_STATE_LABELS: Record<SessionCardState, string> = {
  working: 'Working',
  'needs-you': 'Needs you',
  idle: 'Idle',
  finished: 'Finished',
  failed: 'Failed',
}

export function formatSessionCardState(state: SessionCardState): string {
  return SESSION_CARD_STATE_LABELS[state]
}

/**
 * Reads a Session Card's state from status, attention and activity together.
 *
 * Precedence is deliberate: being blocked on Marcin outranks everything (he
 * cannot ignore it), then live movement outranks a stale outcome flag (an
 * agent that is streaming again is working, whatever its last run left
 * behind), then the outcome the Session carries, then its bare status.
 */
export function classifySessionCardState(card: SessionCard): SessionCardState {
  const { status, attention, activity } = card.session

  if (attention === 'needs-approval' || attention === 'needs-input') {
    return 'needs-you'
  }
  // The approval prompt is live even in the beat before attention catches up.
  if (activity === 'waiting-approval') return 'needs-you'

  if (status === 'running') return 'working'
  // A live activity signal without a running status still means movement.
  if (activity) return 'working'

  // A failure anywhere wins over a finish: the room never hides a broken run
  // behind a stale "finished" flag.
  if (attention === 'failed' || status === 'failed') return 'failed'
  if (attention === 'finished' || status === 'completed') return 'finished'
  return 'idle'
}
