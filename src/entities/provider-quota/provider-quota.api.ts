import type { ProviderQuotaSnapshot } from './provider-quota.types'

export const providerQuotaApi = {
  getCodex: (forceRefresh = false): Promise<ProviderQuotaSnapshot> =>
    window.electronAPI.providerQuota.getCodex(forceRefresh),
  getClaude: (forceRefresh = false): Promise<ProviderQuotaSnapshot> =>
    window.electronAPI.providerQuota.getClaude(forceRefresh),
}
