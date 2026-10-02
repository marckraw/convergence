import { describe, expect, it } from 'vitest'
import {
  currentSectionTitle,
  NEEDS_YOU,
  needsYouCount,
  needsYouVerb,
  WAITING_ON_YOU,
} from './needs-you-words.pure'

describe('the attention queue’s words (NAV-32, ruling 3)', () => {
  it('has one name, in sentence case', () => {
    expect(NEEDS_YOU).toBe('Needs you')
  })

  it('names the section inside it something else, so "Needs you" names one thing (ruling 6)', () => {
    expect(WAITING_ON_YOU).toBe('Waiting on you')
    expect(WAITING_ON_YOU).not.toBe(NEEDS_YOU)
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

describe('a folded section stored under an old name (NAV-32, ruling 6)', () => {
  it('reads "Needs attention" and "Needs you" as the section of what waits on you, and every other title as itself', () => {
    expect(currentSectionTitle('Needs attention')).toBe(WAITING_ON_YOU)
    expect(currentSectionTitle('Needs you')).toBe(WAITING_ON_YOU)
    expect(currentSectionTitle('Working')).toBe('Working')
    expect(currentSectionTitle(WAITING_ON_YOU)).toBe(WAITING_ON_YOU)
  })
})
