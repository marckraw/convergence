import type Database from 'better-sqlite3'

export function migrateTaskObserved(db: Database.Database): void {
  if (
    db.prepare("SELECT 1 FROM app_state WHERE key='cc2_task_observed_v1'").get()
  )
    return
  db.transaction(() => {
    db.exec('ALTER TABLE session_tasks ADD COLUMN observed_at TEXT')
    db.exec(
      'UPDATE session_tasks SET observed_at=COALESCE(started_at,ended_at)',
    )
    db.prepare(
      "INSERT INTO app_state(key,value) VALUES ('cc2_task_observed_v1','1')",
    ).run()
  })()
}
