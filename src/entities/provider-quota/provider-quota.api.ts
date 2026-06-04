import type { ProviderQuotaSnapshot } from './provider-quota.types'

export const providerQuotaApi = {
  getCodex: (forceRefresh = false): Promise<ProviderQuotaSnapshot> =>
    window.electronAPI.providerQuota.getCodex(forceRefresh),
  getCursor: (forceRefresh = false): Promise<ProviderQuotaSnapshot> =>
    window.electronAPI.providerQuota.getCursor(forceRefresh),
}
