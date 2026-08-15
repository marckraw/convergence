import { describe, expect, it } from 'vitest'
import type { SessionCrew } from '@/entities/session-crew'
import type { SessionSummary } from '@/entities/session'
import {
  NO_CREW_GROUP_KEY,
  formatCrewMemberCount,
  groupSessionCardsByCrew,
  sessionCrewGroupKey,
} from './session-crew-groups.pure'
import type { SessionCard } from './mission-control.types'

function card(id: string): SessionCard {
  return {
    session: { id } as SessionSummary,
    projectName: 'convergence',
    providerLabel: 'Claude Code',
    activityLabel: '',
    crews: [],
    searchText: id,
  }
}

function crew(id: string, sessionIds: string[]): SessionCrew {
  return {
    id,
    name: id,
    emoji: null,
    accentColor: null,
    position: 0,
    createdAt: '2026-08-15T10:00:00Z',
    updatedAt: '2026-08-15T10:00:00Z',
    sessionIds,
  }
}

describe('groupSessionCardsByCrew', () => {
  it('puts every card in the No crew group when there are no crews', () => {
    const groups = groupSessionCardsByCrew([card('a'), card('b')], [])

    expect(groups).toHaveLength(1)
    expect(groups[0]?.crew).toBeNull()
    expect(groups[0]?.cards.map((c) => c.session.id)).toEqual(['a', 'b'])
  })

  it('renders a session in two crews inside both containers', () => {
    const groups = groupSessionCardsByCrew(
      [card('a')],
      [crew('mastermind', ['a']), crew('workers', ['a'])],
    )

    expect(groups.map((group) => group.crew?.id)).toEqual([
      'mastermind',
      'workers',
    ])
    expect(groups.every((group) => group.cards.length === 1)).toBe(true)
  })

  it('keeps crew order and the room order inside each container', () => {
    const groups = groupSessionCardsByCrew(
      [card('c'), card('a'), card('b')],
      [crew('first', ['a', 'b', 'c'])],
    )

    expect(groups[0]?.cards.map((entry) => entry.session.id)).toEqual([
      'c',
      'a',
      'b',
    ])
  })

  it('appends the No crew group last, holding only uncrewed cards', () => {
    const groups = groupSessionCardsByCrew(
      [card('a'), card('b'), card('c')],
      [crew('one', ['a']), crew('two', ['b'])],
    )

    expect(groups).toHaveLength(3)
    expect(groups[2]?.crew).toBeNull()
    expect(groups[2]?.cards.map((entry) => entry.session.id)).toEqual(['c'])
  })

  it('omits the No crew group when every card belongs somewhere', () => {
    const groups = groupSessionCardsByCrew([card('a')], [crew('one', ['a'])])

    expect(groups.map((group) => group.crew?.id)).toEqual(['one'])
  })

  it('keeps an empty crew visible with a zero member count', () => {
    const groups = groupSessionCardsByCrew([card('a')], [crew('empty', [])])

    expect(groups[0]?.cards).toEqual([])
    expect(groups[0]?.memberCount).toBe(0)
  })

  it('keeps a crew whose members the filter removed, remembering it has some', () => {
    // The room was narrowed to card 'b'; the crew still holds 'a'.
    const groups = groupSessionCardsByCrew([card('b')], [crew('one', ['a'])])

    expect(groups[0]?.cards).toEqual([])
    expect(groups[0]?.memberCount).toBe(1)
  })

  it('ignores a member whose session is not in the room', () => {
    const groups = groupSessionCardsByCrew(
      [card('a')],
      [crew('one', ['a', 'gone'])],
    )

    expect(groups[0]?.cards.map((entry) => entry.session.id)).toEqual(['a'])
  })
})

describe('sessionCrewGroupKey', () => {
  it('keys a crew by id and the loose group by a reserved key', () => {
    expect(
      sessionCrewGroupKey({ crew: crew('one', []), cards: [], memberCount: 0 }),
    ).toBe('one')
    expect(sessionCrewGroupKey({ crew: null, cards: [], memberCount: 0 })).toBe(
      NO_CREW_GROUP_KEY,
    )
  })
})

describe('formatCrewMemberCount', () => {
  it('pluralises honestly', () => {
    expect(formatCrewMemberCount(0)).toBe('0 sessions')
    expect(formatCrewMemberCount(1)).toBe('1 session')
    expect(formatCrewMemberCount(4)).toBe('4 sessions')
  })
})
