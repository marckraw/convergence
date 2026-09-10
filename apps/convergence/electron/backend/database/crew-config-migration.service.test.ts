import Database from 'better-sqlite3'
import { expect, it } from 'vitest'
import { migrateCrewConfig } from './crew-config-migration.service'

it('adds nullable provenance once without changing existing crews (mutation: omit the migration guard)', () => {
  const db = new Database(':memory:')
  try {
    db.exec(
      "CREATE TABLE app_state (key TEXT PRIMARY KEY, value TEXT); CREATE TABLE session_crews (id TEXT PRIMARY KEY, name TEXT); INSERT INTO session_crews VALUES ('old','Existing')",
    )
    migrateCrewConfig(db)
    db.prepare(
      "UPDATE session_crews SET config_path='/crew.yaml',config_sha256='hash',config_applied_at='time' WHERE id='old'",
    ).run()
    migrateCrewConfig(db)
    expect({
      crew: db.prepare('SELECT * FROM session_crews').get(),
      marker: db
        .prepare("SELECT value FROM app_state WHERE key='crew_config_v1'")
        .get(),
    }).toEqual({
      crew: {
        id: 'old',
        name: 'Existing',
        config_path: '/crew.yaml',
        config_sha256: 'hash',
        config_applied_at: 'time',
      },
      marker: { value: '1' },
    })
  } finally {
    db.close()
  }
})
