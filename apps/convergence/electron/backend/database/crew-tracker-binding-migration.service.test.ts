import Database from 'better-sqlite3'
import { expect, it } from 'vitest'
import {
  CREW_TRACKER_BINDING_COLUMNS,
  migrateCrewTrackerBinding,
} from './crew-tracker-binding-migration.service'
import {
  migrateWorkLedger,
  migrateWorkLedgerBlocked,
  migrateWorkLedgerVerdict,
  WORK_LEDGER_ISSUE_INDEX,
} from './work-ledger-migration.service'

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

it('MAR-3085: the v2 rebuild widens the state, keeps every row, and keeps the index', () => {
  const db = new Database(':memory:')
  try {
    db.exec('CREATE TABLE app_state (key TEXT PRIMARY KEY, value TEXT)')
    migrateWorkLedger(db)
    db.prepare(
      `INSERT INTO work_ledger (id, crew_id, issue_id, issue_identifier,
        issue_title, issue_url, seat, wave, lap, state, tracker_status,
        grounded_at, seen_at, fact_json)
       VALUES ('row-1','crew-1','issue-1','EX-1','t','u','opus',NULL,1,
        'returned','In Review',NULL,'2026-09-18T08:00:00.000Z','{}')`,
    ).run()

    migrateWorkLedgerVerdict(db)
    migrateWorkLedgerVerdict(db)

    // The row survived the rebuild, with the new columns null.
    expect(db.prepare('SELECT * FROM work_ledger').all()).toEqual([
      {
        id: 'row-1',
        crew_id: 'crew-1',
        issue_id: 'issue-1',
        issue_identifier: 'EX-1',
        issue_title: 't',
        issue_url: 'u',
        seat: 'opus',
        wave: null,
        lap: 1,
        state: 'returned',
        tracker_status: 'In Review',
        grounded_at: null,
        seen_at: '2026-09-18T08:00:00.000Z',
        fact_json: '{}',
        verdict: null,
        verdict_settle_id: null,
        verdict_note: null,
      },
    ])
    // `stopped` is storable now, and a word outside the vocabulary is not.
    const insertState = (state: string) =>
      db
        .prepare(
          `INSERT INTO work_ledger (id, crew_id, issue_id, issue_identifier,
            issue_title, issue_url, seat, wave, lap, state, tracker_status,
            grounded_at, seen_at, fact_json, verdict, verdict_settle_id,
            verdict_note)
           VALUES (?, 'crew-1','issue-1','EX-1','t','u','opus',NULL,2, ?,
            'In Review',NULL,'2026-09-18T08:01:00.000Z','{}','stop','s-1','note')`,
        )
        .run(`row-${state}`, state)
    expect(() => insertState('stopped')).not.toThrow()
    expect(() => insertState('teleported')).toThrow()
    // Mutation: drop the index recreation -> red (and the P2a plan test too).
    expect(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND name = ?",
        )
        .all(WORK_LEDGER_ISSUE_INDEX),
    ).toEqual([{ name: WORK_LEDGER_ISSUE_INDEX }])
    // The scratch table is gone, and nothing is left for a second run to trip on.
    expect(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE name = 'work_ledger_rebuilt'",
        )
        .all(),
    ).toEqual([])
  } finally {
    db.close()
  }
})

it('MAR-3085: a refused rebuild leaves the v1 table and no sentinel', () => {
  const db = new Database(':memory:')
  try {
    db.exec('CREATE TABLE app_state (key TEXT PRIMARY KEY, value TEXT)')
    migrateWorkLedger(db)
    db.exec(
      "CREATE TRIGGER refuse BEFORE INSERT ON app_state WHEN NEW.key = 'work_ledger_v2' BEGIN SELECT RAISE(ABORT, 'refused'); END",
    )

    expect(() => migrateWorkLedgerVerdict(db)).toThrow('refused')

    // One transaction: the table is still v1 and the next boot may retry.
    const columns = (
      db.prepare("PRAGMA table_info('work_ledger')").all() as {
        name: string
      }[]
    ).map((column) => column.name)
    expect(columns).not.toContain('verdict')
    expect(
      db.prepare("SELECT 1 FROM app_state WHERE key='work_ledger_v2'").all(),
    ).toEqual([])
    db.exec('DROP TRIGGER refuse')
    expect(() => migrateWorkLedgerVerdict(db)).not.toThrow()
  } finally {
    db.close()
  }
})

