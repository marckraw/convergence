import { describe, expect, it, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { closeDatabase, getDatabase, resetDatabase } from './database'
import {
  CREW_SEAT_MEMBER_INDEX,
  migrateCrewSeats,
  readCrewSeatDedupeLog,
} from './crew-seat-migration.service'
import { CrewService } from '../crew/crew.service'
import { RelayService } from '../relay/relay.service'

/**
 * The seat, arriving in a database that predates it (MAR-3083 R1/R2).
 *
 * Built by hand as the shipped build wrote it, then opened by the app: the
 * only honest way to prove a migration, because the state it repairs is one
 * this build can no longer produce.
 */
const OLD_MEMBERS_TABLE = `
  CREATE TABLE session_crew_members (
    crew_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    baton_name TEXT,
    canvas_x REAL,
    canvas_y REAL,
    added_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (crew_id, session_id)
  );`

const OLD_RELAYS_TABLE = `
  CREATE TABLE session_relays (
    id TEXT PRIMARY KEY,
    crew_id TEXT NOT NULL,
    source_session_id TEXT NOT NULL,
    trigger TEXT NOT NULL DEFAULT 'settled',
    action TEXT NOT NULL,
    target_session_id TEXT,
    spawn_spec_json TEXT,
    armed INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`

function legacyDatabase(name: string, write: (db: Database.Database) => void) {
  const dir = mkdtempSync(join(tmpdir(), `convergence-seat-${name}-`))
  const path = join(dir, 'pre-seats.sqlite')
  const legacy = new Database(path)
  write(legacy)
  legacy.close()
  return { dir, path }
}

/** The rows an opened database needs before a member can be read back. */
function seedWorld(db: Database.Database, sessionIds: string[]): void {
  db.prepare(
    "INSERT INTO projects (id, name, repository_path) VALUES ('p1', 'p1', '/tmp/p1')",
  ).run()
  for (const id of sessionIds) {
    db.prepare(
      `INSERT INTO sessions (id, project_id, provider_id, name, working_directory)
       VALUES (?, 'p1', 'codex', ?, '/tmp/p1')`,
    ).run(id, id)
  }
}

describe('the seat migration', () => {
  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  it('reads a member written before seats existed as horse · resident · 1, and keeps the columns across a reopen', () => {
    const { dir, path } = legacyDatabase('defaults', (db) => {
      db.exec(OLD_MEMBERS_TABLE)
      db.prepare(
        "INSERT INTO session_crew_members (crew_id, session_id) VALUES ('c1', 's1')",
      ).run()
    })

    try {
      let db = getDatabase(path)
      seedWorld(db, ['s1'])
      db.prepare(
        "INSERT INTO session_crews (id, name, position) VALUES ('c1', 'Night shift', 0)",
      ).run()

      const [member] = new CrewService(db).getById('c1')!.members
      // Mutation: drop the seat columns from the migration -> the read throws
      // on the missing columns and this whole file is red.
      expect(member).toMatchObject({
        sessionId: 's1',
        role: 'horse',
        kind: 'resident',
        wipLimit: 1,
        roleCard: null,
        hostPolicy: null,
        lanePolicy: null,
      })

      closeDatabase()
      resetDatabase()
      db = getDatabase(path)
      const columns = (
        db.prepare("PRAGMA table_info('session_crew_members')").all() as {
          name: string
        }[]
      ).map((column) => column.name)
      expect(columns).toEqual(
        expect.arrayContaining([
          'role',
          'kind',
          'role_card',
          'host_policy',
          'lane_policy',
          'wip_limit',
          'provider_id',
          'model',
        ]),
      )
      expect(new CrewService(db).getById('c1')!.members[0]!.role).toBe('horse')
    } finally {
      closeDatabase()
      resetDatabase()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('keeps the earliest membership of a session that sat in two crews, and indexes the table', () => {
    const { dir, path } = legacyDatabase('dedupe', (db) => {
      db.exec(OLD_MEMBERS_TABLE)
      db.prepare(
        `INSERT INTO session_crew_members (crew_id, session_id, added_at)
         VALUES ('c1', 's1', '2026-01-01 00:00:00')`,
      ).run()
      db.prepare(
        `INSERT INTO session_crew_members (crew_id, session_id, added_at)
         VALUES ('c2', 's1', '2026-02-02 00:00:00')`,
      ).run()
    })

    try {
      const db = getDatabase(path)
      const rows = db
        .prepare('SELECT crew_id FROM session_crew_members ORDER BY crew_id')
        .all() as { crew_id: string }[]
      // The one that has been carrying the work stays.
      expect(rows).toEqual([{ crew_id: 'c1' }])
      expect(readCrewSeatDedupeLog(db)?.removed).toEqual([
        { crewId: 'c2', sessionId: 's1', addedAt: '2026-02-02 00:00:00' },
      ])
      const indexes = (
        db.prepare("PRAGMA index_list('session_crew_members')").all() as {
          name: string
        }[]
      ).map((index) => index.name)
      // Mutation: drop the index and keep only the service check -> a writer
      // that never came through the service can still seat a session twice.
      expect(indexes).toContain(CREW_SEAT_MEMBER_INDEX)
    } finally {
      closeDatabase()
      resetDatabase()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  /**
   * The rebuild is ONE transaction (MAR-3083 lap 2, A).
   *
   * Interrupted between the DROP and the RENAME, the old shape left every
   * membership in an orphan table while the next boot's `CREATE TABLE IF NOT
   * EXISTS` made an empty one -- silent and permanent. The interrupt is driven
   * at the real seam: the RENAME's own statement throws.
   */
  it('keeps the table and every membership when the rebuild is interrupted', () => {
    const { dir, path } = legacyDatabase('interrupt', (db) => {
      db.exec(OLD_MEMBERS_TABLE)
      db.prepare(
        "INSERT INTO session_crew_members (crew_id, session_id) VALUES ('c1', 's1')",
      ).run()
      // Boot's order: the seat columns are added before the seat migration
      // runs, so the rebuild has them to carry.
      for (const column of [
        'role TEXT',
        'kind TEXT',
        'role_card TEXT',
        'host_policy TEXT',
        'lane_policy TEXT',
        'wip_limit INTEGER',
        'provider_id TEXT',
        'model TEXT',
      ]) {
        db.exec(`ALTER TABLE session_crew_members ADD COLUMN ${column}`)
      }
    })

    let raw: Database.Database | null = null
    try {
      raw = new Database(path)
      const prepare = raw.prepare.bind(raw)
      vi.spyOn(raw, 'prepare').mockImplementation(((sql: string) =>
        sql.includes('RENAME TO session_crew_members')
          ? {
              run: () => {
                throw new Error('interrupted mid-rebuild')
              },
            }
          : prepare(sql)) as typeof raw.prepare)

      expect(() => migrateCrewSeats(raw!)).toThrow('interrupted mid-rebuild')

      vi.restoreAllMocks()
      // Mutation: drop the `db.transaction` wrapper and this reads zero rows
      // in a table that no longer exists -- the DROP stood on its own.
      const rows = raw
        .prepare('SELECT crew_id, session_id FROM session_crew_members')
        .all()
      expect(rows).toEqual([{ crew_id: 'c1', session_id: 's1' }])
    } finally {
      vi.restoreAllMocks()
      raw?.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('opens a database whose earlier rebuild was interrupted, leftover table and all', () => {
    const { dir, path } = legacyDatabase('leftover', (db) => {
      db.exec(OLD_MEMBERS_TABLE)
      db.prepare(
        "INSERT INTO session_crew_members (crew_id, session_id) VALUES ('c1', 's1')",
      ).run()
      // What an interrupted run left behind: the copy, half-made.
      db.exec(`CREATE TABLE session_crew_members_rebuilt (
        crew_id TEXT NOT NULL,
        session_id TEXT,
        baton_name TEXT
      )`)
    })

    try {
      // Mutation: drop the leading `DROP TABLE IF EXISTS` and opening throws
      // on "table session_crew_members_rebuilt already exists" -- the app
      // cannot open its database on any later boot.
      const db = getDatabase(path)
      seedWorld(db, ['s1'])
      db.prepare(
        "INSERT INTO session_crews (id, name, position) VALUES ('c1', 'Night shift', 0)",
      ).run()

      expect(new CrewService(db).getById('c1')!.sessionIds).toEqual(['s1'])
      const sessionColumn = (
        db.prepare("PRAGMA table_info('session_crew_members')").all() as {
          name: string
          notnull: number
        }[]
      ).find((column) => column.name === 'session_id')
      expect(sessionColumn?.notnull).toBe(0)
    } finally {
      closeDatabase()
      resetDatabase()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  /**
   * The card's column arriving in a database that predates it (MAR-3083 lap
   * 3, L). The fresh-schema test cannot see this: `SCHEMA` supplies the
   * column there, so the guarded ALTER could be deleted with every gate
   * still green.
   */
  it('adds the role-card column to a relay_hops table written before it', () => {
    const { dir, path } = legacyDatabase('hops', (db) => {
      // The shape the shipped build wrote, every column except the one under
      // test; the boot migration is what has to add that one.
      db.exec(`CREATE TABLE relay_hops (
        id TEXT PRIMARY KEY,
        relay_id TEXT NOT NULL,
        crew_id TEXT NOT NULL,
        flow_run_id TEXT NOT NULL,
        fired_at TEXT NOT NULL DEFAULT (datetime('now')),
        source_session_id TEXT NOT NULL,
        target_session_id TEXT,
        spawned_session_id TEXT,
        trigger_status TEXT NOT NULL,
        payload_preview TEXT,
        outcome TEXT NOT NULL,
        baton TEXT,
        round_number INTEGER,
        lap_number INTEGER,
        settled_at TEXT,
        settled_status TEXT,
        dispatch_id TEXT,
        redelivered_from TEXT,
        settle_id TEXT,
        error TEXT
      )`)
      db.prepare(
        `INSERT INTO relay_hops
           (id, relay_id, crew_id, flow_run_id, source_session_id,
            trigger_status, outcome, target_session_id)
         VALUES ('h1', 'r1', 'c1', 'run-1', 's1', 'completed', 'delivered', 's2')`,
      ).run()
    })

    try {
      const db = getDatabase(path)
      const columns = (
        db.prepare("PRAGMA table_info('relay_hops')").all() as {
          name: string
        }[]
      ).map((column) => column.name)
      // Mutation: delete the guarded ALTER and this is red, while every
      // fresh-database test stays green.
      expect(columns).toContain('role_card_carried')
      // The rows that predate it read as "carried no card", which is true.
      expect(new RelayService(db).hasCarriedRoleCard('run-1', 's2')).toBe(false)
    } finally {
      closeDatabase()
      resetDatabase()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('refuses a second crew at the table, whatever wrote the row', () => {
    const db = getDatabase()
    seedWorld(db, ['s1'])
    db.prepare(
      "INSERT INTO session_crews (id, name, position) VALUES ('c1', 'Masterminds', 0)",
    ).run()
    db.prepare(
      "INSERT INTO session_crews (id, name, position) VALUES ('c2', 'Workers', 1)",
    ).run()
    db.prepare(
      "INSERT INTO session_crew_members (crew_id, session_id) VALUES ('c1', 's1')",
    ).run()

    // The half of R2 that does not depend on anybody calling the service: an
    // importer, a spawn joining a crew, a future adapter. Mutation: drop the
    // unique index from the migration -> this insert succeeds and a seat is
    // shared again.
    expect(() =>
      db
        .prepare(
          "INSERT INTO session_crew_members (crew_id, session_id) VALUES ('c2', 's1')",
        )
        .run(),
    ).toThrow(/UNIQUE constraint failed/)
  })

  it('will not remove a membership its crew still has an armed wire on, and says so instead', () => {
    const { dir, path } = legacyDatabase('armed', (db) => {
      db.exec(OLD_MEMBERS_TABLE)
      db.exec(OLD_RELAYS_TABLE)
      db.prepare(
        `INSERT INTO session_crew_members (crew_id, session_id, added_at)
         VALUES ('c1', 's1', '2026-01-01 00:00:00')`,
      ).run()
      db.prepare(
        `INSERT INTO session_crew_members (crew_id, session_id, added_at)
         VALUES ('c2', 's1', '2026-02-02 00:00:00')`,
      ).run()
      db.prepare(
        `INSERT INTO session_relays (id, crew_id, source_session_id, action, armed)
         VALUES ('r1', 'c2', 's1', 'hail', 1)`,
      ).run()
    })

    try {
      const db = getDatabase(path)
      const rows = db
        .prepare('SELECT crew_id FROM session_crew_members ORDER BY crew_id')
        .all() as { crew_id: string }[]
      // A seat wired into a live loop is not a row to delete quietly at boot.
      expect(rows).toEqual([{ crew_id: 'c1' }, { crew_id: 'c2' }])
      const log = readCrewSeatDedupeLog(db)
      expect(log?.kept).toEqual([
        { crewId: 'c2', sessionId: 's1', reason: 'armed-wire' },
      ])
      expect(log?.indexed).toBe(false)
      const indexes = (
        db.prepare("PRAGMA index_list('session_crew_members')").all() as {
          name: string
        }[]
      ).map((index) => index.name)
      expect(indexes).not.toContain(CREW_SEAT_MEMBER_INDEX)
    } finally {
      closeDatabase()
      resetDatabase()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
