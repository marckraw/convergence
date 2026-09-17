import type { SessionCrewMember } from '@/entities/session-crew'

/** At this many seats the drawer offers a search (MAR-3118 R6). */
export const SEAT_SEARCH_THRESHOLD = 8

type SeatRole = SessionCrewMember['role']

/**
 * The hierarchy people think in, top down. Fixed: a crew's insertion order
 * says who was added first, not who leads.
 */
export const SEAT_ROLE_ORDER: readonly SeatRole[] = [
  'mastermind',
  'horse',
  'reviewer',
  'designer',
]

const SEAT_GROUP_TITLES: Record<SeatRole, string> = {
  mastermind: 'Mastermind',
  horse: 'Horses',
  reviewer: 'Reviewers',
  designer: 'Designers',
}

export interface SeatGroup {
  role: SeatRole
  title: string
  count: number
  members: SessionCrewMember[]
}

export function offersSeatSearch(seatCount: number): boolean {
  return seatCount >= SEAT_SEARCH_THRESHOLD
}

/**
 * The seats, grouped by role in the fixed order, each group counted; a group
 * with no seat is left out.
 *
 * The query applies only where the search is offered: below the threshold
 * there is no field, so a stale query must not hide seats nobody can see a
 * reason for. It matches the baton name, the role and the host label,
 * case-insensitively.
 */
export function groupSeats(
  members: readonly SessionCrewMember[],
  options: {
    query?: string
    hostLabel: (member: SessionCrewMember) => string
  },
): SeatGroup[] {
  const needle = offersSeatSearch(members.length)
    ? (options.query ?? '').trim().toLowerCase()
    : ''
  const matching = needle
    ? members.filter((member) =>
        [member.batonName ?? '', member.role, options.hostLabel(member)].some(
          (text) => text.toLowerCase().includes(needle),
        ),
      )
    : [...members]
  return SEAT_ROLE_ORDER.flatMap((role) => {
    const inRole = matching.filter((member) => member.role === role)
    if (inRole.length === 0) return []
    return [
      {
        role,
        title: SEAT_GROUP_TITLES[role],
        count: inRole.length,
        members: inRole,
      },
    ]
  })
}
