import type {
  TrackerIssue,
  TrackerLogicalStatus,
  TrackerRefusal,
} from './tracker.types'
import type {
  NewWorkLedgerRecord,
  TrackerHealth,
  WorkLedgerRecord,
  WorkLedgerState,
} from '../work-ledger/work-ledger.types'

export const TRACKER_WATCH_INTERVAL_MS = 60_000

/**
 * How long a rate-limited tracker is left alone when its reply names no
 * reset time (lap 2, D). A rate limit always backs off.
 */
export const TRACKER_RATE_LIMIT_DEFAULT_BACKOFF_MS = 5 * 60_000

/** A row whose issue the loop has let go of: nothing more to say about it. */
function isTerminal(state: WorkLedgerState): boolean {
  return state === 'done' || state === 'unassigned'
}

/**
 * The ledger state a logical status IS (MAR-3084 R5), or null for a status
 * the binding does not map. An unmapped status writes no row: the ledger has
 * no word for it, and naming it any of the six would be a guess.
 */
export function workLedgerStateFor(
  status: TrackerLogicalStatus,
): WorkLedgerState | null {
  switch (status) {
    case 'backlog':
    case 'todo':
      return 'assigned'
    case 'in-progress':
      return 'working'
    case 'in-review':
      return 'returned'
    case 'reviewed':
      return 'reviewed'
    case 'done':
      return 'done'
    case 'other':
      return null
  }
}

/**
 * A lap is one trip out and back: it turns over when an issue that came back
 * (returned or reviewed) is worked again.
 */
function nextLap(
  previous: WorkLedgerRecord | undefined,
  state: WorkLedgerState,
) {
  if (!previous) return 1
  if (
    state === 'working' &&
    (previous.state === 'returned' || previous.state === 'reviewed')
  ) {
    return previous.lap + 1
  }
  return previous.lap
}

/**
 * Whether the tracker still reports the status a ruling superseded
 * (MAR-3085 R4, amended lap 2): the hold, and only while the lag lasts.
 *
 * A verdict row is a fact the app wrote AHEAD of the tracker -- the
 * mastermind moves the status by hand, and until it does, the tracker keeps
 * saying what it said before the ruling. Reading that lag as a change is how
 * a PASS would be reverted to `returned` within the minute.
 *
 * The hold ENDS the moment the tracker moves, and the move writes its own
 * confirmation row (same state, no verdict, the tracker's new word). Holding
 * silently instead -- treating the catch-up as "no change" -- left the verdict
 * row current with a stale `trackerStatus` forever, so the next real return
 * to that status read as the same lag and was held too: a RETURN worked
 * exactly once per issue. A fact the ledger does not record is a fact it
 * cannot use later.
 *
 * The hold is the whole issue, not only its status: while it lasts, a title,
 * wave, seat or `blocked` change on the tracker writes no row either, and
 * lands on the first row after the status moves (MAR-3138 R2 accepts that
 * price). Accepted -- a ruling is about the lap, and the alternative is a row
 * per edit during the lag.
 */
function verdictHoldsAgainst(
  previous: WorkLedgerRecord,
  issue: TrackerIssue,
): boolean {
  return previous.verdict !== null && previous.trackerStatus === issue.status
}

function sameObservation(
  previous: WorkLedgerRecord,
  next: NewWorkLedgerRecord,
): boolean {
  return (
    previous.state === next.state &&
    previous.seat === next.seat &&
    previous.wave === next.wave &&
    previous.trackerStatus === next.trackerStatus &&
    // A label flip is an observation in its own right (MAR-3138 R2): left
    // out, blocking and unblocking an issue whose status never moved would
    // write no row at all, and the panel would never hear about it.
    previous.blocked === next.blocked &&
    previous.issueIdentifier === next.issueIdentifier &&
    previous.issueTitle === next.issueTitle &&
    previous.issueUrl === next.issueUrl &&
    previous.groundedAt === next.groundedAt
  )
}

/**
 * The rows one complete snapshot adds to the ledger (MAR-3084 R5).
 *
 * Only ever called with a WHOLE list: an issue missing from the snapshot is
 * read as "no longer labeled for a seat", so a partial or refused read must
 * never reach here. An unchanged issue adds nothing.
 */
