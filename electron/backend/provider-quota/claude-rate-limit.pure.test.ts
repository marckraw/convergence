import { describe, expect, it } from 'vitest'
import {
  isRateLimitSignalExpired,
  parseClaudeRateLimitEvent,
  providerQuotaAccountKey,
  PROVIDER_QUOTA_AMBIENT_ACCOUNT_KEY,
} from './claude-rate-limit.pure'

describe('providerQuotaAccountKey', () => {
  it('keys by host and account together, never by either alone', () => {
    // The same account id means nothing on a different host, and two accounts
    // on one host must never read each other's limits.
    expect(
      providerQuotaAccountKey({
        executionHostId: 'local',
        providerAccountId: 'acct-a',
      }),
    ).toBe('local::acct-a')
    expect(
      providerQuotaAccountKey({
        executionHostId: 'remote',
        providerAccountId: 'acct-a',
      }),
    ).not.toBe(
      providerQuotaAccountKey({
        executionHostId: 'local',
        providerAccountId: 'acct-a',
      }),
    )
    expect(
      providerQuotaAccountKey({
        executionHostId: 'local',
        providerAccountId: 'acct-b',
      }),
    ).not.toBe(
      providerQuotaAccountKey({
        executionHostId: 'local',
        providerAccountId: 'acct-a',
      }),
    )
  })

  it('gives the ambient default a key of its own', () => {
    expect(
      providerQuotaAccountKey({
        executionHostId: 'local',
        providerAccountId: null,
      }),
    ).toBe(`local::${PROVIDER_QUOTA_AMBIENT_ACCOUNT_KEY}`)
  })
})

describe('parseClaudeRateLimitEvent', () => {
  it('reads the state, the window and the reset time', () => {
    expect(
      parseClaudeRateLimitEvent({
        type: 'rate_limit_event',
        status: 'allowed_warning',
        rateLimitType: 'five_hour',
        resetsAt: '2026-08-04T18:00:00.000Z',
      }),
    ).toEqual({
      status: 'allowed_warning',
      rateLimitType: 'five_hour',
      resetsAt: '2026-08-04T18:00:00.000Z',
    })
  })

  it('reads a snake_case payload too', () => {
    expect(
      parseClaudeRateLimitEvent({
        status: 'rejected',
        rate_limit_type: 'seven_day',
        resets_at: '2026-08-09T00:00:00.000Z',
      }),
    ).toEqual({
      status: 'rejected',
      rateLimitType: 'seven_day',
      resetsAt: '2026-08-09T00:00:00.000Z',
    })
  })

  it('reads a nested payload without needing to know which shape shipped', () => {
    expect(
      parseClaudeRateLimitEvent({
        type: 'rate_limit_event',
        rate_limit_event: { status: 'allowed', rateLimitType: 'five_hour' },
      })?.status,
    ).toBe('allowed')
  })

  it('reads epoch seconds and epoch milliseconds alike', () => {
    const seconds = parseClaudeRateLimitEvent({
      status: 'rejected',
      resetsAt: 1_785_000_000,
    })
    const millis = parseClaudeRateLimitEvent({
      status: 'rejected',
      resetsAt: 1_785_000_000_000,
    })

    expect(seconds?.resetsAt).toBe('2026-07-25T17:20:00.000Z')
    expect(millis?.resetsAt).toBe(seconds?.resetsAt)
  })

  it('reports no reset rather than an invented one', () => {
    expect(
      parseClaudeRateLimitEvent({ status: 'allowed', resetsAt: 'soon' })
        ?.resetsAt,
    ).toBeNull()
    expect(
      parseClaudeRateLimitEvent({ status: 'allowed' })?.rateLimitType,
    ).toBeNull()
  })

  it('degrades on anything it cannot read, rather than crashing a session', () => {
    // Provider wire input is defensive by house rule; an unrecognised shape
    // must produce nothing at all, never a half-populated display.
    expect(parseClaudeRateLimitEvent(null)).toBeNull()
    expect(parseClaudeRateLimitEvent('rate limited')).toBeNull()
    expect(parseClaudeRateLimitEvent({})).toBeNull()
    expect(parseClaudeRateLimitEvent({ status: 42 })).toBeNull()
    expect(parseClaudeRateLimitEvent({ status: '  ' })).toBeNull()
  })
})

describe('isRateLimitSignalExpired', () => {
  const now = new Date('2026-08-04T12:00:00.000Z')

  it('treats a window that has already reset as gone', () => {
    expect(
      isRateLimitSignalExpired({ resetsAt: '2026-08-04T11:59:59.000Z' }, now),
    ).toBe(true)
  })

  it('keeps a window that has not reset yet', () => {
    expect(
      isRateLimitSignalExpired({ resetsAt: '2026-08-04T12:00:01.000Z' }, now),
    ).toBe(false)
  })

  it('keeps a signal with no reset time, which says nothing about when', () => {
    expect(isRateLimitSignalExpired({ resetsAt: null }, now)).toBe(false)
    expect(isRateLimitSignalExpired({ resetsAt: 'nonsense' }, now)).toBe(false)
  })
})
