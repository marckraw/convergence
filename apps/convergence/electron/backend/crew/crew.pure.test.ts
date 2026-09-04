import { describe, expect, it } from 'vitest'
import {
  nextCrewPosition,
  normalizeCrewAccentColor,
  normalizeCrewBatonName,
  normalizeCrewEmoji,
  normalizeCrewName,
  normalizeCrewSessionIds,
} from './crew.pure'

describe('normalizeCrewBatonName', () => {
  it('stores an unnamed member as no name at all', () => {
    expect(normalizeCrewBatonName('   ')).toBeNull()
    expect(normalizeCrewBatonName(null)).toBeNull()
    expect(normalizeCrewBatonName(undefined)).toBeNull()
  })

  it('keeps the one spelling the relay compares', () => {
    expect(normalizeCrewBatonName('  Night  Horse  ')).toBe('night horse')
  })

  it('refuses a name that starts or ends with a formatting mark', () => {
    // The reader peels a symmetric pair off a name, so `_horse_` would be
    // addressed as `horse` and route to somebody else, and `my_` reads as a
    // token no peel can settle. The door is where that ambiguity dies -- once,
    // for every name, rather than at each place a name is read.
    for (const name of ['_horse_', 'horse*', '`horse`', '*horse', 'my_']) {
      expect(() => normalizeCrewBatonName(name)).toThrow(
        'cannot start or end with a formatting mark',
      )
    }
  })

  it('leaves a mark in the middle of a name alone', () => {
    // `my_horse` is spelling, not formatting.
    expect(normalizeCrewBatonName('my_horse')).toBe('my_horse')
  })

  it('refuses a name no condition may ever wait on', () => {
    // The wire door refuses a condition that waits on no letter and no number
    // (`BATON: 🐎`), so a member stored under that name is a member nobody can
    // be wired to: named here, unreachable there. One question, asked at both
    // doors. `Ł` is a letter in a script that is not English -- a name, not
    // decoration -- and the door must not confuse the two.
    expect(() => normalizeCrewBatonName('🐎')).toThrow(
      'must contain a letter or a number',
    )
    expect(normalizeCrewBatonName('Ł')).toBe('ł')
  })
})

describe('normalizeCrewName', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeCrewName('  Night shift  ')).toBe('Night shift')
  })

  it('rejects blank names', () => {
    expect(() => normalizeCrewName('   ')).toThrow(/cannot be empty/)
  })

  it('rejects names longer than 64 characters', () => {
    expect(() => normalizeCrewName('a'.repeat(65))).toThrow(/longer than/)
  })

  it('accepts a name of exactly 64 characters', () => {
    expect(normalizeCrewName('a'.repeat(64))).toHaveLength(64)
  })
})

describe('normalizeCrewEmoji', () => {
  it('returns null for absent or blank decoration', () => {
    expect(normalizeCrewEmoji(undefined)).toBeNull()
    expect(normalizeCrewEmoji(null)).toBeNull()
    expect(normalizeCrewEmoji('  ')).toBeNull()
  })

  it('keeps a multi-codepoint emoji intact', () => {
    expect(normalizeCrewEmoji('👨‍👩‍👧‍👦')).toBe('👨‍👩‍👧‍👦')
  })

  it('rejects a pasted paragraph', () => {
    expect(() => normalizeCrewEmoji('not an emoji at all')).toThrow(/too long/)
  })
})

describe('normalizeCrewAccentColor', () => {
  it('returns null for absent or blank color', () => {
    expect(normalizeCrewAccentColor(undefined)).toBeNull()
    expect(normalizeCrewAccentColor('   ')).toBeNull()
  })

  it('accepts hex and token vocabularies alike', () => {
    expect(normalizeCrewAccentColor(' #7c3aed ')).toBe('#7c3aed')
    expect(normalizeCrewAccentColor('violet')).toBe('violet')
  })

  it('rejects an over-long value', () => {
    expect(() => normalizeCrewAccentColor('x'.repeat(33))).toThrow(/too long/)
  })
})

describe('normalizeCrewSessionIds', () => {
  it('returns an empty list for absent input', () => {
    expect(normalizeCrewSessionIds(undefined)).toEqual([])
    expect(normalizeCrewSessionIds(null)).toEqual([])
  })

  it('drops blanks and duplicates while preserving order', () => {
    expect(normalizeCrewSessionIds([' b ', 'a', '', 'b', 'a'])).toEqual([
      'b',
      'a',
    ])
  })
})

describe('nextCrewPosition', () => {
  it('starts at zero when there are no crews', () => {
    expect(nextCrewPosition([])).toBe(0)
  })

  it('appends after the highest existing position', () => {
    expect(nextCrewPosition([0, 4, 2])).toBe(5)
  })
})
