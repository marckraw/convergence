import type { RelayHop, RelayHopOutcome } from '@/entities/session-relay'
import type { ResolveSessionName } from './relay-sentence.pure'
import { MISSING_SESSION_LABEL } from './relay-sentence.pure'

/**
 * Outcomes that must never be quiet: something either broke or a loop had to
 * be stopped by force. These drive the red treatment and the container badge.
 */
export const ALARMING_RELAY_OUTCOMES: readonly RelayHopOutcome[] = [
  'error',
  'skipped-budget',
]

export type RelayHopTone = 'delivered' | 'skipped' | 'alarm'

export function isAlarmingHop(hop: Pick<RelayHop, 'outcome'>): boolean {
  return ALARMING_RELAY_OUTCOMES.includes(hop.outcome)
}

export function countAlarmingHops(
  hops: readonly Pick<RelayHop, 'outcome'>[],
): number {
  return hops.filter(isAlarmingHop).length
}

export function relayHopTone(outcome: RelayHopOutcome): RelayHopTone {
  switch (outcome) {
    case 'delivered':
    case 'queued':
    case 'spawned':
      return 'delivered'
    case 'skipped-disarmed':
    case 'skipped-failed':
      return 'skipped'
    default:
      return 'alarm'
  }
}

/**
 * What the ledger calls each outcome. The skips say why in the same breath,
 * because "skipped" on its own is the kind of word that sends someone hunting
 * through logs.
 */
export function formatRelayHopOutcome(outcome: RelayHopOutcome): string {
  switch (outcome) {
    case 'delivered':
      return 'delivered'
    case 'queued':
      return 'queued'
    case 'spawned':
      return 'started a new session'
    case 'skipped-disarmed':
      return 'skipped — disarmed'
    case 'skipped-failed':
      return 'skipped — source failed'
    case 'skipped-budget':
      return 'stopped — hop budget'
    case 'error':
      return 'error'
  }
}

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/**
 * How long ago a hop fired, at a glance. A trail is scanned, not studied, so
 * anything older than a day drops to a date rather than a growing number.
 */
export function formatHopTime(firedAt: string, now: Date): string {
  const fired = new Date(firedAt)
  const elapsed = now.getTime() - fired.getTime()

  if (Number.isNaN(elapsed)) return firedAt
  if (elapsed < MINUTE_MS) return 'just now'
  if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)}m ago`
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)}h ago`
  return fired.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

export interface RelayHopLine {
  sourceName: string
  /** The session that received the payload, spawned or hailed. */
  targetName: string | null
  outcomeLabel: string
  tone: RelayHopTone
  timeLabel: string
  /** Shown only when the hop actually carried something. */
  payloadPreview: string | null
  error: string | null
}

/**
 * One ledger row's worth of words.
 *
 * A hop keeps its names even after its sessions are deleted, so the row falls
 * back to saying so rather than rendering an id -- the whole point of the
 * ledger is that it still reads after the thing it describes is gone.
 */
export function buildRelayHopLine(
  hop: RelayHop,
  resolveName: ResolveSessionName,
  now: Date,
): RelayHopLine {
  const landedIn = hop.spawnedSessionId ?? hop.targetSessionId

  return {
    sourceName: resolveName(hop.sourceSessionId) ?? MISSING_SESSION_LABEL,
    targetName: landedIn
      ? (resolveName(landedIn) ?? MISSING_SESSION_LABEL)
      : null,
    outcomeLabel: formatRelayHopOutcome(hop.outcome),
    tone: relayHopTone(hop.outcome),
    timeLabel: formatHopTime(hop.firedAt, now),
    payloadPreview: hop.payloadPreview,
    error: hop.error,
  }
}

export function formatHopCount(count: number): string {
  return `${count} hop${count === 1 ? '' : 's'}`
}

export interface SessionWireHint {
  /** Armed wires leaving this session. */
  outgoing: number
  /** Armed wires pointing at it. */
  incoming: number
  /** Wires touching it at all, armed or not. */
  total: number
  label: string
}

/**
 * The glyph a Session Card wears when wires touch it.
 *
 * Counts armed wires only in the numbers, because the glyph answers "will
 * anything happen when this finishes" -- but keeps the total so a card with
 * only switched-off wires still shows something rather than looking unwired.
 */
export function buildSessionWireHint(
  relays: readonly {
    sourceSessionId: string
    targetSessionId: string | null
    armed: boolean
  }[],
  sessionId: string,
): SessionWireHint | null {
  const touching = relays.filter(
    (relay) =>
      relay.sourceSessionId === sessionId ||
      relay.targetSessionId === sessionId,
  )
  if (touching.length === 0) return null

  const outgoing = touching.filter(
    (relay) => relay.armed && relay.sourceSessionId === sessionId,
  ).length
  const incoming = touching.filter(
    (relay) => relay.armed && relay.targetSessionId === sessionId,
  ).length

  const parts: string[] = []
  if (outgoing > 0) {
    parts.push(`sends its last message on when it finishes (${outgoing})`)
  }
  if (incoming > 0) {
    parts.push(`receives from ${incoming} other`)
  }
  if (parts.length === 0) {
    parts.push('every wire touching it is disarmed')
  }

  return {
    outgoing,
    incoming,
    total: touching.length,
    label: `Wired: ${parts.join(', ')}`,
  }
}

/** The badge's own sentence, so a red number is never just a red number. */
export function formatAlarmSummary(count: number): string {
  return count === 1
    ? '1 relay hop needs your eyes'
    : `${count} relay hops need your eyes`
}
