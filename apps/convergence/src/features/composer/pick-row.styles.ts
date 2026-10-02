import { cn } from '@convergence/ui'

/**
 * A row you pick in the composer's Skills and Context popovers (CONV-9,
 * MAR-3617): one look for both, R7's chosen look (the selected fill, hover
 * about half of it) instead of a primary tint and a border.
 */
export function pickRowClass(selected: boolean): string {
  return cn(
    'h-auto w-full justify-start rounded-lg px-3 text-left',
    selected ? 'bg-fill-selected text-on-highlight' : 'hover:bg-fill-hover',
  )
}

/** The row's description, two lines at most. */
export const pickRowDetail =
  'mt-1 line-clamp-2 block whitespace-normal text-xs font-normal leading-5 text-ink-muted'

/** A popover of picks: as wide as asked, never wider than the room beside it. */
export const pickPopover = 'max-w-(--available-width) p-0'
