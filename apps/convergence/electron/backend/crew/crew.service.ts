import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type { SessionCrewRow } from '../database/database.types'
import {
  nextCrewPosition,
  normalizeCrewAccentColor,
  normalizeCrewBatonName,
  normalizeCrewEmoji,
  normalizeCrewLimit,
  normalizeCrewName,
  normalizeCrewSessionIds,
} from './crew.pure'
import {
  sessionCrewFromRow,
  type CreateSessionCrewInput,
  type SessionCrew,
  type SessionCrewMember,
  type UpdateSessionCrewInput,
} from './crew.types'

/**
 * Repository + use-case boundary for crews. Membership rows are joined against
 * `sessions` on every read so a deleted session degrades to a missing member
 * rather than a crash, and crew deletion is spelled out row by row so it can
 * never cascade into the sessions themselves.
 */
export class CrewService {
  constructor(private db: Database.Database) {}

  list(): SessionCrew[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM session_crews
         ORDER BY position ASC, created_at ASC, rowid ASC`,
      )
      .all() as SessionCrewRow[]

    const membersByCrewId = this.readMembers()

    return rows.map((row) =>
      sessionCrewFromRow(row, membersByCrewId.get(row.id) ?? []),
    )
  }

  getById(id: string): SessionCrew | null {
    const row = this.db
      .prepare('SELECT * FROM session_crews WHERE id = ?')
      .get(id) as SessionCrewRow | undefined
    if (!row) return null
    return sessionCrewFromRow(row, this.readMembers(row.id).get(row.id) ?? [])
  }

  create(input: CreateSessionCrewInput): SessionCrew {
    const id = randomUUID()
    const name = normalizeCrewName(input.name)
    const emoji = normalizeCrewEmoji(input.emoji)
    const accentColor = normalizeCrewAccentColor(input.accentColor)
    const sessionIds = normalizeCrewSessionIds(input.sessionIds)
    const position = nextCrewPosition(
      (
        this.db.prepare('SELECT position FROM session_crews').all() as {
          position: number
        }[]
      ).map((entry) => entry.position),
    )

    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO session_crews (id, name, emoji, accent_color, position)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(id, name, emoji, accentColor, position)

      for (const sessionId of sessionIds) {
        this.insertMember(id, sessionId)
      }
    })()

    return this.requireById(id)
  }

  /**
   * Every crew this session belongs to.
   *
   * The engine asks so it knows whose loop a settling session is part of: a
   * baton nobody routed has to hail the crew that was waiting on it, and that
   * crew may own no wire leaving this station at all.
   */
  crewIdsForSession(sessionId: string): string[] {
    const rows = this.db
      .prepare(
        'SELECT crew_id FROM session_crew_members WHERE session_id = ? ORDER BY added_at ASC, rowid ASC',
      )
      .all(sessionId) as { crew_id: string }[]
    return rows.map((row) => row.crew_id)
  }

  /**
   * Names one member's baton, or clears it.
   *
   * Its own method rather than a field on `update`, for the same reason arming
   * is: it belongs to a member, not to the crew, and burying it in the crew
   * form would mean editing a colour could rename a route.
   */
  /**
   * Remembers where a member's card was dropped on the Canvas (R10).
   *
   * A null pair means "lay it out" and is how a card is put back under the
   * automatic walk; the two coordinates move together because half a position
   * is not a position. Silent when the pair names a member this crew does not
   * have -- a card dragged in a window whose membership changed under it is
   * not an error worth failing a drag over, and the next crew broadcast
   * corrects the picture.
   */
  setMemberPosition(
    crewId: string,
    sessionId: string,
    position: { x: number; y: number } | null,
  ): SessionCrew {
    this.requireRow(crewId)
    this.db
      .prepare(
        `UPDATE session_crew_members SET canvas_x = ?, canvas_y = ?
         WHERE crew_id = ? AND session_id = ?`,
      )
      .run(
        normalizeCanvasCoordinate(position?.x),
        normalizeCanvasCoordinate(position?.y),
        crewId,
        sessionId,
      )
    return this.requireById(crewId)
  }

  setMemberBatonName(
    crewId: string,
    sessionId: string,
    batonName: string | null,
  ): SessionCrew {
    this.requireRow(crewId)
    this.db
      .prepare(
        'UPDATE session_crew_members SET baton_name = ? WHERE crew_id = ? AND session_id = ?',
      )
      .run(normalizeCrewBatonName(batonName), crewId, sessionId)
    return this.requireById(crewId)
  }

  update(id: string, patch: UpdateSessionCrewInput): SessionCrew {
    const existing = this.requireRow(id)

    const name =
      patch.name === undefined ? existing.name : normalizeCrewName(patch.name)
    const emoji =
      patch.emoji === undefined
        ? existing.emoji
        : normalizeCrewEmoji(patch.emoji)
    const accentColor =
      patch.accentColor === undefined
        ? existing.accent_color
        : normalizeCrewAccentColor(patch.accentColor)
    const position =
      patch.position === undefined ? existing.position : patch.position
    // An untouched knob survives an edit that was about something else;
    // clearing one back to the default is an explicit null, the same shape
    // every other optional field here uses.
    const roundCap =
      patch.roundCap === undefined
        ? existing.round_cap
        : normalizeCrewLimit(patch.roundCap, 'A round cap')
    const stallMinutes =
      patch.stallMinutes === undefined
        ? existing.stall_minutes
        : normalizeCrewLimit(patch.stallMinutes, 'A stall window')

    this.db
      .prepare(
        `UPDATE session_crews
         SET name = ?,
             emoji = ?,
             accent_color = ?,
             position = ?,
             round_cap = ?,
             stall_minutes = ?,
             updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(name, emoji, accentColor, position, roundCap, stallMinutes, id)

    return this.requireById(id)
  }

