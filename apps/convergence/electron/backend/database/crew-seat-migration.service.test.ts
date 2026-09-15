import { describe, expect, it, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { closeDatabase, getDatabase, resetDatabase } from './database'
import {
  CREW_SEAT_MEMBER_INDEX,
  readCrewSeatDedupeLog,
} from './crew-seat-migration.service'
import { CrewService } from '../crew/crew.service'

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
