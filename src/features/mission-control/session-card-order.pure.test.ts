import { describe, expect, it } from 'vitest'
import type { SessionSummary } from '@/entities/session'
import type { SessionCard } from './mission-control.types'
import {
  SESSION_CARD_GROUP_BLOCKED,
  SESSION_CARD_GROUP_RESTING,
  SESSION_CARD_GROUP_REVIEW,
  SESSION_CARD_GROUP_RUNNING,
  getSessionCardGroup,
  orderSessionCards,
} from './session-card-order.pure'

function makeCard(
  id: string,
  overrides: {
    status?: SessionSummary['status']
    attention?: SessionSummary['attention']
    updatedAt?: string
  } = {},
): SessionCard {
  const {
    status = 'idle',
    attention = 'none',
    updatedAt = '2026-08-13T10:00:00.000Z',
  } = overrides

  return {
    session: { id, status, attention, updatedAt } as SessionSummary,
    projectName: 'Convergence',
    providerLabel: 'Anthropic',
    activityLabel: 'idle',
    searchText: id,
  }
}

describe('getSessionCardGroup', () => {
  it('puts sessions blocked on a human first', () => {
    expect(
      getSessionCardGroup(makeCard('a', { attention: 'needs-approval' })),
    ).toBe(SESSION_CARD_GROUP_BLOCKED)
    expect(
      getSessionCardGroup(makeCard('b', { attention: 'needs-input' })),
    ).toBe(SESSION_CARD_GROUP_BLOCKED)
  })

  it('puts finished and failed work in the review band', () => {
    expect(getSessionCardGroup(makeCard('a', { attention: 'finished' }))).toBe(
      SESSION_CARD_GROUP_REVIEW,
    )
    expect(getSessionCardGroup(makeCard('b', { attention: 'failed' }))).toBe(
      SESSION_CARD_GROUP_REVIEW,
    )
  })

  it('puts still-working agents after the ones that need a human', () => {
    expect(getSessionCardGroup(makeCard('a', { status: 'running' }))).toBe(
      SESSION_CARD_GROUP_RUNNING,
    )
  })

  it('puts everything at rest last', () => {
    expect(getSessionCardGroup(makeCard('a', { status: 'idle' }))).toBe(
      SESSION_CARD_GROUP_RESTING,
    )
    expect(getSessionCardGroup(makeCard('b', { status: 'completed' }))).toBe(
      SESSION_CARD_GROUP_RESTING,
    )
  })
})

describe('orderSessionCards', () => {
  it('orders attention before running before resting', () => {
    const ordered = orderSessionCards([
      makeCard('resting'),
      makeCard('running', { status: 'running' }),
      makeCard('review', { attention: 'finished' }),
      makeCard('blocked', { attention: 'needs-approval' }),
    ])

    expect(ordered.map((card) => card.session.id)).toEqual([
      'blocked',
      'review',
      'running',
      'resting',
    ])
  })

  it('orders by recency within a group', () => {
    const ordered = orderSessionCards([
      makeCard('older', { updatedAt: '2026-08-13T09:00:00.000Z' }),
      makeCard('newest', { updatedAt: '2026-08-13T12:00:00.000Z' }),
      makeCard('middle', { updatedAt: '2026-08-13T10:00:00.000Z' }),
    ])

    expect(ordered.map((card) => card.session.id)).toEqual([
      'newest',
      'middle',
      'older',
    ])
  })

  it('keeps recency subordinate to group', () => {
    const ordered = orderSessionCards([
      makeCard('fresh-idle', { updatedAt: '2026-08-13T23:00:00.000Z' }),
      makeCard('stale-blocked', {
        attention: 'needs-input',
        updatedAt: '2026-08-01T00:00:00.000Z',
      }),
    ])

    expect(ordered.map((card) => card.session.id)).toEqual([
      'stale-blocked',
      'fresh-idle',
    ])
  })

  it('is stable for cards that tie on group and timestamp', () => {
    const ordered = orderSessionCards([
      makeCard('first'),
      makeCard('second'),
      makeCard('third'),
    ])

    expect(ordered.map((card) => card.session.id)).toEqual([
      'first',
      'second',
      'third',
    ])
  })

  it('does not mutate the incoming list', () => {
    const input = [
      makeCard('resting'),
      makeCard('blocked', { attention: 'needs-approval' }),
    ]
    orderSessionCards(input)

    expect(input.map((card) => card.session.id)).toEqual(['resting', 'blocked'])
  })
})
