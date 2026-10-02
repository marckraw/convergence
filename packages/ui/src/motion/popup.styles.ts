/*
 * How a popup enters and leaves (MAR-3616): plain CSS transitions on the
 * first and last frames Base UI marks (`data-starting-style`,
 * `data-ending-style`), not keyframes, so closing midway reverses smoothly
 * from wherever the popup is. The values are the motion tokens (DS2), which
 * hold today's (R0): in over --motion-fast from --motion-scale-from and
 * --motion-shift toward the trigger, out in --motion-exit. Reduced motion
 * zeroes the scale and the travel in tokens.css and keeps the fade.
 *
 * Beside the motion, what a popup's rows look like: one source for Menu,
 * Select and Popover, and for any panel built by hand that should look like
 * them.
 */

export { popupSurface } from './popup-surface.styles'

/** The fade and the grow, on Base UI's first and last frames. */
const grow = [
  'transition-motion duration-fast ease-enter',
  'data-starting-style:opacity-0 data-starting-style:scale-(--motion-scale-from)',
  'data-ending-style:opacity-0 data-ending-style:scale-(--motion-scale-from) data-ending-style:duration-exit data-ending-style:ease-exit',
].join(' ')

/** The travel from the trigger's side, by the side the popup sits on. */
const travel = [
  'data-[side=top]:data-starting-style:translate-y-(--motion-shift)',
  'data-[side=bottom]:data-starting-style:-translate-y-(--motion-shift)',
  'data-[side=left]:data-starting-style:translate-x-(--motion-shift)',
  'data-[side=right]:data-starting-style:-translate-x-(--motion-shift)',
].join(' ')

/**
 * Grows from what you pointed at: tooltips, menus, popovers and selects.
 * Base UI's Positioner (and the tooltip host) set `--transform-origin` to the
 * point facing the trigger, and `data-side` to the side it sits on, so it
 * also travels 8 px in from that side, as today's popover and select did; the
 * menu joins them (R0, DS-18).
 */
export const popupMotion = ['origin-(--transform-origin)', grow, travel].join(
  ' ',
)

/**
 * Appears in place, growing and fading in: dialogs, which have no trigger to
 * grow from. Today's pop, on transitions.
 */
export const growMotion = grow

/** Only fades: the scrim behind a dialog or a sheet. */
export const fadeMotion = [
  'transition-opacity duration-fast ease-enter',
  'data-starting-style:opacity-0',
  'data-ending-style:opacity-0 data-ending-style:duration-exit data-ending-style:ease-exit',
].join(' ')

/**
 * One row in a popup's list (a menu item, a select's option): a line of text,
 * an icon before it if you like with the gap built in, lit in the highlight
 * while the pointer or the arrow keys are on it. Today's menu item (R0); its
 * `gap-2` was pasted on 31 of 37 items (DLG-22).
 */
export const popupItem = [
  'relative flex select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none',
  'data-highlighted:bg-highlight data-highlighted:text-on-highlight',
  'data-disabled:pointer-events-none data-disabled:opacity-50',
  '[&_svg]:pointer-events-none [&_svg]:shrink-0',
].join(' ')

/** Where a checked row's check sits: at the row's end (Menu's checkbox and radio items, Select's options). */
export const popupItemCheck =
  'pointer-events-none absolute right-2 flex size-3.5 items-center justify-center'

/** The name of a group of rows, small and muted above them. */
export const popupLabel = 'px-2 py-1.5 text-xs text-ink-muted'

/** The hairline between groups of rows, across the panel's padding (the menu's, R0). */
export const popupSeparator = '-mx-1 my-1 h-px bg-surface-muted'