export function diffTrackerSnapshot(input: {
  crewId: string
  current: readonly WorkLedgerRecord[]
  issues: readonly TrackerIssue[]
  seenAt: string
}): NewWorkLedgerRecord[] {
  const currentByIssue = new Map(
    input.current.map((record) => [record.issueId, record]),
  )
  const seen = new Set<string>()
  const rows: NewWorkLedgerRecord[] = []

  for (const issue of input.issues) {
    seen.add(issue.id)
    const state = workLedgerStateFor(issue.logicalStatus)
    const previous = currentByIssue.get(issue.id)
    // The hold (MAR-3085 R4): the tracker has not moved yet, so it has
    // nothing to say about the lap the mastermind just ruled.
    if (previous && verdictHoldsAgainst(previous, issue)) continue
    if (state === null) {
      // An unmapped status (lap 2, E). The ledger has no word for it, so a
      // current row that still says the issue is in the loop is let go of
      // with the tracker's own word; with no row, or one already let go of,
      // nothing is written. Map the status in the binding to read it as done.
      if (previous && !isTerminal(previous.state)) {
        rows.push({
          ...carriedFrom(previous, input.seenAt),
          trackerStatus: issue.status,
          fact: {
            logicalStatus: issue.logicalStatus,
            branchName: issue.branchName,
            updatedAt: issue.updatedAt,
          },
        })
      }
      continue
    }
    const next: NewWorkLedgerRecord = {
      crewId: input.crewId,
      issueId: issue.id,
      issueIdentifier: issue.identifier,
      issueTitle: issue.title,
      issueUrl: issue.url,
      seat: issue.seat,
      wave: issue.wave,
      lap: nextLap(previous, state),
      state,
      trackerStatus: issue.status,
      groundedAt: issue.groundedAt,
      seenAt: input.seenAt,
      fact: {
        logicalStatus: issue.logicalStatus,
        branchName: issue.branchName,
        updatedAt: issue.updatedAt,
      },
      // The watcher records what the tracker said; a ruling is the
      // mastermind's act and only `appendVerdict` writes one (MAR-3085).
      verdict: null,
      verdictSettleId: null,
      verdictNote: null,
      blocked: issue.blocked,
    }
    if (previous && sameObservation(previous, next)) continue
    rows.push(next)
  }

  for (const previous of input.current) {
    if (seen.has(previous.issueId) || previous.state === 'unassigned') continue
    rows.push(carriedFrom(previous, input.seenAt))
  }
  return rows
}

/** An `unassigned` row carried from the last one; the service mints its id. */
function carriedFrom(
  previous: WorkLedgerRecord,
  seenAt: string,
): NewWorkLedgerRecord {
  return {
    crewId: previous.crewId,
    issueId: previous.issueId,
    issueIdentifier: previous.issueIdentifier,
    issueTitle: previous.issueTitle,
    issueUrl: previous.issueUrl,
    seat: null,
    wave: previous.wave,
    lap: previous.lap,
    state: 'unassigned',
    trackerStatus: previous.trackerStatus,
    groundedAt: previous.groundedAt,
    seenAt,
    fact: { ...previous.fact },
    verdict: null,
    verdictSettleId: null,
    verdictNote: null,
    // The issue left the seat group; nobody said the decision arrived
    // (MAR-3138 R2), so the row keeps the last blocked the tracker reported.
    blocked: previous.blocked,
  }
}

/** Whether a crew's tracker may be asked now (MAR-3084 R7). */
export function isTrackerTickDue(input: {
  health: TrackerHealth | null
  now: Date
}): boolean {
  const until = input.health?.backoffUntil
  if (!until) return true
  const at = Date.parse(until)
  return Number.isNaN(at) || input.now.getTime() >= at
}

/** The crew's tracker health after one read. */
export function trackerHealthAfter(input: {
  previous: TrackerHealth | null
  outcome: { ok: true } | { ok: false; refusal: TrackerRefusal }
  now: Date
}): TrackerHealth {
  const nowIso = input.now.toISOString()
  const lastOkAt = input.previous?.lastOkAt ?? null
  if (input.outcome.ok) {
    return {
      state: 'ok',
      since: input.previous?.state === 'ok' ? input.previous.since : nowIso,
      lastOkAt: nowIso,
      backoffUntil: null,
    }
  }
  const state = input.outcome.refusal.kind
  return {
    state,
    since: input.previous?.state === state ? input.previous.since : nowIso,
    lastOkAt,
    backoffUntil:
      state === 'rate-limited'
        ? (input.outcome.refusal.retryAt ??
          new Date(
            input.now.getTime() + TRACKER_RATE_LIMIT_DEFAULT_BACKOFF_MS,
          ).toISOString())
        : null,
  }
}

/**
 * Whether a health change is worth telling the windows about (lap 2, F):
 * a new state or a new backoff. A quiet successful read is not news.
 */
export function trackerHealthChanged(
  previous: TrackerHealth | null,
  next: TrackerHealth,
): boolean {
  return (
    previous === null ||
    previous.state !== next.state ||
    previous.backoffUntil !== next.backoffUntil
  )
}
