import { parseSessionPullRequest } from '../pull-request/session-pull-request.pure'
import type { SessionPullRequest } from '../../../src/shared/types/session-pull-request.types'
import type {
  NewWorkLedgerRecord,
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
  member_session_id: string | null
  session_exists: number | null
  pull_request_json: string | null
  execution_host: string | null
  execution_host_last_event_at: string | null
  attention: string | null
}

function readFact(raw: string): WorkLedgerFact {
  try {
    const value = JSON.parse(raw) as Partial<WorkLedgerFact> | null
    return {
      logicalStatus: value?.logicalStatus ?? null,
      branchName: value?.branchName ?? null,
      updatedAt: value?.updatedAt ?? null,
      ledgerLapBefore: value?.ledgerLapBefore ?? null,
      lapDisagreed: value?.lapDisagreed ?? false,
    }
  } catch {
    return { logicalStatus: null, branchName: null, updatedAt: null }
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

export function workLedgerEntryFromJoinedRow(
  row: WorkLedgerJoinedRow,
): WorkLedgerEntry {
  const record = workLedgerRecordFromRow(row)
  // A resident seat whose conversation is gone has no session to join.
  const sessionId =
    row.member_session_id !== null && row.session_exists === 1
      ? row.member_session_id
      : null
  return {
    ...record,
    sessionId,
    pr:
      sessionId === null
        ? null
        : pullRequestForIssue(row.pull_request_json, record.issueIdentifier),
    hostLiveness:
      sessionId === null
        ? null
        : {
            executionHost: row.execution_host ?? 'local',
            lastEventAt: row.execution_host_last_event_at,
            hostReachable: row.attention !== 'host-unreachable',
          },
  }
}
