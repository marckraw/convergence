import type Database from 'better-sqlite3'

export function migrateEndedSummary(db: Database.Database): void {
  if (
    db.prepare("SELECT 1 FROM app_state WHERE key='cc2_ended_summary_v1'").get()
  )
    return
  db.transaction(() => {
    db.exec('ALTER TABLE session_agent_runs ADD COLUMN ended_summary TEXT')
    db.exec('ALTER TABLE session_tasks ADD COLUMN ended_summary TEXT')
    db.prepare(
      "INSERT INTO app_state(key,value) VALUES ('cc2_ended_summary_v1','1')",
    ).run()
  })()
}
