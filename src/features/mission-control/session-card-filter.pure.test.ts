import { describe, expect, it } from 'vitest'
import type { SessionSummary } from '@/entities/session'
import type { SessionCard } from './mission-control.types'
import {
  EMPTY_SESSION_CARD_FILTER,
  filterSessionCards,
  isEmptySessionCardFilter,
  matchesSessionCardQuery,
  toggleSessionCardState,
} from './session-card-filter.pure'
import type { SessionCardFilter } from './session-card-filter.pure'
import { SESSION_CARD_STATES } from './session-card-state.pure'
import type { SessionCardState } from './session-card-state.pure'

function makeCard(
  overrides: {
    id?: string
    name?: string
    projectName?: string
    providerId?: string
    providerLabel?: string
    model?: string | null
    status?: SessionSummary['status']
    attention?: SessionSummary['attention']
    activity?: SessionSummary['activity']
    activityLabel?: string
  } = {},
): SessionCard {
  const {
    id = 'session-1',
    name = 'Wire the room',
    projectName = 'Convergence',
    providerId = 'claude-code',
    providerLabel = 'Anthropic',
    model = 'claude-opus-5',
    status = 'idle',
    attention = 'none',
    activity = null,
    activityLabel = 'idle',
  } = overrides

  return {
    session: {
      id,
      name,
      providerId,
      model,
      status,
      attention,
      activity,
    } as SessionSummary,
    projectName,
    providerLabel,
    activityLabel,
    searchText: [
      name,
      projectName,
      providerId,
      providerLabel,
      model ?? '',
      status,
      activityLabel,
    ]
      .join(' ')
      .toLowerCase(),
  }
}

function withQuery(query: string): SessionCardFilter {
  return { ...EMPTY_SESSION_CARD_FILTER, query }
}

function withStates(...states: SessionCardState[]): SessionCardFilter {
  return { ...EMPTY_SESSION_CARD_FILTER, states }
}

const ids = (cards: readonly SessionCard[]): string[] =>
  cards.map((card) => card.session.id)

describe('filterSessionCards · query', () => {
  const cards = [
    makeCard({ id: 'a', name: 'Wire the room', projectName: 'Convergence' }),
    makeCard({
      id: 'b',
      name: 'Fix the tunnel',
      projectName: 'Emergence',
      providerId: 'codex',
      providerLabel: 'OpenAI',
      model: 'gpt-5',
      status: 'running',
      activityLabel: 'running tool: Bash',
    }),
  ]

  it('returns every card for an empty or whitespace query', () => {
    expect(filterSessionCards(cards, withQuery(''))).toHaveLength(2)
    expect(filterSessionCards(cards, withQuery('   '))).toHaveLength(2)
  })

  it('returns every card for the empty filter', () => {
    expect(filterSessionCards(cards, EMPTY_SESSION_CARD_FILTER)).toHaveLength(2)
  })

  it('matches on session name', () => {
    expect(ids(filterSessionCards(cards, withQuery('tunnel')))).toEqual(['b'])
  })

  it('matches on project name', () => {
    expect(ids(filterSessionCards(cards, withQuery('emergence')))).toEqual([
      'b',
    ])
  })

  it('matches on provider id and provider label', () => {
    expect(ids(filterSessionCards(cards, withQuery('claude-code')))).toEqual([
      'a',
    ])
    expect(ids(filterSessionCards(cards, withQuery('openai')))).toEqual(['b'])
  })

  it('matches on model', () => {
    expect(ids(filterSessionCards(cards, withQuery('gpt-5')))).toEqual(['b'])
  })

  it('matches on status', () => {
    expect(ids(filterSessionCards(cards, withQuery('running')))).toEqual(['b'])
  })

  it('matches on activity text', () => {
    expect(ids(filterSessionCards(cards, withQuery('bash')))).toEqual(['b'])
  })

  it('is case-insensitive', () => {
    expect(ids(filterSessionCards(cards, withQuery('EMERGENCE')))).toEqual([
      'b',
    ])
  })

  it('requires every token of a multi-token query to match', () => {
    expect(ids(filterSessionCards(cards, withQuery('emergence bash')))).toEqual(
      ['b'],
    )
    expect(
      filterSessionCards(cards, withQuery('emergence convergence')),
    ).toEqual([])
  })

  it('returns nothing when no card matches', () => {
    expect(filterSessionCards(cards, withQuery('zzzz'))).toEqual([])
  })

  it('does not mutate the incoming list', () => {
    const input = [...cards]
    filterSessionCards(input, withQuery('tunnel'))
    expect(input).toHaveLength(2)
  })
})

