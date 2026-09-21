import {
  formatActivityLabel,
  isSessionCompacting,
  type ActivitySignal,
} from '@/entities/session'
import type { DrillBeat } from './context-drill.types'

/** The beat, in the header's words (MAR-3288 R8). */
export function formatDrillBeatLabel(beat: DrillBeat): string {
  return `drill · ${beat}`
}

/**
 * The header's grey activity pill, or null when it has nothing to add
 * (MAR-3288 R8, lap 2 item A). Both headers -- chat-surface and session-view
 * -- read this one derivation.
 *
 * A running drill's beat REPLACES the activity label rather than sitting
 * beside it, and it always shows: `drill · compacting` names the stage, which
 * nothing else in the header does.
 *
 * With no beat, a compaction is already carried by the attention pill
 * ("Compacting context…", `AttentionIndicator`), which answers the SAME
 * predicate this asks. A grey "compacting context…" beside it would be two
 * pills saying one thing, so the grey one is withheld. Every other activity is
 * exactly the pill the header always showed.
 */
export function resolveSessionActivityLabel(
  activity: ActivitySignal | undefined,
  beat: DrillBeat | null | undefined,
): string | null {
  if (beat) return formatDrillBeatLabel(beat)
  if (isSessionCompacting({ activity })) return null
  return formatActivityLabel(activity)
}
