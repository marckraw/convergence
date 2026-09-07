import { describe, expect, it } from 'vitest'
import { resolveCardDrop } from './canvas-collision.pure'

const other = { id: 'other', x: 0, y: 0, width: 260, height: 108 }
const dragged = { ...other, id: 'dragged' }

describe('R15 collision on drop', () => {
  it('nudges an overlapping drop to the nearest free grid position (mutation: return raw drop)', () => {
    expect(resolveCardDrop(dragged, [other])).toEqual({ x: 0, y: 180 })
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

  it('H-R15 never returns a negative y (mutation: allow candidates above the floor)', () => {
    expect(resolveCardDrop({ ...dragged, y: -180 }, [])).toEqual({ x: 0, y: 0 })
  })

  it('H-R15 respects the frame title floor (mutation: ignore the supplied minimum y)', () => {
    expect(resolveCardDrop(dragged, [], 44)).toEqual({ x: 0, y: 60 })
  })

  it('H-R15 prefers down on equal distances above the floor (mutation: tie toward negative y)', () => {
    const square = { ...other, y: 500, width: 100, height: 100 }
    const drop = { ...square, id: 'dragged' }
    expect([
      resolveCardDrop(drop, [square]),
      resolveCardDrop(drop, [square]),
    ]).toEqual([
      { x: 0, y: 680 },
      { x: 0, y: 680 },
    ])
  })

  it('H-R15 prefers right when equal-distance candidates share y (mutation: tie toward negative x)', () => {
    const tall = { ...other, y: 600, width: 100, height: 500 }
    expect(resolveCardDrop({ ...tall, id: 'dragged' }, [tall])).toEqual({
      x: 180,
      y: 600,
    })
  })
})
