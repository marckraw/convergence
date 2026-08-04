export type ProviderQuotaProviderId =
  | 'codex'
  | 'claude-code'
  | 'cursor'
  | 'antigravity'

export type ProviderQuotaWindowKind = 'five-hour' | 'weekly' | 'other'
export type ProviderQuotaWindowDisplayMode =
  | 'remaining-quota'
  | 'observed-usage'
export type ProviderQuotaSource =
  | 'provider-api'
  | 'provider-event'
  | 'local-usage-log'

export interface ProviderQuotaWindow {
  kind: ProviderQuotaWindowKind
  label: string
  usedPercent: number
  remainingPercent: number
  windowMinutes: number | null
  resetsAt: string | null
  displayMode?: ProviderQuotaWindowDisplayMode
  valueLabel?: string
  resetLabel?: string
}

export interface ProviderCreditsQuota {
  hasCredits: boolean
  unlimited: boolean
  balance: string | null
}

/**
 * What the provider itself said about *this account's* limits (ADR 0007, PA8).
 *
 * Separate from `windows`: for Claude those come from the local usage log,
 * which every account on this machine shares, so they cannot be attributed.
 * This signal can. It carries no percentage, and none is invented.
 */
export interface ProviderRateLimitSignal {
  providerAccountId: string | null
  status: string
  rateLimitType: string | null
  resetsAt: string | null
  observedAt: string
}

export type ProviderQuotaSnapshot =
  | {
      providerId: ProviderQuotaProviderId
      status: 'available'
      source: ProviderQuotaSource
      planType: string | null
      windows: ProviderQuotaWindow[]
      credits: ProviderCreditsQuota | null
      limitReachedType: string | null
      lastCheckedAt: string
      stale: boolean
      rateLimit?: ProviderRateLimitSignal | null
    }
  | {
      providerId: ProviderQuotaProviderId
      status: 'unavailable'
      source: ProviderQuotaSource | 'manual'
      reason: string
      usageUrl?: string
      lastCheckedAt: string
      stale: boolean
      rateLimit?: ProviderRateLimitSignal | null
    }
