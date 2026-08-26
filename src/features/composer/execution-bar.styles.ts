/**
 * Every visual knob of the Execution Bar (MAR-2642).
 *
 * One file on purpose: this strip sits under the composer on every screen, so
 * "smaller" or "quieter" is a note Marcin will make on sight and the answer
 * has to be one line, not a hunt through JSX.
 */

/** The tier itself: a rule above it, and room for a second element beside. */
export const stripClass =
  'mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border/60 pt-2'

/** "Runs on". */
export const stripLabelClass = 'text-[11px] font-medium text-muted-foreground'

/** The chooser, while a session is being born. */
export const stripSelectClass =
  'h-6 px-1.5 text-[11px] text-muted-foreground hover:text-foreground'

/** The machine, once the session is live and the choice is no longer one. */
export const stripFactClass =
  'rounded-md border border-border/60 px-1.5 py-0.5 text-[11px] font-medium text-foreground'

/** A live session whose machine is gone. */
export const stripWarningClass =
  'flex min-w-0 items-center gap-1 text-[11px] text-warning-foreground'

export const stripWarningIconClass = 'h-3 w-3 shrink-0'
