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

/**
 * What the provider itself said about this account's limits (ADR 0007, PA8).
 *
 * Distinct from `windows`, which for Claude come from ccusage reading the
 * shared transcript store and are therefore machine-wide. This is the only
 * account-authoritative usage signal, and it carries no percentage — so none
 * is reported.
 */
export interface ProviderRateLimitSignal {
  /** The account the signal was observed on; null is the ambient default. */
  providerAccountId: string | null
  /** Verbatim provider state, e.g. `allowed`, `allowed_warning`, `rejected`. */
  status: string
  /** Which window, e.g. `five_hour` or `seven_day`. Null when unreported. */
  rateLimitType: string | null
  resetsAt: string | null
  observedAt: string
}

export interface ProviderCreditsQuota {
  hasCredits: boolean
  unlimited: boolean
  balance: string | null
}

export interface ProviderQuotaAvailableSnapshot {
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

export interface ProviderQuotaUnavailableSnapshot {
  providerId: ProviderQuotaProviderId
  status: 'unavailable'
  source: ProviderQuotaSource | 'manual'
  reason: string
  usageUrl?: string
  lastCheckedAt: string
  stale: boolean
  /**
   * Carried on the unavailable snapshot too: ccusage failing says nothing about
   * whether the provider told us we are at a limit, and that is exactly the
   * moment the answer matters most.
   */
  rateLimit?: ProviderRateLimitSignal | null
}

export type ProviderQuotaSnapshot =
  | ProviderQuotaAvailableSnapshot
  | ProviderQuotaUnavailableSnapshot
