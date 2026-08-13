import type { SessionSummary } from '@/entities/session'

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
  /** Lowercased haystack for card-level search. Never conversation content. */
  searchText: string
}
