import type { CSSProperties } from 'react'
import type { ActionsMenuGroup } from './conversation-actions-menu.pure'

/**
 * The standard focus ring (the Button primitive's), so every item in the menu
 * shows the same one (MAR-3393 R6).
 */
const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

/**
 * The existing pop tokens only (R7): no new duration or keyframe. `pop-in`
 * fades and scales in place, and reduced motion drops it entirely.
 */
const POP = 'animate-pop-in motion-reduce:animate-none'

/** Overrides on the shared Button (ghost): a pill, as frames 01 and 02 draw. */
const PILL =
  'h-[34px] gap-1.5 rounded-full border border-border/80 bg-popover/95 px-4 text-sm font-medium text-popover-foreground shadow-lg backdrop-blur-xl hover:bg-accent'

export const conversationActionsStyles = {
  /**
   * Below the composer, right-aligned, while the surface is narrow; in the
   * right gutter beside the composer column once there is room for it
   * (the column is `max-w-2xl`, 42rem, so 56rem leaves 7rem each side).
   */
  row: 'mt-2 flex justify-end @min-[56rem]:absolute @min-[56rem]:bottom-3 @min-[56rem]:right-4 @min-[56rem]:mt-0',
  anchor: 'relative h-[34px] w-24',
  trigger: `${PILL} w-24 px-0 ${FOCUS_RING}`,
  triggerHidden: 'invisible',
  fan: 'absolute bottom-0 right-0 h-0 w-0 outline-none',
  fanItem: `absolute ${PILL} ${FOCUS_RING} ${POP}`,
  fanClose: `absolute bottom-0 right-0 ${PILL} w-24 px-0 ${FOCUS_RING} ${POP}`,
  panel: `absolute z-40 flex flex-col overflow-hidden rounded-2xl border border-border/80 bg-popover/95 text-popover-foreground shadow-xl backdrop-blur-xl ${FOCUS_RING} ${POP}`,
  panelScroll: 'min-h-0 flex-1 overflow-y-auto overscroll-contain p-3',
  back: `-ml-1 mb-1 h-auto gap-1 px-1 py-0.5 text-base font-medium text-popover-foreground ${FOCUS_RING}`,
  search: `mb-1 h-8 border-0 px-2 py-1.5 shadow-none ${FOCUS_RING}`,
  notice: 'mb-1 px-2 text-xs leading-relaxed text-muted-foreground',
  list: 'flex flex-col',
  item: `h-auto w-full justify-start whitespace-normal rounded-md px-2 py-1.5 text-left text-sm font-normal text-popover-foreground ${FOCUS_RING} aria-disabled:cursor-not-allowed aria-disabled:text-muted-foreground aria-disabled:hover:bg-transparent`,
  reason: 'px-2 pb-1.5 text-xs leading-relaxed text-muted-foreground',
  progress: 'px-2 py-1 text-base text-sky-300',
  status: 'px-2 py-1.5 text-sm text-muted-foreground',
  emptyTitle: 'px-2 py-1.5 text-sm font-medium text-popover-foreground',
  hint: 'mt-1 px-2 text-xs text-muted-foreground',
  refusal: 'px-2 pb-1.5 text-xs leading-relaxed text-destructive',
} as const

/**
 * Where each fan entry sits, measured from the button's bottom-right corner
 * in frame 02 (`709:3412`): Skills above, Routines and Project arcing to the
 * left. Close takes the button's own place.
 */
export const FAN_ITEM_POSITION: Record<ActionsMenuGroup, CSSProperties> = {
  skills: { right: 12, bottom: 173 },
  routines: { right: 100, bottom: 127 },
  project: { right: 115, bottom: 62 },
}
