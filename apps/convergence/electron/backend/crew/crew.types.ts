import type { SessionCrewRow } from '../database/database.types'

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
  createdAt: string
  updatedAt: string
  /** Members whose session still exists, oldest membership first. */
  sessionIds: string[]
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
}

export function sessionCrewFromRow(
  row: SessionCrewRow,
  sessionIds: string[],
): SessionCrew {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    accentColor: row.accent_color,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sessionIds,
  }
}
