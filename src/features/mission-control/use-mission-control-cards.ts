import { useEffect, useMemo } from 'react'
import { useProjectStore } from '@/entities/project'
import { useSessionStore } from '@/entities/session'
import { buildSessionCards } from './mission-control-cards.pure'
import {
  filterSessionCards,
  matchesSessionCardQuery,
} from './session-card-filter.pure'
import type { SessionCardFilter } from './session-card-filter.pure'
import { orderSessionCards } from './session-card-order.pure'
import type { SessionCardOrderPreset } from './session-card-order.pure'
import { countSessionCardStates } from './session-card-state.pure'
import type { SessionCardStateCounts } from './session-card-state.pure'
import type { SessionCard } from './mission-control.types'

export interface MissionControlCardsInput {
  /** Everything the room is narrowed by. */
  filter: SessionCardFilter
  /** How the room is laid out. Defaults to Mission Control's own order. */
  order?: SessionCardOrderPreset
}

export interface MissionControlCards {
  /** Cards matching the filter, in the chosen order. */
  cards: SessionCard[]
  /** Cards in the room before the filter narrowed them. */
  totalCount: number
  /**
   * Cards per state, counted after search but before the state chips — so a
   * chip's number answers "how many appear if I turn this on".
   */
  stateCounts: SessionCardStateCounts
}

/**
 * The Session Card list for Mission Control.
 *
 * Reads the session store's all-projects Session Summary list — the same
 * `getAllSummaries()` result that the app already keeps live from the
 * `session:summaryUpdated` broadcast. Mission Control adds no second fetch and
 * no second subscription: one source of truth, already streaming.
 */
export function useMissionControlCards({
  filter,
  order = 'attention-first',
}: MissionControlCardsInput): MissionControlCards {
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

  const stateCounts = useMemo(
    () =>
      countSessionCardStates(
        allCards.filter((card) => matchesSessionCardQuery(card, filter.query)),
      ),
    [allCards, filter.query],
  )

  const cards = useMemo(
    () => orderSessionCards(filterSessionCards(allCards, filter), order),
    [allCards, filter, order],
  )

  return { cards, totalCount: allCards.length, stateCounts }
}
