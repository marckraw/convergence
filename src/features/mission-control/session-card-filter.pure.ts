import type { SessionCard } from './mission-control.types'
import {
  SESSION_CARD_STATES,
  classifySessionCardState,
} from './session-card-state.pure'
import type { SessionCardState } from './session-card-state.pure'

/**
 * Everything Marcin has narrowed the room by, in one value.
 *
 * Each dimension is independent and additive: a card must satisfy all of them.
 * An empty dimension means "don't narrow by this" — so the empty filter shows
 * the whole room, which is Mission Control's default.
 */
export interface SessionCardFilter {
  query: string
  states: readonly SessionCardState[]
}

export const EMPTY_SESSION_CARD_FILTER: SessionCardFilter = {
  query: '',
  states: [],
}

/**
 * Card-level search: every token must appear somewhere in the card's own
 * fields (name, project, provider, model, status, activity text).
 *
 * Conversation content is deliberately not searchable here — full-text search
 * over transcripts is a separate, later engine.
 */
export function matchesSessionCardQuery(
  card: SessionCard,
  query: string,
): boolean {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return tokens.every((token) => card.searchText.includes(token))
}

/** Narrows the room to the cards that satisfy every active dimension. */
export function filterSessionCards(
  cards: readonly SessionCard[],
  filter: SessionCardFilter,
): SessionCard[] {
  return cards.filter(
    (card) =>
      matchesSessionCardQuery(card, filter.query) &&
      (filter.states.length === 0 ||
        filter.states.includes(classifySessionCardState(card))),
  )
}

/** True when the filter narrows nothing — the whole room is showing. */
export function isEmptySessionCardFilter(filter: SessionCardFilter): boolean {
  return filter.query.trim() === '' && filter.states.length === 0
}

/**
 * Multi-toggle semantics for one state chip: on turns it into a constraint,
 * off removes it. Order is kept canonical so two equal selections are equal.
 */
export function toggleSessionCardState(
  states: readonly SessionCardState[],
  state: SessionCardState,
): SessionCardState[] {
  const next = states.includes(state)
    ? states.filter((entry) => entry !== state)
    : [...states, state]

  return SESSION_CARD_STATES.filter((entry) => next.includes(entry))
}
