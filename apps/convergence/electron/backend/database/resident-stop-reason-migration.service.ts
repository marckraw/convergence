import type Database from 'better-sqlite3'

export function migrateResidentStopReason(db: Database.Database): void {
  if (
    db
      .prepare(
        "SELECT 1 FROM app_state WHERE key='cc2_resident_stop_reason_v1'",
      )
      .get()
  )
    return
  db.transaction(() => {
    db.exec('ALTER TABLE session_agent_runs ADD COLUMN stop_reason TEXT')
    db.exec('ALTER TABLE session_tasks ADD COLUMN stop_reason TEXT')
    db.prepare(
      "INSERT INTO app_state(key,value) VALUES ('cc2_resident_stop_reason_v1','1')",
    ).run()
  })()
}
