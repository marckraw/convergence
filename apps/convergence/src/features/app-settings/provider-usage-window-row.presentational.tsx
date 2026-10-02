import type { ProviderQuotaWindow } from '@/entities/provider-quota'
import { Card, Meter } from '@convergence/ui'

interface ProviderUsageWindowRowProps {
  window: ProviderQuotaWindow
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`
}

function formatReset(value: string | null): string {
  if (!value) return 'Reset time unavailable'
  return `Resets ${new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))}`
}

/**
 * One quota window: its name and when it resets, a Meter of what is left (or,
 * for observed usage, of what was used), and the reading in words (DLG-25).
 */
export function ProviderUsageWindowRow({
  window,
}: ProviderUsageWindowRowProps) {
  const used = Math.max(0, Math.min(100, window.usedPercent))
  const isObservedUsage = window.displayMode === 'observed-usage'
  const barValue = isObservedUsage ? used : 100 - used
  const valueLabel = isObservedUsage
    ? (window.valueLabel ?? 'No local usage')
    : `${formatPercent(window.remainingPercent)} remaining`
  const boundaryLabel = isObservedUsage
    ? formatReset(window.resetsAt).replace(
        'Resets',
        window.resetLabel ?? 'Ends',
      )
    : formatReset(window.resetsAt)

  return (
    <Card className="flex flex-col gap-3 px-4 md:flex-row md:items-center">
      <div className="min-w-0 md:flex-1">
        <p className="text-sm font-medium text-ink">{window.label}</p>
        <p className="mt-1 text-xs text-ink-muted">{boundaryLabel}</p>
      </div>
      <div className="md:min-w-55 md:flex-1">
        <Meter
          value={barValue}
          label={window.label}
          valueText={valueLabel}
          tone={isObservedUsage ? 'info' : 'success'}
          size="lg"
        />
      </div>
      <div className="shrink-0 text-sm font-medium text-ink md:text-right">
        {valueLabel}
      </div>
    </Card>
  )
}
