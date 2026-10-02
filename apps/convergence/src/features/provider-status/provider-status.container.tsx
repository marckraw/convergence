import { useCallback, useEffect, useState, type ReactElement } from 'react'
import type { FC } from 'react'
import {
  providerApi,
  type ProviderRuntimeInfo,
  type ProviderStatusInfo,
} from '@/entities/session'
import {
  providerAccountApi,
  type ProviderAccount,
  type ProviderAccountHealth,
} from '@/entities/provider-account'
import { useDialogStore } from '@/entities/dialog'
import { ProviderStatusDialog } from './provider-status.presentational'

interface ProviderStatusDialogContainerProps {
  trigger?: ReactElement
}

export const ProviderStatusDialogContainer: FC<
  ProviderStatusDialogContainerProps
> = ({ trigger }) => {
  const open = useDialogStore((s) => s.openDialog === 'providers')
  const openDialog = useDialogStore((s) => s.open)
  const closeDialog = useDialogStore((s) => s.close)
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) openDialog('providers')
      else closeDialog()
    },
    [openDialog, closeDialog],
  )
  const [statuses, setStatuses] = useState<ProviderStatusInfo[]>([])
  const [runtimeInfo, setRuntimeInfo] = useState<ProviderRuntimeInfo | null>(
    null,
  )
  const [providerAccounts, setProviderAccounts] = useState<ProviderAccount[]>(
    [],
  )
  const [providerAccountHealth, setProviderAccountHealth] =
    useState<ProviderAccountHealth | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [updatingProviderId, setUpdatingProviderId] = useState<string | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const [nextStatuses, nextRuntimeInfo, nextAccounts, nextHealth] =
        await Promise.all([
          providerApi.getStatuses(),
          providerApi.getRuntimeInfo(),
          providerAccountApi.list(),
          // The last recorded verdict, not a fresh check: attestation is
          // scheduled, and opening a dialog should not spend an account.
          providerAccountApi.health(),
        ])
      setStatuses(nextStatuses)
      setRuntimeInfo(nextRuntimeInfo)
      setProviderAccounts(nextAccounts)
      setProviderAccountHealth(nextHealth)
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Failed to load provider status',
      )
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handleUpdateProvider = useCallback(
    async (providerId: string) => {
      setUpdatingProviderId(providerId)
      setError(null)
      setMessage(null)

      try {
        const result = await providerApi.update(providerId)
        if (!result.ok) {
          setError(result.error ?? 'Provider update failed')
          return
        }

        setMessage(
          `Updated ${providerId}. New sessions will use the refreshed provider.`,
        )
        await load()
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : 'Provider update failed',
        )
      } finally {
        setUpdatingProviderId(null)
      }
    },
    [load],
  )

  useEffect(() => {
    void load()
  }, [load])

  return (
    <ProviderStatusDialog
      open={open}
      onOpenChange={handleOpenChange}
      statuses={statuses}
      runtimeInfo={runtimeInfo}
      providerAccounts={providerAccounts}
      providerAccountHealth={providerAccountHealth}
      isLoading={isLoading}
      updatingProviderId={updatingProviderId}
      error={error}
      message={message}
      onRefresh={load}
      onUpdateProvider={handleUpdateProvider}
      trigger={trigger}
    />
  )
}
