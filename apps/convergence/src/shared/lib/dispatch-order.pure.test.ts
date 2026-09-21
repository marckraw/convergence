import { describe, expect, it } from 'vitest'
import { dispatchQueueCompare } from './dispatch-order.pure'

describe('dispatchQueueCompare', () => {
  it('orders priority before first dispatch, with zero and null together last', () => {
    const values = [
      { identifier: 'MAR-3', priority: 3, firstSeenAt: '2026-09-21T01:00:00Z' },
      { identifier: 'MAR-4', priority: 1, firstSeenAt: '2026-09-21T04:00:00Z' },
      { identifier: 'MAR-0', priority: 0, firstSeenAt: '2026-09-21T00:00:00Z' },
      { identifier: 'MAR-2', priority: 1, firstSeenAt: '2026-09-21T02:00:00Z' },
      {
        identifier: 'MAR-5',
        priority: null,
        firstSeenAt: '2026-09-21T00:00:00Z',
      },
    ]
    expect(
      values.sort(dispatchQueueCompare).map((value) => value.identifier),
    ).toEqual(['MAR-2', 'MAR-4', 'MAR-3', 'MAR-0', 'MAR-5'])
  })
  it('uses numeric identifiers when priority and first-seen tie', () => {
    expect(
      [{ identifier: 'MAR-1000' }, { identifier: 'MAR-999' }]
        .sort(dispatchQueueCompare)
        .map((value) => value.identifier),
    ).toEqual(['MAR-999', 'MAR-1000'])
  })
  it('unknown first-seen follows a known observation at the same priority', () => {
    expect(
      dispatchQueueCompare(
        { identifier: 'MAR-1', priority: 1 },
        {
          identifier: 'MAR-2',
          priority: 1,
          firstSeenAt: '2026-09-21T00:00:00Z',
        },
      ),
    ).toBeGreaterThan(0)
  })
  it('identifiers without numbers follow numbered identifiers and compare as text', () => {
    expect(
      [{ identifier: 'beta' }, { identifier: 'MAR-2' }, { identifier: 'alpha' }]
        .sort(dispatchQueueCompare)
        .map((value) => value.identifier),
    ).toEqual(['MAR-2', 'alpha', 'beta'])
  })
})
