import { CREW_LIVE_WINDOW_MS } from './crew-hail.pure'
import { isBudgetedOutcome, readLapNumber } from './relay.pure'
import type { CrewHail } from './crew-hail.types'
import type { RelayHop } from './relay.types'

/**
 * What history calls one recorded event, in the words the design speaks
 * (R12). Deliberately a different vocabulary from `RelayHopOutcome` and
 * `CrewHailReason`: those are what the ENGINE writes, this is what a human
 * reads, and one normalizer between them is what keeps a rename in either
 * from silently changing the other.
 *
 * `parked` is R3's own word for an unrouted baton. The design's list has no
 * member for it and `held` would be a lie -- a held wire did what it was
 * drawn to do, while a parked run reached nobody.
 *
 * `loop-closed` is legacy-only: the lap law (R2) means this build never
 * writes the row or the hail again, and rows that already say it must still
 * read as what they were.
 */
export type RunHistoryOutcome =
  | 'delivered'
  | 'queued'
  | 'held'
  | 'delivery-failed'
  | 'limit-reached'
  | 'handed-back'
  | 'parked'
  | 'reply-overdue'
  | 'loop-closed'
  | 'unknown'

/**
 * What one run amounts to right now.
 *
 * `needs-you` keeps WHICH of the four ways it needs him, because "needs you"
 * on its own is the kind of word that sends someone hunting: a failed
 * delivery, an exhausted limit, a baton nobody answered and a station that
 * went quiet are four different next actions.
 */
export type RunStatusWord =
  | 'handed-back'
  | 'needs-you'
  | 'running'
  | 'finished-quiet'
  | 'unknown'

export type RunNeedsYouReason = 'failed' | 'limit' | 'parked' | 'stalled'

export interface RunStatus {
  word: RunStatusWord
  /** Set only when the word is `needs-you`. */
  reason: RunNeedsYouReason | null
}

/**
 * How dead the run is, most terminal first.
 *
 * A failed delivery and a spent limit ended it; an unrouted baton parked it
 * with nothing coming; a stalled station may still come back on its own. When
 * one run collected several calls, the row leads with the one that is least
 * likely to resolve itself -- a fixed order rather than "the newest", so the
 * same records always read the same way.
 */
const NEEDS_YOU_SEVERITY: readonly RunNeedsYouReason[] = [
  'failed',
  'limit',
  'parked',
  'stalled',
]

/**
 * The design word for one recorded hop.
 *
 * Takes a plain string, like every other reader of a stored outcome (the
 * vocabulary law): a row written by an older or newer Convergence carries a
 * word this build has never heard of, and it must land on `unknown` rather
 * than render blank.
 */
export function normalizeHopOutcome(outcome: string): RunHistoryOutcome {
  switch (outcome) {
    case 'delivered':
      return 'delivered'
    // A spawn IS a delivery -- into a session the wire opened for it. The
    // design's vocabulary has no separate word and inventing one here would
    // put a word on Marcin's screen that no frame shows; the event row names
    // the session it created beside this.
    case 'spawned':
      return 'delivered'
    case 'queued':
      return 'queued'
    // `skipped-no-message` joins them because nothing was owed, so nothing
    // failed: a turn that produced no assistant message left the wire with
    // nothing to carry, which is a hold in every sense the word has here.
    case 'skipped-failed':
    case 'skipped-muted':
    case 'skipped-baton':
    case 'skipped-no-message':
      return 'held'
    case 'skipped-budget':
    case 'skipped-round-budget':
      return 'limit-reached'
    case 'skipped-already-fired':
      return 'loop-closed'
    case 'error':
      return 'delivery-failed'
    default:
      return 'unknown'
  }
}

/** The design word for one recorded call on the chair. Same string rule. */
export function normalizeHailReason(reason: string): RunHistoryOutcome {
  switch (reason) {
    case 'terminal':
      return 'handed-back'
    case 'unrouted':
      return 'parked'
    case 'round-budget':
    case 'budget':
      return 'limit-reached'
    case 'delivery-failed':
      return 'delivery-failed'
    case 'stall':
      return 'reply-overdue'
    case 'loop-closed':
      return 'loop-closed'
    default:
      return 'unknown'
  }
}

/**
 * The design word for either kind of record, which is what the history panel
 * actually holds: one chronological list of hops and hails.
 */
export function normalizeHistoryOutcome(
  event: { kind: 'hop'; outcome: string } | { kind: 'hail'; reason: string },
): RunHistoryOutcome {
  return event.kind === 'hop'
    ? normalizeHopOutcome(event.outcome)
    : normalizeHailReason(event.reason)
}