  /** The stamp records an applied recipe hash, not success of later guarded model changes. */
  stampConfig(id: string, path: string, sha256: string): void {
    this.requireRow(id)
    this.db
      .prepare(
        'UPDATE session_crews SET config_path=?,config_sha256=?,config_applied_at=? WHERE id=?',
      )
      .run(path, sha256, new Date().toISOString(), id)
  }

  delete(id: string): void {
    this.db.transaction(() => {
      this.db
        .prepare('DELETE FROM session_crew_members WHERE crew_id = ?')
        .run(id)
      this.db.prepare('DELETE FROM session_crews WHERE id = ?').run(id)
    })()
  }

  addMember(crewId: string, sessionId: string): SessionCrew {
    this.requireRow(crewId)
    const [normalized] = normalizeCrewSessionIds([sessionId])
    if (!normalized) {
      throw new Error('Crew member session id cannot be empty')
    }
    this.insertMember(crewId, normalized)
    return this.requireById(crewId)
  }

  removeMember(crewId: string, sessionId: string): SessionCrew {
    this.requireRow(crewId)
    this.db
      .prepare(
        'DELETE FROM session_crew_members WHERE crew_id = ? AND session_id = ?',
      )
      .run(crewId, sessionId)
    return this.requireById(crewId)
  }

  private insertMember(crewId: string, sessionId: string): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO session_crew_members (crew_id, session_id)
         VALUES (?, ?)`,
      )
      .run(crewId, sessionId)
  }

  private readMembers(crewId?: string): Map<string, SessionCrewMember[]> {
    const rows = (
      crewId === undefined
        ? this.db
            .prepare(
              `SELECT members.crew_id, members.session_id, members.baton_name,
                      members.canvas_x, members.canvas_y
               FROM session_crew_members members
               JOIN sessions ON sessions.id = members.session_id
               ORDER BY members.added_at ASC, members.rowid ASC`,
            )
            .all()
        : this.db
            .prepare(
              `SELECT members.crew_id, members.session_id, members.baton_name,
                      members.canvas_x, members.canvas_y
               FROM session_crew_members members
               JOIN sessions ON sessions.id = members.session_id
               WHERE members.crew_id = ?
               ORDER BY members.added_at ASC, members.rowid ASC`,
            )
            .all(crewId)
    ) as {
      crew_id: string
      session_id: string
      baton_name: string | null
      canvas_x: number | null
      canvas_y: number | null
    }[]

    const membersByCrewId = new Map<string, SessionCrewMember[]>()
    for (const row of rows) {
      const member: SessionCrewMember = {
        sessionId: row.session_id,
        // Defensive read for the same reason every other added column gets
        // one: a row written before baton names existed has none.
        batonName: row.baton_name ?? null,
        // Both or neither: half a position cannot place a card, and reading
        // one coordinate as 0 would drag it to the edge of the frame.
        canvasX: readCanvasCoordinate(row.canvas_x, row.canvas_y),
        canvasY: readCanvasCoordinate(row.canvas_y, row.canvas_x),
      }
      const existing = membersByCrewId.get(row.crew_id)
      if (existing) {
        existing.push(member)
      } else {
        membersByCrewId.set(row.crew_id, [member])
      }
    }
    return membersByCrewId
  }

  private requireRow(id: string): SessionCrewRow {
    const row = this.db
      .prepare('SELECT * FROM session_crews WHERE id = ?')
      .get(id) as SessionCrewRow | undefined
    if (!row) {
      throw new Error(`Crew not found: ${id}`)
    }
    return row
  }

  private requireById(id: string): SessionCrew {
    const crew = this.getById(id)
    if (!crew) {
      throw new Error(`Crew not found: ${id}`)
    }
    return crew
  }
}

/**
 * A coordinate worth storing, or null.
 *
 * The belt of a belt-and-braces pair, and it says so rather than claiming to
 * be the guard: **`readCanvasCoordinate` below is the load-bearing half.**
 * Deleting this function alone leaves every test green, because the read
 * refuses the same rows -- a stored Infinity comes back and is dropped there,
 * and SQLite turns a NaN into NULL on its own before this is even asked.
 *
 * It stays because a row nobody can read is still a row somebody has to
 * explain, and refusing junk at the door is cheaper than explaining it. The
 * rule it enforces is the read's: a non-finite coordinate is a card gone off
 * the canvas with no way to find it, and null -- the automatic walk -- is
 * always somewhere visible.
 */
function normalizeCanvasCoordinate(value: number | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return value
}

/**
 * One half of a stored pair, kept only when its partner is there too.
 *
 * THE guard. Half a position cannot place a card, and reading one coordinate
 * as 0 would drag it to the edge of its frame -- which looks like a bug
 * rather than an arrangement. It also catches a non-finite value however it
 * got into the column, including from a build that wrote it before the door
 * above existed.
 */
function readCanvasCoordinate(
  value: number | null,
  partner: number | null,
): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (typeof partner !== 'number' || !Number.isFinite(partner)) return null
  return value
}
