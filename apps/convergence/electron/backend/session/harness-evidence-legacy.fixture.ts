import type Database from 'better-sqlite3'
import type { ParallelWorkCounts } from '../../../src/shared/lib/parallel-work.pure'

// Frozen pre-F5 query: the semantic oracle must not follow the implementation.
const linkedTaskIdSql = `COALESCE(
  (SELECT t.task_id FROM session_tasks t WHERE t.session_id=a.session_id AND t.task_type='local_agent' AND t.task_id=a.id),
  (SELECT t.task_id FROM session_tasks t JOIN session_conversation_items spawn ON spawn.session_id=a.session_id AND spawn.id=a.spawned_by_item_id
   WHERE t.session_id=a.session_id AND t.task_type='local_agent' AND t.tool_use_id=spawn.provider_item_id ORDER BY t.rowid DESC LIMIT 1)
)`

export class LegacyHarnessCounts {
  private singleCounts: Database.Statement | null = null
  constructor(private readonly db: Database.Database) {}
  countParallelWork(sessionIds: string[]): Map<string, ParallelWorkCounts> {
    const counts = new Map<string, ParallelWorkCounts>(
      sessionIds.map((id) => [
        id,
        { running: 0, unknown: 0, failed: 0, stopped: 0 },
      ]),
    )
    if (!sessionIds.length) return counts
    const placeholders = sessionIds.map(() => '?').join(',')
    // CC2-4c reuses this derivation: alive is current; only failed/stopped use the answer window.
    // The latest turn's start, carried as a column rather than re-read in the
    // WHERE, so the answer window can name it twice for the cost of once.
    const latestTurnStart = (alias: string) =>
      `(SELECT started_at FROM session_turns turn WHERE turn.session_id=${alias}.session_id ORDER BY turn.sequence DESC LIMIT 1) AS turn_start`
    // The window boundary is a comparison of TIMES, and it used to be a
    // comparison of the strings carrying them: `'…00.000Z' < '…00Z'` lexically,
    // so a failure stamped at exactly the turn's start was counted or dropped by
    // nothing but which writer wrote it and at which precision (MAR-2902).
    // `julianday()` reads both as the same instant.
    //
    // It answers NULL for a value it cannot parse, and this column is not
    // guaranteed to hold a timestamp -- pre-ISO rows and fixtures carry plain
    // labels -- so the original string comparison stays as the fallback for
    // those. The fallback is not a perfect copy of the old behaviour: SQLite
    // reads a bare numeric string as a Julian day number, so `'10'` against
    // `'9'` now answers 1 where the text comparison answered 0. No writer emits
    // such a value; a label like `start` or `zz-after` parses as nothing and
    // falls through to the text comparison unchanged (MAR-2992).
    const window = `COALESCE(turn_start,window_start)`
    const query = `WITH linked AS (
      SELECT a.*, ${linkedTaskIdSql} AS linked_task_id FROM session_agent_runs a WHERE a.session_id IN (${placeholders})
    ) SELECT session_id, status, COUNT(*) AS count,
      CASE WHEN COUNT(julianday(actual_start)) = COUNT(*) THEN MIN(julianday(actual_start)) END AS oldest_start FROM (
      SELECT a.session_id, CASE WHEN a.status IN ('running','unknown') AND t.status<>'running' THEN t.status ELSE a.status END AS status, a.started_at AS window_start, COALESCE(t.started_at,a.started_at) AS actual_start, ${latestTurnStart('a')}
      FROM linked a LEFT JOIN session_tasks t ON t.session_id=a.session_id AND t.task_id=a.linked_task_id
      UNION ALL
      SELECT t.session_id,t.status,COALESCE(t.started_at,t.observed_at) AS window_start, t.started_at AS actual_start, ${latestTurnStart('t')} FROM session_tasks t WHERE t.session_id IN (${placeholders})
      AND NOT EXISTS (SELECT 1 FROM linked a WHERE a.session_id=t.session_id AND a.linked_task_id=t.task_id)
    ) work WHERE status IN ('running','unknown') OR (status IN ('failed','stopped')
      AND window_start IS NOT NULL
      AND COALESCE(julianday(window_start) >= julianday(${window}), window_start >= ${window}))
      GROUP BY session_id,status`
    const statement =
      sessionIds.length === 1
        ? (this.singleCounts ??= this.db.prepare(query))
        : this.db.prepare(query)
    const rows = statement.all(...sessionIds, ...sessionIds) as {
      session_id: string
      status: 'running' | 'unknown' | 'failed' | 'stopped'
      count: number
      oldest_start: number | null
    }[]
    for (const row of rows) {
      const result = counts.get(row.session_id)!
      result[row.status] = row.count
      if (row.status === 'running' && row.oldest_start !== null) {
        const timestamp = Math.round((row.oldest_start - 2440587.5) * 86400000)
        if (timestamp > 0)
          result.runningStartedAt = new Date(timestamp).toISOString()
      }
    }
    return counts
  }
}
