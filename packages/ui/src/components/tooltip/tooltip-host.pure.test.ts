import { describe, expect, it } from 'vitest'
import {
  mayShow,
  openingOf,
  placeTooltip,
  sideOf,
  TOOLTIP_DELAY_MS,
  TOOLTIP_OFFSET,
  TOOLTIP_PADDING,
  TOOLTIP_WARM_MS,
} from './tooltip-host.pure'

describe('sideOf', () => {
  it('reads the four sides, and anything else as top', () => {
    expect(sideOf('right')).toBe('right')
    expect(sideOf('bottom')).toBe('bottom')
    expect(sideOf('left')).toBe('left')
    expect(sideOf('top')).toBe('top')
    expect(sideOf('inline-start')).toBe('top')
    expect(sideOf(null)).toBe('top')
    expect(sideOf(undefined)).toBe('top')
  })
})

describe('openingOf', () => {
  const cold = { showing: false, msSinceClosed: Number.POSITIVE_INFINITY }

  it('keeps the app root’s delay of 200 ms (R0)', () => {
    expect(TOOLTIP_DELAY_MS).toBe(200)
  })

  it('shows a focused control’s tooltip at once', () => {
    expect(openingOf('focus', cold)).toEqual({ delayMs: 0, instant: 'focus' })
  })

  it('waits for a resting pointer the first time', () => {
    expect(openingOf('hover', cold)).toEqual({
      delayMs: TOOLTIP_DELAY_MS,
      instant: undefined,
    })
  })

  it('opens the next tooltip at once while one shows, or just after', () => {
    expect(openingOf('hover', { showing: true, msSinceClosed: 5_000 })).toEqual(
      { delayMs: 0, instant: 'delay' },
    )
    expect(
      openingOf('hover', {
        showing: false,
        msSinceClosed: TOOLTIP_WARM_MS - 1,
      }),
    ).toEqual({ delayMs: 0, instant: 'delay' })
    expect(
      openingOf('hover', { showing: false, msSinceClosed: TOOLTIP_WARM_MS })
        .delayMs,
    ).toBe(TOOLTIP_DELAY_MS)
  })
})

describe('mayShow', () => {
  const anchor = {
    label: 'Settings',
    popupOpen: false,
    expanded: null,
    hasPopup: null,
    onlyWhenTruncated: false,
    truncated: false,
  }

  it('shows a label', () => {
    expect(mayShow(anchor)).toBe(true)
  })

  it('shows nothing for an empty label', () => {
    expect(mayShow({ ...anchor, label: '' })).toBe(false)
    expect(mayShow({ ...anchor, label: null })).toBe(false)
  })

  it('stays away from a trigger whose menu or popover is open', () => {
    expect(mayShow({ ...anchor, popupOpen: true })).toBe(false)
    expect(mayShow({ ...anchor, expanded: 'true', hasPopup: 'menu' })).toBe(
      false,
    )
    expect(mayShow({ ...anchor, expanded: 'true', hasPopup: 'true' })).toBe(
      false,
    )
    expect(mayShow({ ...anchor, expanded: 'false', hasPopup: 'menu' })).toBe(
      true,
    )
  })

  it('keeps the name on a disclosure that is open, which has no popup (NAV-13)', () => {
    expect(mayShow({ ...anchor, expanded: 'true' })).toBe(true)
    expect(mayShow({ ...anchor, expanded: 'true', hasPopup: 'false' })).toBe(
      true,
    )
  })

  it('shows a truncated-only tooltip only when the text is cut short', () => {
    expect(mayShow({ ...anchor, onlyWhenTruncated: true })).toBe(false)
    expect(
      mayShow({ ...anchor, onlyWhenTruncated: true, truncated: true }),
    ).toBe(true)
  })
})

describe('placeTooltip', () => {
  const viewport = { width: 375, height: 812 }
  const tooltip = { width: 100, height: 24 }
  // A 32 px button in the middle of the screen.
  const middle = { top: 400, left: 170, width: 32, height: 32 }

  it('centres the tooltip above, growing from the middle of its bottom edge', () => {
    expect(placeTooltip(middle, tooltip, viewport, 'top')).toEqual({
      side: 'top',
      top: 400 - TOOLTIP_OFFSET - 24,
      left: 186 - 50,
      originX: 50,
      originY: 24,
    })
  })

  it('goes below when asked, growing from its top edge', () => {
    expect(placeTooltip(middle, tooltip, viewport, 'bottom')).toMatchObject({
      side: 'bottom',
      top: 432 + TOOLTIP_OFFSET,
      originY: 0,
    })
  })

  it('flips to the other side when its own has no room', () => {
    const atTheTop = { ...middle, top: 10 }
    expect(placeTooltip(atTheTop, tooltip, viewport, 'top')).toMatchObject({
      side: 'bottom',
      top: 42 + TOOLTIP_OFFSET,
    })
    const atTheRight = { ...middle, left: 330 }
    expect(placeTooltip(atTheRight, tooltip, viewport, 'right')).toMatchObject({
      side: 'left',
    })
  })

  it('slides along its side to stay on screen, still growing from its anchor’s middle', () => {
    const nearTheLeft = { ...middle, left: 4 }
    const placed = placeTooltip(nearTheLeft, tooltip, viewport, 'top')
    expect(placed.left).toBe(TOOLTIP_PADDING)
    expect(placed.originX).toBe(20 - TOOLTIP_PADDING)
    const nearTheRight = { ...middle, left: 340 }
    expect(placeTooltip(nearTheRight, tooltip, viewport, 'top').left).toBe(
      375 - TOOLTIP_PADDING - 100,
    )
  })

  it('sits beside its anchor on the left or the right, centred on it', () => {
    expect(placeTooltip(middle, tooltip, viewport, 'right')).toEqual({
      side: 'right',
      top: 416 - 12,
      left: 202 + TOOLTIP_OFFSET,
      originX: 0,
      originY: 12,
    })
    expect(placeTooltip(middle, tooltip, viewport, 'left')).toMatchObject({
      side: 'left',
      left: 170 - TOOLTIP_OFFSET - 100,
      originX: 100,
    })
  })
})
