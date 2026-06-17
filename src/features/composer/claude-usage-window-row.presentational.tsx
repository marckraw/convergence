import type { ProviderQuotaWindow } from '@/entities/provider-quota'

interface ClaudeUsageWindowRowProps {
  label: string
  window: ProviderQuotaWindow | null
}

function formatBoundary(window: ProviderQuotaWindow | null): string {
  if (!window?.resetsAt) return 'End time unavailable'
  const date = new Date(window.resetsAt)
  if (Number.isNaN(date.getTime())) return 'End time unavailable'

  return `${window.resetLabel ?? 'Ends'} ${new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)}`
}

export function ClaudeUsageWindowRow({
  label,
  window,
}: ClaudeUsageWindowRowProps) {
  const progress =
    typeof window?.usedPercent === 'number'
      ? Math.max(0, Math.min(100, window.usedPercent))
      : 0

  return (
    <div className="grid grid-cols-[4.5rem_1fr] items-center gap-x-2 gap-y-1 text-xs">
      <div>
        <p className="font-medium text-popover-foreground">{label}</p>
        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
          {formatBoundary(window)}
        </p>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-blue-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="col-start-2 truncate text-right font-medium text-popover-foreground">
        {window?.valueLabel ?? '--'}
      </span>
    </div>
  )
}
