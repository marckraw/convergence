import { describe, expect, it } from 'vitest'
import type { SessionSummary } from '@/entities/session'
import type { SessionCard } from './mission-control.types'
import {
  SESSION_CARD_GROUP_BLOCKED,
  SESSION_CARD_GROUP_RESTING,
  SESSION_CARD_GROUP_REVIEW,
  SESSION_CARD_GROUP_RUNNING,
  SESSION_CARD_ORDER_PRESETS,
  formatSessionCardOrderPreset,
  getSessionCardGroup,
  orderSessionCards,
} from './session-card-order.pure'

function makeCard(
  id: string,
  overrides: {
    status?: SessionSummary['status']
    attention?: SessionSummary['attention']
    activity?: SessionSummary['activity']
    updatedAt?: string
    projectName?: string
  } = {},
): SessionCard {
  const {
    status = 'idle',
    attention = 'none',
    activity = null,
    updatedAt = '2026-08-13T10:00:00.000Z',
    projectName = 'Convergence',
  } = overrides

  return {
    session: { id, status, attention, activity, updatedAt } as SessionSummary,
    projectName,
    providerLabel: 'Anthropic',
    activityLabel: 'idle',
    crews: [],
    searchText: id,
  }
}

const ids = (cards: readonly SessionCard[]): string[] =>
  cards.map((card) => card.session.id)

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

    expect(ids(ordered)).toEqual(['blocked', 'review', 'running', 'resting'])
  })

  it('orders by recency within a group', () => {
    const ordered = orderSessionCards([
      makeCard('older', { updatedAt: '2026-08-13T09:00:00.000Z' }),
      makeCard('newest', { updatedAt: '2026-08-13T12:00:00.000Z' }),
      makeCard('middle', { updatedAt: '2026-08-13T10:00:00.000Z' }),
    ])

    expect(ids(ordered)).toEqual(['newest', 'middle', 'older'])
  })

  it('keeps recency subordinate to group', () => {
    const ordered = orderSessionCards([
      makeCard('fresh-idle', { updatedAt: '2026-08-13T23:00:00.000Z' }),
      makeCard('stale-blocked', {
        attention: 'needs-input',
        updatedAt: '2026-08-01T00:00:00.000Z',
      }),
    ])

    expect(ids(ordered)).toEqual(['stale-blocked', 'fresh-idle'])
  })

  it('is stable for cards that tie on group and timestamp', () => {
    const ordered = orderSessionCards([
      makeCard('first'),
      makeCard('second'),
      makeCard('third'),
    ])

    expect(ids(ordered)).toEqual(['first', 'second', 'third'])
  })

  it('does not mutate the incoming list', () => {
    const input = [
      makeCard('resting'),
      makeCard('blocked', { attention: 'needs-approval' }),
    ]
    orderSessionCards(input)

    expect(ids(input)).toEqual(['resting', 'blocked'])
  })

  it('defaults to the attention-first preset', () => {
    const cards = [
      makeCard('running', { status: 'running' }),
      makeCard('blocked', { attention: 'needs-input' }),
    ]

    expect(ids(orderSessionCards(cards))).toEqual(
      ids(orderSessionCards(cards, 'attention-first')),
    )
  })

  it('keeps every preset total and stable on an all-identical list', () => {
    const cards = [makeCard('a'), makeCard('b'), makeCard('c')]

    for (const preset of SESSION_CARD_ORDER_PRESETS) {
      expect(ids(orderSessionCards(cards, preset))).toEqual(['a', 'b', 'c'])
    }
  })

  it('returns every card it was given under every preset', () => {
    const cards = [
      makeCard('blocked', { attention: 'needs-approval' }),
      makeCard('working', { status: 'running' }),
      makeCard('finished', { attention: 'finished' }),
      makeCard('failed', { attention: 'failed' }),
      makeCard('idle'),
    ]

    for (const preset of SESSION_CARD_ORDER_PRESETS) {
      expect(ids(orderSessionCards(cards, preset)).sort()).toEqual(
        ids(cards).sort(),
      )
    }
  })
})

