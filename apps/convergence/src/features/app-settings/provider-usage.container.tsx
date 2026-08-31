import { useCallback, useEffect, useState } from 'react'
import {
  providerQuotaApi,
  type ProviderQuotaSnapshot,
} from '@/entities/provider-quota'
import { ProviderUsageFields } from './provider-usage.presentational'

export function ProviderUsageContainer() {
  const [snapshots, setSnapshots] = useState<ProviderQuotaSnapshot[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const load = useCallback(async (forceRefresh = false) => {
    setIsLoading(true)
    try {
      setSnapshots(await providerQuotaApi.list(forceRefresh))
    } catch {
      setSnapshots([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(false)
  }, [load])

  return (
    <ProviderUsageFields
      snapshots={snapshots}
      isLoading={isLoading}
      onRefresh={() => void load(true)}
    />
  )
}
