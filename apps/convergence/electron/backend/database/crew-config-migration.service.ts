import type Database from 'better-sqlite3'

export function migrateCrewConfig(db: Database.Database): void {
  if (db.prepare("SELECT 1 FROM app_state WHERE key='crew_config_v1'").get())
    return
  db.transaction(() => {
    db.exec('ALTER TABLE session_crews ADD COLUMN config_path TEXT')
    db.exec('ALTER TABLE session_crews ADD COLUMN config_sha256 TEXT')
    db.exec('ALTER TABLE session_crews ADD COLUMN config_applied_at TEXT')
    db.prepare(
      "INSERT INTO app_state(key,value) VALUES ('crew_config_v1','1')",
    ).run()
  })()
}