/** The little of a hop `deriveRunStatus` needs. */
export interface RunStatusHop {
  id: string
  targetSessionId: string | null
  spawnedSessionId: string | null
  outcome: string
  /** When the hop fired, so an unsettled one can be asked its age. */
  firedAt: string
  /**
   * The delivery receipt, or null on a row written before receipts existed.
   *
   * Receipts are issued on this build's rows only. A null receipt identifies
   * a legacy row whose outstanding work the ledger cannot vouch for, so it
   * is not read as owed. `markStationSettled` can still stamp such a row by
   * its fired-at floor; the missing receipt is not proof it cannot settle.
   */
  dispatchId: string | null
  /** Null while the station this hop landed work in still owes it. */
  settledAt: string | null
}

/**
 * Whether an unsettled budgeted hop is genuinely work in flight.
 *
 * Two ways it is not, and both end at `unknown` rather than at `running` --
 * because the honest thing to say about an ending nobody recorded is that
 * nobody recorded it:
 *
 * - **No receipt.** A hop that carries no dispatch id has nothing a settle can
 *   name, so nothing will stamp it by identity. Every row written before
 *   receipts existed is in this state, and reading them as owed pinned them to
 *   "Running" for the life of the ledger.
 * - **Older than the crew's live window.** The stall clock's own rule (a loop
 *   that last fired an hour ago is finished, not stalled), applied to the same
 *   question. A station that took work and died leaves its hop unstamped
 *   forever, and after the window the truthful reading is that the ending was
 *   never written down.
 *
 * A timestamp this build cannot parse is not proof of anything either, so it
 * lands on the same side.
 */
function isStillOwed(hop: RunStatusHop, now: Date): boolean {
  if (hop.dispatchId === null) return false
  const firedAt = Date.parse(hop.firedAt)
  if (!Number.isFinite(firedAt)) return false
  return now.getTime() - firedAt <= CREW_LIVE_WINDOW_MS
}

/** The little of a hail `deriveRunStatus` needs. */
export interface RunStatusHail {
  raisedAt: string
  reason: string
}

/**
 * What one run's own records say happened to it.
 *
 * The order of the questions IS the ruling (R3), and the first one is the
 * load-bearing half: **a run that needs him never reads as one he was handed
 * back.** A failure, a spent limit, a parked baton and a stalled station are
 * each a reason nothing is coming next, and a run that collected one of them
 * on the way to the chair is still a run with something wrong in it. Erring
 * the other way would put a green "handed back" on a run whose second branch
 * died -- exactly the masquerade the design forbids -- and the terminal is
 * still there in the events either way.
 *
 * Acknowledgement is not read here on purpose. Marking a call seen
 * acknowledges it; it does not un-fail a delivery or refill a limit, and a
 * status that changed when he looked at it would be a record of his attention
 * rather than of the run.
 *
 * `running` is asked of the LEDGER rather than of the engine's memory: a
 * budgeted hop with no settle stamp is work a station still owes, and that
 * fact survives the restart that empties every baton. `finished-quiet` is the
 * honest name for the rest -- a run whose deliveries all came back and which
 * asked for nobody. It is not "succeeded": nothing here knows whether the
 * work was any good.
 *
 * **Both kinds of record answer the question, not the calls alone.** A hop
 * that failed and a hop the budget stopped are recorded FACTS about the run,
 * and they say it needs him whether or not a call was ever filed beside them
 * -- which, for every row written before `delivery-failed` and `budget`
 * existed, it could not have been. Reading the hails alone let one of those
 * runs read "finished quiet", and one that also reached the chair read
 * "handed back": the masquerade promise 5 forbids, spread across the whole
 * ledger by construction. A hop's engine word is read through the same
 * one-way normalizer the event rows use rather than matched here a second
 * time (R12): which outcomes mean "a delivery broke" and "a limit stopped it"
 * has one owner, and a second copy in this loop would be a copy free to
 * drift.
 */
