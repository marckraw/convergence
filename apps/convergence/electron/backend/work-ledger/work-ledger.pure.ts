import { parseSessionPullRequest } from '../pull-request/session-pull-request.pure'
import type { SessionPullRequest } from '../../../src/shared/types/session-pull-request.types'
import type {
  NewWorkLedgerRecord,
  TrackerIssuePullRequest,
  TrackerPullRequest,
  WorkLedgerDispatch,
  WorkLedgerEntry,
  WorkLedgerFact,
  WorkLedgerRecord,
  WorkLedgerState,
  WorkLedgerVerdict,
} from './work-ledger.types'

export const WORK_LEDGER_STATES: readonly WorkLedgerState[] = [
  'assigned',
  'working',
  'returned',
  'reviewed',
  'done',
  'unassigned',
  'stopped',
]

/** How much of a mastermind's reply a STOP row carries (MAR-3085 R3). */
export const VERDICT_NOTE_MAX_LENGTH = 4_000

/** What each ruling means for the row that records it (MAR-3085 R3). */
const VERDICT_STATES: Record<WorkLedgerVerdict, WorkLedgerState> = {
  return: 'working',
  pass: 'reviewed',
  stop: 'stopped',
}

/**
 * The row a ruling writes (MAR-3085 R3), carried from the returned row it
 * binds to: same issue, same seat, same wave, and the tracker status it still
 * reports -- the mastermind moves the tracker by hand, and until it does the
 * row says what the tracker last said.
 *
 * The lap is the mastermind's count, never the ledger's: when the two
 * disagree the row takes N and says so in `fact.lapDisagreed`, because the
 * ruling is the act and the ledger is its record.
 */
export function verdictLedgerRecord(input: {
  bound: WorkLedgerRecord
  verdict: WorkLedgerVerdict
  lap: number
  settleId: string
  note?: string | null
  seenAt: string
}): NewWorkLedgerRecord {
  const { bound } = input
  return {
    crewId: bound.crewId,
    issueId: bound.issueId,
    issueIdentifier: bound.issueIdentifier,
    issueTitle: bound.issueTitle,
    issueUrl: bound.issueUrl,
    seat: bound.seat,
    wave: bound.wave,
    lap: input.lap,
    state: VERDICT_STATES[input.verdict],
    trackerStatus: bound.trackerStatus,
    groundedAt: bound.groundedAt,
    seenAt: input.seenAt,
    fact: {
      ...bound.fact,
      ledgerLapBefore: bound.lap,
      lapDisagreed: input.lap !== bound.lap + 1,
    },
    verdict: input.verdict,
    verdictSettleId: input.settleId,
    // A ruling says nothing about the label (MAR-3138 R2): the row keeps the
    // blocked the tracker last reported, so a verdict cannot silently unblock
    // an issue that is still waiting on a decision.
    blocked: bound.blocked,
    verdictNote:
      input.verdict === 'stop' && input.note
        ? input.note.slice(0, VERDICT_NOTE_MAX_LENGTH)
        : null,
  }
}

/** A `work_ledger` row as SQLite returns it. */
export interface WorkLedgerRow {
  id: string
  crew_id: string
  issue_id: string
  issue_identifier: string
  issue_title: string
  issue_url: string
  seat: string | null
  wave: string | null
  lap: number
  state: string
  tracker_status: string
  grounded_at: string | null
  seen_at: string
  fact_json: string
  /** Null on every row the tracker watcher wrote (MAR-3085). */
  verdict: string | null
  verdict_settle_id: string | null
  verdict_note: string | null
  /** SQLite's 0/1 for the `blocked` label (MAR-3138). */
  blocked: number
}

/** The row plus the facts joined in the same SELECT. */
export interface WorkLedgerJoinedRow extends WorkLedgerRow {
  seat_session_id: string | null
  session_exists: number | null
  pull_request_json: string | null
  execution_host: string | null
  execution_host_last_event_at: string | null
  attention: string | null
  /**
   * The `auto_dispatches` row for this `(issue, lap)` (MAR-3204), joined in
   * the same SELECT; every column null when the app never sent this lap.
   */
  sent_at: string | null
  sent_seat: string | null
  sent_session_id: string | null
  sent_delivery: string | null
  sent_error: string | null
}

