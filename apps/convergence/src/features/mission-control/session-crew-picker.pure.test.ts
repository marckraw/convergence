import { describe, expect, it } from 'vitest'
import type { SessionCrew } from '@/entities/session-crew'
import {
  CREW_ACCENT_COLORS,
  CREW_EMOJI_CHOICES,
  crewsHoldingSession,
  filterCrewsByQuery,
  formatCrewTriggerLabel,
  isValidCrewName,
} from './session-crew-picker.pure'

function crew(
  name: string,
  sessionIds: string[] = [],
  emoji: string | null = null,
): SessionCrew {
  return {
    id: name,
    name,
    emoji,
    accentColor: null,
    position: 0,
    createdAt: '2026-08-15T10:00:00Z',
    updatedAt: '2026-08-15T10:00:00Z',
    sessionIds,
  }
}

describe('filterCrewsByQuery', () => {
  it('returns everything for a blank query', () => {
    const crews = [crew('Night shift'), crew('Reviewers')]
    expect(filterCrewsByQuery(crews, '   ')).toHaveLength(2)
  })

  it('matches on name, case-insensitively and mid-word', () => {
    const crews = [crew('Night shift'), crew('Reviewers')]
    expect(filterCrewsByQuery(crews, 'SHIFT').map((c) => c.name)).toEqual([
      'Night shift',
    ])
    expect(filterCrewsByQuery(crews, 'view').map((c) => c.name)).toEqual([
      'Reviewers',
    ])
  })

  it('matches on the crew emoji', () => {
    const crews = [crew('Night shift', [], '🌙'), crew('Reviewers')]
    expect(filterCrewsByQuery(crews, '🌙').map((c) => c.name)).toEqual([
      'Night shift',
    ])
  })

  it('returns nothing when nothing matches', () => {
    expect(filterCrewsByQuery([crew('Night shift')], 'zzz')).toEqual([])
  })
})

describe('crewsHoldingSession', () => {
  it('finds every crew the session belongs to', () => {
    const crews = [crew('a', ['s1']), crew('b', ['s2']), crew('c', ['s1'])]
    expect(crewsHoldingSession(crews, 's1').map((c) => c.name)).toEqual([
      'a',
      'c',
    ])
  })
})

describe('formatCrewTriggerLabel', () => {
  it('invites when the session is in no crew', () => {
    expect(formatCrewTriggerLabel([crew('a')], 's1')).toBe('Add to crew')
  })

  it('names the crew when there is exactly one', () => {
    expect(formatCrewTriggerLabel([crew('Night shift', ['s1'])], 's1')).toBe(
      'Night shift',
    )
  })

  it('counts when the session is in several', () => {
    expect(
      formatCrewTriggerLabel([crew('a', ['s1']), crew('b', ['s1'])], 's1'),
    ).toBe('2 crews')
  })
})

describe('isValidCrewName', () => {
  it('rejects blank names and accepts real ones', () => {
    expect(isValidCrewName('  ')).toBe(false)
    expect(isValidCrewName(' Night shift ')).toBe(true)
  })
})

describe('decoration palettes', () => {
  it('offers distinct emoji and accent choices', () => {
    expect(new Set(CREW_EMOJI_CHOICES).size).toBe(CREW_EMOJI_CHOICES.length)
    expect(new Set(CREW_ACCENT_COLORS.map((c) => c.value)).size).toBe(
      CREW_ACCENT_COLORS.length,
    )
  })

  it('keeps accent values short enough for the backend to store', () => {
    for (const choice of CREW_ACCENT_COLORS) {
      expect(choice.value.length).toBeLessThanOrEqual(32)
    }
  })
})
