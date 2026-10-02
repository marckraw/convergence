/**
 * A response going with the next message (CONV-15, MAR-3617): the attached-
 * item look the composer's Chip wears (rounded-md, the line, the muted wash,
 * 28 px), for the annotation chip, its edit form and the tray's pill, which
 * hold more than a Chip does (a quote, an arrow, the words, two actions).
 */
export const annotationChipFrame =
  'inline-flex h-7 max-w-full min-w-0 items-center gap-1.5 rounded-md border border-line bg-surface-muted/40 pr-0.5 pl-1.5 text-xs text-ink'

/** The quoted words, cut short, in the muted italic. */
export const annotationQuote = 'min-w-0 max-w-64 truncate italic text-ink-muted'
