import { describe, expect, it } from 'vitest'
import { listboxOptionId, listboxStep } from './listbox.pure'

describe('listboxOptionId', () => {
  it('names a row from its list and its place', () => {
    expect(listboxOptionId('palette', 3)).toBe('palette-option-3')
  })
})

describe('listboxStep', () => {
  it('steps down and up one row, wrapping round the ends', () => {
    expect(listboxStep(0, 3, 'ArrowDown')).toBe(1)
    expect(listboxStep(2, 3, 'ArrowDown')).toBe(0)
    expect(listboxStep(1, 3, 'ArrowUp')).toBe(0)
    expect(listboxStep(0, 3, 'ArrowUp')).toBe(2)
  })

  it('jumps to the ends with Home and End', () => {
    expect(listboxStep(1, 3, 'Home')).toBe(0)
    expect(listboxStep(1, 3, 'End')).toBe(2)
  })

  it('starts at the top going down and the bottom going up', () => {
    expect(listboxStep(null, 3, 'ArrowDown')).toBe(0)
    expect(listboxStep(null, 3, 'ArrowUp')).toBe(2)
  })

  it('leaves other keys, and an empty list, alone', () => {
    expect(listboxStep(0, 3, 'Enter')).toBeUndefined()
    expect(listboxStep(0, 3, 'a')).toBeUndefined()
    expect(listboxStep(null, 0, 'ArrowDown')).toBeUndefined()
    expect(listboxStep(null, 0, 'Home')).toBeUndefined()
  })
})
