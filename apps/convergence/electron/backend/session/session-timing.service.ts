import type Database from 'better-sqlite3'
import type { SessionTurnTiming } from '../../../src/shared/types/session-timing.types'

/** Reads only the latest lifecycle row per requested session, without transcripts. */
export function readSessionTurnTimings(
  db: Database.Database,
  sessionIds: string[],
): Map<string, SessionTurnTiming> {
  if (!sessionIds.length) return new Map()
  const rows = db
    .prepare(
      `SELECT session_id, id, started_at, ended_at, status FROM (
    SELECT session_id, id, started_at, ended_at, status,
      ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY sequence DESC) AS rank
    FROM session_turns WHERE session_id IN (${sessionIds.map(() => '?').join(',')})
  ) WHERE rank = 1`,
    )
    .all(...sessionIds) as {
    session_id: string
    id: string
    started_at: string
    ended_at: string | null
    status: SessionTurnTiming['status']
  }[]
  return new Map(
    rows.map((row) => [
      row.session_id,
      {
        turnId: row.id,
        startedAt: row.started_at,
        // Older restart recovery wrote SQLite's current time, not an observed end.
        endedAt: row.ended_at?.includes('T') ? row.ended_at : null,
        status: row.status,
      },
    ]),
  )
}
