import { describe, expect, it, vi } from 'vitest'
import { CodexQuotaService } from './codex-quota.service'

const RATE_LIMITS_RESPONSE = {
  rateLimits: {
    limitId: 'codex',
    primary: {
      usedPercent: 1,
      windowDurationMins: 10080,
      resetsAt: 1785612249,
    },
    secondary: null,
    credits: { hasCredits: false, unlimited: false, balance: '0' },
    planType: 'pro',
    rateLimitReachedType: null,
  },
  rateLimitResetCredits: { availableCount: 2, credits: [] },
}

describe('CodexQuotaService', () => {
  it('reads quota from the app-server RPC without touching auth.json', async () => {
    const jsonGet = vi.fn()
    const service = new CodexQuotaService({
      jsonGet,
      readRateLimits: async () => RATE_LIMITS_RESPONSE,
    })

    const snapshot = await service.getQuota()

    expect(snapshot.status).toBe('available')
    expect(snapshot.source).toBe('provider-api')
    if (snapshot.status === 'available') {
      expect(snapshot.planType).toBe('pro')
      expect(snapshot.windows[0]).toMatchObject({
        kind: 'weekly',
        usedPercent: 1,
        remainingPercent: 99,
      })
    }
    // The scrape carries the user's raw token; it must not run when the
    // official method answered.
    expect(jsonGet).not.toHaveBeenCalled()
  })

  it('falls back to the chatgpt.com scrape when the RPC is unavailable', async () => {
    const jsonGet = vi.fn().mockResolvedValue({
      plan_type: 'plus',
      rate_limit: {
        primary_window: {
          used_percent: 20,
          limit_window_seconds: 18_000,
          reset_at: 1785612249,
        },
      },
    })
    const service = new CodexQuotaService({
      jsonGet,
      readRateLimits: async () => {
        throw new Error('Unknown method: account/rateLimits/read')
      },
      // CI runners have no real ~/.codex/auth.json; the scrape's token read
      // must be stubbed or this test only passes on a logged-in machine.
      readAuthTokens: async () => ({
        accessToken: 'test-token',
        accountId: null,
      }),
    })

    const snapshot = await service.getQuota()

    expect(jsonGet).toHaveBeenCalledTimes(1)
    expect(snapshot.status).toBe('available')
    if (snapshot.status === 'available') {
      expect(snapshot.planType).toBe('plus')
      expect(snapshot.windows[0]).toMatchObject({
        kind: 'five-hour',
        remainingPercent: 80,
      })
    }
  })

  it('reports unavailable when both paths fail', async () => {
    const service = new CodexQuotaService({
      jsonGet: async () => {
        throw new Error('HTTP 401')
      },
      readRateLimits: async () => {
        throw new Error('codex app-server timed out')
      },
      readAuthTokens: async () => ({
        accessToken: 'test-token',
        accountId: null,
      }),
    })

    const snapshot = await service.getQuota()

    expect(snapshot.status).toBe('unavailable')
    if (snapshot.status === 'unavailable') {
      expect(snapshot.reason).toBe('HTTP 401')
    }
  })

  it('serves the cache before re-querying, and refreshes when forced', async () => {
    const readRateLimits = vi.fn().mockResolvedValue(RATE_LIMITS_RESPONSE)
    const service = new CodexQuotaService({ readRateLimits })

    await service.getQuota()
    await service.getQuota()
    expect(readRateLimits).toHaveBeenCalledTimes(1)

    await service.getQuota({ forceRefresh: true })
    expect(readRateLimits).toHaveBeenCalledTimes(2)
  })

  it('fails without spawning anything when codex was never detected', async () => {
    const service = new CodexQuotaService({
      jsonGet: async () => {
        throw new Error('no auth')
      },
    })

    const snapshot = await service.getQuota()
    expect(snapshot.status).toBe('unavailable')
  })
})
