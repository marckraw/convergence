import {
  formatCodexRemainingPercent,
  getCodexUsageTone,
} from './codex-usage-pill.pure'
import { UsageMeterRow } from './usage-popover.presentational'

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
    typeof remaining === 'number' ? Math.max(0, Math.min(100, remaining)) : null

  return (
    <UsageMeterRow
      label={label}
      detail={formatReset(reset)}
      value={safeRemaining}
      valueLabel={formatCodexRemainingPercent(remaining)}
      tone={getCodexUsageTone(remaining)}
      meterLabel={`${label} quota remaining`}
    />
  )
}