describe('orderSessionCards · working-first', () => {
  it('puts agents that are moving above every other state', () => {
    const ordered = orderSessionCards(
      [
        makeCard('idle'),
        makeCard('finished', { attention: 'finished' }),
        makeCard('failed', { attention: 'failed' }),
        makeCard('blocked', { attention: 'needs-input' }),
        makeCard('working', { status: 'running' }),
      ],
      'working-first',
    )

    expect(ids(ordered)).toEqual([
      'working',
      'blocked',
      'failed',
      'finished',
      'idle',
    ])
  })

  it('counts a streaming session as working even when its status lags', () => {
    const ordered = orderSessionCards(
      [
        makeCard('blocked', { attention: 'needs-approval' }),
        makeCard('streaming', { status: 'idle', activity: 'streaming' }),
      ],
      'working-first',
    )

    expect(ids(ordered)).toEqual(['streaming', 'blocked'])
  })

  it('orders by recency inside a state band', () => {
    const ordered = orderSessionCards(
      [
        makeCard('older', {
          status: 'running',
          updatedAt: '2026-08-13T09:00:00.000Z',
        }),
        makeCard('newer', {
          status: 'running',
          updatedAt: '2026-08-13T12:00:00.000Z',
        }),
      ],
      'working-first',
    )

    expect(ids(ordered)).toEqual(['newer', 'older'])
  })
})

describe('orderSessionCards · recent-first', () => {
  it('ignores state entirely and sorts by last update', () => {
    const ordered = orderSessionCards(
      [
        makeCard('blocked', {
          attention: 'needs-approval',
          updatedAt: '2026-08-13T09:00:00.000Z',
        }),
        makeCard('idle', { updatedAt: '2026-08-13T12:00:00.000Z' }),
        makeCard('working', {
          status: 'running',
          updatedAt: '2026-08-13T10:00:00.000Z',
        }),
      ],
      'recent-first',
    )

    expect(ids(ordered)).toEqual(['idle', 'working', 'blocked'])
  })

  it('keeps the incoming order for identical timestamps', () => {
    const ordered = orderSessionCards(
      [makeCard('first', { attention: 'needs-input' }), makeCard('second')],
      'recent-first',
    )

    expect(ids(ordered)).toEqual(['first', 'second'])
  })
})

describe('orderSessionCards · by-project', () => {
  it('groups cards by project name, alphabetically and case-insensitively', () => {
    const ordered = orderSessionCards(
      [
        makeCard('zeta', { projectName: 'Zeta' }),
        makeCard('alpha', { projectName: 'alpha' }),
        makeCard('mid', { projectName: 'Middle' }),
      ],
      'by-project',
    )

    expect(ids(ordered)).toEqual(['alpha', 'mid', 'zeta'])
  })

  it('keeps attention order inside each project', () => {
    const ordered = orderSessionCards(
      [
        makeCard('a-idle', { projectName: 'Alpha' }),
        makeCard('b-blocked', {
          projectName: 'Beta',
          attention: 'needs-input',
        }),
        makeCard('a-blocked', {
          projectName: 'Alpha',
          attention: 'needs-approval',
        }),
        makeCard('b-idle', { projectName: 'Beta' }),
      ],
      'by-project',
    )

    expect(ids(ordered)).toEqual(['a-blocked', 'a-idle', 'b-blocked', 'b-idle'])
  })

  it('orders by recency inside a project band', () => {
    const ordered = orderSessionCards(
      [
        makeCard('older', {
          projectName: 'Alpha',
          updatedAt: '2026-08-13T09:00:00.000Z',
        }),
        makeCard('newer', {
          projectName: 'Alpha',
          updatedAt: '2026-08-13T12:00:00.000Z',
        }),
      ],
      'by-project',
    )

    expect(ids(ordered)).toEqual(['newer', 'older'])
  })
})

describe('formatSessionCardOrderPreset', () => {
  it('labels every preset', () => {
    expect(
      SESSION_CARD_ORDER_PRESETS.map(formatSessionCardOrderPreset),
    ).toEqual([
      'Attention first',
      'Working first',
      'Recent first',
      'By project',
    ])
  })
})
