/**
 * The composer toolbar's control (CONV-14, MAR-3617): the muted ink that takes
 * the ink on hover, on the pickers' triggers (provider, model, effort,
 * permissions) that are not Buttons of their own. Their height, padding and
 * 12 px words are the row's one size, `sm` (R3), as a prop. One string, not
 * thirteen.
 */
export const composerToolbarControl = 'text-ink-muted hover:text-ink'

/** A row of things going with the next message: skills, project context. */
export const composerAttachedRow = 'mb-2 flex flex-wrap gap-1.5'
