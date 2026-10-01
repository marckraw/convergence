import { describe, expect, it } from 'vitest'
import { listboxOptionId, listboxStep } from './listbox.pure'

const press = (key: string, ctrlKey = false) => ({ key, ctrlKey })

describe('listboxOptionId', () => {
  it('names a row from its list and its place', () => {
    expect(listboxOptionId('palette', 3)).toBe('palette-option-3')
  })
})

describe('listboxStep', () => {
  it('steps down and up one row, wrapping round the ends', () => {
    expect(listboxStep(0, 3, press('ArrowDown'))).toBe(1)
    expect(listboxStep(2, 3, press('ArrowDown'))).toBe(0)
    expect(listboxStep(1, 3, press('ArrowUp'))).toBe(0)
    expect(listboxStep(0, 3, press('ArrowUp'))).toBe(2)
  })

  it('stops at the ends without loop', () => {
    expect(listboxStep(2, 3, press('ArrowDown'), { loop: false })).toBe(2)
    expect(listboxStep(0, 3, press('ArrowUp'), { loop: false })).toBe(0)
    expect(listboxStep(1, 3, press('ArrowDown'), { loop: false })).toBe(2)
  })

  it('steps with Control-N and -J down, Control-P and -K up', () => {
    expect(listboxStep(0, 3, press('n', true))).toBe(1)
    expect(listboxStep(0, 3, press('j', true))).toBe(1)
    expect(listboxStep(1, 3, press('p', true))).toBe(0)
    expect(listboxStep(1, 3, press('k', true))).toBe(0)
    expect(listboxStep(0, 3, press('n'))).toBeUndefined()
  })

  it('jumps to the ends with Home and End', () => {
    expect(listboxStep(1, 3, press('Home'))).toBe(0)
    expect(listboxStep(1, 3, press('End'))).toBe(2)
  })

  it('starts at the top going down and the bottom going up', () => {
    expect(listboxStep(null, 3, press('ArrowDown'))).toBe(0)
    expect(listboxStep(null, 3, press('ArrowUp'))).toBe(2)
  })

  it('leaves other keys, and an empty list, alone', () => {
    expect(listboxStep(0, 3, press('Enter'))).toBeUndefined()
    expect(listboxStep(0, 3, press('a'))).toBeUndefined()
    expect(listboxStep(null, 0, press('ArrowDown'))).toBeUndefined()
    expect(listboxStep(null, 0, press('Home'))).toBeUndefined()
  })
})
