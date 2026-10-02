import type { Tone } from '@convergence/ui'

/**
 * The tones the composer's usage pills wear (R1): plenty left (success),
 * running low or over the threshold (warning), nearly gone (danger), nothing
 * reported (neutral).
 */
type UsageTone = Extract<Tone, 'neutral' | 'success' | 'warning' | 'danger'>

/**
 * The pill round the Codex quota and the context dot, on a ghost Button: the
 * tone's tint, line and ink, in both themes (CONV-2: it was a dark chip with
 * near-white words in the light composer).
 */
export const usagePillTone: Record<UsageTone, string> = {
  success:
    'rounded-full border border-success-line bg-success-soft text-success-ink shadow-none hover:bg-success-soft hover:text-success-ink',
  warning:
    'rounded-full border border-warning-line bg-warning-soft text-warning-ink shadow-none hover:bg-warning-soft hover:text-warning-ink',
  danger:
    'rounded-full border border-danger-line bg-danger-soft text-danger-ink shadow-none hover:bg-danger-soft hover:text-danger-ink',
  neutral:
    'rounded-full border border-line-soft bg-surface-muted/30 text-ink-muted shadow-none hover:bg-surface-muted/40 hover:text-ink-muted',
}

/** The context dot's ring of its own tone (shadow-halo, R1). */
export const contextDotHalo: Record<UsageTone, string> = {
  success: 'shadow-halo shadow-success-solid/16',
  warning: 'shadow-halo shadow-warning-solid/16',
  danger: 'shadow-halo shadow-danger-solid/16',
  neutral: 'shadow-halo shadow-neutral-solid/16',
}

/** A part of a usage popover under a hairline: the credits, an action, a footnote. */
export const usageSection = 'border-t border-line-soft pt-2'
