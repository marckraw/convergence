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

/**
 * The verdict columns and the `stopped` state (MAR-3085).
 *
 * A rebuild rather than an `ALTER`: the `state` CHECK is part of the table
 * definition and SQLite cannot widen one in place. Behind its own sentinel,
 * one transaction of prepared statements, and `DROP TABLE IF EXISTS` on the
 * scratch name first -- the MAR-3083 lap-1 lesson: a rebuild interrupted
 * halfway must not leave a table nobody can migrate past.
 *
 * The index is recreated by the same definition as v1, because
 * `WorkLedgerService.currentView` is measured against it (the P2a
 * `EXPLAIN QUERY PLAN` test).
 */
export function migrateWorkLedgerVerdict(db: Database.Database): void {
  if (db.prepare("SELECT 1 FROM app_state WHERE key='work_ledger_v2'").get())
    return
  db.transaction(() => {
    db.prepare('DROP TABLE IF EXISTS work_ledger_rebuilt').run()
    db.prepare(
      `CREATE TABLE work_ledger_rebuilt (
        id TEXT PRIMARY KEY,
        crew_id TEXT NOT NULL,
        issue_id TEXT NOT NULL,
        issue_identifier TEXT NOT NULL,
        issue_title TEXT NOT NULL,
        issue_url TEXT NOT NULL,
        seat TEXT,
        wave TEXT,
        lap INTEGER NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('assigned', 'working', 'returned', 'reviewed', 'done', 'unassigned', 'stopped')),
        tracker_status TEXT NOT NULL,
        grounded_at TEXT,
        seen_at TEXT NOT NULL,
        fact_json TEXT NOT NULL,
        verdict TEXT NULL CHECK (verdict IN ('pass', 'return', 'stop')),
        verdict_settle_id TEXT NULL,
        verdict_note TEXT NULL
      )`,
    ).run()
    // Every column named, in the order the new table declares them: an
    // `INSERT ... SELECT *` is how a rebuild loses a column's contents.
    db.prepare(
      `INSERT INTO work_ledger_rebuilt (
        id, crew_id, issue_id, issue_identifier, issue_title, issue_url,
        seat, wave, lap, state, tracker_status, grounded_at, seen_at, fact_json
      )
      SELECT id, crew_id, issue_id, issue_identifier, issue_title, issue_url,
        seat, wave, lap, state, tracker_status, grounded_at, seen_at, fact_json
      FROM work_ledger`,
    ).run()
    db.prepare('DROP TABLE work_ledger').run()
    db.prepare('ALTER TABLE work_ledger_rebuilt RENAME TO work_ledger').run()
    db.prepare(
      `CREATE INDEX IF NOT EXISTS ${WORK_LEDGER_ISSUE_INDEX}
         ON work_ledger(crew_id, issue_id, seen_at)`,
    ).run()
    db.prepare(
      "INSERT INTO app_state(key,value) VALUES ('work_ledger_v2','1')",
    ).run()
  })()
}
