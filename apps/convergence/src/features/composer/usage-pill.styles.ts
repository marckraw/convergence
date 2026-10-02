import type { Tone } from '@convergence/ui'

/**
 * The tones the composer's usage pills wear (R1): plenty left (success),
 * running low or over the threshold (warning), nearly gone (danger), nothing
 * reported (neutral). The pills themselves are StatusPillButton (DS-9), which
 * paints the tone.
 */
type UsageTone = Extract<Tone, 'neutral' | 'success' | 'warning' | 'danger'>

/** The context dot's ring of its own tone (shadow-halo, R1). */
export const contextDotHalo: Record<UsageTone, string> = {
  success: 'shadow-halo shadow-success-solid/16',
  warning: 'shadow-halo shadow-warning-solid/16',
  danger: 'shadow-halo shadow-danger-solid/16',
  neutral: 'shadow-halo shadow-neutral-solid/16',
}

/** A part of a usage popover under a hairline: the credits, an action, a footnote. */
export const usageSection = 'border-t border-line-soft pt-2'
