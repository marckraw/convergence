/**
 * A crew is a named, decorated, cross-project collection of sessions.
 * Membership is many-to-many and promises membership only — no automation.
 */
export interface SessionCrew {
  id: string
  name: string
  emoji: string | null
  accentColor: string | null
  position: number
  createdAt: string
  updatedAt: string
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
