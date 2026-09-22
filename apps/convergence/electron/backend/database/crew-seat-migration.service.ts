import type Database from 'better-sqlite3'

/**
 * One seat, one crew (MAR-3083 R2; constitution §6.6).
 *
 * Two mechanisms, and they are not two halves covering each other: the
 * service refuses a second membership with the other crew's name, which is
 * the sentence a person reads, and this unique index refuses it whatever
 * writes the row -- an import, a spawn joining a crew, a future adapter. Each
 * has an input the other cannot see, so both are named and both are pinned.
 *
 * The index cannot be built on a table that already breaks it, and a
 * duplicate membership is somebody's crew: the dedupe keeps the EARLIEST
 * membership (the one that has been carrying the work) and never touches a
 * duplicate a wire is armed on -- a seat wired into a live loop is not a row
 * to delete quietly at boot. When such a duplicate is found, it stays, the
 * index is not created, and the reason is written where it can be read: the
 * service's refusal still holds the door in the meantime.
 *
 * `session_id IS NULL` is a dynamic seat (R3) and is exempt by construction --
 * SQLite treats every NULL as distinct in a unique index, so any number of
 * recipes may sit in one crew.
 */
export const CREW_SEAT_DEDUPE_LOG_KEY = 'crew_seat_dedupe_v1'
export const CREW_SEAT_MEMBER_INDEX = 'idx_session_crew_members_session_unique'
/**
 * A recipe's name is its only key, so it gets the same two halves R2 gave a
 * conversation (MAR-3083 lap 4, Q): the service refuses a name a recipe holds,
 * and this index refuses the row whatever writes it. Partial on purpose --
 * residents may share a name; their key is the session.
 */
export const CREW_RECIPE_NAME_INDEX = 'idx_session_crew_members_recipe_name'

export interface CrewSeatDedupeLog {
  at: string
  /** Memberships removed so the index could be built. */
  removed: { crewId: string; sessionId: string; addedAt: string }[]
  /** Duplicates left in place because a wire in that crew is armed on them. */
  kept: { crewId: string; sessionId: string; reason: 'armed-wire' }[]
  indexed: boolean
  /**
   * Recipe names held twice in one crew, which the recipe-name index cannot
   * be built over. No door has ever allowed it; if a row set shows it anyway,
   * it is named here and the index is skipped rather than rows deleted.
   */
  recipeNameConflicts?: { crewId: string; batonName: string }[]
  recipeNameIndexed?: boolean
}

/**
 * A database written before dynamic seats declares `session_id NOT NULL`, and
 * SQLite cannot relax a column constraint in place. The table is rebuilt --
 * the same move the attachments table took -- carrying every row and its
 * `added_at`, because that is what decides which membership is the earliest
 * when the dedupe below runs.
 *
 * **One transaction, and the app's own law about it** (`database.ts`: "SQLite's
 * DDL is transactional"). Written as a bare `exec` script this was four
 * autocommitted statements, and two interrupts were unrecoverable: killed
 * between the DROP and the RENAME, every membership sat in an orphan table
 * while the next boot's `CREATE TABLE IF NOT EXISTS` made an empty one --
 * silent and permanent; killed between the INSERT and the DROP, the next boot
 * rebuilt again and `CREATE TABLE ..._rebuilt` threw, so the app could not
 * open its database at all. Both are gone: the rollback undoes the half, and
 * the leftover of any older interrupted run is dropped inside the same
 * transaction before the copy begins.
 *
 * Prepared statements rather than one script because a transaction is the
 * unit here, not a string -- and because a test can then interrupt the real
 * seam instead of a hand-made state.
 */
function relaxSessionIdNullability(db: Database.Database): void {
  const column = (
    db.prepare("PRAGMA table_info('session_crew_members')").all() as {
      name: string
      notnull: number
    }[]
  ).find((info) => info.name === 'session_id')
  if (!column || column.notnull === 0) return

  const statements = [
    'DROP TABLE IF EXISTS session_crew_members_rebuilt',
    `CREATE TABLE session_crew_members_rebuilt (
      crew_id TEXT NOT NULL,
      session_id TEXT,
      baton_name TEXT,
      canvas_x REAL,
      canvas_y REAL,
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      role TEXT,
      kind TEXT,
      role_card TEXT,
      host_policy TEXT,
      lane_policy TEXT,
      wip_limit INTEGER,
      lane_path TEXT,
      provider_id TEXT,
      model TEXT,
      UNIQUE (crew_id, session_id)
    )`,
    `INSERT INTO session_crew_members_rebuilt
      (crew_id, session_id, baton_name, canvas_x, canvas_y, added_at,
       role, kind, role_card, host_policy, lane_policy, wip_limit, lane_path,
       provider_id, model)
      SELECT crew_id, session_id, baton_name, canvas_x, canvas_y, added_at,
             role, kind, role_card, host_policy, lane_policy, wip_limit, lane_path,
             provider_id, model
        FROM session_crew_members
        ORDER BY added_at ASC, rowid ASC`,
    'DROP TABLE session_crew_members',
    'ALTER TABLE session_crew_members_rebuilt RENAME TO session_crew_members',
    `CREATE INDEX IF NOT EXISTS idx_session_crew_members_crew
      ON session_crew_members(crew_id)`,
    `CREATE INDEX IF NOT EXISTS idx_session_crew_members_session
      ON session_crew_members(session_id)`,
  ]

  db.transaction(() => {
    for (const statement of statements) db.prepare(statement).run()
  })()
}

