import type { SessionCard } from './mission-control.types'

/**
 * Card-level search: every token must appear somewhere in the card's own
 * fields (name, project, provider, model, status, activity text).
 *
 * Conversation content is deliberately not searchable here — full-text search
 * over transcripts is a separate, later engine.
 */
export function filterSessionCards(
  cards: readonly SessionCard[],
  query: string,
): SessionCard[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return [...cards]

  return cards.filter((card) =>
    tokens.every((token) => card.searchText.includes(token)),
  )
}
