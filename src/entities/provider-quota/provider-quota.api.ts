import type { ProviderQuotaSnapshot } from './provider-quota.types'

export const providerQuotaApi = {
  list: (forceRefresh = false): Promise<ProviderQuotaSnapshot[]> =>
    window.electronAPI.providerQuota.list(forceRefresh),
}
