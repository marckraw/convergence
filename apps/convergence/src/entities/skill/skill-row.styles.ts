/**
 * A skill's row (CONV-10), in its two forms. `full` is the Add popover's: the
 * name line, two lines of description and the tags under them. `compact` is
 * the `::skill::` picker's: the name line and one muted line under it, the
 * same rhythm as the composer's other inline pickers.
 */
export const skillRowStyles = {
  full: 'min-w-0 flex-1',
  fullLine: 'flex min-w-0 items-center gap-2',
  fullName: 'truncate text-sm font-medium',
  fullDetail:
    'mt-1 line-clamp-2 block whitespace-normal text-xs font-normal leading-5 text-ink-muted',
  fullTags: 'mt-2 flex flex-wrap items-center gap-1.5',
  compactLine: 'flex w-full min-w-0 items-center gap-1.5',
  compactName: 'truncate font-medium',
  compactDetail: 'line-clamp-2 w-full text-2xs text-ink-muted',
  warning: 'size-3.5 shrink-0 text-warning-ink',
} as const
