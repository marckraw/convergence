import type {
  TrackerIssue,
  TrackerIssuePullRequest,
  TrackerLogicalStatus,
  TrackerRefusal,
} from './tracker.types'
import type {
  NewWorkLedgerRecord,
  TrackerHealth,
  WorkLedgerFact,
  WorkLedgerRecord,
  WorkLedgerState,
} from '../work-ledger/work-ledger.types'

/**
 * The four speeds and the floor the tracker is read at (MAR-3227 R1).
 *
 * The slow part of Loom catching up was never the renderer fetching from the
 * main process (that is a push) -- it was this process deciding when to ask
 * the tracker. So the speed follows what probably just changed the tracker
 * and whether a person is looking, and nothing asks faster than the floor.
 *
 * Worst case per bound crew, one list read per tick: a burst 240/h (and only
 * while one is open), focused 60/h, background 12/h.
 */
export const TRACKER_TICK_FLOOR_MS = 10_000
/** While a burst is open: a horse was just dispatched to, or just returned. */
export const TRACKER_BURST_INTERVAL_MS = 15_000
/** How long one piece of crew activity keeps the burst open. */
export const TRACKER_BURST_WINDOW_MS = 3 * 60_000
/** A window is focused and nothing happened: the old flat beat, unchanged. */
export const TRACKER_WATCH_INTERVAL_MS = 60_000
/** No window is focused and no burst is open: nobody is looking. */
export const TRACKER_BACKGROUND_INTERVAL_MS = 5 * 60_000

/**
 * How long until the next read of the tracker (MAR-3227 R1).
 *
 * The cadence is counted from the START of the last read rather than from
 * `now`, so rescheduling on a focus change or a new burst never pushes a due
 * read further away than its speed says. `kicked` is a read somebody asked
 * for (activity, focus, Refresh, or a kick that arrived mid-read): it wants
 * one now, and the floor is the only thing that can make it wait.
 */
export function nextTrackerTickDelay(input: {
  now: number
  lastTickAt: number | null
  burstUntil: number | null
  windowFocused: boolean
  kicked: boolean
}): number {
  // Never read: nothing to count from, and nothing for the floor to protect.
  if (input.lastTickAt === null) return 0
  const since = input.now - input.lastTickAt
  const interval = input.kicked
    ? 0
    : input.burstUntil !== null && input.now < input.burstUntil
      ? TRACKER_BURST_INTERVAL_MS
      : input.windowFocused
        ? TRACKER_WATCH_INTERVAL_MS
        : TRACKER_BACKGROUND_INTERVAL_MS
  return Math.max(interval - since, TRACKER_TICK_FLOOR_MS - since, 0)
}

/**
 * The outside read's own slow beat (MAR-3236 R4): the project's issues that
 * are not in the loop change on a person's time, not a horse's, so they are
 * read at most every ten minutes -- or when a person presses Refresh.
 *
 * Worst case per bound crew: 6 outside reads an hour × at most
 * `LINEAR_OUTSIDE_MAX_PAGES` (3) pages = 18 requests an hour, on top of the
 * labeled read's numbers above.
 */
export const TRACKER_OUTSIDE_INTERVAL_MS = 10 * 60_000

/**
 * Whether this tick should also read a crew's outside issues (R4).
 *
 * Due when never read, when the slow beat has passed since the last read, or
 * when a person's Refresh asked for it (`kicked`). A burst or a focus kick
 * is not a reason: those are about the loop moving, and nothing outside the
 * loop moved because a horse came back.
 */
export function isOutsideReadDue(input: {
  now: number
  lastOutsideReadAt: number | null
  kicked: boolean
}): boolean {
  if (input.kicked) return true
  if (input.lastOutsideReadAt === null) return true
  return input.now - input.lastOutsideReadAt >= TRACKER_OUTSIDE_INTERVAL_MS
}

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

/** Two label lists holding the same names in the same order. */
function sameLabels(
  previous: readonly string[] | undefined,
  next: readonly string[] | undefined,
): boolean {
  const a = previous ?? []
  const b = next ?? []
  return a.length === b.length && a.every((name, at) => name === b[at])
}

