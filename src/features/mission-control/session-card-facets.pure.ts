import type { SessionCard } from './mission-control.types'
import {
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
  return buildFacet(cards, filter, 'projectIds', (card) => ({
    id: getSessionCardProjectKey(card),
    label: card.projectName,
  }))
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
