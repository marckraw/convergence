import { Meter as BaseMeter } from '@base-ui/react/meter'
import { cn } from '#lib/cn.pure'
import { toneSolid, toneStroke, type Tone } from '#lib/tone.styles'
import { meterFraction, type MeterThresholds, meterTone } from './meter.pure'

/** A bar's thickness: 4, 6 (today's bars) or 8 px. */
const BAR_SIZES = {
  sm: 'h-1',
  md: 'h-1.5',
  lg: 'h-2',
} as const

/** A ring's size: 16, 20 (the composer's usage ring) or 28 px. */
const RING_SIZES = {
  sm: 'size-4',
  md: 'size-5',
  lg: 'size-7',
} as const

type MeterSize = keyof typeof BAR_SIZES

/** The ring's geometry, in its own 20-unit box: today's usage ring. */
const RING_RADIUS = 7
const RING_STROKE = 3

type MeterProps = {
  /** The reading. */
  value: number
  min?: number
  /** 100 unless told otherwise. */
  max?: number
  /** What it measures, for a screen reader: "Context window", "Weekly limit". */
  label: string
  /** The reading in words, when the number alone misleads: "62 of 100 requests left". */
  valueText?: string
  /** Its tone (R1), whatever the reading; or let `thresholds` decide. */
  tone?: Tone
  /** Where the reading turns warning and danger, in its own units. */
  thresholds?: MeterThresholds
  /** `bar` across its line, or `ring` the size of a glyph. */
  shape?: 'bar' | 'ring'
  size?: MeterSize
  className?: string
}

/**
 * How much of something is used or left (MAR-3616): a quota, a context
 * window, a usage window. Every bar in Convergence is a reading, not
 * progress, so it is a meter (Base UI): `role="meter"` with its value, min,
 * max and label, which no bar has today (DS-25). Its fill wears a tone (R1),
 * given or decided by thresholds. A bar fills from the left, moving over the
 * panel duration between readings (at once under reduced motion); a ring is
 * the composer's usage ring.
 */
function Meter({
  value,
  min = 0,
  max = 100,
  label,
  valueText,
  tone,
  thresholds,
  shape = 'bar',
  size = 'md',
  className,
}: MeterProps) {
  const wears = meterTone({ value, tone, thresholds })
  const fraction = meterFraction(value, min, max)
  return (
    <BaseMeter.Root
      value={value}
      min={min}
      max={max}
      aria-valuetext={valueText}
      data-slot="meter"
      data-shape={shape}
      data-tone={wears}
      className={cn(
        shape === 'bar' ? 'w-full' : ['inline-grid', RING_SIZES[size]],
        className,
      )}
    >
      <BaseMeter.Label className="sr-only">{label}</BaseMeter.Label>
      {shape === 'bar' ? (
        <BaseMeter.Track
          className={cn(
            'w-full overflow-hidden rounded-full bg-surface-muted',
            BAR_SIZES[size],
          )}
        >
          <BaseMeter.Indicator
            data-slot="meter-indicator"
            className={cn(
              'h-full rounded-full transition-all duration-panel motion-reduce:transition-none',
              toneSolid[wears],
            )}
          />
        </BaseMeter.Track>
      ) : (
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          className={cn('-rotate-90', RING_SIZES[size])}
        >
          <circle
            cx="10"
            cy="10"
            r={RING_RADIUS}
            fill="none"
            strokeWidth={RING_STROKE}
            className="stroke-line"
          />
          <circle
            data-slot="meter-indicator"
            cx="10"
            cy="10"
            r={RING_RADIUS}
            fill="none"
            pathLength={100}
            strokeDasharray={`${fraction * 100} ${100 - fraction * 100}`}
            strokeLinecap="round"
            strokeWidth={RING_STROKE}
            className={cn(
              'transition-all duration-panel motion-reduce:transition-none',
              toneStroke[wears],
            )}
          />
        </svg>
      )}
    </BaseMeter.Root>
  )
}

export { Meter, type MeterProps, type MeterSize }
export type { MeterThresholds }
