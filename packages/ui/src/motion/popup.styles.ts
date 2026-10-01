/*
 * How a popup enters and leaves (MAR-3616): plain CSS transitions on the
 * first and last frames Base UI marks (`data-starting-style`,
 * `data-ending-style`), not keyframes, so closing midway reverses smoothly
 * from wherever the popup is. The values are today's (R0): in over 150 ms
 * from 95% and 8 px toward the trigger, out in 100 ms. Reduced motion keeps
 * the fade and drops the scale and the travel. The tooltip uses it now; the
 * menus, popovers and selects join in DS3b.
 */

/** The travel from the trigger's side, by the side the popup sits on. */
const travel = [
  'motion-safe:data-[side=top]:data-starting-style:translate-y-2',
  'motion-safe:data-[side=bottom]:data-starting-style:-translate-y-2',
  'motion-safe:data-[side=left]:data-starting-style:translate-x-2',
  'motion-safe:data-[side=right]:data-starting-style:-translate-x-2',
].join(' ')

/**
 * Grows from what you pointed at: tooltips now, menus, popovers and selects
 * in DS3b. Base UI's Positioner (and the tooltip host) set
 * `--transform-origin` to the point facing the trigger.
 */
export const popupMotion = [
  'origin-(--transform-origin) transition-[opacity,scale,translate] duration-150 ease-out',
  'data-starting-style:opacity-0 motion-safe:data-starting-style:scale-95',
  'data-ending-style:opacity-0 motion-safe:data-ending-style:scale-95 data-ending-style:duration-100',
  travel,
].join(' ')