export function deriveRunStatus(input: {
  hops: readonly RunStatusHop[]
  hails: readonly RunStatusHail[]
  /** Read once by the caller, so one page of runs is judged by one clock. */
  now: Date
}): {
  status: RunStatus
  owedBy: RelayRun['owedBy']
  handedBackAt: string | null
} {
  const needs = new Set<RunNeedsYouReason>()
  let handedBackAt: string | null = null
  // Whether this build can read the run's records AT ALL -- a question about
  // the vocabulary, never about whether a turn was spent. A run of nothing
  // but held wires is perfectly readable and simply spent nothing.
  let readable = false
  // Work a station genuinely still owes, and work whose ending nobody wrote
  // down. They are different answers and neither is the other's default.
  let owedBy: RelayRun['owedBy'] = null
  let unrecorded = false

  for (const hop of input.hops) {
    const word = normalizeHopOutcome(hop.outcome)
    if (word !== 'unknown') readable = true
    if (word === 'delivery-failed') needs.add('failed')
    if (word === 'limit-reached') needs.add('limit')
    if (!isBudgetedOutcome(hop.outcome)) continue
    if (hop.settledAt !== null) continue
    if (isStillOwed(hop, input.now)) {
      if (!owedBy || Date.parse(hop.firedAt) >= Date.parse(owedBy.firedAt)) {
        owedBy = {
          hopId: hop.id,
          targetSessionId: hop.spawnedSessionId ?? hop.targetSessionId,
          firedAt: hop.firedAt,
        }
      }
    } else unrecorded = true
  }

  for (const hail of input.hails) {
    if (normalizeHailReason(hail.reason) !== 'unknown') readable = true
    switch (hail.reason) {
      case 'terminal':
        if (
          !handedBackAt ||
          Date.parse(hail.raisedAt) > Date.parse(handedBackAt)
        )
          handedBackAt = hail.raisedAt
        break
      case 'delivery-failed':
        needs.add('failed')
        break
      case 'round-budget':
      case 'budget':
        needs.add('limit')
        break
      // The legacy reason falls through on purpose: a `loop-closed` row was a
      // baton handed to a wire that could not take it, with nobody told --
      // that is a parked run in every way except the word the build of the
      // day used for it.
      case 'unrouted':
      case 'loop-closed':
        needs.add('parked')
        break
      case 'stall':
        needs.add('stalled')
        break
      default:
        break
    }
  }

  const finish = (status: RunStatus) => ({
    status,
    owedBy,
    handedBackAt: status.word === 'handed-back' ? handedBackAt : null,
  })
  for (const reason of NEEDS_YOU_SEVERITY) {
    if (needs.has(reason)) return finish({ word: 'needs-you', reason })
  }

  if (handedBackAt) return finish({ word: 'handed-back', reason: null })

  if (owedBy) return finish({ word: 'running', reason: null })

  // Three roads to the same word, and one sentence covers all of them: a run
  // recorded entirely in another build's vocabulary, a run with no records at
  // all, and a run whose last delivery has no ending written down. Saying
  // "finished quiet" about any of them would be vouching for something
  // nothing here can read.
  if (unrecorded || !readable) return finish({ word: 'unknown', reason: null })

  return finish({ word: 'finished-quiet', reason: null })
}

/** One generation of the run: every hop whose wire was on its Nth pass. */
export interface RelayRunLap {
  lap: number
  hops: RelayHop[]
}

export interface RelayRunCounts {
  /** Hops that actually spent a provider turn. */
  deliveries: number
  /** Hops that could not deliver at all. */
  failures: number
  /** How many generations the run reached. */
  laps: number
  /** Every recorded event, hails included. */
  events: number
}

/** One user-visible run: everything one `flowRunId` ever recorded. */
export interface RelayRun {
  flowRunId: string
  crewId: string
  /** The first recorded event's time, hail or hop. */
  startedAt: string
  /** The last recorded event's time. */
  endedAt: string
  lastActivityAt: string
  owedBy: {
    hopId: string
    targetSessionId: string | null
    firedAt: string
  } | null
  handedBackAt: string | null
  laps: RelayRunLap[]
  hails: CrewHail[]
  status: RunStatus
  counts: RelayRunCounts
}

export interface RelayRunPage {
  runs: RelayRun[]
  /**
   * Calls with no run id (R12). A station whose baton nothing answered may
   * have no outgoing wire at all, so its call has no hop and no run to hang
   * under -- and attaching it to the newest run would attribute somebody
   * else's silence to a chain that was fine.
   */
  unattributedHails: CrewHail[]
  /**
   * The design's word for every event on this page, by hop or hail id.
   *
   * Decided HERE, once, by the layer that owns the vocabulary -- and sent
   * across rather than recomputed, because the renderer cannot import from
   * `electron/` and a second copy of `normalizeHistoryOutcome` over there
   * would be two vocabularies free to drift with nothing agreeing them. A
   * literal that crosses the tree boundary needs a barrier; a value that
   * crosses it needs nothing.
   */
  outcomes: Record<string, RunHistoryOutcome>
  nextCursor: RunHistoryCursor | null
  hasMore: boolean
}

/**
 * Turns one crew's raw records into the runs the history panel shows.
 *
 * Pure, and given everything it needs, because the grouping IS the feature:
 * laps come from `readLapNumber` so a run recorded before the column existed
 * groups exactly as a new one does, ordering comes from the caller's own
 * chronological sequence rather than from a timestamp compare that
 * second-resolution `fired_at` cannot make total, and a hail with no run id
 * never enters a run.
 *
 * `hops` and `hails` arrive OLDEST first -- the order the ledger happened in
 * and the order `readLapNumber` reads "earlier" in.
 */
