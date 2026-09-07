export type ProviderQuotaProviderId =
  | 'codex'
  | 'claude-code'
  | 'cursor'
  | 'antigravity'

export interface ProviderQuotaAccountScope {
  /** Accounts are host-scoped since PA1; remote hosts fail closed (PA10). */
  executionHostId: string
  providerAccountId: string | null
}

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
  /**
   * The provider is starting up, so this is a wait rather than a failure.
   *
   * Kept as a flag on the read the surfaces already make rather than as a
   * second channel: an "unavailable" that is really "not yet" is the one
   * unavailable reason a surface should show as motion instead of as a dash
   * (MAR-2825). Mirrored in `src/entities/provider-quota/provider-quota.types.ts`
   * -- the renderer keeps its own copy of this shape.
   */
  warmingUp?: boolean
}

export type ProviderQuotaSnapshot =
  | ProviderQuotaAvailableSnapshot
  | ProviderQuotaUnavailableSnapshot