/**
 * What a fact reads as when the stored JSON does not say (MAR-3190 lap 2, G).
 *
 * ONE object for both paths below, because the two used to disagree: a
 * malformed `fact_json` fell back to three keys and no `labels`, so the
 * unreadable case handed its readers a shape the readable case never
 * produced. `summary` is absent from BOTH on purpose -- its key's presence is
 * how the watcher knows a body has been read for this row (R4).
 */
const FACT_DEFAULTS: WorkLedgerFact = {
  logicalStatus: null,
  branchName: null,
  updatedAt: null,
  ledgerLapBefore: null,
  lapDisagreed: false,
  groomMe: false,
  groomed: false,
  grounded: false,
  dispatch: false,
  priority: null,
  labels: [],
  pullRequests: [],
}

function readFact(raw: string): WorkLedgerFact {
  try {
    const value = JSON.parse(raw) as Partial<WorkLedgerFact> | null
    return {
      ...FACT_DEFAULTS,
      ...(value?.merged ? { merged: value.merged } : {}),
      logicalStatus: value?.logicalStatus ?? FACT_DEFAULTS.logicalStatus,
      branchName: value?.branchName ?? FACT_DEFAULTS.branchName,
      updatedAt: value?.updatedAt ?? FACT_DEFAULTS.updatedAt,
      ledgerLapBefore: value?.ledgerLapBefore ?? FACT_DEFAULTS.ledgerLapBefore,
      lapDisagreed: value?.lapDisagreed ?? FACT_DEFAULTS.lapDisagreed,
      groomMe: value?.groomMe ?? FACT_DEFAULTS.groomMe,
      groomed: value?.groomed ?? FACT_DEFAULTS.groomed,
      grounded: value?.grounded ?? FACT_DEFAULTS.grounded,
      dispatch: value?.dispatch ?? FACT_DEFAULTS.dispatch,
      priority: value?.priority ?? FACT_DEFAULTS.priority,
      labels: value?.labels ?? FACT_DEFAULTS.labels,
      // A row written before MAR-3304 has no key at all; absent is read as
      // "the tracker links none", so no reader downstream meets `undefined`.
      pullRequests: value?.pullRequests ?? FACT_DEFAULTS.pullRequests,
      ...(value && 'summary' in value
        ? { summary: value.summary ?? null }
        : {}),
    }
  } catch {
    return { ...FACT_DEFAULTS }
  }
}

/** A stored verdict word, or null for anything this build cannot read. */
function readVerdict(value: string | null): WorkLedgerVerdict | null {
  return value === 'pass' || value === 'return' || value === 'stop'
    ? value
    : null
}

export function workLedgerRecordFromRow(row: WorkLedgerRow): WorkLedgerRecord {
  return {
    id: row.id,
    crewId: row.crew_id,
    issueId: row.issue_id,
    issueIdentifier: row.issue_identifier,
    issueTitle: row.issue_title,
    issueUrl: row.issue_url,
    seat: row.seat,
    wave: row.wave,
    lap: row.lap,
    state: (WORK_LEDGER_STATES as readonly string[]).includes(row.state)
      ? (row.state as WorkLedgerState)
      : 'unassigned',
    trackerStatus: row.tracker_status,
    groundedAt: row.grounded_at,
    seenAt: row.seen_at,
    fact: readFact(row.fact_json),
    // A word this build does not know reads as no verdict rather than
    // throwing: the column is written by a newer build's vocabulary too.
    verdict: readVerdict(row.verdict),
    verdictSettleId: row.verdict_settle_id,
    verdictNote: row.verdict_note,
    // A row written before the v3 column existed reads as not blocked, the
    // same as the column's default.
    blocked: row.blocked === 1,
  }
}

/**
 * A session's PR belongs to an issue only when its head branch names the
 * issue (MAR-3084 R6). A seat holds many issues over time; its PR is one of
 * them, never all of them.
 */
export function pullRequestForIssue(
  pullRequestJson: string | null,
  issueIdentifier: string,
): SessionPullRequest | null {
  const pr = parseSessionPullRequest(pullRequestJson)
  if (!pr || !issueIdentifier) return null
  return branchNamesIssue(pr.headBranch, issueIdentifier) ? pr : null
}

