/**
 * A crew is a named, decorated, cross-project collection of sessions.
 * Membership is many-to-many and promises membership only — no automation.
 */
export interface SessionCrewMember {
  sessionId: string
  /**
   * The short name a baton addresses this member by, or null when nobody has
   * named it. A label the wire editor reads to pre-fill a condition — the
   * engine never routes on it, it compares a wire's stored token.
   */
  batonName: string | null
}

export interface SessionCrew {
  id: string
  name: string
  emoji: string | null
  accentColor: string | null
  position: number
  /** How many rounds this crew's loop may spend; null takes the default. */
  roundCap: number | null
  /** How long a station may hold the loop before it hails; null is default. */
  stallMinutes: number | null
  createdAt: string
  updatedAt: string
  sessionIds: string[]
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
