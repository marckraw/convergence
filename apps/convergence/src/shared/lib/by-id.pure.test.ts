import { describe, expect, it } from 'vitest'
import { removeById, upsertById } from './by-id.pure'

describe('upsertById', () => {
  it('replaces a record where it is', () => {
    const items = [
      { id: 'a', n: 1 },
      { id: 'b', n: 2 },
    ]
    expect(upsertById(items, { id: 'b', n: 3 })).toEqual([
      { id: 'a', n: 1 },
      { id: 'b', n: 3 },
    ])
  })

  it('puts a new record first', () => {
    expect(upsertById([{ id: 'a' }], { id: 'z' })).toEqual([
      { id: 'z' },
      { id: 'a' },
    ])
  })

  it('leaves the list it was given alone', () => {
    const items = [{ id: 'a', n: 1 }]
    upsertById(items, { id: 'a', n: 2 })
    expect(items).toEqual([{ id: 'a', n: 1 }])
  })
})

describe('removeById', () => {
  it('drops only the record of that id', () => {
    expect(removeById([{ id: 'a' }, { id: 'b' }], 'a')).toEqual([{ id: 'b' }])
    expect(removeById([{ id: 'a' }], 'missing')).toEqual([{ id: 'a' }])
  })
})
