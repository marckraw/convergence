import type { SessionCrewRow } from '../database/database.types'

/**
 * One member of a crew, and the short name a baton addresses it by.
 *
 * Membership still carries no behaviour: the baton name is a label the wire
 * editor reads to pre-fill a condition with `BATON: <name>`, never something
 * the engine routes on. The engine only ever compares a wire's stored token
 * against a message's last line.
 */
export interface SessionCrewMember {
  sessionId: string
  batonName: string | null
}

/**
 * A crew is a named, decorated, cross-project collection of sessions.
 * Membership is many-to-many and carries no behaviour: crews promise
 * membership only, never automation, dispatch, or relays.
 */
export interface SessionCrew {
  id: string
  name: string
  emoji: string | null
  accentColor: string | null
  position: number
  /**
   * How many hops this crew's loop may spend before the round guard trips, or
   * null to take the default. Per crew because a loop is a crew's, not the
   * app's: one crew's twelve rounds are another's two.
   */
  roundCap: number | null
  /**
   * How long a station may hold this crew's loop before it hails, in minutes,
   * or null to take the default.
   */
  stallMinutes: number | null
  createdAt: string
  updatedAt: string
  /** Members whose session still exists, oldest membership first. */
  sessionIds: string[]
  /** The same members, with the short name a baton addresses each by. */
  members: SessionCrewMember[]
}

export interface CreateSessionCrewInput {
  name: string
  emoji?: string | null
  accentColor?: string | null
  sessionIds?: string[]
}

export interface UpdateSessionCrewInput {
  name?: string
  emoji?: string | null
  accentColor?: string | null
  position?: number
  roundCap?: number | null
  stallMinutes?: number | null
}

export function sessionCrewFromRow(
  row: SessionCrewRow,
  members: SessionCrewMember[],
): SessionCrew {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    accentColor: row.accent_color,
    position: row.position,
    // Read defensively: a row written before the knobs existed has no value on
    // some sqlite paths, and "take the default" is the honest answer for it.
    roundCap: row.round_cap ?? null,
    stallMinutes: row.stall_minutes ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Kept beside `members` rather than derived at every call site: every
    // existing reader asks for the ids, and one of the two would have drifted
    // the moment somebody filtered the other.
    sessionIds: members.map((member) => member.sessionId),
    members,
  }
}
