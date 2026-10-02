import { chipFrame } from '@convergence/ui'

/**
 * A response going with the next message (CONV-15, MAR-3617): Chip's own
 * frame (`chipFrame`, rounded-md, the line, the muted wash and ink, 28 px),
 * for the annotation chip, its edit form and the tray's pill, which hold more
 * than a Chip does (a quote, an arrow, the words, two actions). The ✕ end
 * is a removable Chip's.
 */
export const annotationChipFrame = `${chipFrame} pr-0.5`

/** The response's own words, in the body ink beside the muted quote. */
export const annotationBody = 'min-w-0 truncate text-ink'

/** The quoted words, cut short, in the muted italic. */
export const annotationQuote = 'min-w-0 max-w-64 truncate italic text-ink-muted'