/**
 * The branch names the issue as a token (lap 2, B): case-insensitive, not
 * preceded by a letter or digit, not followed by a digit. `MAR-300` is not in
 * `agent/mar-3008-tray-key`; `MAR-3008` is.
 */
export function branchNamesIssue(branch: string, identifier: string): boolean {
  const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?<![A-Za-z0-9])${escaped}(?![0-9])`, 'i').test(branch)
}

/**
 * The pull request an issue HAS, best reading first (MAR-3304 R3, lap 2 A/B).
 *
 * Two witnesses to one fact, and one of them has actually read it. The
 * seat's conversation carries a PR with a state, a review word and a time it
 * was read; the tracker carries a link with no state at all. Which issue a
 * conversation's reading belongs to is settled BEFORE this function, by the
 * head-branch rule in `pullRequestForIssue` (MAR-3084 R6) -- that is the
 * whole "the horse moved on" case, and by the time a session arrives here it
 * has survived it.
 *
 * So a reading that got this far WINS, always. Pairing it against the
 * tracker's numbers as well (lap 1) looked like extra care and was not: a
 * seat still on this issue opening a SECOND pull request -- a re-attempt,
 * with the tracker still linking only the first -- would have had its live
 * reading overridden by a stale, closed link rendered "state not read", a
 * worse answer about a PR somebody HAS read.
 *
 * The tracker's link is the fallback for the only case left: no reading at
 * all. With several links the LAST one wins -- Linear orders attachments by
 * `createdAt`, so the last is the newest, and a re-opened or superseded PR
 * must not shadow the current one for ever.
 *
 * The union is tagged rather than flattened on purpose: a caller must decide
 * what to do with a link whose state nobody read, and it cannot accidentally
 * print one.
 */
export function resolveEntryPullRequest(input: {
  session: SessionPullRequest | null
  /**
   * Absent on every fact written before MAR-3304, and normalized HERE, once:
   * every caller reads the same optional key off a stored fact, so a default
   * per caller is a default one of them will forget.
   */
  linked: readonly TrackerIssuePullRequest[] | undefined
}): SessionPullRequest | TrackerPullRequest | null {
  const { session } = input
  if (session) return session
  const linked = input.linked ?? []
  const newest = linked[linked.length - 1]
  if (!newest) return null
  return {
    source: 'tracker',
    number: newest.number,
    url: newest.url,
    title: newest.title,
  }
}

export function workLedgerEntryFromJoinedRow(
  row: WorkLedgerJoinedRow,
): WorkLedgerEntry {
  const record = workLedgerRecordFromRow(row)
  // A resident seat whose conversation is gone has no session to join.
  const sessionId =
    row.seat_session_id !== null && row.session_exists === 1
      ? row.seat_session_id
      : null
  return {
    ...record,
    sessionId,
    pr: resolveEntryPullRequest({
      session:
        sessionId === null
          ? null
          : pullRequestForIssue(row.pull_request_json, record.issueIdentifier),
      linked: record.fact.pullRequests,
    }),
    hostLiveness:
      sessionId === null
        ? null
        : {
            executionHost: row.execution_host ?? 'local',
            lastEventAt: row.execution_host_last_event_at,
            hostReachable: row.attention !== 'host-unreachable',
          },
    dispatch: workLedgerDispatchFromJoinedRow(row),
  }
}

/**
 * The app's record of sending this lap (MAR-3204 R1), or null.
 *
 * `sent_at` is NOT NULL in the table, so a null here can only mean the LEFT
 * JOIN found no row -- the one case that is "never sent".
 */
export function workLedgerDispatchFromJoinedRow(
  row: Pick<
    WorkLedgerJoinedRow,
    'sent_at' | 'sent_seat' | 'sent_session_id' | 'sent_delivery' | 'sent_error'
  >,
): WorkLedgerDispatch | null {
  if (row.sent_at === null) return null
  return {
    sentAt: row.sent_at,
    seat: row.sent_seat ?? '',
    sessionId: row.sent_session_id ?? '',
    delivery: row.sent_delivery === 'queued' ? 'queued' : 'turn',
    error: row.sent_error,
  }
}
