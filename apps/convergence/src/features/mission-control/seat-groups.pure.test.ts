import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CREW_MEMBER_SEAT,
  type SessionCrewMember,
} from '@/entities/session-crew'
import { groupSeats, offersSeatSearch } from './seat-groups.pure'

function seat(
  batonName: string,
  role: SessionCrewMember['role'],
  hostPolicy: string | null = null,
): SessionCrewMember {
  return {
    ...DEFAULT_CREW_MEMBER_SEAT,
    sessionId: `s-${batonName}`,
    batonName,
    canvasX: null,
    canvasY: null,
    role,
    hostPolicy,
  }
}

const hostLabel = (member: SessionCrewMember) =>
  member.hostPolicy === 'lm' ? 'little-monster' : 'This Mac'

const seats = (count: number) =>
  Array.from({ length: count }, (_, index) => seat(`horse-${index}`, 'horse'))

describe('groupSeats (MAR-3118 R6)', () => {
  it.each([
    [7, false],
    [8, true],
    [9, true],
  ])('offers a search at %i seats: %s', (count, offered) => {
    // Mutation: threshold 9 -> the 8-seat row is red.
    expect(offersSeatSearch(seats(count).length)).toBe(offered)
  })

  it('orders groups by the hierarchy, whatever order the seats were added in, and hides empty groups', () => {
    const groups = groupSeats(
      [
        seat('codex', 'reviewer'),
        seat('opus', 'horse'),
        seat('fable', 'mastermind'),
        seat('grok', 'horse'),
      ],
      { hostLabel },
    )

    // Mutation: order groups by first appearance -> Reviewers leads, red.
    expect(
      groups.map((group) => [
        group.title,
        group.count,
        group.members.map((m) => m.batonName),
      ]),
    ).toEqual([
      ['Mastermind', 1, ['fable']],
      ['Horses', 2, ['opus', 'grok']],
      ['Reviewers', 1, ['codex']],
    ])
  })

  it.each([
    ['name', 'GROK', ['grok']],
    ['role', 'review', ['codex']],
    ['host', 'little', ['glm']],
  ])('narrows by %s, case-insensitively, at 8+ seats', (_by, query, names) => {
    const crew = [
      ...seats(5),
      seat('grok', 'horse'),
      seat('codex', 'reviewer'),
      seat('glm', 'horse', 'lm'),
    ]
    const shown = groupSeats(crew, { query, hostLabel }).flatMap((group) =>
      group.members.map((member) => member.batonName),
    )
    expect(shown).toEqual(names)
  })

  it('ignores a query below the threshold, where no field exists to explain it', () => {
    const crew = [seat('grok', 'horse'), seat('codex', 'reviewer')]
    const shown = groupSeats(crew, { query: 'grok', hostLabel }).flatMap(
      (group) => group.members.map((member) => member.batonName),
    )
    expect(shown).toEqual(['grok', 'codex'])
  })
})
