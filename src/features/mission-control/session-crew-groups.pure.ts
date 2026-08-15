import type { SessionCrew } from '@/entities/session-crew'
import type { SessionCard } from './mission-control.types'

/**
 * One bordered container in the crews view: a crew and the cards of the room
 * that belong to it. The trailing group carries `crew: null` — the sessions in
 * no crew at all, so switching layouts never makes a card vanish.
 */
export interface SessionCrewGroup {
  crew: SessionCrew | null
  cards: SessionCard[]
  /**
   * Members the crew holds before any filter narrowed the room. A container
   * with members but no cards was filtered out rather than emptied, and the
   * room dims it instead of hiding it.
   */
  memberCount: number
}

export const NO_CREW_GROUP_KEY = '__no-crew__'

export function sessionCrewGroupKey(group: SessionCrewGroup): string {
  return group.crew?.id ?? NO_CREW_GROUP_KEY
}

/**
 * Lays the filtered, ordered room out by crew.
 *
 * Membership is many-to-many, so a session in three crews is rendered three
 * times — once per container, deliberately. Card order inside a container is
 * the room's own order, not the order sessions were added to the crew.
 */
export function groupSessionCardsByCrew(
  cards: readonly SessionCard[],
  crews: readonly SessionCrew[],
): SessionCrewGroup[] {
  const crewed = new Set<string>()
  for (const crew of crews) {
    for (const sessionId of crew.sessionIds) {
      crewed.add(sessionId)
    }
  }

  const groups: SessionCrewGroup[] = crews.map((crew) => {
    const members = new Set(crew.sessionIds)
    return {
      crew,
      cards: cards.filter((card) => members.has(card.session.id)),
      memberCount: crew.sessionIds.length,
    }
  })

  const loose = cards.filter((card) => !crewed.has(card.session.id))
  if (loose.length > 0) {
    groups.push({ crew: null, cards: loose, memberCount: loose.length })
  }

  return groups
}

export function formatCrewMemberCount(count: number): string {
  return `${count} session${count === 1 ? '' : 's'}`
}
