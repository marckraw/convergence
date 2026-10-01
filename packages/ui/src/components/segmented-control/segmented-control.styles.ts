/*
 * "One of a few, side by side" (MAR-3616 DS3c): SegmentedControl's radios,
 * NavTabs' links and Tabs' `segmented` tabs share this look, so the eye reads
 * them as one control. R7: the chosen one is a raised chip (--chip with the
 * raised shadow) on a muted track (--chip-track); never the ring's colour,
 * never a white overlay, never a swapped Button variant. Only colours and
 * the shadow change when the choice moves, so nothing shifts under the
 * pointer.
 */

import { focusRing } from '#lib/focus-ring.styles'

/** R3, the item's own height: 24, 28 or 32 px inside the 2 px track. */
export type SegmentedSize = 'xs' | 'sm' | 'md'

/** The track: a muted groove the items sit in. */
export const segmentedTrack =
  'inline-flex max-w-full shrink-0 items-center gap-0.5 rounded-md border border-transparent bg-chip-track p-0.5'

/** One item, quiet until it's the chosen one. */
export const segmentedItem = [
  'inline-flex min-w-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-sm',
  'font-medium text-ink-muted transition-colors hover:text-ink',
  'data-checked:bg-chip data-checked:text-ink data-checked:shadow-raised',
  'data-active:bg-chip data-active:text-ink data-active:shadow-raised',
  'aria-[current=page]:bg-chip aria-[current=page]:text-ink aria-[current=page]:shadow-raised',
  focusRing,
  'data-disabled:pointer-events-none data-disabled:opacity-50',
  '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  'app-no-drag',
].join(' ')

/** Each size: the item's height, padding, type and icon (Button's R3 recipes). */
export const segmentedItemSize: Record<SegmentedSize, string> = {
  xs: 'h-control-xs px-2 text-2xs [&_svg]:size-3',
  sm: 'h-control-sm px-2 text-xs [&_svg]:size-3.5',
  md: 'h-control-md px-3 text-xs [&_svg]:size-4',
}
