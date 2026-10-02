import type { BadgeSize } from '@convergence/ui'

/**
 * The machine or the place, once settled: a quiet label Badge (CONV-18),
 * outlined, at the strip's own 11 px (the Badge's `md`, a size and never a
 * className: DS-4), the scale Marcin ruled quiet (MAR-2642) and
 * composer.container.test.tsx pins. The composer's Execution Bar wears the
 * same one.
 */
export const stripFactSize: BadgeSize = 'md'

/**
 * The branch field, at the strip's 11 px and its tight padding: the one
 * field with words smaller than the frame's compact 12 px, kept so the strip
 * stays on its one ruled scale (MAR-2642). A recorded exception in
 * scripts/guards/sizes-in-constants.json, not a pattern (ruling 10).
 */
export const stripInputClass =
  'w-40 border-line-soft px-1.5 text-2xs shadow-none'

export const stripLabelClass = 'text-2xs font-medium text-ink-muted'

export const stripNoticeClass = 'text-2xs text-ink-muted'

/** The place picker's trigger, beside size="xs" (24 px, R3) on the Combobox: its quiet ink only. */
export const stripSelectClass = 'text-ink-muted hover:text-ink'
