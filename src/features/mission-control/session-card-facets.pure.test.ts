import { describe, expect, it } from 'vitest'
import type { SessionSummary } from '@/entities/session'
import type { SessionCard } from './mission-control.types'
import {
  buildProjectFacets,
  buildProviderFacets,
  filterFacetOptions,
  formatFacetSummary,
} from './session-card-facets.pure'
import { EMPTY_SESSION_CARD_FILTER } from './session-card-filter.pure'
import type { SessionCardFilter } from './session-card-filter.pure'

function makeCard(overrides: {
  id: string
  projectId?: string | null
  projectName?: string
  contextKind?: SessionSummary['contextKind']
  providerId?: string
  providerLabel?: string
  status?: SessionSummary['status']
  searchText?: string
}): SessionCard {
  const {
    id,
    projectId = 'project-a',
    projectName = 'Convergence',
    contextKind = 'project',
    providerId = 'claude-code',
    providerLabel = 'Anthropic',
    status = 'idle',
    searchText = id,
  } = overrides

  return {
    session: {
      id,
      projectId,
      contextKind,
      providerId,
      status,
      attention: 'none',
      activity: null,
    } as SessionSummary,
    projectName,
    providerLabel,
    activityLabel: 'idle',
    searchText,
  }
}

function filterWith(overrides: Partial<SessionCardFilter>): SessionCardFilter {
  return { ...EMPTY_SESSION_CARD_FILTER, ...overrides }
}

const cards = [
  makeCard({ id: 'a1', projectId: 'project-a', projectName: 'Alpha' }),
  makeCard({
    id: 'a2',
    projectId: 'project-a',
    projectName: 'Alpha',
    providerId: 'codex',
    providerLabel: 'OpenAI',
  }),
  makeCard({ id: 'b1', projectId: 'project-b', projectName: 'Beta' }),
  makeCard({
    id: 'chat',
    projectId: null,
    contextKind: 'global',
    projectName: 'Convergence',
  }),
]

describe('buildProjectFacets', () => {
  it('lists every project in the room, alphabetically, with counts', () => {
    expect(buildProjectFacets(cards, EMPTY_SESSION_CARD_FILTER)).toEqual([
      { id: 'project-a', label: 'Alpha', count: 2 },
      { id: 'project-b', label: 'Beta', count: 1 },
      { id: 'global', label: 'Convergence (chats)', count: 1 },
    ])
  })

  it('names the chat bucket apart from the project of the same name', () => {
    const withRealConvergence = [
      ...cards,
      makeCard({
        id: 'repo',
        projectId: 'project-convergence',
        projectName: 'Convergence',
      }),
    ]
    const facets = buildProjectFacets(
      withRealConvergence,
      EMPTY_SESSION_CARD_FILTER,
    )

    expect(facets.map((facet) => facet.label)).toEqual([
      'Alpha',
      'Beta',
      'Convergence',
      'Convergence (chats)',
    ])
  })

  it('holds its own dimension open when counting', () => {
    const facets = buildProjectFacets(
      cards,
      filterWith({ projectIds: ['project-b'] }),
    )

    // Alpha still shows 2 — that is what picking it would reveal.
    expect(facets.map((facet) => facet.count)).toEqual([2, 1, 1])
  })

  it('counts through the other dimensions', () => {
    const facets = buildProjectFacets(
      cards,
      filterWith({ providerIds: ['codex'] }),
    )

    expect(facets).toEqual([
      { id: 'project-a', label: 'Alpha', count: 1 },
      { id: 'project-b', label: 'Beta', count: 0 },
      { id: 'global', label: 'Convergence (chats)', count: 0 },
    ])
  })

  it('keeps an option listed even when nothing matches it', () => {
    const facets = buildProjectFacets(cards, filterWith({ query: 'a1' }))

    expect(facets.map((facet) => facet.id)).toEqual([
      'project-a',
      'project-b',
      'global',
    ])
  })

  it('returns nothing for an empty room', () => {
    expect(buildProjectFacets([], EMPTY_SESSION_CARD_FILTER)).toEqual([])
  })
})

describe('buildProviderFacets', () => {
  it('lists every provider in the room with counts', () => {
    expect(buildProviderFacets(cards, EMPTY_SESSION_CARD_FILTER)).toEqual([
      { id: 'claude-code', label: 'Anthropic', count: 3 },
      { id: 'codex', label: 'OpenAI', count: 1 },
    ])
  })

  it('holds its own dimension open when counting', () => {
    const facets = buildProviderFacets(
      cards,
      filterWith({ providerIds: ['codex'] }),
    )

    expect(facets).toEqual([
      { id: 'claude-code', label: 'Anthropic', count: 3 },
      { id: 'codex', label: 'OpenAI', count: 1 },
    ])
  })

  it('counts through the project dimension', () => {
    const facets = buildProviderFacets(
      cards,
      filterWith({ projectIds: ['project-b'] }),
    )

    expect(facets).toEqual([
      { id: 'claude-code', label: 'Anthropic', count: 1 },
      { id: 'codex', label: 'OpenAI', count: 0 },
    ])
  })
})

describe('filterFacetOptions', () => {
  const options = [
    { id: 'a', label: 'Backpack', count: 3 },
    { id: 'b', label: 'backpack-sb-plugins-react', count: 15 },
    { id: 'c', label: 'Convergence', count: 25 },
  ]

  it('returns every option for an empty or whitespace query', () => {
    expect(filterFacetOptions(options, '')).toHaveLength(3)
    expect(filterFacetOptions(options, '   ')).toHaveLength(3)
  })

  it('matches labels case-insensitively', () => {
    expect(filterFacetOptions(options, 'BACKPACK').map((o) => o.id)).toEqual([
      'a',
      'b',
    ])
  })

  it('requires every token to match', () => {
    expect(
      filterFacetOptions(options, 'backpack react').map((o) => o.id),
    ).toEqual(['b'])
  })

  it('returns nothing when no label matches', () => {
    expect(filterFacetOptions(options, 'zzz')).toEqual([])
  })

  it('does not mutate the incoming options', () => {
    const input = [...options]
    filterFacetOptions(input, 'backpack')
    expect(input).toHaveLength(3)
  })
})

describe('formatFacetSummary', () => {
  const options = [
    { id: 'project-a', label: 'Alpha', count: 2 },
    { id: 'project-b', label: 'Beta', count: 1 },
  ]

  it('says the all-label when nothing is picked', () => {
    expect(formatFacetSummary([], options, 'All projects', 'project')).toBe(
      'All projects',
    )
  })

  it('names the one pick', () => {
    expect(
      formatFacetSummary(['project-b'], options, 'All projects', 'project'),
    ).toBe('Beta')
  })

  it('counts several picks', () => {
    expect(
      formatFacetSummary(
        ['project-a', 'project-b'],
        options,
        'All projects',
        'project',
      ),
    ).toBe('2 projects')
  })

  it('falls back to a count when the one pick is no longer in the room', () => {
    expect(
      formatFacetSummary(['gone'], options, 'All projects', 'project'),
    ).toBe('1 project')
  })
})
