import { beforeEach, describe, expect, it, vi } from 'vitest'
import { providerQuotaApi } from './provider-quota.api'
import type { ProviderQuotaSnapshot } from './provider-quota.types'

const codexSnapshot: ProviderQuotaSnapshot = {
  providerId: 'codex',
  status: 'available',
  source: 'provider-api',
  planType: null,
  windows: [],
  credits: null,
  limitReachedType: null,
  lastCheckedAt: '2026-01-02T00:00:00.000Z',
  stale: false,
}

describe('providerQuotaApi', () => {
  let list: ReturnType<typeof vi.fn>

  beforeEach(() => {
    list = vi.fn().mockResolvedValue([codexSnapshot])

    Object.defineProperty(window, 'electronAPI', {
      value: {
        providerQuota: {
          list,
        },
      },
      configurable: true,
    })
  })

  it('forwards list to the preload bridge', async () => {
    await expect(providerQuotaApi.list(true)).resolves.toEqual([codexSnapshot])

    expect(list).toHaveBeenCalledWith(true)
  })
})
