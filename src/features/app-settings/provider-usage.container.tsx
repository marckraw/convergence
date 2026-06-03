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

function createCursorManualSnapshot(): ProviderQuotaSnapshot {
  return {
    providerId: 'cursor',
    status: 'unavailable',
    source: 'manual',
    reason:
      'Cursor ACP does not expose usage or quota counters to Convergence. Open the Cursor dashboard to inspect usage and billing.',
    usageUrl: 'https://cursor.com/dashboard',
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
      setSnapshots([
        await providerQuotaApi.getCodex(forceRefresh),
        createClaudeManualSnapshot(),
        createCursorManualSnapshot(),
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
        {
          ...createCursorManualSnapshot(),
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
