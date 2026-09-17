import type Database from 'better-sqlite3'

export const WORK_LEDGER_ISSUE_INDEX = 'idx_work_ledger_crew_issue_seen'

/**
 * The work ledger (MAR-3084 R4): what the app saw on the tracker, append-only.
 *
 * One transaction, prepared statements only, behind the `work_ledger_v1`
 * sentinel. The index is the one `WorkLedgerService.currentView` is measured
 * against: newest row per `(crew_id, issue_id)` by `seen_at`, then rowid --
 * which every index entry carries implicitly.
 */
export function migrateWorkLedger(db: Database.Database): void {
  if (db.prepare("SELECT 1 FROM app_state WHERE key='work_ledger_v1'").get())
    return
  db.transaction(() => {
    db.prepare(
      `CREATE TABLE IF NOT EXISTS work_ledger (
        id TEXT PRIMARY KEY,
        crew_id TEXT NOT NULL,
        issue_id TEXT NOT NULL,
        issue_identifier TEXT NOT NULL,
        issue_title TEXT NOT NULL,
        issue_url TEXT NOT NULL,
        seat TEXT,
        wave TEXT,
        lap INTEGER NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('assigned', 'working', 'returned', 'reviewed', 'done', 'unassigned')),
        tracker_status TEXT NOT NULL,
        grounded_at TEXT,
        seen_at TEXT NOT NULL,
        fact_json TEXT NOT NULL
      )`,
    ).run()
    db.prepare(
      `CREATE INDEX IF NOT EXISTS ${WORK_LEDGER_ISSUE_INDEX}
         ON work_ledger(crew_id, issue_id, seen_at)`,
    ).run()
    db.prepare(
      "INSERT INTO app_state(key,value) VALUES ('work_ledger_v1','1')",
    ).run()
  })()
}
