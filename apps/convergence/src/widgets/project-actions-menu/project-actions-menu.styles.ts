/*
 * The project actions panel's rows (MAR-3617): an icon in a 32 px box, a
 * name, and a line of mono detail under it. Kept here once, not retyped in
 * each row.
 */

/** A row: the 36 px icon column, then the words. */
export const actionRow = 'flex items-center gap-2'

/** The icon column, as wide as the run button that sits in it. */
export const actionIconColumn = 'flex w-9 shrink-0 items-center'

/** An action's icon, boxed like the run button beside the commands. */
export const actionIconBox =
  'flex size-8 items-center justify-center rounded-md border border-line bg-canvas text-ink-muted [&>svg]:size-4'

/** The mono line under an action's name: its command, or what it does. */
export const actionDetail = 'block truncate font-mono text-2xs text-ink-muted'

/**
 * The last row, Add action: a ListRow like the lane rows under it (R3: a
 * row, never a Button stretched with h-auto: NAV's N3), with a dashed edge
 * that says it adds one more.
 */
export const actionAddRow = 'rounded-md border border-dashed border-line'
