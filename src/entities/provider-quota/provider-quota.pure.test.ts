import { describe, expect, it } from 'vitest'
import { findProviderQuotaSnapshot } from './provider-quota.pure'
import type { ProviderQuotaSnapshot } from './provider-quota.types'

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
