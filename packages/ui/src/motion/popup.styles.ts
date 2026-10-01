/*
 * How a popup enters and leaves (MAR-3616): plain CSS transitions on the
 * first and last frames Base UI marks (`data-starting-style`,
 * `data-ending-style`), not keyframes, so closing midway reverses smoothly
 * from wherever the popup is. The values are the motion tokens (DS2), which
 * hold today's (R0): in over --motion-fast from --motion-scale-from and
 * --motion-shift toward the trigger, out in --motion-exit. Reduced motion
 * zeroes the scale and the travel in tokens.css and keeps the fade. The
 * tooltip uses it now; the menus, popovers and selects join in DS3b.
 */

/** The travel from the trigger's side, by the side the popup sits on. */
const travel = [
  'data-[side=top]:data-starting-style:translate-y-(--motion-shift)',
  'data-[side=bottom]:data-starting-style:-translate-y-(--motion-shift)',
  'data-[side=left]:data-starting-style:translate-x-(--motion-shift)',
  'data-[side=right]:data-starting-style:-translate-x-(--motion-shift)',
].join(' ')

/**
 * Grows from what you pointed at: tooltips now, menus, popovers and selects
 * in DS3b. Base UI's Positioner (and the tooltip host) set
 * `--transform-origin` to the point facing the trigger.
 */
export const popupMotion = [
  'origin-(--transform-origin) transition-[opacity,scale,translate] duration-fast ease-enter',
  'data-starting-style:opacity-0 data-starting-style:scale-(--motion-scale-from)',
  'data-ending-style:opacity-0 data-ending-style:scale-(--motion-scale-from) data-ending-style:duration-exit data-ending-style:ease-exit',
  travel,
].join(' ')
