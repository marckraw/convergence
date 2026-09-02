import { DEFAULT_CREW_ROUND_CAP, isBudgetedOutcome } from './relay.pure'
import type { CrewHailReason } from './crew-hail.types'

/**
 * How long a station may hold a crew's loop before the silence is a fault.
 *
 * Thirty minutes because a real turn can be long -- a horse running gates
 * takes twenty -- and a hail that fires while work is still happening is a
 * hail people learn to ignore.
 */
export const DEFAULT_CREW_STALL_MINUTES = 30

/**
 * How recently a crew must have moved for its silence to be worth a hail.
 *
 * A loop that last fired yesterday is finished, not stalled, and telling
 * Marcin about it every minute forever would be noise wearing an alarm's
 * clothes. One hour: long enough that a genuinely stuck station is still
 * within it, short enough that history stays quiet.
 */
export const CREW_LIVE_WINDOW_MS = 60 * 60 * 1000

const MINUTE_MS = 60_000

/**
 * How often the stall clock ticks.
 *
 * Far finer than the window it measures, on purpose: the tick's only job is to
 * notice promptly once a window has passed, and filing the same call twice is
 * impossible by construction -- the hail book refuses a duplicate while one is
 * still open.
 */
export const RELAY_STALL_CHECK_INTERVAL_MS = MINUTE_MS

/**
 * The stall window this crew actually uses.
 *
 * A stored value that could not have been meant falls back to the default
 * rather than disabling the check -- the same rule the round cap follows, for
 * the same reason: a guard a bad row can switch off is not a guard.
 */
export function resolveStallMinutes(
  storedMinutes: number | null | undefined,
): number {
  if (typeof storedMinutes !== 'number') return DEFAULT_CREW_STALL_MINUTES
  if (!Number.isInteger(storedMinutes) || storedMinutes < 1) {
    return DEFAULT_CREW_STALL_MINUTES
  }
  return storedMinutes
}

/** The little of a hop the stall check needs, so any caller can supply it. */
export interface StallCandidateHop {
  id: string
  flowRunId: string
  outcome: string
  firedAt: string
  targetSessionId: string | null
  spawnedSessionId: string | null
  /** When the station this hop landed in came back, or null while it owes it. */
  settledAt: string | null
  /** How it came back, read as a plain string (the vocabulary law). */
  settledStatus: string | null
}

/**
 * Why this station is worth a call: it never came back at all, or it came back
 * broken. Both are loud; they are not the same sentence.
 */
export type StalledStationFate = 'quiet' | 'failed'

export interface StalledStation {
  sessionId: string
  /** The hop that landed the work nobody answered. */
  hopId: string
  flowRunId: string
  fate: StalledStationFate
}

/**
 * The settle words that mean nothing is owed: the station came back and all
 * was well, or the user ended the work before the station took it (a
 * `cancelled` or `abandoned` receipt, MAR-2759). Every other word --
 * `failed`, whether the station came back broken or the system could not run
 * the dispatch at all, or one this build cannot read -- stays loud.
 */
const SETTLED_QUIETLY: ReadonlySet<string> = new Set([
  'completed',
  'cancelled',
  'abandoned',
])

