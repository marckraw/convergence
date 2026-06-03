export type ProviderQuotaProviderId = 'codex' | 'claude-code' | 'cursor'

export type ProviderQuotaWindowKind = 'five-hour' | 'weekly' | 'other'

export interface ProviderQuotaWindow {
  kind: ProviderQuotaWindowKind
  label: string
  usedPercent: number
  remainingPercent: number
  windowMinutes: number | null
  resetsAt: string | null
}

export interface ProviderCreditsQuota {
  hasCredits: boolean
  unlimited: boolean
  balance: string | null
}

export interface ProviderQuotaAvailableSnapshot {
  providerId: ProviderQuotaProviderId
  status: 'available'
  source: 'provider-api' | 'provider-event'
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
  source: 'provider-api' | 'provider-event' | 'manual'
  reason: string
  usageUrl?: string
  lastCheckedAt: string
  stale: boolean
}

export type ProviderQuotaSnapshot =
  | ProviderQuotaAvailableSnapshot
  | ProviderQuotaUnavailableSnapshot
