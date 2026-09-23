import type Database from 'better-sqlite3'

export function migrateReleaseActs(db: Database.Database): void {
  if (db.prepare("SELECT 1 FROM app_state WHERE key='release_acts_v1'").get())
    return
  db.transaction(() => {
    db.prepare(
      `CREATE TABLE release_acts (
      id TEXT PRIMARY KEY, crew_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('merge')),
      issue_id TEXT NOT NULL, pr_number INTEGER NOT NULL, head_sha TEXT NOT NULL,
      requested_at TEXT NOT NULL, started_at TEXT, completed_at TEXT,
      outcome TEXT NOT NULL CHECK (outcome IN ('pending','running','merged','skipped','failed')),
      error TEXT
    )`,
    ).run()
    db.prepare(
      'CREATE INDEX idx_release_acts_crew ON release_acts(crew_id)',
    ).run()
    db.prepare(
      "INSERT INTO app_state(key,value) VALUES ('release_acts_v1','1')",
    ).run()
  })()
}
