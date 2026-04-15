import { useCallback, useEffect, useState } from 'react'
import type { FC } from 'react'
import { Bot } from 'lucide-react'
import { providerApi, type ProviderStatusInfo } from '@/entities/session'
import { Button } from '@/shared/ui/button'
import { ProviderStatusDialog } from './provider-status.presentational'

export const ProviderStatusDialogContainer: FC = () => {
  const [open, setOpen] = useState(false)
  const [statuses, setStatuses] = useState<ProviderStatusInfo[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      setStatuses(await providerApi.getStatuses())
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

  useEffect(() => {
    void load()
  }, [load])

  const availableCount = statuses.filter(
    (provider) => provider.availability === 'available',
  ).length

  return (
    <ProviderStatusDialog
      open={open}
      onOpenChange={setOpen}
      statuses={statuses}
      isLoading={isLoading}
      error={error}
      onRefresh={load}
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
