import { crewTokens, type CrewTokenName } from '@convergence/ui'
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
  /** What a crew stores: the colour's hex, which is the key to its token. */
  value: string
  label: string
  /** The category hue it paints with (R1): `hue="crew-violet"`, `var(--crew-violet)`. */
  hue: CrewHue
}

/** A crew colour as a Badge hue. */
export type CrewHue = `crew-${CrewTokenName}`

const CREW_COLOR_LABELS: Record<CrewTokenName, string> = {
  violet: 'Violet',
  blue: 'Blue',
  cyan: 'Cyan',
  green: 'Green',
  amber: 'Amber',
  red: 'Red',
  pink: 'Pink',
  slate: 'Slate',
}

/**
 * The palette a crew picks from. A crew stores the hex (`value`); every view
 * paints with the hue's token, so the hex is data and never a colour on
 * screen (MAR-3617).
 */
export const CREW_ACCENT_COLORS: readonly CrewAccentChoice[] = (
  Object.keys(crewTokens) as CrewTokenName[]
).map((name) => ({
  value: crewTokens[name],
  label: CREW_COLOR_LABELS[name],
  hue: `crew-${name}`,
}))

/**
 * The hue a stored crew colour paints with, or none for a crew with no colour
 * (or a value the palette never offered). The stored hex is compared without
 * regard to case, as the backend keeps whatever the picker sent.
 */
export function crewHue(
  accentColor: string | null | undefined,
): CrewHue | undefined {
  if (!accentColor) return undefined
  const key = accentColor.toLowerCase()
  return CREW_ACCENT_COLORS.find((choice) => choice.value === key)?.hue
}

/**
 * A stored crew colour as a CSS colour to paint with: the hue's token, or the
 * stored value itself when it is not one of the palette's (a crew from an
 * older build), and null for a crew with none.
 */
export function crewColor(
  accentColor: string | null | undefined,
): string | null {
  if (!accentColor) return null
  const hue = crewHue(accentColor)
  return hue ? `var(--${hue})` : accentColor
}

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
