import { useCallback, useEffect, useState } from 'react'
import type { FC } from 'react'
import { Bot } from 'lucide-react'
import {
  providerApi,
  type ProviderRuntimeInfo,
  type ProviderStatusInfo,
} from '@/entities/session'
import { useDialogStore } from '@/entities/dialog'
import { Button } from '@/shared/ui/button'
import { ProviderStatusDialog } from './provider-status.presentational'

export const ProviderStatusDialogContainer: FC = () => {
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
      const [nextStatuses, nextRuntimeInfo] = await Promise.all([
        providerApi.getStatuses(),
        providerApi.getRuntimeInfo(),
      ])
      setStatuses(nextStatuses)
      setRuntimeInfo(nextRuntimeInfo)
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

  const availableCount = statuses.filter(
    (provider) => provider.availability === 'available',
  ).length

  return (
    <ProviderStatusDialog
      open={open}
      onOpenChange={handleOpenChange}
      statuses={statuses}
      runtimeInfo={runtimeInfo}
      isLoading={isLoading}
      updatingProviderId={updatingProviderId}
      error={error}
      message={message}
      onRefresh={load}
      onUpdateProvider={handleUpdateProvider}
      trigger={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-between px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <span className="flex items-center gap-2">
            <Bot className="h-3.5 w-3.5" />
            Providers
          </span>
          <span className="text-[11px] text-muted-foreground/80">
            {statuses.length > 0
              ? `${availableCount}/${statuses.length}`
              : 'View'}
          </span>
        </Button>
      }
    />
  )
}
