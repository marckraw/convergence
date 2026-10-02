import { describe, expect, it } from 'vitest'
import {
  FLOATING_CORNER,
  FLOATING_CORNER_BUTTON_CLASS,
  FLOATING_CORNER_CLEAR_BOTTOM,
  FLOATING_CORNER_CLEAR_RIGHT,
  cornerRectsIntersect,
  floatingCornerReservedRect,
} from './floating-corner.pure'

/** Tailwind's spacing scale: one step is 4 px. */
function spacing(className: string, utility: string): number {
  const match = className.match(
    new RegExp(`(?:^|\\s)${utility}-(\\d+)(?:\\s|$)`),
  )
  if (!match) throw new Error(`no ${utility}-N in "${className}"`)
  return Number(match[1]) * 4
}

describe('the floating corner (MAR-3416)', () => {
  it('describes the box its class draws — a class and a number that drift apart turn red', () => {
    const cls = FLOATING_CORNER_BUTTON_CLASS
    expect(cls.split(/\s+/)).toContain('fixed')
    expect(spacing(cls, 'right')).toBe(FLOATING_CORNER.right)
    expect(spacing(cls, 'bottom')).toBe(FLOATING_CORNER.bottom)
    expect(spacing(cls, 'h')).toBe(FLOATING_CORNER.size)
    expect(spacing(cls, 'w')).toBe(FLOATING_CORNER.size)
  })

  it('reserves the button box plus the gap on every side', () => {
    expect(floatingCornerReservedRect({ width: 1000, height: 800 })).toEqual({
      left: 1000 - 16 - 40 - 8,
      top: 800 - 40 - 40 - 8,
      right: 1000 - 16 + 8,
      bottom: 800 - 40 + 8,
    })
    expect(FLOATING_CORNER_CLEAR_BOTTOM).toBe(88)
    expect(FLOATING_CORNER_CLEAR_RIGHT).toBe(64)
  })

  it('counts an overlap as an intersection and a shared edge as none', () => {
    const a = { left: 0, top: 0, right: 10, bottom: 10 }
    expect(
      cornerRectsIntersect(a, { left: 9, top: 9, right: 20, bottom: 20 }),
    ).toBe(true)
    expect(
      cornerRectsIntersect(a, { left: 10, top: 0, right: 20, bottom: 10 }),
    ).toBe(false)
    expect(
      cornerRectsIntersect(a, { left: 0, top: 10, right: 10, bottom: 20 }),
    ).toBe(false)
  })
})
