import type { FoldCardState } from './needs-you-fold.pure'

/**
 * The one place a card's state becomes a colour (MAR-3366 R6). The card's
 * status icon and the folded section's glyph strip both read it, so a
 * retuned colour changes both at once. States the card leaves untinted fall
 * back to muted.
 *
 * R1's tones, the inks (MC-2, MC-3): waiting on you is warning, failed is
 * danger, working is info, finished is success -- the colour the same
 * session wears in Mission Control and on Loom.
 */
export const cardStateTone: Readonly<Record<FoldCardState, string>> = {
  waiting: 'text-warning-ink',
  failed: 'text-danger-ink',
  working: 'text-info-ink',
  finished: 'text-success-ink',
  unreachable: 'text-ink-muted',
  unknown: 'text-ink-muted',
  idle: 'text-ink-muted',
}

/** The tones that name a state; the muted fallback is not one of them. */
export const cardStateToneKeys = [
  'waiting',
  'failed',
  'working',
  'finished',
] as const satisfies readonly FoldCardState[]
