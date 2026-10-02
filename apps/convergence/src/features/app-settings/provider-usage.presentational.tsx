import { RefreshCw } from 'lucide-react'
import type { ProviderQuotaSnapshot } from '@/entities/provider-quota'
import { Button, Card, EmptyState } from '@convergence/ui'
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
      <Card
        padding="md"
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <p className="text-sm font-medium text-ink">Provider usage</p>
          <p className="mt-1 text-sm text-ink-muted">
            Live quota windows, plus manual links for providers that do not
            expose usage limits reliably.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onRefresh}
            disabled={isLoading}
            pending={isLoading}
            pendingLabel="Refreshing…"
          >
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
        </div>
      </Card>

      <div className="space-y-3">
        {snapshots.length === 0 && isLoading ? (
          <EmptyState state="loading" title="Checking provider usage limits…" />
        ) : null}
        {snapshots.map((snapshot) => (
          <ProviderUsageCard key={snapshot.providerId} snapshot={snapshot} />
        ))}
      </div>
    </div>
  )
}
