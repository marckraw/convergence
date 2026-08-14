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
  projectIds: readonly string[]
  providerIds: readonly string[]
}

export type SessionCardFilterDimension = keyof SessionCardFilter

export const EMPTY_SESSION_CARD_FILTER: SessionCardFilter = {
  query: '',
  states: [],
  projectIds: [],
  providerIds: [],
}

/**
 * Chat Sessions belong to no Project, so they cannot be keyed by one. They
 * still have to be pickable, so they get their own key — the same bucket the
 * card's own "Convergence" project label already describes.
 */
export const GLOBAL_SESSION_PROJECT_KEY = 'global'
const UNKNOWN_SESSION_PROJECT_KEY = 'unknown'

/** The project bucket a card belongs to, for picking and grouping. */
export function getSessionCardProjectKey(card: SessionCard): string {
  if (card.session.projectId) return card.session.projectId
  return card.session.contextKind === 'global'
    ? GLOBAL_SESSION_PROJECT_KEY
    : UNKNOWN_SESSION_PROJECT_KEY
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

/**
 * One predicate per dimension, so narrowing and the facet counts that describe
 * it can never drift apart.
 */
const DIMENSION_PREDICATES: Record<
  SessionCardFilterDimension,
  (card: SessionCard, filter: SessionCardFilter) => boolean
> = {
  query: (card, filter) => matchesSessionCardQuery(card, filter.query),
  states: (card, filter) =>
    filter.states.length === 0 ||
    filter.states.includes(classifySessionCardState(card)),
  projectIds: (card, filter) =>
    filter.projectIds.length === 0 ||
    filter.projectIds.includes(getSessionCardProjectKey(card)),
  providerIds: (card, filter) =>
    filter.providerIds.length === 0 ||
    filter.providerIds.includes(card.session.providerId),
}

const DIMENSIONS = Object.keys(
  DIMENSION_PREDICATES,
) as SessionCardFilterDimension[]

/** Narrows the room to the cards that satisfy every active dimension. */
export function filterSessionCards(
  cards: readonly SessionCard[],
  filter: SessionCardFilter,
): SessionCard[] {
  return cards.filter((card) =>
    DIMENSIONS.every((dimension) =>
      DIMENSION_PREDICATES[dimension](card, filter),
    ),
  )
}

/**
 * The same narrowing with one dimension held open — what a control needs to
 * count itself honestly ("how many cards appear if I turn this one on").
 */
export function filterSessionCardsExcept(
  cards: readonly SessionCard[],
  filter: SessionCardFilter,
  except: SessionCardFilterDimension,
): SessionCard[] {
  return cards.filter((card) =>
    DIMENSIONS.every(
      (dimension) =>
        dimension === except || DIMENSION_PREDICATES[dimension](card, filter),
    ),
  )
}

/** True when the filter narrows nothing — the whole room is showing. */
export function isEmptySessionCardFilter(filter: SessionCardFilter): boolean {
  return (
    filter.query.trim() === '' &&
    filter.states.length === 0 &&
    filter.projectIds.length === 0 &&
    filter.providerIds.length === 0
  )
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

/**
 * Multi-toggle semantics for a picker option. Unlike states, project and
 * provider ids have no canonical order, so selection order is preserved.
 */
export function toggleFilterId(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((entry) => entry !== id) : [...ids, id]
}
