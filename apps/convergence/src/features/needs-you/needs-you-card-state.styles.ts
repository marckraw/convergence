import type { FoldCardState } from './needs-you-fold.pure'

/**
 * The one place a card's state becomes a colour (MAR-3366 R6). The card's
 * status icon and the folded section's glyph strip both read it, so a
 * retuned colour changes both at once. States the card leaves untinted fall
 * back to muted.
 */
export const cardStateTone: Readonly<Record<FoldCardState, string>> = {
  waiting: 'text-warning-foreground',
  failed: 'text-destructive',
  working: 'text-blue-600 dark:text-blue-400',
  finished: 'text-emerald-500',
  unreachable: 'text-muted-foreground',
  unknown: 'text-muted-foreground',
  idle: 'text-muted-foreground',
}

/** The tones that name a state; the muted fallback is not one of them. */
export const cardStateToneKeys = [
  'waiting',
  'failed',
  'working',
  'finished',
] as const satisfies readonly FoldCardState[]
