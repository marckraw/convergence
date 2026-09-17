import { parseSessionPullRequest } from '../pull-request/session-pull-request.pure'
import type { SessionPullRequest } from '../../../src/shared/types/session-pull-request.types'
import type {
  WorkLedgerEntry,
  WorkLedgerFact,
  WorkLedgerRecord,
  WorkLedgerState,
} from './work-ledger.types'

export const WORK_LEDGER_STATES: readonly WorkLedgerState[] = [
  'assigned',
  'working',
  'returned',
  'reviewed',
  'done',
  'unassigned',
]

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
    }
  } catch {
    return { logicalStatus: null, branchName: null, updatedAt: null }
  }
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
  return pr.headBranch.toLowerCase().includes(issueIdentifier.toLowerCase())
    ? pr
    : null
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
