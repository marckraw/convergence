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
