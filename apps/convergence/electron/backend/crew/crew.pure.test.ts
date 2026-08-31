import { describe, expect, it } from 'vitest'
import {
  nextCrewPosition,
  normalizeCrewAccentColor,
  normalizeCrewEmoji,
  normalizeCrewName,
  normalizeCrewSessionIds,
} from './crew.pure'

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
