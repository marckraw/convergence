import { describe, expect, it } from 'vitest'
import { resolveCardDrop } from './canvas-collision.pure'

const other = { id: 'other', x: 0, y: 0, width: 260, height: 108 }
const dragged = { ...other, id: 'dragged' }

describe('R15 collision on drop', () => {
  it('nudges an overlapping drop to the nearest free grid position (mutation: return raw drop)', () => {
    expect(resolveCardDrop(dragged, [other])).toEqual({ x: 0, y: -180 })
  })

  it('pushes a crowded drop outside the 64 px gap (mutation: return raw drop)', () => {
    expect(resolveCardDrop({ ...dragged, y: 140 }, [other])).toEqual({
      x: 0,
      y: 180,
    })
  })

  it('preserves a free drop at the exact gap (mutation: shift every free drop)', () => {
    expect(resolveCardDrop({ ...dragged, y: 172 }, [other])).toEqual({
      x: 0,
      y: 172,
    })
  })

  it('resolves equal distances deterministically by x then y (mutation: reverse the tie order)', () => {
    const square = { ...other, width: 100, height: 100 }
    const drop = { ...square, id: 'dragged' }
    expect([
      resolveCardDrop(drop, [square]),
      resolveCardDrop(drop, [square]),
    ]).toEqual([
      { x: -180, y: 0 },
      { x: -180, y: 0 },
    ])
  })
})