describe('matchesSessionCardQuery', () => {
  const card = makeCard({ name: 'Wire the room', projectName: 'Convergence' })

  it('matches every card on an empty or whitespace query', () => {
    expect(matchesSessionCardQuery(card, '')).toBe(true)
    expect(matchesSessionCardQuery(card, '   ')).toBe(true)
  })

  it('matches on any card field, case-insensitively', () => {
    expect(matchesSessionCardQuery(card, 'WIRE')).toBe(true)
    expect(matchesSessionCardQuery(card, 'convergence')).toBe(true)
    expect(matchesSessionCardQuery(card, 'claude-opus-5')).toBe(true)
  })

  it('requires every token to match', () => {
    expect(matchesSessionCardQuery(card, 'wire convergence')).toBe(true)
    expect(matchesSessionCardQuery(card, 'wire emergence')).toBe(false)
  })

  it('ignores the card state — that is the chips job', () => {
    const working = makeCard({ status: 'running' })
    expect(matchesSessionCardQuery(working, 'wire')).toBe(true)
  })
})

describe('filterSessionCards · states', () => {
  const cards = [
    makeCard({ id: 'working', status: 'running' }),
    makeCard({ id: 'blocked', attention: 'needs-approval' }),
    makeCard({ id: 'asked', attention: 'needs-input' }),
    makeCard({ id: 'finished', status: 'completed', attention: 'finished' }),
    makeCard({ id: 'failed', status: 'failed', attention: 'failed' }),
    makeCard({ id: 'idle' }),
  ]

  it('shows the whole room when no state is selected', () => {
    expect(filterSessionCards(cards, withStates())).toHaveLength(cards.length)
  })

  it('narrows to a single selected state', () => {
    expect(ids(filterSessionCards(cards, withStates('working')))).toEqual([
      'working',
    ])
    expect(ids(filterSessionCards(cards, withStates('needs-you')))).toEqual([
      'blocked',
      'asked',
    ])
    expect(ids(filterSessionCards(cards, withStates('idle')))).toEqual(['idle'])
    expect(ids(filterSessionCards(cards, withStates('finished')))).toEqual([
      'finished',
    ])
    expect(ids(filterSessionCards(cards, withStates('failed')))).toEqual([
      'failed',
    ])
  })

  it('unions the selected states', () => {
    expect(
      ids(filterSessionCards(cards, withStates('working', 'failed'))),
    ).toEqual(['working', 'failed'])
  })

  it('shows every card when every state is selected', () => {
    expect(
      filterSessionCards(cards, withStates(...SESSION_CARD_STATES)),
    ).toHaveLength(cards.length)
  })

  it('keeps the incoming order', () => {
    expect(
      ids(filterSessionCards(cards, withStates('idle', 'working'))),
    ).toEqual(['working', 'idle'])
  })
})

describe('filterSessionCards · composition', () => {
  const cards = [
    makeCard({
      id: 'convergence-working',
      projectName: 'Convergence',
      status: 'running',
    }),
    makeCard({
      id: 'convergence-idle',
      projectName: 'Convergence',
    }),
    makeCard({
      id: 'emergence-working',
      projectName: 'Emergence',
      status: 'running',
    }),
  ]

  it('applies query and states together', () => {
    expect(
      ids(
        filterSessionCards(cards, {
          query: 'convergence',
          states: ['working'],
        }),
      ),
    ).toEqual(['convergence-working'])
  })

  it('returns nothing when the two dimensions disagree', () => {
    expect(
      filterSessionCards(cards, { query: 'emergence', states: ['idle'] }),
    ).toEqual([])
  })
})

describe('isEmptySessionCardFilter', () => {
  it('is true for the empty filter and for whitespace', () => {
    expect(isEmptySessionCardFilter(EMPTY_SESSION_CARD_FILTER)).toBe(true)
    expect(isEmptySessionCardFilter(withQuery('  '))).toBe(true)
  })

  it('is false once any dimension narrows', () => {
    expect(isEmptySessionCardFilter(withQuery('room'))).toBe(false)
    expect(isEmptySessionCardFilter(withStates('working'))).toBe(false)
  })
})

describe('toggleSessionCardState', () => {
  it('adds a state that was off', () => {
    expect(toggleSessionCardState([], 'working')).toEqual(['working'])
  })

  it('removes a state that was on', () => {
    expect(toggleSessionCardState(['working', 'idle'], 'working')).toEqual([
      'idle',
    ])
  })

  it('keeps the canonical state order however chips are clicked', () => {
    const clickedBackwards = toggleSessionCardState(
      toggleSessionCardState(['failed'], 'idle'),
      'working',
    )

    expect(clickedBackwards).toEqual(['working', 'idle', 'failed'])
  })

  it('does not mutate the incoming selection', () => {
    const states: SessionCardState[] = ['working']
    toggleSessionCardState(states, 'idle')
    expect(states).toEqual(['working'])
  })
})
