import { durationsMs } from '../../motion/tokens'

/** Where a tooltip shows, beside what it explains. */
export type TooltipSide = 'top' | 'right' | 'bottom' | 'left'

/** What made a tooltip show at once, as `data-instant` says: focus, or another tooltip just before. */
export type TooltipInstant = 'focus' | 'delay' | undefined

/**
 * How long a pointer rests on something before its tooltip shows, in ms: the
 * delay the app's root provider has always used (R0, MAR-3616), the
 * `--motion-tooltip-delay` token (DS-33).
 */
export const TOOLTIP_DELAY_MS = durationsMs.tooltipDelay

/**
 * After a tooltip closes, how long the next one still shows at once, in ms:
 * the `--motion-tooltip-warm` token (DS-33).
 */
export const TOOLTIP_WARM_MS = durationsMs.tooltipWarm

/** Between a tooltip and what it explains, in px: today's `sideOffset`. */
export const TOOLTIP_OFFSET = 4

/** The least room a tooltip keeps from the screen's edges, in px. */
export const TOOLTIP_PADDING = 5

const SIDES: readonly string[] = ['top', 'right', 'bottom', 'left']

/** The side an attribute names, or top when it names none. */
export const sideOf = (value: string | null | undefined): TooltipSide =>
  value && SIDES.includes(value) ? (value as TooltipSide) : 'top'

type Moment = {
  /** A tooltip is on screen right now (moving from one control to the next). */
  showing: boolean
  /** Since the last tooltip closed, in ms. */
  msSinceClosed: number
}

/**
 * How a tooltip opens. Keyboard focus shows it at once. A pointer waits
 * TOOLTIP_DELAY_MS, unless a tooltip is showing or closed less than
 * TOOLTIP_WARM_MS ago: then it opens at once and skips its animation, so
 * moving along a toolbar reads label after label.
 */
export const openingOf = (
  cause: 'hover' | 'focus',
  { showing, msSinceClosed }: Moment,
): { delayMs: number; instant: TooltipInstant } => {
  if (cause === 'focus') return { delayMs: 0, instant: 'focus' }
  if (showing || msSinceClosed < TOOLTIP_WARM_MS)
    return { delayMs: 0, instant: 'delay' }
  return { delayMs: TOOLTIP_DELAY_MS, instant: undefined }
}

/**
 * Whether an anchor's tooltip may show now. An empty label shows nothing. A
 * trigger whose menu or popover is open says enough already: Base UI marks it
 * `data-popup-open`, and so does a trigger with a TooltipCard of its own
 * (`popupOpen` covers both); a popup trigger that says `aria-haspopup` and
 * `aria-expanded="true"` is open too. A disclosure that is merely expanded (a
 * branch row, a fold) has no popup, and keeps its name (NAV-13). A tooltip
 * asked for only when its text is cut short shows only then.
 */
export const mayShow = (anchor: {
  label: string | null
  popupOpen: boolean
  expanded: string | null
  hasPopup: string | null
  onlyWhenTruncated: boolean
  truncated: boolean
}): boolean =>
  Boolean(anchor.label) &&
  !anchor.popupOpen &&
  !(
    anchor.expanded === 'true' &&
    anchor.hasPopup !== null &&
    anchor.hasPopup !== 'false'
  ) &&
  (!anchor.onlyWhenTruncated || anchor.truncated)

type Box = { top: number; left: number; width: number; height: number }
type Size = { width: number; height: number }

export type TooltipPlacement = {
  /** The side it ended up on: the one asked for, or the opposite when that has no room. */
  side: TooltipSide
  /** Its top left corner, in the viewport's px (position: fixed). */
  top: number
  left: number
  /** Where it grows from, in its own px: the middle of what it explains, on the facing edge. */
  originX: number
  originY: number
}

const OPPOSITE: Record<TooltipSide, TooltipSide> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
}

const clamp = (value: number, low: number, high: number) =>
  Math.min(Math.max(value, low), Math.max(low, high))

/**
 * Where a tooltip goes: centred on the side asked for, flipped to the
 * opposite side when that side hasn't the room and the other has more, and
 * slid along its side to stay on screen. It grows from the point facing the
 * middle of its anchor, as Base UI's popups do.
 */
export const placeTooltip = (
  anchor: Box,
  tooltip: Size,
  viewport: Size,
  asked: TooltipSide,
): TooltipPlacement => {
  const room: Record<TooltipSide, number> = {
    top: anchor.top - TOOLTIP_OFFSET - TOOLTIP_PADDING,
    bottom:
      viewport.height -
      (anchor.top + anchor.height) -
      TOOLTIP_OFFSET -
      TOOLTIP_PADDING,
    left: anchor.left - TOOLTIP_OFFSET - TOOLTIP_PADDING,
    right:
      viewport.width -
      (anchor.left + anchor.width) -
      TOOLTIP_OFFSET -
      TOOLTIP_PADDING,
  }
  const vertical = asked === 'top' || asked === 'bottom'
  const needed = vertical ? tooltip.height : tooltip.width
  const side =
    room[asked] < needed && room[OPPOSITE[asked]] > room[asked]
      ? OPPOSITE[asked]
      : asked
  const middleX = anchor.left + anchor.width / 2
  const middleY = anchor.top + anchor.height / 2

  if (side === 'top' || side === 'bottom') {
    const left = clamp(
      middleX - tooltip.width / 2,
      TOOLTIP_PADDING,
      viewport.width - TOOLTIP_PADDING - tooltip.width,
    )
    const top =
      side === 'top'
        ? anchor.top - TOOLTIP_OFFSET - tooltip.height
        : anchor.top + anchor.height + TOOLTIP_OFFSET
    return {
      side,
      top,
      left,
      originX: middleX - left,
      originY: side === 'top' ? tooltip.height : 0,
    }
  }
  const top = clamp(
    middleY - tooltip.height / 2,
    TOOLTIP_PADDING,
    viewport.height - TOOLTIP_PADDING - tooltip.height,
  )
  const left =
    side === 'left'
      ? anchor.left - TOOLTIP_OFFSET - tooltip.width
      : anchor.left + anchor.width + TOOLTIP_OFFSET
  return {
    side,
    top,
    left,
    originX: side === 'left' ? tooltip.width : 0,
    originY: middleY - top,
  }
}
