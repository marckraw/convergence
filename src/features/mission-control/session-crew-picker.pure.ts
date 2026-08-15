import type { SessionCrew } from '@/entities/session-crew'

/**
 * A starter set of decorations, not a restriction: the backend stores whatever
 * the picker chose, so this palette can grow without a migration.
 */
export const CREW_EMOJI_CHOICES = [
  '🐎',
  '🌙',
  '🛰️',
  '🔭',
  '⚙️',
  '🧭',
  '🔥',
  '🧪',
  '📦',
  '🎯',
  '🛠️',
  '🌊',
] as const

export interface CrewAccentChoice {
  value: string
  label: string
}

export const CREW_ACCENT_COLORS: readonly CrewAccentChoice[] = [
  { value: '#7c3aed', label: 'Violet' },
  { value: '#2563eb', label: 'Blue' },
  { value: '#06b6d4', label: 'Cyan' },
  { value: '#10b981', label: 'Green' },
  { value: '#f59e0b', label: 'Amber' },
  { value: '#ef4444', label: 'Red' },
  { value: '#ec4899', label: 'Pink' },
  { value: '#94a3b8', label: 'Slate' },
]

/** Crews long enough to need searching get a search box; short ones do not. */
export const CREW_SEARCH_THRESHOLD = 6

export function filterCrewsByQuery(
  crews: readonly SessionCrew[],
  query: string,
): SessionCrew[] {
  const needle = query.trim().toLowerCase()
  if (needle.length === 0) return [...crews]
  return crews.filter(
    (crew) =>
      crew.name.toLowerCase().includes(needle) ||
      (crew.emoji ?? '').includes(needle),
  )
}

export function crewsHoldingSession(
  crews: readonly SessionCrew[],
  sessionId: string,
): SessionCrew[] {
  return crews.filter((crew) => crew.sessionIds.includes(sessionId))
}

/**
 * What the card's crew button says at a glance: the crew itself when there is
 * exactly one, a count when there are several, and the invitation when there
 * are none.
 */
export function formatCrewTriggerLabel(
  crews: readonly SessionCrew[],
  sessionId: string,
): string {
  const holding = crewsHoldingSession(crews, sessionId)
  if (holding.length === 0) return 'Add to crew'
  if (holding.length === 1) return holding[0]?.name ?? 'Add to crew'
  return `${holding.length} crews`
}

export function isValidCrewName(name: string): boolean {
  return name.trim().length > 0
}
