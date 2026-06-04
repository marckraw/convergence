import { useCallback, useEffect, useState } from 'react'
import {
  providerQuotaApi,
  type ProviderQuotaSnapshot,
} from '@/entities/provider-quota'
import { ProviderUsageFields } from './provider-usage.presentational'

function createClaudeManualSnapshot(): ProviderQuotaSnapshot {
  return {
    providerId: 'claude-code',
    status: 'unavailable',
    source: 'manual',
    reason:
      'Claude Code does not expose these reset windows reliably to Convergence. Open Claude settings to check usage limits manually.',
    usageUrl: 'https://claude.ai/new#settings/usage',
    lastCheckedAt: new Date().toISOString(),
    stale: false,
  }
}

function createCursorFallbackSnapshot(reason: string): ProviderQuotaSnapshot {
  return {
    providerId: 'cursor',
    status: 'unavailable',
    source: 'provider-api',
    reason,
    usageUrl: 'https://cursor.com/dashboard',
    lastCheckedAt: new Date().toISOString(),
    stale: false,
  }
}

function createAntigravityManualSnapshot(): ProviderQuotaSnapshot {
  return {
    providerId: 'antigravity',
    status: 'unavailable',
    source: 'manual',
    reason:
      'Antigravity CLI exposes quota through its interactive /usage and /quota panels, but does not expose a machine-readable quota endpoint to Convergence yet. Run `agy` and use /usage or /quota for live limits.',
    usageUrl: 'https://www.antigravity.google/docs/plans',
    lastCheckedAt: new Date().toISOString(),
    stale: false,
  }
}

export function ProviderUsageContainer() {
  const [snapshots, setSnapshots] = useState<ProviderQuotaSnapshot[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const load = useCallback(async (forceRefresh = false) => {
    setIsLoading(true)
    try {
      const [codex, cursor] = await Promise.all([
        providerQuotaApi.getCodex(forceRefresh),
        providerQuotaApi.getCursor(forceRefresh),
      ])
      setSnapshots([
        codex,
        createClaudeManualSnapshot(),
        cursor,
        createAntigravityManualSnapshot(),
      ])
    } catch (err) {
      const reason =
        err instanceof Error
          ? err.message
          : 'Provider usage limits are unavailable.'
      setSnapshots([
        {
          providerId: 'codex',
          status: 'unavailable',
          source: 'provider-api',
          reason,
          lastCheckedAt: new Date().toISOString(),
          stale: false,
        },
        {
          ...createClaudeManualSnapshot(),
        },
        createCursorFallbackSnapshot(reason),
        {
          ...createAntigravityManualSnapshot(),
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(false)
  }, [load])

  return (
    <ProviderUsageFields
      snapshots={snapshots}
      isLoading={isLoading}
      onRefresh={() => void load(true)}
    />
  )
}
