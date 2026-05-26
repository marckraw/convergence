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

export type ProviderQuotaSnapshot =
  | {
      providerId: 'codex' | 'claude-code'
      status: 'available'
      source: 'provider-api' | 'provider-event'
      planType: string | null
      windows: ProviderQuotaWindow[]
      credits: ProviderCreditsQuota | null
      limitReachedType: string | null
      lastCheckedAt: string
      stale: boolean
    }
  | {
      providerId: 'codex' | 'claude-code'
      status: 'unavailable'
      source: 'provider-api' | 'provider-event'
      reason: string
      lastCheckedAt: string
      stale: boolean
    }
