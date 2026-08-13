import { useEffect, useMemo } from 'react'
import { useProjectStore } from '@/entities/project'
import { useSessionStore } from '@/entities/session'
import { buildSessionCards } from './mission-control-cards.pure'
import { filterSessionCards } from './session-card-filter.pure'
import { orderSessionCards } from './session-card-order.pure'
import type { SessionCard } from './mission-control.types'

export interface MissionControlCards {
  /** Cards matching the query, in Mission Control's default order. */
  cards: SessionCard[]
  /** Cards in the room before the query narrowed them. */
  totalCount: number
}

/**
 * The Session Card list for Mission Control.
 *
 * Reads the session store's all-projects Session Summary list — the same
 * `getAllSummaries()` result that the app already keeps live from the
 * `session:summaryUpdated` broadcast. Mission Control adds no second fetch and
 * no second subscription: one source of truth, already streaming.
 */
export function useMissionControlCards(query: string): MissionControlCards {
  const sessions = useSessionStore((state) => state.globalSessions)
  const providers = useSessionStore((state) => state.providers)
  const loadProviders = useSessionStore((state) => state.loadProviders)
  const projects = useProjectStore((state) => state.projects)

  useEffect(() => {
    void loadProviders()
  }, [loadProviders])

  const allCards = useMemo(
    () => buildSessionCards({ sessions, projects, providers }),
    [sessions, projects, providers],
  )

  const cards = useMemo(
    () => orderSessionCards(filterSessionCards(allCards, query)),
    [allCards, query],
  )

  return { cards, totalCount: allCards.length }
}
