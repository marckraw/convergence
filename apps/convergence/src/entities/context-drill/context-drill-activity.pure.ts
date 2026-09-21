import { formatActivityLabel, type ActivitySignal } from '@/entities/session'
import type { DrillBeat } from './context-drill.types'

/** The beat, in the header's words (MAR-3288 R8). */
export function formatDrillBeatLabel(beat: DrillBeat): string {
  return `drill · ${beat}`
}

/**
 * The header's ONE activity pill (MAR-3288 R8).
 *
 * A running drill's beat REPLACES the activity label rather than sitting
 * beside it: during `compacting` the activity also reads `compacting`, and
 * two pills saying the same thing in two vocabularies is how a header stops
 * being read. No beat -> exactly the pill the header always showed.
 */
export function resolveSessionActivityLabel(
  activity: ActivitySignal | undefined,
  beat: DrillBeat | null | undefined,
): string | null {
  return beat ? formatDrillBeatLabel(beat) : formatActivityLabel(activity)
}
