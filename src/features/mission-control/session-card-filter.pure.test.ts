import { describe, expect, it } from 'vitest'
import type { SessionSummary } from '@/entities/session'
import type { SessionCard } from './mission-control.types'
import { filterSessionCards } from './session-card-filter.pure'

function makeCard(
  overrides: {
    id?: string
    name?: string
    projectName?: string
    providerId?: string
    providerLabel?: string
    model?: string | null
    status?: SessionSummary['status']
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
    activityLabel = 'idle',
  } = overrides

  return {
    session: { id, name, providerId, model, status } as SessionSummary,
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

describe('filterSessionCards', () => {
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
    expect(filterSessionCards(cards, '')).toHaveLength(2)
    expect(filterSessionCards(cards, '   ')).toHaveLength(2)
  })

  it('matches on session name', () => {
    expect(
      filterSessionCards(cards, 'tunnel').map((card) => card.session.id),
    ).toEqual(['b'])
  })

  it('matches on project name', () => {
    expect(
      filterSessionCards(cards, 'emergence').map((card) => card.session.id),
    ).toEqual(['b'])
  })

  it('matches on provider id and provider label', () => {
    expect(
      filterSessionCards(cards, 'claude-code').map((card) => card.session.id),
    ).toEqual(['a'])
    expect(
      filterSessionCards(cards, 'openai').map((card) => card.session.id),
    ).toEqual(['b'])
  })

  it('matches on model', () => {
    expect(
      filterSessionCards(cards, 'gpt-5').map((card) => card.session.id),
    ).toEqual(['b'])
  })

  it('matches on status', () => {
    expect(
      filterSessionCards(cards, 'running').map((card) => card.session.id),
    ).toEqual(['b'])
  })

  it('matches on activity text', () => {
    expect(
      filterSessionCards(cards, 'bash').map((card) => card.session.id),
    ).toEqual(['b'])
  })

  it('is case-insensitive', () => {
    expect(
      filterSessionCards(cards, 'EMERGENCE').map((card) => card.session.id),
    ).toEqual(['b'])
  })

  it('requires every token of a multi-token query to match', () => {
    expect(
      filterSessionCards(cards, 'emergence bash').map(
        (card) => card.session.id,
      ),
    ).toEqual(['b'])
    expect(filterSessionCards(cards, 'emergence convergence')).toEqual([])
  })

  it('returns nothing when no card matches', () => {
    expect(filterSessionCards(cards, 'zzzz')).toEqual([])
  })

  it('does not mutate the incoming list', () => {
    const input = [...cards]
    filterSessionCards(input, 'tunnel')
    expect(input).toHaveLength(2)
  })
})
