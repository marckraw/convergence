import type { Tone } from '#lib/tone.styles'

/**
 * Where a meter's reading turns worse, in the meter's own units. Warning
 * below danger means more is worse (a context window filling up); warning
 * above danger means less is worse (a quota running out).
 */
export type MeterThresholds = { warning: number; danger: number }

/**
 * The tone a reading wears (R1): the one given, or the thresholds' verdict
 * (success until a threshold is crossed), or info when neither says.
 */
export const meterTone = ({
  value,
  tone,
  thresholds,
}: {
  value: number
  tone?: Tone
  thresholds?: MeterThresholds
}): Tone => {
  if (tone !== undefined) return tone
  if (thresholds === undefined) return 'info'
  const { warning, danger } = thresholds
  const moreIsWorse = warning <= danger
  const crossed = (limit: number) =>
    moreIsWorse ? value >= limit : value <= limit
  if (crossed(danger)) return 'danger'
  if (crossed(warning)) return 'warning'
  return 'success'
}

/** How full the range is, from 0 to 1, clamped. */
export const meterFraction = (value: number, min: number, max: number) =>
  max <= min ? 0 : Math.min(1, Math.max(0, (value - min) / (max - min)))
