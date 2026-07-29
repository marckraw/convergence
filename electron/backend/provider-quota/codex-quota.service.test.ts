import { describe, expect, it, vi } from 'vitest'
import type { ProviderDebugEntry } from '../provider-debug/provider-debug.types'
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
      // No readRateLimits and no binary path, so the RPC cannot run. Both
      // scrape seams are stubbed so this never reads a real ~/.codex/auth.json.
      readAuthTokens: async () => ({
        accessToken: 'test-token',
        accountId: null,
      }),
      jsonGet: async () => {
        throw new Error('no auth')
      },
    })

    const snapshot = await service.getQuota()
    expect(snapshot.status).toBe('unavailable')
  })

  // A cold read spawns a codex app-server and can take ~30s. Two callers must
  // not mean two processes.
  it('shares one in-flight read between concurrent callers', async () => {
    let resolveRead: ((value: unknown) => void) | null = null
    const readRateLimits = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve
        }),
    )
    const service = new CodexQuotaService({ readRateLimits })

    const first = service.getQuota()
    const second = service.getQuota()
    // A forceRefresh must join the in-flight read, not start a second one.
    const third = service.getQuota({ forceRefresh: true })

    expect(readRateLimits).toHaveBeenCalledTimes(1)

    resolveRead!(RATE_LIMITS_RESPONSE)
    const [a, b, c] = await Promise.all([first, second, third])

    expect(readRateLimits).toHaveBeenCalledTimes(1)
    expect(a.status).toBe('available')
    expect(b).toEqual(a)
    expect(c).toEqual(a)
  })

  it('releases the in-flight slot so a later refresh reads again', async () => {
    const readRateLimits = vi.fn().mockResolvedValue(RATE_LIMITS_RESPONSE)
    const service = new CodexQuotaService({ readRateLimits })

    await Promise.all([service.getQuota(), service.getQuota()])
    expect(readRateLimits).toHaveBeenCalledTimes(1)

    await service.getQuota({ forceRefresh: true })
    expect(readRateLimits).toHaveBeenCalledTimes(2)
  })

  it('records the RPC failure to the debug sink before falling back', async () => {
    const entries: ProviderDebugEntry[] = []
    const service = new CodexQuotaService({
      debugSink: { record: (entry) => entries.push(entry) },
      readRateLimits: async () => {
        throw new Error('codex app-server timed out after 60000ms')
      },
      readAuthTokens: async () => ({
        accessToken: 'test-token',
        accountId: null,
      }),
      jsonGet: async () => {
        throw new Error('Codex ChatGPT auth is expired. Run `codex login`.')
      },
    })

    const snapshot = await service.getQuota()

    // The surfaced reason stays the scrape's actionable one...
    expect(snapshot.status).toBe('unavailable')
    if (snapshot.status === 'unavailable') {
      expect(snapshot.reason).toBe(
        'Codex ChatGPT auth is expired. Run `codex login`.',
      )
    }

    // ...but the RPC failure is diagnosable rather than swallowed.
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      providerId: 'codex',
      method: 'account/rateLimits/read',
    })
    expect(entries[0]?.note).toContain('codex app-server timed out')
  })

  it('keeps the debug sink quiet when the RPC succeeds', async () => {
    const entries: ProviderDebugEntry[] = []
    const service = new CodexQuotaService({
      debugSink: { record: (entry) => entries.push(entry) },
      readRateLimits: async () => RATE_LIMITS_RESPONSE,
    })

    await service.getQuota()
    expect(entries).toEqual([])
  })
})
