import { describe, expect, it, vi } from 'vitest'
import {
  createDefaultProviderQuotaSources,
  createManualQuotaSource,
} from './provider-quota.sources'
import {
  ProviderQuotaService,
  type ProviderQuotaSnapshotSource,
} from './provider-quota.service'
import type {
  ProviderQuotaProviderId,
  ProviderQuotaSnapshot,
  ProviderQuotaUnavailableSnapshot,
} from './provider-quota.types'

function availableSnapshot(
  providerId: ProviderQuotaProviderId,
): ProviderQuotaSnapshot {
  return {
    providerId,
    status: 'available',
    source: providerId === 'claude-code' ? 'local-usage-log' : 'provider-api',
    planType: null,
    windows: [],
    credits: null,
    limitReachedType: null,
    lastCheckedAt: '2026-01-02T00:00:00.000Z',
    stale: false,
  }
}

function source(
  providerId: ProviderQuotaProviderId,
  snapshot: ProviderQuotaSnapshot = availableSnapshot(providerId),
  fallbackSource: ProviderQuotaUnavailableSnapshot['source'] = 'provider-api',
): ProviderQuotaSnapshotSource {
  return {
    providerId,
    fallbackSource,
    getQuota: vi.fn().mockResolvedValue(snapshot),
  }
}

describe('ProviderQuotaService', () => {
  it('lists snapshots in source order and forwards force refresh', async () => {
    const codex = source('codex')
    const claude = source(
      'claude-code',
      availableSnapshot('claude-code'),
      'local-usage-log',
    )
    const cursor = source('cursor')
    const service = new ProviderQuotaService([codex, claude, cursor])

    await expect(service.list({ forceRefresh: true })).resolves.toEqual([
      availableSnapshot('codex'),
      availableSnapshot('claude-code'),
      availableSnapshot('cursor'),
    ])

    expect(codex.getQuota).toHaveBeenCalledWith({ forceRefresh: true })
    expect(claude.getQuota).toHaveBeenCalledWith({ forceRefresh: true })
    expect(cursor.getQuota).toHaveBeenCalledWith({ forceRefresh: true })
  })

  it('isolates source failures into unavailable snapshots', async () => {
    const failingSource: ProviderQuotaSnapshotSource = {
      providerId: 'claude-code',
      fallbackSource: 'local-usage-log',
      usageUrl: 'https://claude.ai/new#settings/usage',
      getQuota: vi.fn().mockRejectedValue(new Error('ccusage failed')),
    }
    const service = new ProviderQuotaService([failingSource, source('codex')], {
      now: () => new Date('2026-01-02T03:04:05.000Z'),
    })

    await expect(service.list()).resolves.toEqual([
      {
        providerId: 'claude-code',
        status: 'unavailable',
        source: 'local-usage-log',
        reason: 'ccusage failed',
        usageUrl: 'https://claude.ai/new#settings/usage',
        lastCheckedAt: '2026-01-02T03:04:05.000Z',
        stale: false,
      },
      availableSnapshot('codex'),
    ])
  })

  it('creates backend-owned manual snapshots', async () => {
    const manual = createManualQuotaSource(
      {
        providerId: 'cursor',
        reason: 'Cursor quota is only available in the dashboard.',
        usageUrl: 'https://cursor.com/dashboard',
      },
      { now: () => new Date('2026-01-02T03:04:05.000Z') },
    )

    await expect(manual.getQuota()).resolves.toEqual({
      providerId: 'cursor',
      status: 'unavailable',
      source: 'manual',
      reason: 'Cursor quota is only available in the dashboard.',
      usageUrl: 'https://cursor.com/dashboard',
      lastCheckedAt: '2026-01-02T03:04:05.000Z',
      stale: false,
    })
  })

  it('creates the default provider source order', async () => {
    const codex = {
      getQuota: vi.fn().mockResolvedValue(availableSnapshot('codex')),
    }
    const claude = {
      getQuota: vi.fn().mockResolvedValue(availableSnapshot('claude-code')),
    }

    const sources = createDefaultProviderQuotaSources({
      codex,
      claude,
      now: () => new Date('2026-01-02T03:04:05.000Z'),
    })
    const service = new ProviderQuotaService(sources)
    const snapshots = await service.list({ forceRefresh: true })

    expect(sources.map((quotaSource) => quotaSource.providerId)).toEqual([
      'codex',
      'claude-code',
      'cursor',
      'antigravity',
    ])
    expect(codex.getQuota).toHaveBeenCalledWith({ forceRefresh: true })
    expect(claude.getQuota).toHaveBeenCalledWith({ forceRefresh: true })
    expect(snapshots).toMatchObject([
      { providerId: 'codex', status: 'available' },
      { providerId: 'claude-code', status: 'available' },
      {
        providerId: 'cursor',
        status: 'unavailable',
        source: 'manual',
        usageUrl: 'https://cursor.com/dashboard',
      },
      {
        providerId: 'antigravity',
        status: 'unavailable',
        source: 'manual',
        usageUrl: 'https://www.antigravity.google/docs/plans',
      },
    ])
  })
})
