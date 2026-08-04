import { describe, expect, it } from 'vitest'
import {
  describeProviderRateLimit,
  findProviderQuotaSnapshot,
} from './provider-quota.pure'
import type {
  ProviderQuotaSnapshot,
  ProviderRateLimitSignal,
} from './provider-quota.types'

const snapshots: ProviderQuotaSnapshot[] = [
  {
    providerId: 'codex',
    status: 'available',
    source: 'provider-api',
    planType: 'pro',
    windows: [],
    credits: null,
    limitReachedType: null,
    lastCheckedAt: '2026-01-02T00:00:00.000Z',
    stale: false,
  },
  {
    providerId: 'cursor',
    status: 'unavailable',
    source: 'manual',
    reason: 'Cursor quota is unavailable.',
    usageUrl: 'https://cursor.com/dashboard',
    lastCheckedAt: '2026-01-02T00:00:00.000Z',
    stale: false,
  },
]

describe('findProviderQuotaSnapshot', () => {
  it('returns the snapshot for a provider', () => {
    expect(findProviderQuotaSnapshot(snapshots, 'codex')).toBe(snapshots[0])
  })

  it('returns null when the provider snapshot is absent', () => {
    expect(findProviderQuotaSnapshot(snapshots, 'claude-code')).toBeNull()
  })
})

describe('describeProviderRateLimit', () => {
  function signal(overrides: Partial<ProviderRateLimitSignal> = {}) {
    return {
      providerAccountId: 'acct-a',
      status: 'allowed_warning',
      rateLimitType: 'seven_day',
      resetsAt: '2026-08-09T00:00:00.000Z',
      observedAt: '2026-08-04T12:00:00.000Z',
      ...overrides,
    }
  }

  it('reports nothing when the provider has said nothing', () => {
    expect(describeProviderRateLimit(null)).toBeNull()
    expect(describeProviderRateLimit(undefined)).toBeNull()
  })

  it('names the state in words, never as a percentage', () => {
    // The event carries no utilization figure. Inventing one would be
    // indistinguishable from measuring one.
    expect(
      describeProviderRateLimit(signal({ status: 'allowed' })),
    ).toMatchObject({ headline: 'Within limits', tone: 'ok' })
    expect(
      describeProviderRateLimit(signal({ status: 'allowed_warning' })),
    ).toMatchObject({ headline: 'Approaching the limit', tone: 'warning' })
    expect(
      describeProviderRateLimit(signal({ status: 'rejected' })),
    ).toMatchObject({ headline: 'Limit reached', tone: 'danger' })
  })

  it('shows an unrecognised status verbatim rather than bucketing it', () => {
    const display = describeProviderRateLimit(
      signal({ status: 'some_future_state' }),
    )

    expect(display?.headline).toBe('some_future_state')
    expect(display?.tone).toBe('neutral')
  })

  it('says which window and when it resets', () => {
    const display = describeProviderRateLimit(signal())

    expect(display?.detail).toMatch(/Seven day window/)
    expect(display?.detail).toMatch(/resets/)
  })

  it('omits what the provider did not say', () => {
    expect(
      describeProviderRateLimit(signal({ rateLimitType: null, resetsAt: null }))
        ?.detail,
    ).toBeNull()
    expect(
      describeProviderRateLimit(signal({ resetsAt: 'nonsense' }))?.detail,
    ).toBe('Seven day window')
  })
})
