import Database from 'better-sqlite3'
import { expect, it } from 'vitest'
import {
  CREW_TRACKER_BINDING_COLUMNS,
  migrateCrewTrackerBinding,
} from './crew-tracker-binding-migration.service'
import { migrateWorkLedger } from './work-ledger-migration.service'

it('MAR-3084: adds the binding columns once, keeping existing crews (mutation: omit the sentinel guard)', () => {
  const db = new Database(':memory:')
  try {
    db.exec(
      "CREATE TABLE app_state (key TEXT PRIMARY KEY, value TEXT); CREATE TABLE session_crews (id TEXT PRIMARY KEY, name TEXT); INSERT INTO session_crews VALUES ('old','Existing')",
    )
    migrateCrewTrackerBinding(db)
    migrateCrewTrackerBinding(db)
    expect(db.prepare('SELECT * FROM session_crews').get()).toEqual({
      id: 'old',
      name: 'Existing',
      ...Object.fromEntries(CREW_TRACKER_BINDING_COLUMNS.map((c) => [c, null])),
    })
  } finally {
    db.close()
  }
})

it('MAR-3084: the ledger migration is one transaction -- a refusal leaves no table and no sentinel', () => {
  const db = new Database(':memory:')
  try {
    db.exec('CREATE TABLE app_state (key TEXT PRIMARY KEY, value TEXT)')
    // The sentinel insert is refused, after the table and index were created.
    db.exec(
      "CREATE TRIGGER refuse BEFORE INSERT ON app_state WHEN NEW.key = 'work_ledger_v1' BEGIN SELECT RAISE(ABORT, 'refused'); END",
    )
    expect(() => migrateWorkLedger(db)).toThrow('refused')
    expect(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE name LIKE '%work_ledger%'",
        )
        .all(),
    ).toEqual([])

    db.exec('DROP TRIGGER refuse')
    migrateWorkLedger(db)
    migrateWorkLedger(db)
    expect(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE name LIKE '%work_ledger%' AND name NOT LIKE 'sqlite_autoindex%' ORDER BY name",
        )
        .all(),
    ).toEqual([
      { name: 'idx_work_ledger_crew_issue_seen' },
      { name: 'work_ledger' },
    ])
  } finally {
    db.close()
  }
})
