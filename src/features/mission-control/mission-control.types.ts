import type { SessionSummary } from '@/entities/session'
import type { SessionCrew } from '@/entities/session-crew'

/**
 * A Session Card is Mission Control's rendering of one Session as the agent
 * working: the live Session Summary plus the display text the room needs to
 * show it at a glance. It never carries conversation content — the transcript
 * is the drill-down.
 */
export interface SessionCard {
  session: SessionSummary
  projectName: string
  providerLabel: string
  activityLabel: string
  /**
   * The crews holding this Session, in crew order. Carried on the card so the
   * crew filter and the card's own accent badges read the same membership and
   * cannot drift.
   */
  crews: SessionCrew[]
  /** Lowercased haystack for card-level search. Never conversation content. */
  searchText: string
}
