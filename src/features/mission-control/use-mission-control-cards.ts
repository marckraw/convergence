import { useEffect, useMemo } from 'react'
import { useProjectStore } from '@/entities/project'
import { useSessionStore } from '@/entities/session'
import { buildSessionCards } from './mission-control-cards.pure'
import type { SessionCard } from './mission-control.types'

export interface MissionControlCards {
  cards: SessionCard[]
}

/**
 * The Session Card list for Mission Control.
 *
 * Reads the session store's all-projects Session Summary list — the same
 * `getAllSummaries()` result that the app already keeps live from the
 * `session:summaryUpdated` broadcast. Mission Control adds no second fetch and
 * no second subscription: one source of truth, already streaming.
 */
export function useMissionControlCards(): MissionControlCards {
  const sessions = useSessionStore((state) => state.globalSessions)
  const providers = useSessionStore((state) => state.providers)
  const loadProviders = useSessionStore((state) => state.loadProviders)
  const projects = useProjectStore((state) => state.projects)

  useEffect(() => {
    void loadProviders()
  }, [loadProviders])

  const cards = useMemo(
    () => buildSessionCards({ sessions, projects, providers }),
    [sessions, projects, providers],
  )

  return { cards }
}
