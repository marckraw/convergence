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
}

export interface ProviderQuotaUnavailableSnapshot {
  providerId: ProviderQuotaProviderId
  status: 'unavailable'
  source: ProviderQuotaSource | 'manual'
  reason: string
  usageUrl?: string
  lastCheckedAt: string
  stale: boolean
}

export type ProviderQuotaSnapshot =
  | ProviderQuotaAvailableSnapshot
  | ProviderQuotaUnavailableSnapshot
