import { cn } from '@convergence/ui'

/**
 * A row you pick in the composer's Skills and Context popovers (CONV-9,
 * MAR-3617): one look for both, R7's chosen look (the selected fill, hover
 * about half of it) instead of a primary tint and a border. It is a Card
 * with no edge or fill of its own and a CardAction holding its lines, never
 * a Button stretched with h-auto (R3, CONV-29's N5): the Card's hover, the
 * chosen fill kept under the pointer.
 */
export function pickRowClass(selected: boolean): string {
  return cn(
    'border-transparent bg-transparent',
    selected && 'bg-fill-selected text-on-highlight hover:bg-fill-selected',
  )
}

/** The row's door, which holds its lines: 12 px in and 8 px down, the room the row had. */
export const pickRowAction =
  'flex w-full min-w-0 items-start gap-2 px-3 py-2 text-left'

/** The row's description, two lines at most. */
export const pickRowDetail =
  'mt-1 line-clamp-2 block whitespace-normal text-xs font-normal leading-5 text-ink-muted'

/** A popover of picks: as wide as asked, never wider than the room beside it. */
export const pickPopover = 'max-w-(--available-width) p-0'
