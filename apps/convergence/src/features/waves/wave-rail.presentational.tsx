import type { FC } from 'react'
import { PanelLeftOpen } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { waveRailCounts, type WaveSections } from './wave-sections.pure'
import { WAVE_OUTAGE_DOT_CLASS, WAVE_RAIL_CLASS } from './wave-panel.styles'

/** What the rail says when Open cannot act (MAR-3148 R1). */
export const WAVE_RAIL_NARROW_TITLE = 'Window too narrow for the wave column'

interface WaveRailViewProps {
  sections: WaveSections
  outage: boolean
  /**
   * The window is too narrow to hold the column, so opening it would put the
   * conversation below its floor: the control says so instead of doing
   * nothing (MAR-3148 R1).
   */
  narrow?: boolean
  onExpand: () => void
}

const COUNTS = [
  ['waitingOnYou', 'Waiting on you'],
  ['inTheWave', 'In the wave'],
  ['waitingToStart', 'Waiting to start'],
  ['waves', 'Waves'],
] as const

/**
 * The collapsed column (R4): four counts and the outage dot, read off the
 * same sections the open panel draws -- there is no second selector.
 */
export const WaveRailView: FC<WaveRailViewProps> = ({
  sections,
  outage,
  narrow = false,
  onExpand,
}) => {
  const counts = waveRailCounts(sections)
  return (
    <aside aria-label="Waves rail" className={WAVE_RAIL_CLASS}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label="Open the wave panel"
        className="size-7 p-0"
        disabled={narrow}
        title={narrow ? WAVE_RAIL_NARROW_TITLE : undefined}
        onClick={onExpand}
      >
        <PanelLeftOpen className="size-3.5" />
      </Button>
      {outage ? (
        <span
          role="status"
          aria-label="Tracker not answering"
          className={WAVE_OUTAGE_DOT_CLASS}
        />
      ) : null}
      {COUNTS.map(([key, label]) => (
        <span
          key={key}
          data-wave-count={key}
          title={label}
          aria-label={`${label}: ${counts[key]}`}
          className="text-xs tabular-nums text-muted-foreground"
        >
          {counts[key]}
        </span>
      ))}
    </aside>
  )
}
