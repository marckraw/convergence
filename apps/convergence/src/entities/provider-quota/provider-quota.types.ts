export type ProviderQuotaProviderId =
  | 'codex'
  | 'claude-code'
  | 'cursor'
  | 'antigravity'

export type ProviderQuotaWindowKind = 'five-hour' | 'weekly' | 'other'
export type ProviderQuotaWindowDisplayMode =
  | 'remaining-quota'
  | 'observed-usage'
export type ProviderQuotaSource = 'provider-api' | 'provider-event'

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
    }
  | {
      providerId: ProviderQuotaProviderId
      status: 'unavailable'
      source: ProviderQuotaSource | 'manual'
      reason: string
      usageUrl?: string
      lastCheckedAt: string
      stale: boolean
      /**
       * The provider is starting up, so this is a wait rather than a failure.
       *
       * Kept as a flag on the read the surfaces already make rather than as a
       * second channel: an "unavailable" that is really "not yet" is the one
       * unavailable reason a surface should show as motion instead of as a
       * dash (MAR-2825).
       */
      warmingUp?: boolean
    }