export function migrateCrewSeats(db: Database.Database): CrewSeatDedupeLog {
  relaxSessionIdNullability(db)
  const duplicates = db
    .prepare(
      `SELECT session_id FROM session_crew_members
        WHERE session_id IS NOT NULL
        GROUP BY session_id HAVING COUNT(*) > 1`,
    )
    .all() as { session_id: string }[]

  const log: CrewSeatDedupeLog = {
    at: new Date().toISOString(),
    removed: [],
    kept: [],
    indexed: false,
  }

  db.transaction(() => {
    for (const { session_id: sessionId } of duplicates) {
      const rows = db
        .prepare(
          `SELECT crew_id, added_at FROM session_crew_members
            WHERE session_id = ?
            ORDER BY added_at ASC, rowid ASC`,
        )
        .all(sessionId) as { crew_id: string; added_at: string }[]
      // The first row is the membership that stays, whatever the rest say.
      for (const row of rows.slice(1)) {
        if (hasArmedWire(db, row.crew_id, sessionId)) {
          log.kept.push({
            crewId: row.crew_id,
            sessionId,
            reason: 'armed-wire',
          })
          continue
        }
        db.prepare(
          'DELETE FROM session_crew_members WHERE crew_id = ? AND session_id = ?',
        ).run(row.crew_id, sessionId)
        log.removed.push({
          crewId: row.crew_id,
          sessionId,
          addedAt: row.added_at,
        })
      }
    }

    const recipeNameConflicts = db
      .prepare(
        `SELECT crew_id AS crewId, baton_name AS batonName
           FROM session_crew_members
          WHERE session_id IS NULL AND baton_name IS NOT NULL
          GROUP BY crew_id, baton_name HAVING COUNT(*) > 1`,
      )
      .all() as { crewId: string; batonName: string }[]
    log.recipeNameIndexed = recipeNameConflicts.length === 0
    if (log.recipeNameIndexed) {
      db.exec(
        `CREATE UNIQUE INDEX IF NOT EXISTS ${CREW_RECIPE_NAME_INDEX}
           ON session_crew_members(crew_id, baton_name)
          WHERE session_id IS NULL`,
      )
    } else {
      log.recipeNameConflicts = recipeNameConflicts
    }

    log.indexed = log.kept.length === 0
    if (log.indexed) {
      db.exec(
        `CREATE UNIQUE INDEX IF NOT EXISTS ${CREW_SEAT_MEMBER_INDEX}
           ON session_crew_members(session_id)`,
      )
    }

    if (
      log.removed.length > 0 ||
      log.kept.length > 0 ||
      (log.recipeNameConflicts?.length ?? 0) > 0
    ) {
      db.prepare(
        'INSERT OR REPLACE INTO app_state(key,value) VALUES (?, ?)',
      ).run(CREW_SEAT_DEDUPE_LOG_KEY, JSON.stringify(log))
    }
  })()

  return log
}

/** Whether a wire this crew still has armed names this session at either end. */
function hasArmedWire(
  db: Database.Database,
  crewId: string,
  sessionId: string,
): boolean {
  const row = db
    .prepare(
      `SELECT 1 FROM session_relays
        WHERE crew_id = ? AND armed = 1
          AND (source_session_id = ? OR target_session_id = ?)
        LIMIT 1`,
    )
    .get(crewId, sessionId, sessionId)
  return row !== undefined
}

/** The dedupe's own record, for anyone asking what boot removed. */
export function readCrewSeatDedupeLog(
  db: Database.Database,
): CrewSeatDedupeLog | null {
  const row = db
    .prepare('SELECT value FROM app_state WHERE key = ?')
    .get(CREW_SEAT_DEDUPE_LOG_KEY) as { value: string } | undefined
  if (!row) return null
  try {
    return JSON.parse(row.value) as CrewSeatDedupeLog
  } catch {
    return null
  }
}

/** Pausing only gates future automatic dispatches; it never stops a turn. */
export function migrateCrewSeatPause(db: Database.Database): void {
  if (
    db.prepare("SELECT 1 FROM app_state WHERE key='crew_seat_pause_v1'").get()
  )
    return
  db.transaction(() => {
    db.prepare(
      'ALTER TABLE session_crew_members ADD COLUMN paused INTEGER NOT NULL DEFAULT 0',
    ).run()
    db.prepare(
      "INSERT INTO app_state(key,value) VALUES ('crew_seat_pause_v1','1')",
    ).run()
  })()
}