/** The columns of `work_ledger`, in declaration order. */
function ledgerColumns(db: Database.Database): string[] {
  return (
    db.prepare("PRAGMA table_info('work_ledger')").all() as { name: string }[]
  ).map((column) => column.name)
}

it('MAR-3138 R3: v3 adds `blocked` once, and a fresh DB ends where a v1+v2 one does', () => {
  const fresh = new Database(':memory:')
  const older = new Database(':memory:')
  try {
    // The DB that already ran v1 and v2, with a row from before v3.
    older.exec('CREATE TABLE app_state (key TEXT PRIMARY KEY, value TEXT)')
    migrateWorkLedger(older)
    migrateWorkLedgerVerdict(older)
    older
      .prepare(
        `INSERT INTO work_ledger (id, crew_id, issue_id, issue_identifier,
          issue_title, issue_url, seat, wave, lap, state, tracker_status,
          grounded_at, seen_at, fact_json)
         VALUES ('row-1','crew-1','issue-1','EX-1','t','u','opus',NULL,1,
          'working','In Progress',NULL,'2026-09-18T08:00:00.000Z','{}')`,
      )
      .run()

    // The DB that boots into this build for the first time.
    fresh.exec('CREATE TABLE app_state (key TEXT PRIMARY KEY, value TEXT)')
    migrateWorkLedger(fresh)
    migrateWorkLedgerVerdict(fresh)
    migrateWorkLedgerBlocked(fresh)

    migrateWorkLedgerBlocked(older)
    // Mutation: drop the sentinel guard -> `duplicate column name: blocked`
    // on this second call, red.
    migrateWorkLedgerBlocked(older)

    expect(ledgerColumns(older)).toEqual(ledgerColumns(fresh))
    // The canary for a later rebuild (lap 2, C): a v4 whose
    // `INSERT ... SELECT` list is copied from v2's block would drop `blocked`
    // on the way through, and this assertion is what would say so.
    expect(ledgerColumns(older)).toContain('blocked')
    // The row that predates the column reads as not blocked, and the column
    // refuses a null: "the tracker did not say blocked" is `false`, not
    // "unknown".
    expect(older.prepare('SELECT blocked FROM work_ledger').all()).toEqual([
      { blocked: 0 },
    ])
    expect(() =>
      older
        .prepare('UPDATE work_ledger SET blocked = NULL WHERE id = ?')
        .run('row-1'),
    ).toThrow()
    // v2's index survives an ALTER, which is why v3 does not recreate it.
    expect(
      older
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name=?")
        .all(WORK_LEDGER_ISSUE_INDEX),
    ).toEqual([{ name: WORK_LEDGER_ISSUE_INDEX }])
  } finally {
    fresh.close()
    older.close()
  }
})

it('MAR-3138 R3: a refused v3 leaves the v2 table and no sentinel', () => {
  const db = new Database(':memory:')
  try {
    db.exec('CREATE TABLE app_state (key TEXT PRIMARY KEY, value TEXT)')
    migrateWorkLedger(db)
    migrateWorkLedgerVerdict(db)
    db.exec(
      "CREATE TRIGGER refuse BEFORE INSERT ON app_state WHEN NEW.key = 'work_ledger_v3' BEGIN SELECT RAISE(ABORT, 'refused'); END",
    )

    expect(() => migrateWorkLedgerBlocked(db)).toThrow('refused')

    // One transaction: the column went back with the sentinel, so the next
    // boot may retry rather than finding a half-migrated table.
    expect(ledgerColumns(db)).not.toContain('blocked')
    expect(
      db.prepare("SELECT 1 FROM app_state WHERE key='work_ledger_v3'").all(),
    ).toEqual([])
    db.exec('DROP TRIGGER refuse')
    expect(() => migrateWorkLedgerBlocked(db)).not.toThrow()
    expect(ledgerColumns(db)).toContain('blocked')
  } finally {
    db.close()
  }
})
