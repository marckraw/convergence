import { describe, expect, it } from 'vitest'
import {
  currentSectionTitle,
  NEEDS_YOU,
  needsYouCount,
  needsYouVerb,
} from './needs-you-words.pure'

describe('the attention queue’s words (NAV-32, ruling 3)', () => {
  it('has one name, in sentence case', () => {
    expect(NEEDS_YOU).toBe('Needs you')
  })

  it.each([
    [0, '0 need you'],
    [1, '1 needs you'],
    [2, '2 need you'],
    [12, '12 need you'],
  ])('counts %i as "%s"', (count, phrase) => {
    expect(needsYouCount(count)).toBe(phrase)
  })

  it('agrees with its count on the verb alone, for a count drawn apart', () => {
    expect(needsYouVerb(1)).toBe('needs you')
    expect(needsYouVerb(3)).toBe('need you')
  })
})

describe('a folded section stored under the old name (NAV-32)', () => {
  it('reads "Needs attention" as the queue, and every other title as itself', () => {
    expect(currentSectionTitle('Needs attention')).toBe(NEEDS_YOU)
    expect(currentSectionTitle('Working')).toBe('Working')
    expect(currentSectionTitle(NEEDS_YOU)).toBe(NEEDS_YOU)
  })
})
