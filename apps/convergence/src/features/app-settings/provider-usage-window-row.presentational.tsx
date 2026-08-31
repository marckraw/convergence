import type { ProviderQuotaWindow } from '@/entities/provider-quota'

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

export function ProviderUsageWindowRow({
  window,
}: ProviderUsageWindowRowProps) {
  const used = Math.max(0, Math.min(100, window.usedPercent))
  const isObservedUsage = window.displayMode === 'observed-usage'
  const barWidth = isObservedUsage ? used : 100 - used
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
    <div className="grid gap-3 rounded-lg border border-border/70 bg-card/40 px-4 py-3 md:grid-cols-[minmax(0,1fr)_minmax(220px,1.4fr)_auto] md:items-center">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{window.label}</p>
        <p className="mt-1 text-xs text-muted-foreground">{boundaryLabel}</p>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        aria-label={`${window.label}: ${valueLabel}`}
      >
        <div
          className={`h-full rounded-full ${isObservedUsage ? 'bg-blue-500' : 'bg-emerald-500'}`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
      <div className="text-sm font-medium text-foreground md:text-right">
        {valueLabel}
      </div>
    </div>
  )
}
