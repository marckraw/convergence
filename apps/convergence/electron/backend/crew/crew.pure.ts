import {
  hasEdgeFormattingMark,
  hasNameableCharacter,
} from '../relay/relay.pure'

const MAX_CREW_NAME_LENGTH = 64
const MAX_CREW_EMOJI_CODEPOINTS = 8
const MAX_CREW_ACCENT_COLOR_LENGTH = 32

export function normalizeCrewName(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new Error('Crew name cannot be empty')
  }
  if (trimmed.length > MAX_CREW_NAME_LENGTH) {
    throw new Error(
      `Crew name cannot be longer than ${MAX_CREW_NAME_LENGTH} characters`,
    )
  }
  return trimmed
}

/**
 * Emoji are stored verbatim rather than validated against a codepoint table:
 * the renderer owns the picker vocabulary, the backend only guards length so
 * a paste accident cannot smuggle a paragraph into a decoration column.
 */
export function normalizeCrewEmoji(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null) return null
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  if (Array.from(trimmed).length > MAX_CREW_EMOJI_CODEPOINTS) {
    throw new Error('Crew emoji is too long')
  }
  return trimmed
}

/**
 * The accent palette is a renderer concern (MC7 picks the swatches), so the
 * backend stores whatever short token the UI chose instead of hard-coding a
 * hex-only rule the palette would later have to fight.
 */
export function normalizeCrewAccentColor(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null) return null
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  if (trimmed.length > MAX_CREW_ACCENT_COLOR_LENGTH) {
    throw new Error('Crew accent color is too long')
  }
  return trimmed
}

export function normalizeCrewSessionIds(
  values: readonly string[] | null | undefined,
): string[] {
  if (!values) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    if (trimmed.length === 0 || seen.has(trimmed)) continue
    seen.add(trimmed)
    result.push(trimmed)
  }
  return result
}

export function nextCrewPosition(positions: readonly number[]): number {
  let highest = -1
  for (const position of positions) {
    if (Number.isFinite(position) && position > highest) {
      highest = position
    }
  }
  return highest + 1
}

/**
 * A baton name is one word-ish label, not a sentence: it is typed into a
 * condition line and read at a glance on a canvas arrow.
 */
const MAX_CREW_BATON_NAME_LENGTH = 32

/**
 * The short name a baton addresses a crew member by.
 *
 * Lowercased and whitespace-collapsed on the way in, because that is the one
 * spelling the relay compares -- storing `Horse` and matching `horse` would
 * mean the pre-filled condition and the stored name disagreed about a wire the
 * user never edited. Blank stores as null: an unnamed member is simply one no
 * baton can address yet.
 *
 * A name may not begin or end with a formatting mark, because the reader
 * peels a symmetric pair off the name it finds: `_horse_` would be addressed
 * as `horse` and route to a different member, and `my_` would read as a token
 * no peel can settle. This door is where that ambiguity dies -- once, for
 * every name -- rather than at each place a name is read.
 *
 * And it must contain something a person could have meant as a name, by the
 * same question the wire door asks of a condition: a member named with no
 * letter and no number is one no condition may wait on, so accepting the name
 * here while refusing the condition there would store a station nobody can be
 * wired to.
 */
export function normalizeCrewBatonName(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null) return null
  const collapsed = value.trim().replace(/\s+/g, ' ').toLowerCase()
  if (collapsed.length === 0) return null
  if (collapsed.length > MAX_CREW_BATON_NAME_LENGTH) {
    throw new Error(
      `A baton name cannot be longer than ${MAX_CREW_BATON_NAME_LENGTH} characters`,
    )
  }
  if (collapsed.includes(':')) {
    throw new Error('A baton name cannot contain a colon')
  }
  if (hasEdgeFormattingMark(collapsed)) {
    throw new Error('A baton name cannot start or end with a formatting mark')
  }
  if (!hasNameableCharacter(collapsed)) {
    throw new Error('A baton name must contain a letter or a number')
  }
  return collapsed
}

/**
 * A crew knob: a whole number of rounds or minutes, or null for the default.
 *
 * Refused rather than clamped when it is not a number a human could have
 * meant. A silently corrected 0 would read back as a cap the user never set,
 * and they would have no way to tell it apart from one they did.
 */
export function normalizeCrewLimit(
  value: number | null | undefined,
  label: string,
): number | null {
  if (value === undefined || value === null) return null
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a whole number of at least 1`)
  }
  return value
}
