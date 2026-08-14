import { describe, expect, it } from 'vitest'
import { findRowEndIndex } from './session-card-row.pure'

// Three cards per row, three rows: the shape the grid produces at a given width.
const THREE_PER_ROW = [0, 0, 0, 120, 120, 120, 240, 240]

describe('findRowEndIndex', () => {
  it('ends the row at its last card, whichever card was hailed', () => {
    expect(findRowEndIndex(THREE_PER_ROW, 0)).toBe(2)
    expect(findRowEndIndex(THREE_PER_ROW, 1)).toBe(2)
    expect(findRowEndIndex(THREE_PER_ROW, 2)).toBe(2)
  })

  it('finds the row a card in the middle of the room belongs to', () => {
    expect(findRowEndIndex(THREE_PER_ROW, 4)).toBe(5)
  })

  it('ends a short last row at the last card there is', () => {
    expect(findRowEndIndex(THREE_PER_ROW, 6)).toBe(7)
    expect(findRowEndIndex(THREE_PER_ROW, 7)).toBe(7)
  })

  it('gives every card its own row when the grid is one column wide', () => {
    const singleColumn = [0, 90, 180, 270]
    expect(
      singleColumn.map((_, index) => findRowEndIndex(singleColumn, index)),
    ).toEqual([0, 1, 2, 3])
  })

  it('puts the whole room on one row when it fits on one', () => {
    expect(findRowEndIndex([0, 0, 0, 0], 1)).toBe(3)
  })

  it('handles a room of one card', () => {
    expect(findRowEndIndex([0], 0)).toBe(0)
  })

  it('has no answer for a card that is not in the room', () => {
    expect(findRowEndIndex(THREE_PER_ROW, -1)).toBeNull()
    expect(findRowEndIndex(THREE_PER_ROW, 8)).toBeNull()
    expect(findRowEndIndex([], 0)).toBeNull()
  })

  it('never looks backwards past the hailed card', () => {
    // Row two is hailed; the answer must stay inside row two.
    const end = findRowEndIndex(THREE_PER_ROW, 3)
    expect(end).toBe(5)
    expect(end).toBeGreaterThanOrEqual(3)
  })
})
