import type Database from 'better-sqlite3'

/** A durable claim precedes delivery; uniqueness arbitrates concurrent processes. */
export function migrateAutoDispatches(db: Database.Database): void {
  if (
    db.prepare("SELECT 1 FROM app_state WHERE key='auto_dispatches_v1'").get()
  )
    return
  db.transaction(() => {
    db.prepare(
      `CREATE TABLE auto_dispatches (
      id TEXT PRIMARY KEY,
      crew_id TEXT NOT NULL,
      issue_id TEXT NOT NULL,
      lap INTEGER NOT NULL,
      seat TEXT NOT NULL,
      session_id TEXT NOT NULL,
      wire_id TEXT NOT NULL,
      sent_at TEXT NOT NULL,
      delivery TEXT NOT NULL CHECK (delivery IN ('turn', 'queued')),
      receipt TEXT,
      error TEXT,
      UNIQUE (crew_id, issue_id, lap)
    )`,
    ).run()
    db.prepare(
      "INSERT INTO app_state(key,value) VALUES ('auto_dispatches_v1','1')",
    ).run()
  })()
}
