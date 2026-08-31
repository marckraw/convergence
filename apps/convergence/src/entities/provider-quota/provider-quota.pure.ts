import type {
  ProviderQuotaProviderId,
  ProviderQuotaSnapshot,
} from './provider-quota.types'

export function findProviderQuotaSnapshot(
  snapshots: ProviderQuotaSnapshot[],
  providerId: ProviderQuotaProviderId,
): ProviderQuotaSnapshot | null {
  return (
    snapshots.find((snapshot) => snapshot.providerId === providerId) ?? null
  )
}
