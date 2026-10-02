import type { Tone } from '@convergence/ui'
import type { RelayHopTone } from './relay-hop.pure'
import type { HistoryTone } from './run-history.pure'

/**
 * What a hop's outcome says, in R1's tones (MC-23): one table for the trail,
 * the history and the event inspector, where three wrote their own colours.
 * Delivered is success, an alarm danger, a run handed back to you warning;
 * held, skipped and anything this build does not know are neutral: red is for
 * what we understand to be wrong. The colours are the kit's tone maps
 * (toneInk, toneSolid…); this file only says which tone.
 */
export const HISTORY_TONE: Record<HistoryTone, Tone> = {
  delivered: 'success',
  held: 'neutral',
  alarm: 'danger',
  terminal: 'warning',
  unknown: 'neutral',
}

export const RELAY_HOP_TONE: Record<RelayHopTone, Tone> = {
  delivered: 'success',
  skipped: 'neutral',
  alarm: 'danger',
  unknown: 'neutral',
}

/** A row's frame in its tone; a neutral row keeps the plain hairline. */
export const TONE_FRAME: Record<Tone, string> = {
  neutral: 'border-hairline',
  info: 'border-info-line',
  success: 'border-success-line',
  warning: 'border-warning-line',
  danger: 'border-danger-line',
}
