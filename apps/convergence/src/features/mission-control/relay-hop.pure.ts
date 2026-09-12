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
  // The delivery limit is alarming while `skipped-baton` is not, and the
  // difference is whether anything is owed: a wire that held because the
  // message named another route did exactly what it was drawn to do, while a
  // run that spent its whole limit is waiting on a human and has hailed.
  'skipped-round-budget',
]

export type RelayHopTone = 'delivered' | 'skipped' | 'alarm' | 'unknown'

export function isAlarmingHop(hop: Pick<RelayHop, 'outcome'>): boolean {
  return (ALARMING_RELAY_OUTCOMES as readonly string[]).includes(hop.outcome)
}

export function countAlarmingHops(
  hops: readonly Pick<RelayHop, 'outcome'>[],
): number {
  return hops.filter(isAlarmingHop).length
}

/**
 * Takes a plain string, not the union: a ledger row written by a different
 * build carries a word this one has never heard of, and it must land somewhere
 * quiet. An unknown outcome is never alarming -- red is reserved for things
 * this build actually understands to be wrong.
 */
export function relayHopTone(outcome: string): RelayHopTone {
  switch (outcome) {
    case 'delivered':
    case 'queued':
    case 'spawned':
      return 'delivered'
    // `skipped-already-fired` is grey on purpose, and it is LEGACY: the lap
    // law (R2) means no build after RUN45 writes it, but rows that already
    // say it are still rows, and a chain that ended after one pass was the
    // loop law doing its job rather than a fault.
    // `skipped-muted` is grey because the wire did exactly what it was told.
    // Red here would train the user to fear their own quiet send.
    // `skipped-baton` is grey for the same reason the other two are: the wire
    // is default-closed by design, and red here would train the user to fear
    // a condition doing its job on every settle that names another route.
    // `skipped-no-message` is grey for the same reason again: the turn simply
    // produced nothing to carry, and nothing was owed.
    case 'skipped-failed':
    case 'skipped-already-fired':
    case 'skipped-muted':
    case 'skipped-baton':
    case 'skipped-no-message':
      return 'skipped'
    case 'skipped-budget':
    case 'skipped-round-budget':
    case 'error':
      return 'alarm'
    default:
      return 'unknown'
  }
}

/** Shown for a row whose outcome word belongs to a different build. */
export const UNKNOWN_OUTCOME_LABEL = 'unknown outcome'

/**
 * What the ledger calls each outcome. The skips say why in the same breath,
 * because "skipped" on its own is the kind of word that sends someone hunting
 * through logs. Anything this build does not recognise gets a neutral label
 * rather than a blank -- the raw word travels separately, for the tooltip.
 */
export function formatRelayHopOutcome(outcome: string): string {
  switch (outcome) {
    case 'delivered':
      return 'delivered'
    case 'queued':
      return 'queued'
    case 'spawned':
      return 'started a new session'
    case 'skipped-failed':
      return 'skipped — source failed'
    case 'skipped-budget':
      return 'stopped — hop budget'
    // Legacy only (R2): the ledger is a historical record, and a row this
    // build stopped writing must still read as what it meant.
    case 'skipped-already-fired':
      return 'lap closed (older build)'
    case 'skipped-muted':
      return 'held — sent quiet'
    case 'skipped-baton':
      return 'held — another baton'
    case 'skipped-no-message':
      return 'held — nothing to carry'
    case 'skipped-round-budget':
      return 'stopped — delivery limit'
    case 'error':
      return 'error'
    default:
      return UNKNOWN_OUTCOME_LABEL
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
  /**
   * The stored word, but only when this build could not translate it. Rendered
   * as the label's tooltip so an unrecognised row can still be identified
   * exactly, without putting a raw enum in front of anyone else's eyes.
   */
  rawOutcome: string | null
  tone: RelayHopTone
  timeLabel: string
  /**
   * Which round of the loop this was, in words. Null on the rows that belong
   * to the settle rather than the loop (a quiet send, a failed source) — and
   * on every row written before rounds existed, which is the same honest
   * answer.
   */
  roundLabel: string | null
  /** The route the finishing message declared, or null when it declared none. */
  batonLabel: string | null
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
  const tone = relayHopTone(hop.outcome)

  return {
    sourceName: resolveName(hop.sourceSessionId) ?? MISSING_SESSION_LABEL,
    targetName: landedIn
      ? (resolveName(landedIn) ?? MISSING_SESSION_LABEL)
      : null,
    outcomeLabel: formatRelayHopOutcome(hop.outcome),
    rawOutcome: tone === 'unknown' ? hop.outcome : null,
    tone,
    timeLabel: formatHopTime(hop.firedAt, now),
    roundLabel: hop.roundNumber === null ? null : `round ${hop.roundNumber}`,
    batonLabel: hop.baton === null ? null : `⚡ ${hop.baton}`,
    payloadPreview: hop.payloadPreview,
    error: hopReasonToShow(hop),
  }
}

/**
 * The reason a SURFACE should show for a hop, which is not always the reason
 * the ledger recorded (MAR-2888).
 *
 * A `queued` hop's reason describes a STATE -- "Waiting behind a running turn
 * at the target." -- and it is true only while the hop is still waiting. Once
 * the turn ran and the hop settled, the sentence describes something that has
 * ended, and a surface repeating it tells the reader to be patient about work
 * that already landed. Every other outcome's error is a record of an EVENT --
 * a refusal, a broken delivery, a spent budget -- and stays readable forever.
 *
 * One function because there are two surfaces and they were not agreeing: the
 * canvas row learned this in lap 2 and History's event row did not. The
 * ledger keeps the truth that the hop waited; what changes is whether a
 * reader is told it still does.
 */
export function hopReasonToShow(hop: {
  outcome: string
  settledAt: string | null
  error: string | null
}): string | null {
  if (hop.outcome === 'queued' && hop.settledAt !== null) return null
  return hop.error
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

/**
 * What the second press of "Clear trail" is agreeing to.
 *
 * Says the scope out loud -- history goes, wires and sessions stay -- because
 * a crew's Flow section puts the two a few pixels apart, and "clear" is a word
 * that could plausibly mean either. When the ⚠ badge is showing, the alerts it
 * counts are named too: they are the one thing on screen that a wipe destroys
 * without the user having read it.
 */
export function formatClearTrailConfirm(alarmingCount: number): string {
  const base = 'Clear every hop? The wires and sessions stay.'
  if (alarmingCount === 0) return base
  return alarmingCount === 1
    ? `${base} This also dismisses 1 alert.`
    : `${base} This also dismisses ${alarmingCount} alerts.`
}

/**
 * What a clear left behind, or null when it took everything.
 *
 * A flow still in flight keeps its rows -- the loop law reads them to know a
 * wire already fired -- so a trail that does not empty has to say why, or it
 * reads as a button that half worked.
 */
export function formatKeptHopsNote(keptCount: number): string | null {
  if (keptCount <= 0) return null
  return keptCount === 1
    ? 'Kept 1 hop from a flow that is still running.'
    : `Kept ${keptCount} hops from a flow that is still running.`
}
