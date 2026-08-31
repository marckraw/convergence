import { formatCodexRemainingPercent } from './codex-usage-pill.pure'

interface CodexUsageQuotaRowProps {
  label: string
  remaining: number | null
  reset: string | null
}

function formatReset(value: string | null): string {
  if (!value) return 'Reset time unavailable'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Reset time unavailable'
  return `Resets ${new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)}`
}

export function CodexUsageQuotaRow({
  label,
  remaining,
  reset,
}: CodexUsageQuotaRowProps) {
  const safeRemaining =
    typeof remaining === 'number' ? Math.max(0, Math.min(100, remaining)) : 0

  return (
    <div className="grid grid-cols-[4.5rem_1fr_2.5rem] items-center gap-2 text-xs">
      <div>
        <p className="font-medium text-popover-foreground">{label}</p>
        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
          {formatReset(reset)}
        </p>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-emerald-400"
          style={{ width: `${safeRemaining}%` }}
        />
      </div>
      <span className="text-right font-medium text-popover-foreground">
        {formatCodexRemainingPercent(remaining)}
      </span>
    </div>
  )
}