/**
 * Every station that took this crew's work and never came back, oldest debts
 * included.
 *
 * The question is set-shaped -- *which stations still owe which delivered
 * work* -- so it is asked per STATION, never of the newest row alone: a
 * failed station's own refusal rows land on top of its stamped hop, and a
 * healthy sibling in a fan-out writes newer rows forever, and neither may
 * bury a debt. Each station is judged by its newest budgeted hop, because a
 * station holding fresh work is mid-turn, not one that abandoned the older
 * row; rows that spent nothing are not debts and are skipped entirely.
 *
 * Per candidate, four things must all hold, and each one exists to keep a
 * hail from being noise:
 *
 * - the hop actually spent a provider turn, so something is genuinely owed;
 * - it landed somewhere this can name, or there is no station to accuse;
 * - the window has passed;
 * - the crew is still live. A loop that last moved yesterday finished.
 *
 * Then the question itself: **does this station still owe the landed hop?**
 * The clock is only a proxy for it, and on the ordinary A -> B wire the two
 * disagree -- a terminal station writes no row when it finishes, so the clock
 * alone accuses a healthy loop every time. The answer is the durable stamp
 * the station's own settle left on the hop.
 *
 * A station that came back BROKEN stays loud: a terminal station that failed
 * writes no row, parks nothing and hails nothing, so this call is its only
 * alarm. So does a fate this build cannot read -- a station whose ending is a
 * word we do not know is not one we can vouch for. And neither waits for the
 * window: the window is the benefit of the doubt given to SILENCE, and a
 * broken return -- a `failed` settle, or a dispatch the system could not run
 * and stamped `failed` by the session layer's word (design P) -- has already
 * answered. Work the user cancelled or abandoned before the station took it
 * is quiet: there is no silence to accuse anyone of.
 */
export function findStalledStations(input: {
  /** The crew's trail, newest first -- the order the ledger reads in. */
  hops: readonly StallCandidateHop[]
  now: Date
  stallMinutes: number
}): StalledStation[] {
  const judged = new Set<string>()
  const stalled: StalledStation[] = []

  for (const hop of input.hops) {
    if (!isBudgetedOutcome(hop.outcome)) continue

    const landedIn = hop.spawnedSessionId ?? hop.targetSessionId
    if (!landedIn) continue

    // The first budgeted hop seen for a station is its newest, because the
    // trail arrives newest first -- and it settles the question for that
    // station whichever way it goes. Older hops are history, not debts.
    if (judged.has(landedIn)) continue
    judged.add(landedIn)

    const firedAt = new Date(hop.firedAt).getTime()
    if (Number.isNaN(firedAt)) continue

    const quietFor = input.now.getTime() - firedAt
    if (quietFor > CREW_LIVE_WINDOW_MS) continue

    const cameBack = hop.settledAt !== null
    if (cameBack && SETTLED_QUIETLY.has(hop.settledStatus ?? '')) continue
    // Silence gets the window; a broken return is already an answer.
    if (!cameBack && quietFor < input.stallMinutes * MINUTE_MS) continue

    stalled.push({
      sessionId: landedIn,
      hopId: hop.id,
      flowRunId: hop.flowRunId,
      fate: cameBack ? 'failed' : 'quiet',
    })
  }

  return stalled
}

/**
 * The one sentence a hail leads with.
 *
 * Written here rather than at each raising site so the four reasons cannot
 * drift into four different voices, and so the words are testable without a
 * database. Every one of them says what happened AND what it means for the
 * loop, because "unrouted" on its own is the kind of word that sends someone
 * hunting through logs.
 */
export function formatCrewHailDetail(
  reason: CrewHailReason,
  context: {
    baton?: string | null
    cap?: number
    minutes?: number
    fate?: StalledStationFate
  } = {},
): string {
  switch (reason) {
    case 'terminal':
      return 'This station handed the work to you, so the loop parked here and no wire fired.'
    case 'unrouted':
      return `This station handed on "${context.baton ?? 'a baton'}", and no armed wire in this crew answers to it, so nothing fired.`
    case 'loop-closed':
      return `This station handed on "${context.baton ?? 'a baton'}", but the wire that answers to it already carried this run, and a crew closes one lap per run — so the loop ended here.`
    case 'round-budget':
      return `This loop went ${context.cap ?? DEFAULT_CREW_ROUND_CAP} rounds without reaching a terminal, so the wire held rather than spending another turn.`
    case 'stall':
      return context.fate === 'failed'
        ? "This station took the loop's work and failed, so nothing is coming next on its own."
        : `This station took the loop's work and has been quiet for ${context.minutes ?? DEFAULT_CREW_STALL_MINUTES} minutes, so nothing is coming next on its own.`
  }
}
