import { RefreshCw } from 'lucide-react'
import type { ProviderQuotaSnapshot } from '@/entities/provider-quota'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/cn.pure'
import { ProviderUsageCard } from './provider-usage-card.presentational'

interface ProviderUsageFieldsProps {
  snapshots: ProviderQuotaSnapshot[]
  isLoading: boolean
  onRefresh: () => void
}

export function ProviderUsageFields({
  snapshots,
  isLoading,
  onRefresh,
}: ProviderUsageFieldsProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card/45 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Provider usage</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Live Codex quota windows, optional Cursor team spend from the Admin
            API, plus manual links for providers that do not expose usage limits
            reliably.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading}
          >
            <RefreshCw
              className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')}
            />
            Refresh
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {snapshots.length === 0 && isLoading ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
            Checking provider usage limits...
          </p>
        ) : null}
        {snapshots.map((snapshot) => (
          <ProviderUsageCard key={snapshot.providerId} snapshot={snapshot} />
        ))}
      </div>
    </div>
  )
}