export function assembleRuns(input: {
  crewId: string
  /** Every hop of the runs on this page, oldest first. */
  hops: readonly RelayHop[]
  /**
   * Every call this page has to place, oldest first -- the ones belonging to
   * a run AND the ones belonging to none. One list rather than two, so that
   * deciding what belongs to a run happens exactly once, here, where a test
   * can put an orphan in and prove it never lands in a chain that was fine.
   * Handing this function only the pre-filtered calls would leave the guard
   * below with no reachable input and the rule pinned by nothing.
   */
  hails: readonly CrewHail[]
  /** The runs to build, newest first: the page's own order. */
  flowRunIds: readonly string[]
  hasMore: boolean
  /**
   * The clock every run on this page is judged by.
   *
   * Passed in rather than read here, so the whole page is derived from one
   * instant and a test can put a run either side of the live window without
   * waiting for it.
   */
  now: Date
}): RelayRunPage {
  const hopsByRun = new Map<string, RelayHop[]>()
  for (const hop of input.hops) {
    const bucket = hopsByRun.get(hop.flowRunId)
    if (bucket) bucket.push(hop)
    else hopsByRun.set(hop.flowRunId, [hop])
  }

  const hailsByRun = new Map<string, CrewHail[]>()
  const unattributedHails: CrewHail[] = []
  for (const hail of input.hails) {
    // The one rule that has to be made here and nowhere else: a call with no
    // run id belongs to NO run. A station whose baton nothing answered may
    // have no outgoing wire at all, so its call has no hop and no run to hang
    // under -- and attaching it to the newest one would blame a chain that
    // was fine and flip that run's status to "needs you".
    if (hail.flowRunId === null) {
      unattributedHails.push(hail)
      continue
    }
    const bucket = hailsByRun.get(hail.flowRunId)
    if (bucket) bucket.push(hail)
    else hailsByRun.set(hail.flowRunId, [hail])
  }

  const runs: RelayRun[] = []
  for (const flowRunId of input.flowRunIds) {
    const hops = hopsByRun.get(flowRunId) ?? []
    const hails = hailsByRun.get(flowRunId) ?? []
    if (hops.length === 0 && hails.length === 0) continue

    // Laps are read against the WHOLE page's chronological sequence, not the
    // run's own slice, because `readLapNumber` counts a wire's earlier
    // budgeted hops by position and only rows of this run and this wire can
    // ever match -- so the wider sequence is free and the narrower one would
    // have to be rebuilt per run.
    const lapsByNumber = new Map<number, RelayHop[]>()
    for (const hop of hops) {
      const lap = readLapNumber(hop, input.hops)
      const bucket = lapsByNumber.get(lap)
      if (bucket) bucket.push(hop)
      else lapsByNumber.set(lap, [hop])
    }
    const laps: RelayRunLap[] = [...lapsByNumber.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([lap, lapHops]) => ({ lap, hops: lapHops }))

    const times = [
      ...hops.map((hop) => hop.firedAt),
      ...hails.map((hail) => hail.raisedAt),
    ].sort()

    const derived = deriveRunStatus({ hops, hails, now: input.now })
    runs.push({
      flowRunId,
      crewId: input.crewId,
      startedAt: times[0] ?? '',
      endedAt: times[times.length - 1] ?? '',
      lastActivityAt:
        [
          ...times,
          ...hops.flatMap((hop) => (hop.settledAt ? [hop.settledAt] : [])),
        ]
          .sort((a, b) => Date.parse(a) - Date.parse(b))
          .at(-1) ?? '',
      laps,
      hails,
      ...derived,
      counts: {
        deliveries: hops.filter((hop) => isBudgetedOutcome(hop.outcome)).length,
        failures: hops.filter((hop) => hop.outcome === 'error').length,
        laps: laps.length,
        events: hops.length + hails.length,
      },
    })
  }

  const outcomes: Record<string, RunHistoryOutcome> = {}
  for (const hop of input.hops) {
    outcomes[hop.id] = normalizeHopOutcome(hop.outcome)
  }
  for (const hail of input.hails) {
    outcomes[hail.id] = normalizeHailReason(hail.reason)
  }

  return {
    runs,
    // Newest first, unlike the runs' own events: these are not a sequence,
    // they are a list of things still unanswered.
    unattributedHails: unattributedHails
      .slice()
      .sort((a, b) => (a.raisedAt < b.raisedAt ? 1 : -1)),
    outcomes,
    hasMore: input.hasMore,
    nextCursor: null,
  }
}

export interface RunHistoryCursor {
  asOf: string
  live: 0 | 1
  lastActivityAt: string
  flowRunId: string
}
