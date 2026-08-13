import type { SessionCard } from './mission-control.types'

export const SESSION_CARD_GROUP_BLOCKED = 0
export const SESSION_CARD_GROUP_REVIEW = 1
export const SESSION_CARD_GROUP_RUNNING = 2
export const SESSION_CARD_GROUP_RESTING = 3

/**
 * Which band of the room a card belongs to. Agents that cannot move without
 * Marcin come first, then agents whose work is done and unread, then agents
 * still working, then everything at rest.
 */
export function getSessionCardGroup(card: SessionCard): number {
  switch (card.session.attention) {
    case 'needs-approval':
    case 'needs-input':
      return SESSION_CARD_GROUP_BLOCKED
    case 'failed':
    case 'finished':
      return SESSION_CARD_GROUP_REVIEW
    default:
      return card.session.status === 'running'
        ? SESSION_CARD_GROUP_RUNNING
        : SESSION_CARD_GROUP_RESTING
  }
}

/**
 * Default Mission Control ordering: attention, then running, then recency.
 * Stable — cards that tie on group and timestamp keep their incoming order.
 */
export function orderSessionCards(
  cards: readonly SessionCard[],
): SessionCard[] {
  return cards
    .map((card, index) => ({ card, index }))
    .sort((left, right) => {
      const groupDelta =
        getSessionCardGroup(left.card) - getSessionCardGroup(right.card)
      if (groupDelta !== 0) return groupDelta

      const recencyDelta =
        Date.parse(right.card.session.updatedAt) -
        Date.parse(left.card.session.updatedAt)
      if (recencyDelta !== 0 && Number.isFinite(recencyDelta)) {
        return recencyDelta
      }

      return left.index - right.index
    })
    .map((entry) => entry.card)
}