/** The same links in a stable order of our own: by number, then by URL. */
function sortedPullRequests(
  links: readonly TrackerIssuePullRequest[] | undefined,
): TrackerIssuePullRequest[] {
  return [...(links ?? [])].sort(
    (a, b) =>
      a.number - b.number || (a.url < b.url ? -1 : a.url > b.url ? 1 : 0),
  )
}

/**
 * Two link lists holding the same pull requests, in any order (MAR-3304,
 * lap 2 C).
 *
 * Sorted before comparing, like `sameLabels` and for the same reason: the
 * order is the server's, and an order that wobbled while nothing about the
 * issue moved would append a ledger row per multi-link issue per tick. The
 * set is the fact; the order Linear gives is only how the newest link is
 * picked downstream (`resolveEntryPullRequest`).
 */
function samePullRequests(
  previous: readonly TrackerIssuePullRequest[] | undefined,
  next: readonly TrackerIssuePullRequest[] | undefined,
): boolean {
  const a = sortedPullRequests(previous)
  const b = sortedPullRequests(next)
  return (
    a.length === b.length &&
    a.every(
      (link, at) =>
        link.number === b[at].number &&
        link.url === b[at].url &&
        link.title === b[at].title,
    )
  )
}

/**
 * Whether the tick saw exactly what the ledger already holds.
 *
 * EVERY fact a reader can see is compared here (MAR-3190 R7). A fact left off
 * this list is a fact that can change on the tracker and never reach the
 * screen: the row is not rewritten, so nothing is broadcast, so the panel
 * goes on showing the old value until something else about the issue happens
 * to move. `blocked` taught us that (MAR-3138 R2); the label facts, the
 * priority, the label list and the summary are the same shape of promise.
 */
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
    previous.groundedAt === next.groundedAt &&
    previous.fact.groomMe === next.fact.groomMe &&
    previous.fact.groomed === next.fact.groomed &&
    previous.fact.grounded === next.fact.grounded &&
    previous.fact.dispatch === next.fact.dispatch &&
    (previous.fact.priority ?? null) === (next.fact.priority ?? null) &&
    sameLabels(previous.fact.labels, next.fact.labels) &&
    // A PR linked on the tracker is a fact a reader SEES (MAR-3304 R2) -- and
    // it is the one that moves last, long after the status stopped changing.
    // Left off this list, the very issue this slice exists for (a Done row
    // whose PR arrives after the last status move) would never be rewritten.
    samePullRequests(previous.fact.pullRequests, next.fact.pullRequests) &&
    (previous.fact.summary ?? null) === (next.fact.summary ?? null)
  )
}

/**
 * What the tick saw, as the row carries it (MAR-3190).
 *
 * `summary` is always written, even as null: its KEY is how a later tick
 * knows a body has been read for this issue at all (R4), so writing the fact
 * without it would make every row look like a row from before this slice and
 * ask for every body on every tick.
 */
function factFrom(issue: TrackerIssue): WorkLedgerFact {
  return {
    logicalStatus: issue.logicalStatus,
    branchName: issue.branchName,
    updatedAt: issue.updatedAt,
    groomMe: issue.groomMe,
    groomed: issue.groomed,
    grounded: issue.grounded,
    dispatch: issue.dispatch,
    priority: issue.priority,
    labels: issue.labels,
    pullRequests: issue.pullRequests,
    summary: issue.summary,
  }
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
          fact: factFrom(issue),
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
      fact: factFrom(issue),
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
    if (seen.has(previous.issueId)) continue
    // Absence is not an event for work the loop has let go of (MAR-3190 R8).
    // The page now ages a Done issue out after fourteen days, so every
    // finished issue eventually stops being in it -- and read as "left the
    // loop" that would turn a row a person has already accepted into an
    // `unassigned` one, months after anybody looked at it. `unassigned` was
    // always skipped here; `done` joins it for the same reason.
    if (isTerminal(previous.state)) continue
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
    // The issue left the loop -- no Loom label at all now, or it left the
    // project (MAR-3190 R1 widened what "left" means). Nobody said the
    // decision arrived (MAR-3138 R2), so the row keeps the last blocked the
    // tracker reported.
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
