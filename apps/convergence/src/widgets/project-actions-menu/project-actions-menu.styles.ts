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
  'flex size-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground'

/** The mono line under an action's name: its command, or what it does. */
export const actionDetail =
  'block truncate font-mono text-2xs text-muted-foreground'

/** A Button drawn as one of the panel's wide rows. */
export const actionButtonRow =
  'h-auto w-full justify-start rounded-md px-3 text-left'
