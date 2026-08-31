import type { SessionCrew } from '@/entities/session-crew'
import type { SessionCard } from './mission-control.types'
import {
  GLOBAL_SESSION_PROJECT_KEY,
  filterSessionCardsExcept,
  getSessionCardProjectKey,
} from './session-card-filter.pure'
import type { SessionCardFilter } from './session-card-filter.pure'

/** One option in a picker: what it is called, and how many cards it holds. */
export interface SessionCardFacetOption {
  id: string
  label: string
  count: number
}

/** A crew option, carrying the decoration its chip is tinted with. */
export interface SessionCardCrewFacetOption extends SessionCardFacetOption {
  emoji: string | null
  accentColor: string | null
}

function buildFacet(
  cards: readonly SessionCard[],
  filter: SessionCardFilter,
  dimension: 'projectIds' | 'providerIds',
  read: (card: SessionCard) => { id: string; label: string },
): SessionCardFacetOption[] {
  // Options come from the whole room so a picker never loses an entry, while
  // counts hold this dimension open — the same honesty the state chips use.
  const labelById = new Map<string, string>()
  for (const card of cards) {
    const { id, label } = read(card)
    if (!labelById.has(id)) labelById.set(id, label)
  }

  const counts = new Map<string, number>()
  for (const card of filterSessionCardsExcept(cards, filter, dimension)) {
    const { id } = read(card)
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }

  return [...labelById.entries()]
    .map(([id, label]) => ({ id, label, count: counts.get(id) ?? 0 }))
    .sort((left, right) =>
      left.label.localeCompare(right.label, undefined, { sensitivity: 'base' }),
    )
}

/** The project picker's options, counted with the project dimension held open. */
export function buildProjectFacets(
  cards: readonly SessionCard[],
  filter: SessionCardFilter,
): SessionCardFacetOption[] {
  return buildFacet(cards, filter, 'projectIds', (card) => {
    const id = getSessionCardProjectKey(card)
    return {
      id,
      // Chat Sessions carry the app's own name, which collides with the real
      // Convergence repository in a list of projects. Say which one it is.
      label:
        id === GLOBAL_SESSION_PROJECT_KEY
          ? `${card.projectName} (chats)`
          : card.projectName,
    }
  })
}

/** The provider picker's options, counted with the provider dimension held open. */
export function buildProviderFacets(
  cards: readonly SessionCard[],
  filter: SessionCardFilter,
): SessionCardFacetOption[] {
  return buildFacet(cards, filter, 'providerIds', (card) => ({
    id: card.session.providerId,
    label: card.providerLabel,
  }))
}

/**
 * The crew chips' options, counted with the crew dimension held open.
 *
 * Options come from the crew list rather than from the cards, so a crew with no
 * members is still offered — an empty crew is legal, and a chip that vanishes
 * when its last session leaves would be a control that hides itself.
 */
export function buildCrewFacets(
  cards: readonly SessionCard[],
  filter: SessionCardFilter,
  crews: readonly SessionCrew[],
): SessionCardCrewFacetOption[] {
  const counts = new Map<string, number>()
  for (const card of filterSessionCardsExcept(cards, filter, 'crewIds')) {
    for (const crew of card.crews) {
      counts.set(crew.id, (counts.get(crew.id) ?? 0) + 1)
    }
  }

  return crews.map((crew) => ({
    id: crew.id,
    label: crew.name,
    count: counts.get(crew.id) ?? 0,
    emoji: crew.emoji,
    accentColor: crew.accentColor,
  }))
}

/**
 * Narrows a picker's options as Marcin types. Substring, case-insensitive,
 * every token — the same forgiving shape as card search.
 */
export function filterFacetOptions(
  options: readonly SessionCardFacetOption[],
  query: string,
): SessionCardFacetOption[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return [...options]

  return options.filter((option) => {
    const label = option.label.toLowerCase()
    return tokens.every((token) => label.includes(token))
  })
}

/** What a picker's trigger says: "All projects", one name, or a count. */
export function formatFacetSummary(
  selected: readonly string[],
  options: readonly SessionCardFacetOption[],
  allLabel: string,
  noun: string,
): string {
  if (selected.length === 0) return allLabel
  if (selected.length === 1) {
    const option = options.find((entry) => entry.id === selected[0])
    if (option) return option.label
  }
  return `${selected.length} ${noun}${selected.length === 1 ? '' : 's'}`
}
