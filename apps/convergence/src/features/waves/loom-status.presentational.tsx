import type { FC, ReactNode } from 'react'
import { cn } from '@/shared/lib/cn.pure'
import type { WaveHeader } from './wave-sections.pure'
import { WAVE_OUTAGE_DOT_CLASS } from './wave-panel.styles'

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
          'flex items-center gap-1.5 text-[11px]',
          header.kind === 'outage'
            ? 'text-amber-300/90'
            : 'text-muted-foreground',
        )}
      >
        {header.kind === 'outage' ? (
          <span className={WAVE_OUTAGE_DOT_CLASS} />
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
