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

function sameObservation(
  previous: WorkLedgerRecord,
  next: NewWorkLedgerRecord,
): boolean {
  return (
    previous.state === next.state &&
    previous.seat === next.seat &&
    previous.wave === next.wave &&
    previous.trackerStatus === next.trackerStatus &&
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
    if (state === null) continue
    const previous = currentByIssue.get(issue.id)
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
    }
    if (previous && sameObservation(previous, next)) continue
    rows.push(next)
  }

  for (const previous of input.current) {
    if (seen.has(previous.issueId) || previous.state === 'unassigned') continue
    // A new row, carried from the last one; its `id` is the service's to mint.
    rows.push({
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
      seenAt: input.seenAt,
      fact: { ...previous.fact },
    })
  }
  return rows
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
      state === 'rate-limited' ? input.outcome.refusal.retryAt : null,
  }
}
