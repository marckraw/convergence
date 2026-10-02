import {
  formatCodexRemainingPercent,
  getCodexUsageTone,
} from './codex-usage-pill.pure'
import { Timestamp } from '@convergence/ui'
import { UsageMeterRow } from './usage-popover.presentational'

interface CodexUsageQuotaRowProps {
  label: string
  remaining: number | null
  reset: string | null
}

/** When the window resets: a Timestamp, the whole moment in its tooltip (CONV-22). */
function resetDetail(value: string | null) {
  if (!value || Number.isNaN(new Date(value).getTime())) {
    return 'Reset time unavailable'
  }
  return (
    <>
      Resets <Timestamp date={value} format="datetime" />
    </>
  )
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
      detail={resetDetail(reset)}
      value={safeRemaining}
      valueLabel={formatCodexRemainingPercent(remaining)}
      tone={getCodexUsageTone(remaining)}
      meterLabel={`${label} quota remaining`}
    />
  )
}
