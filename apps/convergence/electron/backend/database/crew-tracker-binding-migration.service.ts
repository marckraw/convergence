import type Database from 'better-sqlite3'

/**
 * A crew's tracker binding (MAR-3084 R3): five nullable columns, nothing
 * secret. The API key is a Keychain fact under `convergence.tracker` / crew
 * id and has no column here -- `database.test.ts` pins the set.
 */
export const CREW_TRACKER_BINDING_COLUMNS = [
  'tracker_kind',
  'tracker_project_id',
  'tracker_label_prefix',
  'tracker_wave_prefix',
  'tracker_status_map_json',
] as const

export function migrateCrewTrackerBinding(db: Database.Database): void {
  if (
    db
      .prepare("SELECT 1 FROM app_state WHERE key='crew_tracker_binding_v1'")
      .get()
  )
    return
  db.transaction(() => {
    for (const column of CREW_TRACKER_BINDING_COLUMNS) {
      db.prepare(`ALTER TABLE session_crews ADD COLUMN ${column} TEXT`).run()
    }
    db.prepare(
      "INSERT INTO app_state(key,value) VALUES ('crew_tracker_binding_v1','1')",
    ).run()
  })()
}

/** The crew's opt-in, independent of the already-applied binding migration. */
export function migrateCrewAutoDispatch(db: Database.Database): void {
  if (
    db
      .prepare("SELECT 1 FROM app_state WHERE key='crew_auto_dispatch_v1'")
      .get()
  )
    return
  db.transaction(() => {
    db.prepare(
      'ALTER TABLE session_crews ADD COLUMN tracker_auto_dispatch INTEGER NOT NULL DEFAULT 0',
    ).run()
    db.prepare(
      "INSERT INTO app_state(key,value) VALUES ('crew_auto_dispatch_v1','1')",
    ).run()
  })()
}
