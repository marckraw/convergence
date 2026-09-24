/**
 * The window corner the feedback button owns (MAR-3416).
 *
 * One source for two readers: the feedback button that sits there, and every
 * floating control that must stay clear of it (the conversation's Actions
 * button). Features cannot import each other, so the corner lives in shared.
 * All numbers are CSS pixels measured from the window's right and bottom
 * edges.
 */
export const FLOATING_CORNER = {
  /** The button's distance from the window's right edge (`right-4`). */
  right: 16,
  /** The button's distance from the window's bottom edge (`bottom-10`). */
  bottom: 40,
  /** The button's width and height (`h-10 w-10`). */
  size: 40,
  /** The clear space every other control keeps around the button. */
  gap: 8,
} as const

/**
 * The feedback button's own box as Tailwind classes. Written out literally so
 * Tailwind can see them; `floating-corner.pure.test.ts` pins them to the
 * numbers above.
 */
export const FLOATING_CORNER_BUTTON_CLASS = 'fixed right-4 bottom-10 h-10 w-10'

/**
 * How far above the window's bottom edge a control must start to sit clear
 * above the corner: the button's top plus the gap (88 px).
 */
export const FLOATING_CORNER_CLEAR_BOTTOM =
  FLOATING_CORNER.bottom + FLOATING_CORNER.size + FLOATING_CORNER.gap

/**
 * How far from the window's right edge a control must end to sit clear
 * beside the corner: the button's left edge plus the gap (64 px).
 */
export const FLOATING_CORNER_CLEAR_RIGHT =
  FLOATING_CORNER.right + FLOATING_CORNER.size + FLOATING_CORNER.gap

export interface CornerRect {
  left: number
  top: number
  right: number
  bottom: number
}

/**
 * The reserved corner in a window of this size: the button's box grown by
 * the gap on every side.
 */
export function floatingCornerReservedRect(viewport: {
  width: number
  height: number
}): CornerRect {
  const { right, bottom, size, gap } = FLOATING_CORNER
  return {
    left: viewport.width - right - size - gap,
    top: viewport.height - bottom - size - gap,
    right: viewport.width - right + gap,
    bottom: viewport.height - bottom + gap,
  }
}

/** Whether two boxes overlap; boxes that only touch at an edge do not. */
export function cornerRectsIntersect(a: CornerRect, b: CornerRect): boolean {
  return (
    a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
  )
}
