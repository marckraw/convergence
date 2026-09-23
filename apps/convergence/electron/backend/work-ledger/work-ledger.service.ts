import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import {
  verdictLedgerRecord,
  workLedgerEntryFromJoinedRow,
  workLedgerRecordFromRow,
  type WorkLedgerJoinedRow,
  type WorkLedgerRow,
} from './work-ledger.pure'
import type {
  NewWorkLedgerRecord,
  WorkLedgerEntry,
  WorkLedgerRecord,
  WorkLedgerVerdict,
} from './work-ledger.types'

/**
 * The newest row per `(crew_id, issue_id)`: by `seen_at`, then rowid.
 *
 * A correlated lookup rather than a window function so the plan can walk
 * `idx_work_ledger_crew_issue_seen` backwards for each issue; the test reads
 * `EXPLAIN QUERY PLAN` and asserts it does.
 */
const CURRENT_VIEW_WHERE = `ledger.crew_id = ?
    AND ledger.rowid = (
      SELECT latest.rowid FROM work_ledger AS latest
      WHERE latest.crew_id = ledger.crew_id
        AND latest.issue_id = ledger.issue_id
      ORDER BY latest.seen_at DESC, latest.rowid DESC
      LIMIT 1
    )`

export const WORK_LEDGER_CURRENT_VIEW_SQL = `SELECT ledger.* FROM work_ledger AS ledger
  WHERE ${CURRENT_VIEW_WHERE}`

const CURRENT_VIEW_ORDER = 'ORDER BY ledger.seen_at DESC, ledger.rowid DESC'

/**
 * The work ledger (MAR-3084 R4, R6): append-only facts about what the tracker
 * said, and a read that joins them with what only the app knows.
 *
 * Repository boundary. There is an append and there are reads; the source
 * test asserts no other kind of statement exists in this file.
 */
export class WorkLedgerService {
  constructor(private readonly db: Database.Database) {}

  append(records: readonly NewWorkLedgerRecord[]): void {
    if (records.length === 0) return
    const insert = this.db.prepare(
      `INSERT INTO work_ledger (
        id, crew_id, issue_id, issue_identifier, issue_title, issue_url,
        seat, wave, lap, state, tracker_status, grounded_at, seen_at, fact_json,
        verdict, verdict_settle_id, verdict_note, blocked
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    this.db.transaction(() => {
      for (const record of records) {
        insert.run(
          randomUUID(),
          record.crewId,
          record.issueId,
          record.issueIdentifier,
          record.issueTitle,
          record.issueUrl,
          record.seat,
          record.wave,
          record.lap,
          record.state,
          record.trackerStatus,
          record.groundedAt,
          record.seenAt,
          JSON.stringify(record.fact),
          record.verdict,
          record.verdictSettleId,
          record.verdictNote,
          record.blocked ? 1 : 0,
        )
      }
    })()
  }

  /**
   * Records one ruling against the row it binds to (MAR-3085 R3).
   *
   * Its own door rather than a caller assembling the row, so a verdict row's
   * shape has one definition -- and still an append: a ruling is a new fact
   * about the issue, never an edit of the last one.
   */
  appendVerdict(input: {
    bound: WorkLedgerRecord
    verdict: WorkLedgerVerdict
    lap: number
    settleId: string
    note?: string | null
    seenAt: string
  }): NewWorkLedgerRecord {
    const record = verdictLedgerRecord(input)
    this.append([record])
    return record
  }

  firstDispatchSeenAt(crewId: string): Map<string, string> {
    const rows = this.db
      .prepare(
        `SELECT issue_id, MIN(seen_at) AS first_seen
      FROM work_ledger WHERE crew_id = ? AND json_extract(fact_json, '$.dispatch') = 1
      GROUP BY issue_id`,
      )
      .all(crewId) as { issue_id: string; first_seen: string }[]
    return new Map(rows.map((row) => [row.issue_id, row.first_seen]))
  }

  currentView(crewId: string): WorkLedgerRecord[] {
    const rows = this.db
      .prepare(`${WORK_LEDGER_CURRENT_VIEW_SQL} ${CURRENT_VIEW_ORDER}`)
      .all(crewId) as WorkLedgerRow[]
    return rows.map(workLedgerRecordFromRow)
  }

  /**
   * The current rows with the seat's session, its PR for THIS issue, its
   * host liveness and the app's send of this lap (MAR-3204) -- one SELECT,
   * nothing written (R6).
   *
   * The seat joins a RESIDENT member by baton name; a recipe has no session
   * until something spawns one, so its row carries `sessionId: null`.
   */
  list(crewId: string): WorkLedgerEntry[] {
    const rows = this.db
      .prepare(
        `SELECT ledger.*,
                COALESCE(member.session_id, dispatch.session_id) AS seat_session_id,
                CASE WHEN session.id IS NULL THEN 0 ELSE 1 END AS session_exists,
                session.pull_request_json AS pull_request_json,
                session.execution_host AS execution_host,
                session.execution_host_last_event_at AS execution_host_last_event_at,
                session.attention AS attention,
                sent.sent_at AS sent_at,
                sent.seat AS sent_seat,
                sent.session_id AS sent_session_id,
                sent.delivery AS sent_delivery,
                sent.error AS sent_error
         FROM work_ledger AS ledger
         LEFT JOIN session_crew_members AS member
           ON member.rowid = (
             SELECT candidate.rowid FROM session_crew_members AS candidate
             WHERE candidate.crew_id = ledger.crew_id
               AND candidate.baton_name = ledger.seat
               AND candidate.session_id IS NOT NULL
             ORDER BY candidate.rowid ASC
             LIMIT 1
           )
         LEFT JOIN auto_dispatches AS dispatch ON dispatch.rowid = (
           SELECT candidate.rowid FROM auto_dispatches AS candidate
           WHERE candidate.crew_id = ledger.crew_id
             AND candidate.issue_id = ledger.issue_id
             AND candidate.seat = ledger.seat
           ORDER BY candidate.lap DESC, candidate.sent_at DESC, candidate.rowid DESC
           LIMIT 1
         )
         -- The send of THIS lap (MAR-3204): UNIQUE (crew_id, issue_id, lap)
         -- makes it one row or none, so the join never multiplies a row, and
         -- the window's word costs no statement beyond this one.
         LEFT JOIN auto_dispatches AS sent
           ON sent.crew_id = ledger.crew_id
          AND sent.issue_id = ledger.issue_id
          AND sent.lap = ledger.lap
         LEFT JOIN sessions AS session ON session.id = seat_session_id
         WHERE ${CURRENT_VIEW_WHERE}
         ${CURRENT_VIEW_ORDER}`,
      )
      .all(crewId) as WorkLedgerJoinedRow[]
    return rows.map(workLedgerEntryFromJoinedRow)
  }
}
