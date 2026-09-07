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
  it('reads quota from the app-server RPC', async () => {
    const service = new CodexQuotaService({
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
  })

  it('says the server is starting instead of blocking on the cold start — read through to the RPC turns red', async () => {
    // The read does not fail during a warm-up, it waits: 7-25s with the pill
    // still showing whatever number it last had (MAR-2825). Answering now, and
    // saying what the wait is, is both honest and immediate.
    let warming = true
    let reads = 0
    const service = new CodexQuotaService({
      isWarmingUp: () => warming,
      readRateLimits: async () => {
        reads += 1
        return RATE_LIMITS_RESPONSE
      },
    })

    const warmingSnapshot = await service.getQuota()
    expect({
      status: warmingSnapshot.status,
      warmingUp:
        warmingSnapshot.status === 'unavailable'
          ? warmingSnapshot.warmingUp
          : null,
      reason:
        warmingSnapshot.status === 'unavailable'
          ? warmingSnapshot.reason
          : null,
      reads,
    }).toEqual({
      status: 'unavailable',
      warmingUp: true,
      reason: 'Codex is starting up.',
      reads: 0,
    })

    warming = false
    const readySnapshot = await service.getQuota()
    expect({ status: readySnapshot.status, reads }).toEqual({
      status: 'available',
      reads: 1,
    })
  })

  it('answers warming up rather than the cached number it can no longer stand behind', async () => {
    // The control: a cache that is still inside its TTL is exactly the number
    // the pill would otherwise keep showing across an app restart.
    let warming = false
    const service = new CodexQuotaService({
      isWarmingUp: () => warming,
      readRateLimits: async () => RATE_LIMITS_RESPONSE,
    })
    expect((await service.getQuota()).status).toBe('available')

    warming = true
    const snapshot = await service.getQuota()
    expect(snapshot.status).toBe('unavailable')
  })

  it('reports the RPC failure instead of scraping the credential file', async () => {
    // The old fallback read `~/.codex/auth.json` and called an undocumented
    // chatgpt.com endpoint with the user's raw access token, and *any* RPC
    // failure reached it — including a slow cold start. It is gone
    // (constitution A8): a failed read says so.
    const service = new CodexQuotaService({
      readRateLimits: async () => {
        throw new Error('Unknown method: account/rateLimits/read')
      },
    })

    const snapshot = await service.getQuota()

    expect(snapshot.status).toBe('unavailable')
    if (snapshot.status === 'unavailable') {
      expect(snapshot.reason).toBe('Unknown method: account/rateLimits/read')
    }
  })

  it('reports unavailable when the read fails', async () => {
    const service = new CodexQuotaService({
      readRateLimits: async () => {
        throw new Error('codex app-server timed out')
      },
    })

    const snapshot = await service.getQuota()

    expect(snapshot.status).toBe('unavailable')
    if (snapshot.status === 'unavailable') {
      expect(snapshot.reason).toBe('codex app-server timed out')
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
    // No readRateLimits and no server pool, so there is nothing to ask.
    const service = new CodexQuotaService({})

    const snapshot = await service.getQuota()
    expect(snapshot.status).toBe('unavailable')
    if (snapshot.status === 'unavailable') {
      expect(snapshot.reason).toBe('Codex CLI was not detected.')
    }
  })

  // A cold read waits on the resident server coming up, which can take ~25s.
  // Two callers must not mean two reads.
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

  it('records the RPC failure to the debug sink as well as surfacing it', async () => {
    const entries: ProviderDebugEntry[] = []
    const service = new CodexQuotaService({
      debugSink: { record: (entry) => entries.push(entry) },
      readRateLimits: async () => {
        throw new Error('codex app-server timed out after 60000ms')
      },
    })

    const snapshot = await service.getQuota()

    expect(snapshot.status).toBe('unavailable')
    if (snapshot.status === 'unavailable') {
      expect(snapshot.reason).toBe('codex app-server timed out after 60000ms')
    }

    // A broken RPC path with no trace is undiagnosable.
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

describe('CodexQuotaService account scoping', () => {
  const ACCOUNT_HOME = '/home/.convergence/provider-accounts/codex/acct-a'

  function scopedService() {
    const readRateLimits = vi.fn(async () => RATE_LIMITS_RESPONSE)
    const service = new CodexQuotaService({
      readRateLimits,
      resolveAccount: (accountId) =>
        accountId === 'acct-a' ? { configDir: ACCOUNT_HOME } : null,
    })
    return { service, readRateLimits }
  }

  it('reads limits from the selected account own CODEX_HOME', async () => {
    const { service, readRateLimits } = scopedService()

    await service.getQuota({
      scope: { executionHostId: 'local', providerAccountId: 'acct-a' },
    })

    expect(readRateLimits).toHaveBeenCalledWith({ configDir: ACCOUNT_HOME })
  })

  it('reads the ambient login when no account is selected', async () => {
    const { service, readRateLimits } = scopedService()

    await service.getQuota()

    expect(readRateLimits).toHaveBeenCalledWith(null)
  })

  it('never serves one account numbers under another account name', async () => {
    // Codex answers these from the account's own authenticated session, so
    // unlike Claude's shared usage log they genuinely belong to somebody.
    const { service, readRateLimits } = scopedService()

    await service.getQuota({
      scope: { executionHostId: 'local', providerAccountId: 'acct-a' },
    })
    await service.getQuota({
      scope: { executionHostId: 'local', providerAccountId: 'acct-b' },
    })

    expect(readRateLimits).toHaveBeenCalledTimes(2)
    expect(readRateLimits).toHaveBeenLastCalledWith(null)
  })

  it('keeps hosts apart as well as accounts', async () => {
    const { service, readRateLimits } = scopedService()

    await service.getQuota({
      scope: { executionHostId: 'local', providerAccountId: 'acct-a' },
    })
    await service.getQuota({
      scope: { executionHostId: 'remote', providerAccountId: 'acct-a' },
    })

    expect(readRateLimits).toHaveBeenCalledTimes(2)
  })

  it('still serves one account from cache instead of re-reading it', async () => {
    const { service, readRateLimits } = scopedService()
    const scope = {
      executionHostId: 'local',
      providerAccountId: 'acct-a' as string | null,
    }

    await service.getQuota({ scope })
    await service.getQuota({ scope })

    expect(readRateLimits).toHaveBeenCalledTimes(1)
  })
})
