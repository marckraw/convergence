import type { ProviderQuotaSnapshot } from './provider-quota.types'

export interface ProviderQuotaAccountScope {
  executionHostId: string
  providerAccountId: string | null
}

export const providerQuotaApi = {
  /**
   * `scope` names the account the caller is asking about (ADR 0007, PA8).
   * Omitting it asks for machine-wide numbers only — which is what every
   * caller got before accounts existed.
   */
  list: (
    forceRefresh = false,
    scope?: ProviderQuotaAccountScope,
  ): Promise<ProviderQuotaSnapshot[]> =>
    window.electronAPI.providerQuota.list(forceRefresh, scope),
}
