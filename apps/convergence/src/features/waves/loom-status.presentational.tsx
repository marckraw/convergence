import type { FC, ReactNode } from 'react'
import { cn, StatusDot } from '@convergence/ui'
import type { WaveHeader } from './wave-sections.pure'

/**
 * The tracker's own voice in Loom's header (MAR-3097 R3), where a person is
 * already looking. An outage is an age and never a zero; everything else the
 * header can say belongs to the sheets, not to this line.
 *
 * Refresh sits beside it (MAR-3227 R6) when the container hands one over.
 */
export const LoomStatusView: FC<{
  header: WaveHeader
  refresh?: ReactNode
}> = ({ header, refresh }) => {
  const status =
    header.kind === 'outage' || header.kind === 'reading' ? (
      <span
        role="status"
        className={cn(
          'flex items-center gap-1.5 text-2xs',
          // The tracker not answering is a heads-up: the warning ink (R1).
          header.kind === 'outage' ? 'text-warning-ink' : 'text-ink-muted',
        )}
      >
        {header.kind === 'outage' ? (
          <StatusDot tone="warning" size="sm" />
        ) : null}
        {header.text}
      </span>
    ) : null
  if (!refresh) return status
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {status}
      {refresh}
    </div>
  )
}
