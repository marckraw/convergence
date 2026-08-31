import { describe, expect, it } from 'vitest'
import { ownRecordValue } from './own-record.pure'

describe('ownRecordValue', () => {
  it('hands back a value the record actually holds', () => {
    expect(ownRecordValue({ 'daemon-a': 1 }, 'daemon-a')).toBe(1)
  })

  it('refuses an inherited member, whatever it is named', () => {
    // The whole reason this exists: `{}['toString']` is a function, and a
    // function is truthy. Every caller past that point believes it found one.
    const record: Record<string, number> = {}
    for (const key of ['toString', 'constructor', 'valueOf', '__proto__']) {
      expect(ownRecordValue(record, key)).toBeUndefined()
    }
  })

  it('hands back a value stored under an inherited name', () => {
    // Own keys win: shadowing a prototype member is not a reason to lose it.
    expect(ownRecordValue({ toString: 7 }, 'toString')).toBe(7)
  })
})
