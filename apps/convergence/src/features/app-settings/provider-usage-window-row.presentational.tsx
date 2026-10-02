import type { ProviderQuotaWindow } from '@/entities/provider-quota'
import { Card, Meter, Timestamp } from '@convergence/ui'

interface ProviderUsageWindowRowProps {
  window: ProviderQuotaWindow
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`
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
  // When it resets (or, for observed usage, ends): a Timestamp (CONV-22).
  const boundaryWord = isObservedUsage
    ? (window.resetLabel ?? 'Ends')
    : 'Resets'
  const boundaryLabel = window.resetsAt ? (
    <>
      {boundaryWord} <Timestamp date={window.resetsAt} format="datetime" />
    </>
  ) : (
    'Reset time unavailable'
  )

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
