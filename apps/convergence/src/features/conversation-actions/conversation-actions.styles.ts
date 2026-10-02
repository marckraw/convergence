import type { CSSProperties } from 'react'
import { focusRing } from '@convergence/ui'
import {
  FLOATING_CORNER_CLEAR_BOTTOM,
  FLOATING_CORNER_CLEAR_RIGHT,
} from '@/entities/feedback'
import type { ActionsMenuGroup } from './conversation-actions-menu.pure'

/**
 * The standard focus ring (the Button primitive's, focusRing), so every item
 * in the menu shows the same one (MAR-3393 R6).
 */
const FOCUS_RING = focusRing

/**
 * The existing pop tokens only (R7): no new duration or keyframe. `pop-in`
 * fades and scales in place, and reduced motion drops it entirely.
 */
const POP = 'animate-pop-in motion-reduce:animate-none'

/**
 * The pill's look on the shared Button (ghost, `lg`), as frames 01 and 02
 * draw it, on the one opaque popup surface (R8: glass is the tooltip's
 * alone). Its height, padding and words are the lg size's, 36 px (R11: the
 * frames' 34 px to the nearest; R3: a size is a prop, never a className).
 */
const PILL =
  'gap-1.5 rounded-full border border-line bg-raised font-medium text-ink shadow-raised hover:bg-fill-hover'

export const conversationActionsStyles = {
  /**
   * Below the composer, right-aligned, while the surface is narrow; in the
   * right gutter beside the composer column once there is room for it: the
   * app's container size `actions-beside` (global.css: the column is
   * `max-w-conversation`, 42rem, so 56rem leaves 7rem each side; CONV-29).
   *
   * Never under the feedback button (MAR-3416 R2): narrow, the button stops
   * short of the feedback button's corner (`--actions-clear-right`); in the
   * gutter it stands above that corner (`--actions-clear-bottom`). Both
   * lengths come from the shared corner, through `ACTIONS_ROW_STYLE`.
   *
   * One layer for the button, the fan and the lists (R1): above the composer
   * card (`z-10`) and the feedback button (`z-40`), below dialogs, popovers
   * and tooltips (`z-50`). Covered content is `inert` (the expanded Loom),
   * and a layer this high would show through the cover, so it hides there.
   */
  row: 'relative z-45 mt-2 flex justify-end pr-(--actions-clear-right) in-[[inert]]:invisible @min-actions-beside:absolute @min-actions-beside:bottom-(--actions-clear-bottom) @min-actions-beside:right-4 @min-actions-beside:mt-0 @min-actions-beside:pr-0',
  /** The button's place, 96 px: the trigger and the fan's Close each fill it. */
  anchor: 'relative h-control-lg w-24',
  trigger: `${PILL} w-full ${FOCUS_RING}`,
  triggerHidden: 'invisible',
  /** The anchor's box: the entries are placed from its bottom-right corner, Close over it. */
  fan: 'absolute inset-0 outline-none',
  fanItem: `absolute ${PILL} ${FOCUS_RING} ${POP}`,
  fanClose: `absolute bottom-0 right-0 w-full ${PILL} ${FOCUS_RING} ${POP}`,
  panel: `absolute z-40 flex flex-col overflow-hidden rounded-2xl border border-line bg-raised text-ink shadow-floating ${FOCUS_RING} ${POP}`,
  panelScroll: 'min-h-0 flex-1 overflow-y-auto overscroll-contain p-3',
  /**
   * The panel's way back, its title beside it: the 36 px (lg) Button's own
   * height, padding and words (R3), drawn out by its padding so the chevron
   * stands on the panel's edge of words.
   */
  back: `-ml-4 mb-1 gap-1 font-medium text-ink ${FOCUS_RING}`,
  /** The Skills search is a SearchField, every skill list's one search (CONV-10): placed, not restyled. */
  search: 'mb-1',
  notice: 'mb-1 px-2 text-xs leading-relaxed text-ink-muted',
  list: 'flex flex-col',
  /**
   * One command of the menu: a dense ListRow (a line of words in a 32 px
   * row, 8 px in), a row and never a Button resized into one (R3). One not
   * offered keeps its place and its focus, in the muted ink, with no hover.
   */
  item: 'rounded-md has-aria-disabled:cursor-not-allowed has-aria-disabled:text-ink-muted has-aria-disabled:hover:bg-transparent',
  /** Close menu, under a running routine: the 28 px (sm) Button's own row, quieter. */
  closeItem: `mt-1 w-full justify-start text-left font-normal text-ink-muted ${FOCUS_RING}`,
  reason: 'px-2 pb-1.5 text-xs leading-relaxed text-ink-muted',
  /**
   * A Skills row (MAR-3616 DS3e): a ListboxOption the search drives, its
   * reason inside it. One not offered keeps today's muted words, undimmed.
   */
  option:
    'rounded-md px-2 py-1.5 text-sm text-ink aria-disabled:cursor-not-allowed aria-disabled:text-ink-muted aria-disabled:opacity-100',
  optionReason: 'pb-0.5 text-xs leading-relaxed text-ink-muted',
  // A routine's beat is working: the info ink (R1), readable in light too (CONV-2).
  progress: 'px-2 py-1 text-base text-info-ink',
  status: 'px-2 py-1.5 text-sm text-ink-muted',
  hint: 'mt-1 px-2 text-xs text-ink-muted',
  refusal: 'px-2 pb-1.5 leading-relaxed',
} as const

/**
 * The Actions host's right padding (the mount's `px-4`). The narrow row sits
 * inside it, so the row pads only the rest of the way to the corner's edge.
 */
const ACTIONS_HOST_INSET_RIGHT = 16

/** The lengths the row's classes read (MAR-3416 R2), from the shared corner. */
export const ACTIONS_ROW_STYLE = {
  '--actions-clear-right': `${FLOATING_CORNER_CLEAR_RIGHT - ACTIONS_HOST_INSET_RIGHT}px`,
  '--actions-clear-bottom': `${FLOATING_CORNER_CLEAR_BOTTOM}px`,
} as CSSProperties

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
